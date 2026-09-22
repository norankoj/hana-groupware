// src/app/notice/page.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/utils/supabase/client";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import Modal from "@/components/Modal";
import { btnStyles, inputClass } from "@/components/fund/shared";
import { CATEGORY_STYLE, NOTICE_PROSE } from "@/components/notice/shared";
import { Eye } from "lucide-react";
import toast from "react-hot-toast";
import { toProxyUrl } from "@/utils/minio-url";

const NoticeEditor = dynamic(() => import("@/components/notice/NoticeEditor"), { ssr: false });

type Profile = {
  id: string;
  full_name: string;
  position: string;
  role: string;
};

type NoticeAttachment = { name: string; url: string; type: "image" | "file"; objectName?: string };

type Notice = {
  id: number;
  title: string;
  content: string;
  category: string;
  is_pinned: boolean;
  popup_enabled: boolean;
  popup_days: number; // 팝업 유지 일수 (1, 2, 3, 7)
  popup_until: string | null; // 팝업 종료일 ISO
  attachments: NoticeAttachment[];
  view_count: number;
  created_at: string;
  updated_at: string;
  author_id: string;
  profiles?: { full_name: string; position: string } | null;
  notice_views?: { count: number }[];
};

const CATEGORIES = ["전체", "공지", "일반", "중요"];

/** 에디터는 비어 있어도 "<p></p>" 를 준다 — 글자가 하나도 없으면 빈 것으로 본다 */
const isEmptyHtml = (html: string) =>
  !html || (!html.replace(/<[^>]*>/g, "").trim() && !/<img/i.test(html));
const WRITE_ROLES = ["admin", "director", "staff"];
const MINIO_BUCKET = "notice";

/** 이미지 파일을 WebP로 압축 (최대 1200px, 품질 0.75) */
async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          resolve(
            new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
              type: "image/webp",
            }),
          );
        },
        "image/webp",
        0.75,
      );
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

// ── 메인 공지사항 페이지 ───────────────────────────────────────────────────
export default function NoticePage() {
  const supabase = createClient();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeCategory, setActiveCategory] = useState("전체");
  const [search, setSearch] = useState("");
  /** 입력칸 글자 — 칠 때마다 조회하지 않게, 멈추고 0.3초 뒤에 search 로 넘긴다 */
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 15;

  // 작성 모달
  const [isWriteOpen, setIsWriteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Notice | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // 폼
  const [form, setForm] = useState({
    title: "",
    content: "",
    category: "일반",
    is_pinned: false,
    popup_enabled: false,
    popup_days: 1,
    send_notification: false,
  });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [saving, setSaving] = useState(false);

  const canWrite = profile && WRITE_ROLES.includes(profile.role);
  const canAdmin =
    profile && (profile.role === "admin" || profile.role === "director");

  // ── fetch ────────────────────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, position, role")
      .eq("id", user.id)
      .single();
    if (data) setProfile(data as any);
  }, []);

  const fetchNotices = useCallback(async () => {
    setLoading(true);
    // 목록에 보이는 칸만 받는다. 예전엔 "*" 라서 공지 15개의 본문(content) HTML 을
    // 통째로 받았다 — 목록은 본문을 쓰지 않는데 가장 무거운 칸이다. 본문은 상세 화면에서 받는다.
    let query = supabase
      .from("notices")
      .select(
        "id, title, category, is_pinned, popup_enabled, popup_until, attachments, view_count, created_at, author_id, profiles:author_id(full_name, position), notice_views(count)",
        { count: "exact" },
      );
    if (activeCategory !== "전체") query = query.eq("category", activeCategory);
    if (search.trim()) query = query.ilike("title", `%${search.trim()}%`);
    query = query
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });
    query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    const { data, count, error } = await query;
    if (!error && data) {
      setNotices(data as any);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [activeCategory, search, page]);

  useEffect(() => {
    fetchProfile();
  }, []);
  useEffect(() => {
    setPage(1);
  }, [activeCategory, search]);
  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);


  // ── 파일 업로드 (서버 경유 — HTTPS 호환, 진행 표시) ─────────────────────
  /**
   * 본문에 넣는 이미지 — 첨부와 같은 규칙으로 줄여서(WebP 1200px) 공지 버킷에 올린다.
   * NAS 가 http 라 주소를 그대로 넣으면 https 화면에서 막힌다 → 같은 도메인 프록시 주소로 넣는다.
   * 공지 id 가 생기기 전에 쓰므로 inline/ 폴더에 모은다.
   */
  const uploadInlineImage = async (raw: File): Promise<string | null> => {
    try {
      const file = await compressImage(raw);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bucket", MINIO_BUCKET);
      fd.append("folder", "inline");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "" }));
        toast.error(error || "이미지를 올리지 못했습니다.");
        return null;
      }
      const { url } = await res.json();
      return url ? toProxyUrl(url) : null;
    } catch {
      toast.error("이미지를 올리지 못했습니다.");
      return null;
    }
  };

  const uploadFiles = async (
    noticeId: number,
    files: File[],
  ): Promise<NoticeAttachment[]> => {
    setUploadProgress({ current: 0, total: files.length });
    let done = 0;

    const results = await Promise.all(
      files.map(async (rawFile) => {
        try {
          const file = rawFile.type.startsWith("image/")
            ? await compressImage(rawFile)
            : rawFile;
          const formData = new FormData();
          formData.append("file", file);
          formData.append("bucket", MINIO_BUCKET);
          formData.append("folder", String(noticeId));
          const res = await fetch("/api/upload", { method: "POST", body: formData });
          if (!res.ok) return null;
          const { url, objectName } = await res.json();
          done++;
          setUploadProgress((p) => ({ ...p, current: done }));
          return {
            name: rawFile.name,
            url: url ?? "",
            objectName,
            type: file.type.startsWith("image/") ? "image" : "file",
          } as NoticeAttachment;
        } catch {
          done++;
          setUploadProgress((p) => ({ ...p, current: done }));
          return null;
        }
      }),
    );
    return results.filter(Boolean) as NoticeAttachment[];
  };

  // ── 저장 ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.title.trim() || !profile) return;
    setSaving(true);

    const popupUntil = form.popup_enabled
      ? new Date(
          Date.now() + form.popup_days * 24 * 60 * 60 * 1000,
        ).toISOString()
      : null;

    if (editTarget) {
      // 기존 첨부파일 유지 + 새 파일 추가
      setUploadingFiles(true);
      const newAttachments =
        pendingFiles.length > 0
          ? await uploadFiles(editTarget.id, pendingFiles)
          : [];
      setUploadingFiles(false);
      const merged = [...(editTarget.attachments || []), ...newAttachments];
      await supabase
        .from("notices")
        .update({
          title: form.title,
          content: form.content,
          category: form.category,
          is_pinned: form.is_pinned,
          popup_enabled: form.popup_enabled,
          popup_days: form.popup_days,
          popup_until: popupUntil,
          attachments: merged,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editTarget.id);
    } else {
      // INSERT 먼저, id 받아서 파일 업로드
      const { data: inserted } = await supabase
        .from("notices")
        .insert({
          title: form.title,
          content: form.content,
          category: form.category,
          is_pinned: form.is_pinned,
          popup_enabled: form.popup_enabled,
          popup_days: form.popup_days,
          popup_until: popupUntil,
          author_id: profile.id,
          view_count: 0,
          attachments: [],
        })
        .select("id")
        .single();

      if (inserted && pendingFiles.length > 0) {
        setUploadingFiles(true);
        const attachments = await uploadFiles(inserted.id, pendingFiles);
        setUploadingFiles(false);
        await supabase
          .from("notices")
          .update({ attachments })
          .eq("id", inserted.id);
      }
      // 알림 발송 체크된 경우에만 전체 사용자에게 푸시
      if (inserted && form.send_notification) {
        fetch("/api/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toAll: true,
            title: `새 공지사항`,
            body: form.title,
            url: `/notice/${inserted.id}`,
          }),
        }).catch(() => {});
      }
    }

    setSaving(false);
    setIsWriteOpen(false);
    setEditTarget(null);
    setPendingFiles([]);
    setForm({
      title: "",
      content: "",
      category: "일반",
      is_pinned: false,
      popup_enabled: false,
      popup_days: 1,
      send_notification: false,
    });
    fetchNotices();
  };

  // ── 삭제 (MinIO) ─────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    if (!confirm("공지사항을 삭제하시겠습니까?")) return;
    const notice = notices.find((n) => n.id === id);
    // MinIO 파일 삭제
    if (notice?.attachments?.length) {
      await Promise.all(
        notice.attachments
          .filter((a) => a.objectName)
          .map((a) =>
            fetch(`/api/upload?bucket=${MINIO_BUCKET}&object=${encodeURIComponent(a.objectName!)}`, { method: "DELETE" }),
          ),
      );
    }
    await supabase.from("notices").delete().eq("id", id);
    fetchNotices();
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-7xl mx-auto space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading tracking-tight">
            공지사항
          </h1>
          <p className="mt-1 text-sm text-muted">
            교회 및 사역 관련 공지를 확인하세요
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => {
              setEditTarget(null);
              setPendingFiles([]);
              setForm({
                title: "",
                content: "",
                category: "일반",
                is_pinned: false,
                popup_enabled: false,
                popup_days: 1,
                send_notification: false,
              });
              setIsWriteOpen(true);
            }}
            className={`${btnStyles.cta} px-5 py-2.5 text-sm`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            <span className="mt-[1px]">공지 작성</span>
          </button>
        )}
      </div>

      {/* 필터 + 검색 */}
      <div className="bg-white rounded-2xl border border-line p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeCategory === cat ? "bg-primary text-white" : "bg-table-header text-muted hover:bg-gray-100"}`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-56">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-disabled-text"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="제목 검색..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-line rounded-lg focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-white rounded-2xl border border-line overflow-hidden">
        <div className="hidden sm:grid grid-cols-[60px_1fr_80px_100px_60px_80px_80px] gap-4 px-6 py-3 bg-table-header border-b border-line-soft text-xs font-semibold text-gray-400 uppercase tracking-wide">
          <span>구분</span>
          <span>제목</span>
          <span className="text-center">카테고리</span>
          <span className="text-center">작성자</span>
          <span className="text-center">첨부</span>
          <span className="text-center">읽음</span>
          <span className="text-center">날짜</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
          </div>
        ) : notices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-disabled-text gap-3">
            <svg
              className="w-12 h-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm">등록된 공지사항이 없습니다</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {notices.map((notice, idx) => (
              <li
                key={notice.id}
                onClick={() => router.push(`/notice/${notice.id}`)}
                className={`grid grid-cols-1 sm:grid-cols-[60px_1fr_80px_100px_60px_80px_80px] gap-2 sm:gap-4 px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors ${notice.is_pinned ? "bg-primary-wash/40" : ""}`}
              >
                <div className="hidden sm:flex items-center">
                  {notice.is_pinned ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                      <svg
                        className="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z" />
                      </svg>
                      고정
                    </span>
                  ) : (
                    <span className="text-xs text-disabled-text">
                      {(page - 1) * PAGE_SIZE + idx + 1}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  {notice.is_pinned && (
                    <svg
                      className="w-3 h-3 text-primary shrink-0 sm:hidden"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z" />
                    </svg>
                  )}
                  <span
                    className={`text-sm font-semibold truncate ${notice.is_pinned ? "text-primary-active" : "text-gray-800"}`}
                  >
                    {notice.title}
                  </span>
                  {notice.popup_enabled && (
                    <span className="shrink-0 text-[10px] font-bold text-orange-500 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">
                      팝업
                    </span>
                  )}
                  <span
                    className={`sm:hidden shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${CATEGORY_STYLE[notice.category] || CATEGORY_STYLE["일반"]}`}
                  >
                    {notice.category}
                  </span>
                </div>
                <div className="hidden sm:flex items-center justify-center">
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${CATEGORY_STYLE[notice.category] || CATEGORY_STYLE["일반"]}`}
                  >
                    {notice.category}
                  </span>
                </div>
                <div className="hidden sm:flex items-center justify-center text-xs text-muted">
                  {notice.profiles?.full_name || "—"}
                </div>
                <div className="hidden sm:flex items-center justify-center text-xs text-gray-400">
                  {(notice.attachments || []).length > 0 ? (
                    <span className="flex items-center gap-0.5 text-primary/60">
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                        />
                      </svg>
                      {(notice.attachments || []).length}
                    </span>
                  ) : (
                    "—"
                  )}
                </div>
                <div className="hidden sm:flex items-center justify-center text-xs text-gray-400">
                  {notice.notice_views?.[0]?.count ?? 0}
                </div>
                <div className="hidden sm:flex items-center justify-center text-xs text-gray-400">
                  {format(new Date(notice.created_at), "MM.dd", { locale: ko })}
                </div>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 py-4 border-t border-line-soft">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => Math.abs(p - page) <= 2)
              .map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-sm font-semibold transition ${p === page ? "bg-primary text-white" : "text-muted hover:bg-gray-100"}`}
                >
                  {p}
                </button>
              ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ── 업로드 로딩 오버레이 ── */}
      {(uploadingFiles || saving) && (
        <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-black/60">
          <div className="bg-white rounded-2xl px-10 py-8 flex flex-col items-center gap-4 shadow-2xl min-w-[220px]">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
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
                      className="bg-primary h-2 rounded-full transition-all duration-300"
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

      {/* ── 글쓰기/수정 모달 — 그룹웨어 공용 Modal 을 쓴다 ── */}
      {isWriteOpen && (
        <Modal
          isOpen
          onClose={() => setIsWriteOpen(false)}
          title={editTarget ? "공지 수정" : "공지 작성"}
          className="sm:max-w-[680px]"
          footer={
            <div className="flex items-center gap-2 w-full">
              {/* 올리기 전에 상세 화면 모양 그대로 확인 */}
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                disabled={!form.title.trim() && isEmptyHtml(form.content)}
                className="flex items-center gap-1.5 px-2 py-2 text-sm font-medium text-primary rounded-lg hover:bg-primary-wash transition cursor-pointer disabled:text-disabled-text disabled:hover:bg-transparent disabled:cursor-not-allowed"
              >
                <Eye size={16} /> 미리보기
              </button>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => setIsWriteOpen(false)}
                  className={btnStyles.cancel}
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.title.trim() || saving || uploadingFiles}
                  className={btnStyles.save}
                >
                {uploadingFiles
                  ? "파일 업로드 중..."
                  : saving
                    ? "저장 중..."
                    : editTarget
                      ? "수정 완료"
                      : "등록"}
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
              {/* 카테고리 + 고정 + 전체 알림 */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex gap-1.5">
                  {["일반", "공지", "중요"].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setForm((f) => ({ ...f, category: cat }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${form.category === cat ? "bg-primary text-white" : "bg-table-header text-muted hover:bg-gray-100"}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {canAdmin && (
                  <div className="flex items-center gap-4 ml-auto">
                    {!editTarget && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.send_notification}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, send_notification: e.target.checked }))
                          }
                          className="w-4 h-4 rounded accent-primary"
                        />
                        <span className="text-sm font-semibold text-gray-600">
                          전체 알림 발송
                        </span>
                      </label>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_pinned}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, is_pinned: e.target.checked }))
                        }
                        className="w-4 h-4 rounded accent-primary"
                      />
                      <span className="text-sm font-semibold text-gray-600">
                        상단 고정
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* 팝업 설정 (관리자만) */}
              {canAdmin && (
                <div className="rounded-xl border border-line p-4 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.popup_enabled}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          popup_enabled: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded accent-primary"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      메인 화면 팝업 공지
                    </span>
                  </label>
                  {form.popup_enabled && (
                    <div className="flex items-center gap-2 pl-6">
                      <span className="text-sm text-muted">팝업 유지</span>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 7].map((d) => (
                          <button
                            key={d}
                            onClick={() =>
                              setForm((f) => ({ ...f, popup_days: d }))
                            }
                            className={`px-2.5 py-1 rounded-lg text-sm font-semibold transition ${form.popup_days === d ? "bg-primary text-white" : "bg-table-header text-muted hover:bg-gray-100"}`}
                          >
                            {d}일
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 제목 */}
              <input
                type="text"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="제목을 입력하세요"
                className={`${inputClass} font-semibold placeholder:font-normal`}
              />

              {/* 내용 */}
              <NoticeEditor
                content={form.content}
                onChange={(html) => setForm((f) => ({ ...f, content: html }))}
                uploadImage={uploadInlineImage}
              />

              {/* 파일 첨부 */}
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                  파일 첨부 (이미지, PDF 등)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.zip"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files)
                      setPendingFiles((prev) => [
                        ...prev,
                        ...Array.from(e.target.files!),
                      ]);
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-line rounded-xl text-sm text-gray-400 hover:border-primary-soft hover:text-primary transition w-full justify-center"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  파일 선택 또는 드래그
                </button>

                {/* 선택된 파일 목록 */}
                {pendingFiles.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {pendingFiles.map((f, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-2 px-3 py-2 bg-table-header rounded-lg text-sm"
                      >
                        <span className="truncate text-gray-700">{f.name}</span>
                        <button
                          onClick={() =>
                            setPendingFiles((prev) =>
                              prev.filter((_, j) => j !== i),
                            )
                          }
                          className="text-gray-400 hover:text-red-500 shrink-0"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* 수정 시 기존 첨부 */}
                {editTarget && (editTarget.attachments || []).length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-400 mb-1.5">
                      기존 첨부파일
                    </p>
                    <ul className="space-y-1.5">
                      {editTarget.attachments.map((att) => (
                        <li
                          key={att.url}
                          className="flex items-center gap-2 px-3 py-2 bg-primary-wash rounded-lg text-sm text-primary-active"
                        >
                          <svg
                            className="w-4 h-4 shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                            />
                          </svg>
                          <span className="truncate flex-1">{att.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
          </div>
        </Modal>
      )}

      {/* ── 미리보기 — 상세 화면과 같은 틀(NOTICE_PROSE)로 그린다 ── */}
      {previewOpen && (
        <Modal
          isOpen
          onClose={() => setPreviewOpen(false)}
          title="미리보기"
          className="sm:max-w-[760px]"
          bodyClassName="p-0"
          footer={
            <button
              onClick={() => setPreviewOpen(false)}
              className={btnStyles.cancel}
            >
              닫기
            </button>
          }
        >
          <div className="px-6 py-5 border-b border-line-soft">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {form.is_pinned && (
                <span className="text-[11px] font-bold text-primary bg-primary-wash px-2 py-0.5 rounded">
                  📌 고정
                </span>
              )}
              {form.popup_enabled && (
                <span className="text-[11px] font-bold text-warning-active bg-warning-soft border border-warning/30 px-2 py-0.5 rounded">
                  팝업 공지
                </span>
              )}
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${CATEGORY_STYLE[form.category] || CATEGORY_STYLE["일반"]}`}
              >
                {form.category}
              </span>
            </div>
            <h1 className="text-xl font-bold text-heading leading-snug">
              {form.title.trim() || (
                <span className="text-disabled-text">제목 없음</span>
              )}
            </h1>
            <div className="flex items-center gap-3 mt-2.5 text-xs text-gray-400 flex-wrap">
              <span>
                {profile?.full_name} · {profile?.position}
              </span>
              <span>{format(new Date(), "yyyy.MM.dd HH:mm", { locale: ko })}</span>
            </div>
          </div>

          <div className="px-6 py-6">
            {isEmptyHtml(form.content) ? (
              <p className="text-sm text-disabled-text">내용이 비어 있습니다.</p>
            ) : (
              <div
                className={NOTICE_PROSE}
                // 작성 중인 본인 글을 본인 화면에만 그린다 — 상세 화면과 같은 방식
                dangerouslySetInnerHTML={{ __html: form.content }}
              />
            )}

            {/* 첨부 — 아직 올리기 전이라 이름만 보여준다 */}
            {(pendingFiles.length > 0 ||
              (editTarget?.attachments ?? []).length > 0) && (
              <div className="mt-6 pt-4 border-t border-line-soft">
                <p className="text-xs font-bold text-muted mb-2">첨부파일</p>
                <ul className="space-y-1">
                  {[
                    ...(editTarget?.attachments ?? []).map((a) => a.name),
                    ...pendingFiles.map((f) => f.name),
                  ].map((name, i) => (
                    <li key={i} className="text-sm text-gray-700 truncate">
                      📎 {name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

