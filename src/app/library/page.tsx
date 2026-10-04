// src/app/library/page.tsx
// 자료실 — 카테고리 목록. 검색하면 모든 카테고리의 자료를 찾는다
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { FolderOpen, FolderPlus, ChevronRight, Settings2 } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useCurrentMenu } from "@/components/ClientLayout";
import { btnStyles } from "@/components/fund/shared";
import { showConfirm } from "@/utils/alert";
import {
  FileTable,
  EmptyState,
  SkeletonRows,
  deleteObject,
  isManager,
  useMe,
  type LibraryCategory,
  type LibraryFile,
} from "@/components/library/shared";
import { CategoryModal, CategoryOrderModal } from "@/components/library/LibraryModals";

export default function LibraryPage() {
  const supabase = createClient();
  const router = useRouter();
  const menu = useCurrentMenu();
  const me = useMe();

  const [categories, setCategories] = useState<LibraryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isOrderOpen, setIsOrderOpen] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<LibraryFile[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from("library_categories")
      .select("*, profiles:creator_id(full_name), library_files(count)")
      .order("sort_order")
      .order("created_at");
    if (error) toast.error("카테고리를 불러오지 못했습니다.");
    else setCategories(data as LibraryCategory[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (!search) return setResults([]);
    setSearching(true);
    // 쉼표 · 괄호는 or() 문법을 깨뜨려서 뺀다
    const q = search.replace(/[,()]/g, " ");
    supabase
      .from("library_files")
      .select("*, profiles:uploader_id(full_name), library_categories(name)")
      .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setResults((data as LibraryFile[]) ?? []);
        setSearching(false);
      });
  }, [search]);

  const handleDeleteFile = async (f: LibraryFile) => {
    if (!(await showConfirm("자료 삭제", `'${f.title}' 자료를 삭제하시겠습니까?`, "삭제"))) return;
    const { error } = await supabase.from("library_files").delete().eq("id", f.id);
    if (error) return toast.error("삭제하지 못했습니다.");
    f.attachments.forEach((a) => deleteObject(a.object_name));
    setResults((prev) => prev.filter((x) => x.id !== f.id));
    fetchCategories();
    toast.success("삭제되었습니다.");
  };

  const matchedCategories = search
    ? categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : categories;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5">
      {/* 헤더 */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-heading tracking-tight">{menu?.name || "자료실"}</h1>
          <p className="mt-1 text-sm text-muted">매뉴얼, 서식, 공문을 카테고리별로 모아두고 내려받는 곳입니다</p>
        </div>
        {me && (
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 순서는 모두에게 같이 보여서 관리자/디렉터만 바꾼다 */}
            {isManager(me) && categories.length > 1 && (
              <button
                onClick={() => setIsOrderOpen(true)}
                aria-label="카테고리 순서 설정"
                title="카테고리 순서"
                className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-line bg-white text-gray-500 hover:text-primary hover:border-primary/40 transition"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => setIsCreateOpen(true)} className={`${btnStyles.cta} px-4 py-2.5 text-sm`}>
              <FolderPlus className="w-4 h-4" />
              {/* 좁은 화면에선 '만들기'만 — 버튼이 화면 밖으로 밀려나지 않게 */}
              <span className="mt-[1px]"><span className="hidden sm:inline">카테고리 </span>만들기</span>
            </button>
          </div>
        )}
      </div>

      {/* 검색 */}
      <div className="relative">
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-disabled-text"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="카테고리 이름, 자료 제목, 설명으로 검색"
          aria-label="자료 검색"
          className="w-full pl-11 pr-4 py-3 text-sm bg-white border border-line rounded-2xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-[112px] rounded-2xl border border-line bg-white p-5">
              <div className="h-4 w-1/2 rounded bg-table-header animate-pulse" />
              <div className="h-3 w-3/4 rounded bg-table-header animate-pulse mt-3" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* 카테고리 */}
          {matchedCategories.length > 0 ? (
            <section className="space-y-2">
              {search && <h2 className="text-sm font-bold text-gray-600 ml-1">카테고리</h2>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {matchedCategories.map((c) => {
                  const count = c.library_files?.[0]?.count ?? 0;
                  return (
                    <Link
                      key={c.id}
                      href={`/library/${c.id}`}
                      className="group flex items-start gap-4 rounded-2xl border border-line bg-white p-5 hover:border-primary/40 hover:shadow-md active:scale-[0.99] transition"
                    >
                      <div className="w-11 h-11 shrink-0 rounded-xl bg-primary-wash flex items-center justify-center group-hover:bg-primary-soft transition">
                        <FolderOpen className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-heading truncate">{c.name}</p>
                        <p className="text-xs text-muted truncate mt-0.5">{c.description || "설명 없음"}</p>
                        <p className="text-[11px] text-gray-400 mt-2">
                          자료 <span className="font-semibold text-gray-600">{count}</span>개
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary group-hover:translate-x-0.5 transition mt-1" />
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : (
            !search && (
              <EmptyState
                title="아직 카테고리가 없습니다"
                hint="카테고리를 만들면 그 안에 자료를 올릴 수 있습니다"
                action={
                  <button onClick={() => setIsCreateOpen(true)} className={`${btnStyles.soft} px-4 py-2 text-sm`}>
                    카테고리 만들기
                  </button>
                }
              />
            )
          )}

          {/* 자료 검색 결과 */}
          {search && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-gray-600 ml-1">
                자료 {searching ? "" : <span className="text-primary">{results.length}</span>}
              </h2>
              {searching ? (
                <SkeletonRows rows={3} />
              ) : results.length ? (
                <FileTable files={results} me={me} onDelete={handleDeleteFile} showCategory />
              ) : (
                <EmptyState title={`'${search}'에 맞는 자료가 없습니다`} hint="다른 단어로 검색해 보세요" />
              )}
            </section>
          )}
        </>
      )}

      {isCreateOpen && me && (
        <CategoryModal
          meId={me.id}
          onClose={() => setIsCreateOpen(false)}
          onSaved={(id) => router.push(`/library/${id}`)}
        />
      )}
      {isOrderOpen && (
        <CategoryOrderModal
          categories={categories}
          onClose={() => setIsOrderOpen(false)}
          onSaved={() => {
            setIsOrderOpen(false);
            fetchCategories();
          }}
        />
      )}
    </div>
  );
}
