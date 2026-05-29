"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Select from "@/components/Select";

type Props = {
  projectId: string;
  myUserId: string;
  isMember: boolean;
  isAdmin: boolean;
  isMarf?: boolean;
};

type CheckItem = {
  id: string;
  title: string;
  category: string;
  due_date: string | null;
  is_completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
  sort_order: number;
  source_type: string | null;  // 'accommodation_cleaning' 등 자동 생성 구분용
};

const MARF_CATEGORIES    = ["전체", "숙소", "차량", "선물", "일정", "일반"];
const GENERAL_CATEGORIES = ["전체", "일정", "일반"];

export default function ChecklistTab({ projectId, myUserId, isMember, isAdmin, isMarf }: Props) {
  // supabase 클라이언트를 한 번만 생성 → 매 렌더마다 재생성되면 불필요한 work 발생
  const supabase = useMemo(() => createClient(), []);

  const CATEGORIES = isMarf ? MARF_CATEGORIES : GENERAL_CATEGORIES;
  const NEW_ITEM_DEFAULT_CAT = isMarf ? "일반" : "일반";

  const [items,       setItems]       = useState<CheckItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [filterCat,   setFilterCat]   = useState("전체");
  const [newTitle,    setNewTitle]    = useState("");
  const [newCategory, setNewCategory] = useState(NEW_ITEM_DEFAULT_CAT);
  const [newDueDate,  setNewDueDate]  = useState("");
  const [adding,      setAdding]      = useState(false);
  const [showAdd,     setShowAdd]     = useState(false);

  // 인라인 수정용 상태
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from("project_checklists")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order")
      .order("created_at");
    setItems((data || []) as CheckItem[]);
    setLoading(false);
  }, [supabase, projectId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // ── 체크 토글 ───────────────────────────────────────────────────────
  const handleToggle = useCallback(async (item: CheckItem) => {
    if (!isMember) return;
    const now   = new Date().toISOString();
    const patch = item.is_completed
      ? { is_completed: false, completed_by: null,     completed_at: null }
      : { is_completed: true,  completed_by: myUserId, completed_at: now  };
    await supabase.from("project_checklists").update(patch).eq("id", item.id);
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, ...patch } : i));
  }, [supabase, isMember, myUserId]);

  // ── 추가 ────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!newTitle.trim()) { toast.error("항목 이름을 입력하세요."); return; }
    setAdding(true);
    const { data, error } = await supabase
      .from("project_checklists")
      .insert({
        project_id: projectId,
        title:      newTitle.trim(),
        category:   newCategory,
        due_date:   newDueDate || null,
        sort_order: items.length,
      })
      .select()
      .single();
    if (error) { toast.error("추가 실패"); setAdding(false); return; }
    setItems((prev) => [...prev, data as CheckItem]);
    setNewTitle("");
    setNewDueDate("");
    setShowAdd(false);
    setAdding(false);
  };

  // ── 인라인 수정 저장 ─────────────────────────────────────────────────
  const handleSave = async (item: CheckItem) => {
    if (!editTitle.trim()) { toast.error("항목 이름을 입력하세요."); return; }
    const { error } = await supabase
      .from("project_checklists")
      .update({ title: editTitle.trim() })
      .eq("id", item.id);
    if (error) { toast.error("수정 실패"); return; }
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, title: editTitle.trim() } : i));
    setEditId(null);
  };

  // ── 삭제 (확인 후) ───────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!window.confirm("이 체크리스트 항목을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("project_checklists").delete().eq("id", id);
    if (error) { toast.error("삭제 실패"); return; }
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  // ── 필터 & 통계 ─────────────────────────────────────────────────────
  const filtered = useMemo(
    () => filterCat === "전체" ? items : items.filter((i) => i.category === filterCat),
    [items, filterCat],
  );
  const done = useMemo(() => items.filter((i) => i.is_completed).length, [items]);

  if (loading) return <div className="text-center py-10 text-gray-400">로딩 중...</div>;

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setFilterCat(c)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                filterCat === c ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}>{c}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            <b className="text-green-600">{done}</b> / {items.length} 완료
          </span>
          {isAdmin && (
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              항목 추가
            </button>
          )}
        </div>
      </div>

      {/* 진행률 바 */}
      {items.length > 0 && (
        <div className="mb-4">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-400 rounded-full transition-all"
              style={{ width: `${(done / items.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 추가 폼 */}
      {showAdd && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <div className="grid sm:grid-cols-4 gap-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="새 항목 이름..."
              autoFocus
              className="sm:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Select
              value={newCategory}
              onChange={(v) => setNewCategory(v)}
              options={CATEGORIES.slice(1).map((c) => ({ value: c, label: c }))}
              className="w-full py-2 px-3 bg-white border border-gray-300 rounded-lg text-sm"
            />
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              취소
            </button>
            <button
              onClick={handleAdd}
              disabled={adding}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {adding ? "추가 중..." : "추가"}
            </button>
          </div>
        </div>
      )}

      {/* 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">항목이 없습니다.</div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 bg-white rounded-lg border px-4 py-3 transition group ${
                item.is_completed ? "border-green-100 bg-green-50/30" : "border-gray-200"
              }`}
            >
              {/* 체크박스 */}
              <input
                type="checkbox"
                checked={item.is_completed}
                onChange={() => handleToggle(item)}
                className="w-4 h-4 rounded accent-green-500 cursor-pointer shrink-0"
              />

              {/* 제목 — 수정 모드이면 input, 아니면 텍스트 */}
              {editId === item.id ? (
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave(item);
                      if (e.key === "Escape") setEditId(null);
                    }}
                    autoFocus
                    className="flex-1 border border-blue-400 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => handleSave(item)}
                    className="px-2.5 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition shrink-0"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => setEditId(null)}
                    className="px-2.5 py-1 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-100 transition shrink-0"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <span className={`flex-1 text-sm ${item.is_completed ? "line-through text-gray-400" : "text-gray-800"}`}>
                  {item.title}
                </span>
              )}

              {/* 태그들 (수정 중이 아닐 때만 표시) */}
              {editId !== item.id && (
                <>
                  {item.source_type && (
                    <span className="text-xs bg-blue-50 text-blue-400 border border-blue-100 px-1.5 py-0.5 rounded shrink-0">자동</span>
                  )}
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">{item.category}</span>
                  {item.due_date && (
                    <span className={`text-xs shrink-0 ${new Date(item.due_date) < new Date() && !item.is_completed ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                      {item.due_date}
                    </span>
                  )}
                </>
              )}

              {/* 수정·삭제 버튼 (admin, 수정 모드 아닐 때, hover 시 표시) */}
              {isAdmin && editId !== item.id && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => { setEditId(item.id); setEditTitle(item.title); }}
                    title="수정"
                    className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-blue-500 transition rounded"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    title="삭제"
                    className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 transition rounded"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
