"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import dynamic from "next/dynamic";
import { toProxyUrl } from "@/utils/minio-url";

const NoticeEditor = dynamic(() => import("@/components/notice/NoticeEditor"), { ssr: false });

type Profile = { id: string; full_name: string; position: string; role: string };
type Viewer = { id: string; full_name: string };
type NoticeAttachment = { name: string; url: string; type: "image" | "file"; objectName?: string };
type Notice = {
  id: number;
  title: string;
  content: string;
  category: string;
  is_pinned: boolean;
  popup_enabled: boolean;
  popup_days: number;
  popup_until: string | null;
  attachments: NoticeAttachment[];
  view_count: number;
  created_at: string;
  updated_at: string;
  author_id: string;
  profiles?: { full_name: string; position: string } | null;
};

const CATEGORIES = ["공지", "일반", "중요"];
const CATEGORY_STYLE: Record<string, string> = {
  공지: "bg-blue-50 text-blue-700 border-blue-200",
  중요: "bg-red-50 text-red-700 border-red-200",
  일반: "bg-gray-50 text-gray-600 border-gray-200",
};
const MINIO_BUCKET = "notice";
const WRITE_ROLES = ["admin", "director", "staff"];

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) { resolve(file); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
        else { width = Math.round((width * MAX) / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" }));
      }, "image/webp", 0.75);
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

export default function NoticeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [notice, setNotice] = useState<Notice | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [allUsers, setAllUsers] = useState<Viewer[]>([]);
  const [showViewersModal, setShowViewersModal] = useState(false);

  // 수정 상태
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    title: "",
    content: "",
    category: "일반",
    is_pinned: false,
    popup_enabled: false,
    popup_days: 1,
  });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<NoticeAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [saving, setSaving] = useState(false);

  const canWrite = profile && WRITE_ROLES.includes(profile.role);
  const canAdmin = profile && (profile.role === "admin" || profile.role === "director");
  const canEdit = notice && profile && (canAdmin || notice.author_id === profile.id);

  const fetchNotice = useCallback(async () => {
    const { data } = await supabase
      .from("notices")
      .select("*, profiles:author_id(full_name, position)")
      .eq("id", id)
      .single();
    if (data) setNotice(data as any);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const { data: p } = await supabase.from("profiles").select("id, full_name, position, role").eq("id", user.id).single();
      if (p) setProfile(p as any);
      await fetchNotice();
      // 조회수 증가 (fetch 후 현재 값 기반)
      const { data: cur } = await supabase.from("notices").select("view_count").eq("id", id).single();
      if (cur) {
        await supabase.from("notices").update({ view_count: (cur.view_count || 0) + 1 }).eq("id", id);
      }
      // 조회 기록 저장 (중복 시 무시)
      if (p) {
        await supabase.from("notice_views").upsert(
          { notice_id: Number(id), user_id: p.id },
          { onConflict: "notice_id,user_id", ignoreDuplicates: true },
        );
      }
      // 전체 사용자 목록 fetch
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .neq("status", "inactive");
      if (allProfiles) setAllUsers(allProfiles.map((p: any) => ({ id: p.id, full_name: p.full_name })));

      // 조회자 목록 fetch (2-step: notice_views → profiles)
      const { data: viewData } = await supabase
        .from("notice_views")
        .select("user_id")
        .eq("notice_id", id);
      if (viewData && viewData.length > 0) {
        const userIds = viewData.map((v: any) => v.user_id);
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        if (profileData) {
          setViewers(profileData.map((p: any) => ({ id: p.id, full_name: p.full_name })));
        }
      }
    };
    init();
  }, [id]);

  const openEdit = () => {
    if (!notice) return;
    setForm({
      title: notice.title,
      content: notice.content,
      category: notice.category,
      is_pinned: notice.is_pinned,
      popup_enabled: notice.popup_enabled || false,
      popup_days: notice.popup_days || 1,
    });
    setPendingFiles([]);
    setExistingAttachments(notice.attachments || []);
    setIsEditing(true);
  };

  const removeExistingAttachment = async (att: NoticeAttachment) => {
    if (att.objectName) {
      await fetch(`/api/upload?bucket=${MINIO_BUCKET}&object=${encodeURIComponent(att.objectName)}`, { method: "DELETE" });
    }
    setExistingAttachments((prev) => prev.filter((a) => a.url !== att.url));
  };

  const uploadFiles = async (noticeId: number, files: File[]): Promise<NoticeAttachment[]> => {
    setUploadProgress({ current: 0, total: files.length });
    let done = 0;
    const results = await Promise.all(
      files.map(async (rawFile) => {
        try {
          const file = rawFile.type.startsWith("image/") ? await compressImage(rawFile) : rawFile;
          const formData = new FormData();
          formData.append("file", file);
          formData.append("bucket", MINIO_BUCKET);
          formData.append("folder", String(noticeId));
          const res = await fetch("/api/upload", { method: "POST", body: formData });
          if (!res.ok) return null;
          const { url, objectName } = await res.json();
          done++;
          setUploadProgress((p) => ({ ...p, current: done }));
          return { name: rawFile.name, url: url ?? "", objectName, type: file.type.startsWith("image/") ? "image" : "file" } as NoticeAttachment;
        } catch {
          done++;
          setUploadProgress((p) => ({ ...p, current: done }));
          return null;
        }
      }),
    );
    return results.filter(Boolean) as NoticeAttachment[];
  };

  const handleSave = async () => {
    if (!notice || !form.title.trim()) return;
    setSaving(true);
    const popupUntil = form.popup_enabled
      ? new Date(Date.now() + form.popup_days * 24 * 60 * 60 * 1000).toISOString()
      : null;
    setUploadingFiles(pendingFiles.length > 0);
    const newAttachments = pendingFiles.length > 0 ? await uploadFiles(notice.id, pendingFiles) : [];
    setUploadingFiles(false);
    const merged = [...existingAttachments, ...newAttachments];
    await supabase.from("notices").update({
      title: form.title,
      content: form.content,
      category: form.category,
      is_pinned: form.is_pinned,
      popup_enabled: form.popup_enabled,
      popup_days: form.popup_days,
      popup_until: popupUntil,
      attachments: merged,
      updated_at: new Date().toISOString(),
    }).eq("id", notice.id);
    setSaving(false);
    setIsEditing(false);
    setPendingFiles([]);
    fetchNotice();
  };

  const handleDelete = async () => {
    if (!notice) return;
    if (!confirm("공지사항을 삭제하시겠습니까?")) return;
    // MinIO 파일 삭제
    if (notice.attachments?.length) {
      await Promise.all(
        notice.attachments
          .filter((a) => a.objectName)
          .map((a) =>
            fetch(`/api/upload?bucket=${MINIO_BUCKET}&object=${encodeURIComponent(a.objectName!)}`, { method: "DELETE" }),
          ),
      );
    }
    await supabase.from("notices").delete().eq("id", notice.id);
    router.push("/notice");
  };

  const removeAttachment = async (att: NoticeAttachment) => {
    if (!notice) return;
    // MinIO 파일 삭제
    if (att.objectName) {
      await fetch(`/api/upload?bucket=${MINIO_BUCKET}&object=${encodeURIComponent(att.objectName)}`, { method: "DELETE" });
    }
    const updated = (notice.attachments || []).filter((a) => a.url !== att.url);
    await supabase.from("notices").update({ attachments: updated }).eq("id", notice.id);
    setNotice((prev) => prev ? { ...prev, attachments: updated } : null);
  };

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-100 rounded w-2/3" />
          <div className="h-4 bg-gray-100 rounded w-1/3" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  if (!notice) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-10 text-center text-gray-500">
        공지사항을 찾을 수 없습니다.
        <br />
        <button onClick={() => router.push("/notice")} className="mt-4 text-blue-600 underline text-sm">
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  const images = (notice.attachments || []).filter((a) => a.type === "image");
  const files = (notice.attachments || []).filter((a) => a.type === "file");

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 space-y-5">
      {/* 뒤로가기 */}
      <button
        onClick={() => router.push("/notice")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        공지사항 목록
      </button>

      {/* 본문 카드 */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {notice.is_pinned && (
              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                📌 고정
              </span>
            )}
            {notice.popup_enabled && (
              <span className="text-[11px] font-bold text-orange-500 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded">
                팝업 공지
              </span>
            )}
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${CATEGORY_STYLE[notice.category] || CATEGORY_STYLE["일반"]}`}>
              {notice.category}
            </span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 leading-snug">{notice.title}</h1>
          <div className="flex items-center gap-3 mt-2.5 text-xs text-gray-400 flex-wrap">
            <span>{notice.profiles?.full_name} · {notice.profiles?.position}</span>
            <span>{format(new Date(notice.created_at), "yyyy.MM.dd HH:mm", { locale: ko })}</span>
            <span>읽음 {viewers.length}명</span>
          </div>
        </div>

        {/* 본문 */}
        <div className="px-6 py-6">
          <div
            className="prose prose-sm max-w-none text-gray-800 leading-relaxed break-words [&_a]:break-all"
            dangerouslySetInnerHTML={{ __html: notice.content }}
          />
        </div>

        {/* 이미지 첨부 */}
        {images.length > 0 && (
          <div className="px-6 pb-5 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">첨부 이미지</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {images.map((att) => (
                <div key={att.url} className="relative group">
                  <img
                    src={toProxyUrl(att.url)}
                    alt={att.name}
                    className="w-full rounded-xl object-cover max-h-48 border border-gray-100 cursor-zoom-in"
                    onClick={() => setLightboxImg(toProxyUrl(att.url))}
                  />
                  {canEdit && (
                    <button
                      onClick={() => removeAttachment(att)}
                      className="absolute top-1.5 right-1.5 p-1 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 파일 첨부 */}
        {files.length > 0 && (
          <div className="px-6 pb-5 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">첨부 파일</p>
            <div className="space-y-1.5">
              {files.map((att) => (
                <div key={att.url} className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm text-gray-700 truncate">{att.name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a href={att.url} download={att.name} target="_blank" rel="noopener noreferrer"
                      className="px-2 py-1 text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition">
                      다운로드
                    </a>
                    {canEdit && (
                      <button onClick={() => removeAttachment(att)}
                        className="px-2 py-1 text-xs font-semibold text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition">
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 읽음 현황 */}
        <div className="border-t border-gray-100">
          {/* 토글 버튼 */}
          <button
            onClick={() => setShowViewersModal((v) => !v)}
            className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>읽음 <strong className="text-gray-700">{viewers.length}</strong>명</span>
              <span className="text-blue-500 font-semibold underline underline-offset-2">보기</span>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showViewersModal ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* 펼쳐지는 내용 — grid-rows 트릭으로 smooth */}
          {(() => {
            const sortKo = (arr: Viewer[]) => [...arr].sort((a, b) => a.full_name.localeCompare(b.full_name, "ko"));
            const viewerIds = new Set(viewers.map((v) => v.id));
            const readList = sortKo(viewers);
            const unreadList = sortKo(allUsers.filter((u) => !viewerIds.has(u.id)));
            return (
              <div className={`grid transition-all duration-300 ease-in-out ${showViewersModal ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                  <div className="px-6 pb-5 space-y-4">
                    {/* 읽은 사람 */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                        <span className="text-xs font-bold text-gray-600">읽은 사람</span>
                        <span className="text-[11px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">{readList.length}명</span>
                      </div>
                      {readList.length === 0 ? (
                        <p className="text-xs text-gray-400 pl-3">아직 읽은 사람이 없습니다.</p>
                      ) : (
                        <p className="text-xs text-gray-600 pl-3 leading-relaxed">
                          {readList.map((v) => v.full_name).join(" · ")}
                        </p>
                      )}
                    </div>
                    {/* 안읽은 사람 */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                        <span className="text-xs font-bold text-gray-600">안읽은 사람</span>
                        <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">{unreadList.length}명</span>
                      </div>
                      {unreadList.length === 0 ? (
                        <p className="text-xs text-gray-400 pl-3">모두 읽었습니다! 🎉</p>
                      ) : (
                        <p className="text-xs text-gray-400 pl-3 leading-relaxed">
                          {unreadList.map((u) => u.full_name).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* 수정/삭제 버튼 */}
        {canEdit && (
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
            <button onClick={openEdit}
              className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-50 rounded-xl hover:bg-gray-100 transition border border-gray-200">
              수정
            </button>
            <button onClick={handleDelete}
              className="px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition border border-red-100">
              삭제
            </button>
          </div>
        )}
      </div>

      {/* 이미지 라이트박스 */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
          onClick={() => setLightboxImg(null)}
        >
          <img src={lightboxImg} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl" />
        </div>
      )}

      {/* 업로드 로딩 오버레이 */}
      {(uploadingFiles || saving) && (
        <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-black/60">
          <div className="bg-white rounded-2xl px-10 py-8 flex flex-col items-center gap-4 shadow-2xl min-w-[220px]">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            {uploadingFiles && uploadProgress.total > 0 ? (
              <>
                <p className="text-gray-800 font-bold text-base">파일 업로드 중...</p>
                <div className="w-full">
                  <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                    <span>{uploadProgress.current}/{uploadProgress.total}개 완료</span>
                    <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <p className="text-gray-800 font-bold text-base">저장 중...</p>
            )}
            <p className="text-gray-400 text-sm">잠시만 기다려 주세요</p>
          </div>
        </div>
      )}

      {/* 수정 모달 */}
      {isEditing && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setIsEditing(false)}>
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-2xl max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">공지 수정</h2>
              <button onClick={() => setIsEditing(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              {/* 제목 */}
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="제목"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              />

              {/* 카테고리 */}
              <div className="flex gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c} type="button"
                    onClick={() => setForm((p) => ({ ...p, category: c }))}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition
                      ${form.category === c ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"}`}>
                    {c}
                  </button>
                ))}
              </div>

              {/* 에디터 */}
              <NoticeEditor
                content={form.content}
                onChange={(html) => setForm((p) => ({ ...p, content: html }))}
              />

              {/* 옵션 */}
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_pinned}
                    onChange={(e) => setForm((p) => ({ ...p, is_pinned: e.target.checked }))}
                    className="w-4 h-4 rounded accent-blue-600" />
                  <span className="text-sm text-gray-700">상단 고정</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.popup_enabled}
                    onChange={(e) => setForm((p) => ({ ...p, popup_enabled: e.target.checked }))}
                    className="w-4 h-4 rounded accent-blue-600" />
                  <span className="text-sm text-gray-700">팝업 공지</span>
                </label>
                {form.popup_enabled && (
                  <select value={form.popup_days}
                    onChange={(e) => setForm((p) => ({ ...p, popup_days: Number(e.target.value) }))}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-sm">
                    {[1, 2, 3, 7].map((d) => <option key={d} value={d}>{d}일간</option>)}
                  </select>
                )}
              </div>

              {/* 기존 첨부파일 */}
              {existingAttachments.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">기존 첨부파일</p>
                  <div className="space-y-1.5">
                    {existingAttachments.map((att) => (
                      <div key={att.url} className="flex items-center justify-between gap-2 px-3 py-2 bg-blue-50 rounded-xl border border-blue-100">
                        <div className="flex items-center gap-2 min-w-0">
                          {att.type === "image" ? (
                            <img src={toProxyUrl(att.url)} alt={att.name} className="w-8 h-8 rounded object-cover shrink-0 border border-blue-200" />
                          ) : (
                            <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                          )}
                          <span className="text-sm text-blue-700 truncate">{att.name}</span>
                        </div>
                        <button
                          onClick={() => removeExistingAttachment(att)}
                          className="text-blue-300 hover:text-red-500 shrink-0 transition"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 새 파일 첨부 */}
              <div>
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  파일 추가 첨부
                </button>
                <input ref={fileInputRef} type="file" multiple className="hidden"
                  onChange={(e) => setPendingFiles(Array.from(e.target.files || []))} />
                {pendingFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {pendingFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-lg text-sm">
                        <span className="truncate text-gray-700">{f.name}</span>
                        <button onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                          className="text-gray-400 hover:text-red-500 ml-2">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-50 rounded-xl hover:bg-gray-100 border border-gray-200 transition">
                취소
              </button>
              <button onClick={handleSave}
                disabled={!form.title.trim() || saving || uploadingFiles}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition">
                {uploadingFiles ? "파일 업로드 중..." : saving ? "저장 중..." : "수정 완료"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
