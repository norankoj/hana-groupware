// src/app/notice/page.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/utils/supabase/client";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

const NoticeEditor = dynamic(() => import("@/components/notice/NoticeEditor"), { ssr: false });

type Profile = {
  id: string;
  full_name: string;
  position: string;
  role: string;
};

type NoticeAttachment = { name: string; url: string; type: "image" | "file" };

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
};

const CATEGORIES = ["전체", "공지", "일반", "중요"];
const CATEGORY_STYLE: Record<string, string> = {
  공지: "bg-blue-50 text-blue-700 border-blue-200",
  중요: "bg-red-50 text-red-700 border-red-200",
  일반: "bg-gray-50 text-gray-600 border-gray-200",
};
const WRITE_ROLES = ["admin", "director", "staff"];
const STORAGE_BUCKET = "notice-attachments";

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
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 15;

  // 작성 모달
  const [isWriteOpen, setIsWriteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Notice | null>(null);

  // 폼
  const [form, setForm] = useState({
    title: "",
    content: "",
    category: "일반",
    is_pinned: false,
    popup_enabled: false,
    popup_days: 1,
  });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
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
    let query = supabase
      .from("notices")
      .select("*, profiles:author_id(full_name, position)", { count: "exact" });
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


  // ── 파일 업로드 ──────────────────────────────────────────────────────────
  const uploadFiles = async (
    noticeId: number,
    files: File[],
  ): Promise<NoticeAttachment[]> => {
    const results: NoticeAttachment[] = [];
    for (const rawFile of files) {
      // 이미지는 WebP 압축 후 업로드
      const file = rawFile.type.startsWith("image/")
        ? await compressImage(rawFile)
        : rawFile;
      const ext = file.name.split(".").pop();
      const path = `${noticeId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file);
      if (error) continue;
      const {
        data: { publicUrl },
      } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      const isImage = file.type.startsWith("image/");
      results.push({
        name: file.name,
        url: publicUrl,
        type: isImage ? "image" : "file",
      });
    }
    return results;
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
    });
    fetchNotices();
  };

  // ── 삭제 ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    if (!confirm("공지사항을 삭제하시겠습니까?")) return;
    // storage 파일도 삭제
    const notice = notices.find((n) => n.id === id);
    if (notice?.attachments?.length) {
      const paths = notice.attachments
        .map((a) => {
          const parts = a.url.split(`/${STORAGE_BUCKET}/`);
          return parts[1] ?? "";
        })
        .filter(Boolean);
      if (paths.length)
        await supabase.storage.from(STORAGE_BUCKET).remove(paths);
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
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            공지사항
          </h1>
          <p className="mt-1 text-sm text-gray-500">
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
              });
              setIsWriteOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg font-bold text-sm tracking-tight transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 cursor-pointer"
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
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeCategory === cat ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-56">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300"
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제목 검색..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="hidden sm:grid grid-cols-[60px_1fr_80px_100px_60px_80px_80px] gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
          <span>구분</span>
          <span>제목</span>
          <span className="text-center">카테고리</span>
          <span className="text-center">작성자</span>
          <span className="text-center">첨부</span>
          <span className="text-center">조회</span>
          <span className="text-center">날짜</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500" />
          </div>
        ) : notices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3">
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
                className={`grid grid-cols-1 sm:grid-cols-[60px_1fr_80px_100px_60px_80px_80px] gap-2 sm:gap-4 px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors ${notice.is_pinned ? "bg-blue-50/40" : ""}`}
              >
                <div className="hidden sm:flex items-center">
                  {notice.is_pinned ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600">
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
                    <span className="text-xs text-gray-300">
                      {(page - 1) * PAGE_SIZE + idx + 1}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  {notice.is_pinned && (
                    <svg
                      className="w-3 h-3 text-blue-500 shrink-0 sm:hidden"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z" />
                    </svg>
                  )}
                  <span
                    className={`text-sm font-semibold truncate ${notice.is_pinned ? "text-blue-700" : "text-gray-800"}`}
                  >
                    {notice.title}
                  </span>
                  {notice.popup_enabled && (
                    <span className="shrink-0 text-[10px] font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">
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
                <div className="hidden sm:flex items-center justify-center text-xs text-gray-500">
                  {notice.profiles?.full_name || "—"}
                </div>
                <div className="hidden sm:flex items-center justify-center text-xs text-gray-400">
                  {(notice.attachments || []).length > 0 ? (
                    <span className="flex items-center gap-0.5 text-blue-400">
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
                  {notice.view_count || 0}
                </div>
                <div className="hidden sm:flex items-center justify-center text-xs text-gray-400">
                  {format(new Date(notice.created_at), "MM.dd", { locale: ko })}
                </div>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 py-4 border-t border-gray-100">
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
                  className={`w-8 h-8 rounded-lg text-sm font-semibold transition ${p === page ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
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

      {/* ── 글쓰기/수정 모달 ── */}
      {isWriteOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setIsWriteOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-gray-200 w-full max-w-2xl max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">
                {editTarget ? "공지 수정" : "공지 작성"}
              </h2>
              <button
                onClick={() => setIsWriteOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              {/* 카테고리 + 고정 */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex gap-1.5">
                  {["일반", "공지", "중요"].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setForm((f) => ({ ...f, category: cat }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${form.category === cat ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {canAdmin && (
                  <label className="flex items-center gap-2 cursor-pointer ml-auto">
                    <input
                      type="checkbox"
                      checked={form.is_pinned}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, is_pinned: e.target.checked }))
                      }
                      className="w-4 h-4 rounded accent-blue-600"
                    />
                    <span className="text-sm font-semibold text-gray-600">
                      상단 고정
                    </span>
                  </label>
                )}
              </div>

              {/* 팝업 설정 (관리자만) */}
              {canAdmin && (
                <div className="rounded-xl border border-gray-200 p-4 space-y-3">
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
                      className="w-4 h-4 rounded accent-orange-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      메인 화면 팝업 공지
                    </span>
                  </label>
                  {form.popup_enabled && (
                    <div className="flex items-center gap-2 pl-6">
                      <span className="text-sm text-gray-500">팝업 유지</span>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 7].map((d) => (
                          <button
                            key={d}
                            onClick={() =>
                              setForm((f) => ({ ...f, popup_days: d }))
                            }
                            className={`px-2.5 py-1 rounded-lg text-sm font-semibold transition ${form.popup_days === d ? "bg-orange-500 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}
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
                className="w-full px-4 py-3 text-sm font-semibold border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 placeholder:font-normal"
              />

              {/* 내용 */}
              <NoticeEditor
                content={form.content}
                onChange={(html) => setForm((f) => ({ ...f, content: html }))}
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
                  className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition w-full justify-center"
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
                        className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm"
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
                          className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-sm text-blue-700"
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

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setIsWriteOpen(false)}
                className="px-5 py-2 text-sm font-semibold text-gray-600 bg-gray-50 rounded-xl hover:bg-gray-100"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={!form.title.trim() || saving || uploadingFiles}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition"
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
        </div>
      )}
    </div>
  );
}

