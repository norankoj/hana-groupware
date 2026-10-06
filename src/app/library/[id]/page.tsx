// src/app/library/[id]/page.tsx
// 자료실 카테고리 — 자료 표 · 검색 · 올리기
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { ChevronLeft, Upload, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/utils/supabase/client";
import { btnStyles } from "@/components/fund/shared";
import { showConfirm } from "@/utils/alert";
import {
  FileTable,
  EmptyState,
  SkeletonRows,
  deleteAttachment,
  isManager,
  useMe,
  type LibraryCategory,
  type LibraryFile,
} from "@/components/library/shared";
import { UploadModal, CategoryModal } from "@/components/library/LibraryModals";

export default function LibraryCategoryPage() {
  const supabase = createClient();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const categoryId = Number(id);
  const me = useMe();

  const [category, setCategory] = useState<LibraryCategory | null>(null);
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"upload" | "edit" | null>(null);

  const fetchAll = useCallback(async () => {
    // ponytail: 카테고리 자료를 전부 받아 화면에서 거른다. 한 카테고리에 수백 건이 넘으면 range 로
    const [{ data: c }, { data: f }] = await Promise.all([
      supabase
        .from("library_categories")
        .select("*, profiles:creator_id(full_name)")
        .eq("id", categoryId)
        .maybeSingle(),
      supabase
        .from("library_files")
        .select("*, profiles:uploader_id(full_name)")
        .eq("category_id", categoryId)
        .order("created_at", { ascending: false }),
    ]);
    setCategory(c as LibraryCategory | null);
    setFiles((f as LibraryFile[]) ?? []);
    setLoading(false);
  }, [categoryId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const canManageCategory = !!category && (isManager(me) || category.creator_id === me?.id);

  const q = search.trim().toLowerCase();
  const visible = q
    ? files.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          f.attachments.some((a) => a.name.toLowerCase().includes(q)) ||
          (f.description ?? "").toLowerCase().includes(q),
      )
    : files;

  const handleDeleteFile = async (f: LibraryFile) => {
    if (!(await showConfirm("자료 삭제", `'${f.title}' 자료를 삭제하시겠습니까?`, "삭제"))) return;
    const { error } = await supabase.from("library_files").delete().eq("id", f.id);
    if (error) return toast.error("삭제하지 못했습니다.");
    f.attachments.forEach(deleteAttachment);
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
    toast.success("삭제되었습니다.");
  };

  const handleDeleteCategory = async () => {
    if (!category) return;
    // 자료가 남은 카테고리는 DB 가 막는다 (on delete restrict) — 먼저 알려준다
    if (files.length) return toast.error("자료가 남아 있어 삭제할 수 없습니다. 자료를 먼저 지워주세요.");
    if (!(await showConfirm("카테고리 삭제", `'${category.name}' 카테고리를 삭제하시겠습니까?`, "삭제"))) return;
    const { error } = await supabase.from("library_categories").delete().eq("id", category.id);
    if (error) return toast.error("삭제하지 못했습니다.");
    toast.success("삭제되었습니다.");
    router.push("/library");
  };

  if (!loading && !category)
    return (
      <div className="w-full max-w-7xl mx-auto">
        <EmptyState
          title="카테고리를 찾을 수 없습니다"
          hint="삭제되었거나 주소가 잘못되었습니다"
          action={
            <Link href="/library" className={`${btnStyles.soft} px-4 py-2 text-sm`}>
              자료실로 돌아가기
            </Link>
          }
        />
      </div>
    );

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5">
      {/* 헤더 */}
      <div>
        <Link
          href="/library"
          className="inline-flex items-center gap-0.5 text-sm text-muted hover:text-primary transition -ml-1 mb-2"
        >
          <ChevronLeft className="w-4 h-4" />
          자료실
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {category ? (
              <>
                <h1 className="text-2xl font-bold text-heading tracking-tight truncate">{category.name}</h1>
                {category.description && <p className="mt-1 text-sm text-muted">{category.description}</p>}
              </>
            ) : (
              <div className="h-8 w-48 rounded bg-table-header animate-pulse" />
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {canManageCategory && (
              <>
                <button
                  onClick={() => setModal("edit")}
                  aria-label="카테고리 수정"
                  className="p-2.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary-wash transition"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDeleteCategory}
                  aria-label="카테고리 삭제"
                  className="p-2.5 rounded-lg text-gray-400 hover:text-danger hover:bg-danger-soft transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            {me && category && (
              <button onClick={() => setModal("upload")} className={`${btnStyles.cta} px-4 py-2.5 text-sm`}>
                <Upload className="w-4 h-4" />
                {/* 좁은 화면에선 '올리기'만 */}
                <span className="mt-[1px]"><span className="hidden sm:inline">자료 </span>올리기</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 검색 */}
      <div className="bg-white rounded-2xl border border-line p-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted whitespace-nowrap shrink-0">
          전체 <span className="font-bold text-heading">{files.length}</span>건
          {q && (
            <>
              {" "}/ 검색 <span className="font-bold text-primary">{visible.length}</span>건
            </>
          )}
        </p>
        <div className="relative w-full sm:w-64">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-disabled-text"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제목, 설명, 파일명 검색"
            aria-label="이 카테고리에서 검색"
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-line rounded-lg focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* 목록 */}
      {loading ? (
        <SkeletonRows />
      ) : visible.length ? (
        <FileTable files={visible} me={me} onDelete={handleDeleteFile} />
      ) : q ? (
        <EmptyState title={`'${search.trim()}'에 맞는 자료가 없습니다`} hint="다른 단어로 검색해 보세요" />
      ) : (
        <EmptyState
          title="자료가 없습니다"
          hint="이 카테고리에 처음으로 자료를 올려보세요"
          action={
            me && (
              <button onClick={() => setModal("upload")} className={`${btnStyles.soft} px-4 py-2 text-sm`}>
                자료 올리기
              </button>
            )
          }
        />
      )}

      {/* 만든 사람 */}
      {category && (
        <p className="text-xs text-gray-400 text-right pt-1">
          만든 사람 {category.profiles?.full_name ?? "-"} / {format(new Date(category.created_at), "yyyy.MM.dd")}
        </p>
      )}

      {modal === "upload" && me && (
        <UploadModal categoryId={categoryId} meId={me.id} onClose={() => setModal(null)} onUploaded={fetchAll} />
      )}
      {modal === "edit" && me && category && (
        <CategoryModal
          initial={category}
          meId={me.id}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            fetchAll();
          }}
        />
      )}
    </div>
  );
}
