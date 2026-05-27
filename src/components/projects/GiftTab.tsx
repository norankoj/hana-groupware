"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Select from "@/components/Select";
import Modal from "@/components/Modal";

type Props = { projectId: string; myUserId: string; isMember: boolean; isAdmin: boolean };

/** 선물 종류 (마스터 목록) */
type GiftItem = {
  id: string;
  item_name: string;
  description: string | null;
  responsible_name: string | null;
  unit_budget: number | null;
  notes: string | null;
  sort_order: number;
};

/** 가정별 배치 (marf_gifts + gift_item_id) */
type GiftAssignment = {
  id: string;
  gift_item_id: string;
  missionary_id: string | null;
  status: string;
  notes: string | null;
};

type Missionary = { id: string; name: string; family_group: string | null };
type Family     = { key: string; label: string; repId: string; memberCount: number };

const STATUS = {
  pending:   { label: "준비전",   color: "bg-gray-100 text-gray-500",       icon: "⏸" },
  purchased: { label: "구매완료", color: "bg-sky-100 text-sky-700",         icon: "🛒" },
  prepared:  { label: "준비완료", color: "bg-amber-100 text-amber-700",     icon: "📦" },
  delivered: { label: "전달완료", color: "bg-emerald-100 text-emerald-700", icon: "✅" },
} as const;

const EMPTY_ITEM_FORM   = { item_name: "", description: "", responsible_name: "", unit_budget: "", notes: "" };
const EMPTY_ASSIGN_FORM = { gift_item_id: "", status: "pending", notes: "" };

export default function GiftTab({ projectId, isMember, isAdmin }: Props) {
  const supabase = createClient();
  const [giftItems,     setGiftItems]     = useState<GiftItem[]>([]);
  const [assignments,   setAssignments]   = useState<GiftAssignment[]>([]);
  const [missionaries,  setMissionaries]  = useState<Missionary[]>([]);
  const [loading,       setLoading]       = useState(true);

  // ── 선물 종류 모달 ──────────────────────────────────────────────────────────
  const [showItemModal, setShowItemModal] = useState(false);
  const [selectedItem,  setSelectedItem]  = useState<GiftItem | null>(null);
  const [itemForm,      setItemForm]      = useState(EMPTY_ITEM_FORM);
  const [savingItem,    setSavingItem]    = useState(false);

  // ── 가정 배치 모달 ──────────────────────────────────────────────────────────
  const [showAssignModal,  setShowAssignModal]  = useState(false);
  const [assigningToFamily, setAssigningToFamily] = useState<Family | null>(null);
  const [selectedAssign,   setSelectedAssign]   = useState<GiftAssignment | null>(null);
  const [assignForm,       setAssignForm]        = useState(EMPTY_ASSIGN_FORM);
  const [savingAssign,     setSavingAssign]      = useState(false);

  // ── fetch ───────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const [{ data: gi }, { data: ga }, { data: m }] = await Promise.all([
      supabase.from("marf_gift_items")
        .select("*").eq("project_id", projectId)
        .order("sort_order").order("created_at"),
      supabase.from("marf_gifts")
        .select("id, gift_item_id, missionary_id, status, notes")
        .eq("project_id", projectId)
        .not("gift_item_id", "is", null),
      supabase.from("marf_missionaries")
        .select("id, name, family_group")
        .eq("project_id", projectId)
        .order("family_group").order("name"),
    ]);
    setGiftItems((gi  || []) as GiftItem[]);
    setAssignments((ga || []) as GiftAssignment[]);
    setMissionaries((m || []) as Missionary[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── 가족 목록 구성 ───────────────────────────────────────────────────────────
  const groupMap = new Map<string, Missionary[]>();
  const solos: Missionary[] = [];
  missionaries.forEach((m) => {
    const g = m.family_group?.trim();
    if (g) { if (!groupMap.has(g)) groupMap.set(g, []); groupMap.get(g)!.push(m); }
    else solos.push(m);
  });
  const families: Family[] = [];
  groupMap.forEach((members, group) =>
    families.push({ key: group, label: group, repId: members[0].id, memberCount: members.length }),
  );
  solos.forEach((m) =>
    families.push({ key: m.id, label: m.name, repId: m.id, memberCount: 1 }),
  );

  const getMemberIds = (repId: string): Set<string> => {
    const m = missionaries.find((x) => x.id === repId);
    if (!m?.family_group?.trim()) return new Set([repId]);
    return new Set(
      missionaries.filter((x) => x.family_group?.trim() === m.family_group!.trim()).map((x) => x.id),
    );
  };

  /** 가정에 배치된 선물 assignments */
  const getAssignmentsForFamily = (repId: string): GiftAssignment[] => {
    const memberIds = getMemberIds(repId);
    return assignments.filter((a) => a.missionary_id && memberIds.has(a.missionary_id));
  };

  /** 이 가정에 아직 배치 안 된 선물 종류 옵션 */
  const buildGiftOptions = (repId: string) => {
    const usedItemIds = new Set(getAssignmentsForFamily(repId).map((a) => a.gift_item_id));
    return [
      { value: "", label: "— 선물 선택 —" },
      ...giftItems.map((gi) => ({
        value: gi.id,
        label: `🎁 ${gi.item_name}${usedItemIds.has(gi.id) ? "  ✓배치됨" : ""}`,
      })),
    ];
  };

  // ── 선물 종류 CRUD ──────────────────────────────────────────────────────────
  const openCreateItem = () => { setSelectedItem(null); setItemForm(EMPTY_ITEM_FORM); setShowItemModal(true); };
  const openEditItem   = (item: GiftItem) => {
    setSelectedItem(item);
    setItemForm({
      item_name: item.item_name, description: item.description || "",
      responsible_name: item.responsible_name || "",
      unit_budget: item.unit_budget?.toString() || "", notes: item.notes || "",
    });
    setShowItemModal(true);
  };
  const handleSaveItem = async () => {
    if (!itemForm.item_name.trim()) { toast.error("선물 이름을 입력하세요."); return; }
    setSavingItem(true);
    const payload = {
      item_name: itemForm.item_name, description: itemForm.description || null,
      responsible_name: itemForm.responsible_name || null,
      unit_budget: itemForm.unit_budget ? Number(itemForm.unit_budget) : null,
      notes: itemForm.notes || null,
    };
    if (selectedItem) {
      const { error } = await supabase.from("marf_gift_items").update(payload).eq("id", selectedItem.id);
      if (error) { toast.error("수정 실패"); setSavingItem(false); return; }
      toast.success("수정되었습니다.");
    } else {
      const { error } = await supabase.from("marf_gift_items").insert({ ...payload, project_id: projectId });
      if (error) { toast.error("저장 실패"); setSavingItem(false); return; }
      toast.success("등록되었습니다.");
    }
    setShowItemModal(false); fetchData(); setSavingItem(false);
  };
  const handleDeleteItem = async (id: string) => {
    if (!confirm("선물 종류와 모든 배치 정보가 삭제됩니다. 삭제하시겠습니까?")) return;
    await supabase.from("marf_gift_items").delete().eq("id", id);
    toast.success("삭제되었습니다."); fetchData();
  };

  // ── 가정 배치 CRUD ──────────────────────────────────────────────────────────
  const openCreateAssign = (family: Family) => {
    setAssigningToFamily(family);
    setSelectedAssign(null);
    setAssignForm(EMPTY_ASSIGN_FORM);
    setShowAssignModal(true);
  };
  const openEditAssign = (family: Family, assign: GiftAssignment) => {
    setAssigningToFamily(family);
    setSelectedAssign(assign);
    setAssignForm({ gift_item_id: assign.gift_item_id, status: assign.status, notes: assign.notes || "" });
    setShowAssignModal(true);
  };
  const handleSaveAssign = async () => {
    if (!assignForm.gift_item_id) { toast.error("선물을 선택하세요."); return; }
    if (!assigningToFamily) return;
    setSavingAssign(true);
    const gi = giftItems.find((x) => x.id === assignForm.gift_item_id);
    const payload = {
      gift_item_id: assignForm.gift_item_id,
      missionary_id: assigningToFamily.repId,
      status: assignForm.status,
      notes: assignForm.notes || null,
    };
    if (selectedAssign) {
      const { error } = await supabase.from("marf_gifts").update(payload).eq("id", selectedAssign.id);
      if (error) { toast.error("수정 실패"); setSavingAssign(false); return; }
      toast.success("수정되었습니다.");
    } else {
      const { error } = await supabase.from("marf_gifts").insert({
        ...payload, project_id: projectId,
        item_name: gi?.item_name ?? "", quantity: 1,
      });
      if (error) { toast.error("저장 실패"); setSavingAssign(false); return; }
      toast.success("배치되었습니다.");
    }
    setShowAssignModal(false); fetchData(); setSavingAssign(false);
  };
  const handleDeleteAssign = async (id: string) => {
    if (!confirm("이 배치를 삭제하시겠습니까?")) return;
    await supabase.from("marf_gifts").delete().eq("id", id);
    toast.success("삭제되었습니다."); fetchData();
  };

  // ── 통계 ─────────────────────────────────────────────────────────────────
  const totalNeeded    = assignments.length;
  const totalPurchased = assignments.filter((a) =>
    ["purchased", "prepared", "delivered"].includes(a.status)).length;
  const totalDelivered = assignments.filter((a) => a.status === "delivered").length;

  if (loading) return <div className="text-center py-10 text-gray-400">로딩 중...</div>;

  return (
    <div className="space-y-6">

      {/* ════════════════════════════════════════
          상단: 선물 목록 (종류별 현황)
      ════════════════════════════════════════ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-sm font-bold text-gray-700">🎁 선물 목록</h3>
            <span className="text-xs text-gray-400">종류 {giftItems.length}개</span>
            {totalNeeded > 0 && (
              <>
                <span className="text-xs text-gray-500">필요 <b className="text-gray-800">{totalNeeded}</b>개</span>
                <span className="text-xs text-blue-600">구매완료 <b>{totalPurchased}</b>개</span>
                <span className="text-xs text-green-600">전달완료 <b>{totalDelivered}</b>개</span>
              </>
            )}
          </div>
          {isAdmin && (
            <button
              onClick={openCreateItem}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              선물 추가
            </button>
          )}
        </div>

        {giftItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-8 text-center text-gray-400 text-sm">
            <p>등록된 선물이 없습니다.</p>
            {isAdmin && <p className="text-xs mt-1">위 버튼으로 선물을 추가하세요.</p>}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">선물명</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600 text-xs hidden sm:table-cell">담당자</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-gray-600 text-xs">필요</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-gray-600 text-xs">구매완료</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-gray-600 text-xs">전달완료</th>
                  <th className="px-4 py-2.5 text-xs text-gray-600 font-semibold hidden md:table-cell">진행률</th>
                  {isAdmin && <th className="px-3 py-2.5 w-16" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {giftItems.map((item) => {
                  const itemAssigns = assignments.filter((a) => a.gift_item_id === item.id);
                  const needed    = itemAssigns.length;
                  const purchased = itemAssigns.filter((a) =>
                    ["purchased", "prepared", "delivered"].includes(a.status)).length;
                  const delivered = itemAssigns.filter((a) => a.status === "delivered").length;
                  const pct = needed > 0 ? Math.round((purchased / needed) * 100) : 0;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 group">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{item.item_name}</div>
                        {item.description && <div className="text-xs text-gray-400 mt-0.5">{item.description}</div>}
                        {item.unit_budget && (
                          <div className="text-xs text-gray-400">개당 {item.unit_budget.toLocaleString()}원</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-sm hidden sm:table-cell">
                        {item.responsible_name || <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-bold text-gray-800">{needed}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-bold ${purchased === needed && needed > 0 ? "text-green-600" : "text-blue-600"}`}>
                          {purchased}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-bold ${delivered === needed && needed > 0 ? "text-green-600" : "text-gray-600"}`}>
                          {delivered}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {needed > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  pct === 100 ? "bg-green-500" : pct >= 50 ? "bg-blue-500" : "bg-orange-400"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 w-8 text-right shrink-0">{pct}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">배치 없음</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={() => openEditItem(item)}
                              className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition"
                              title="수정"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition"
                              title="삭제"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════
          하단: 가정별 배치 현황 (테이블)
      ════════════════════════════════════════ */}
      <section>
        {/* 타이틀 + 통계 */}
        {(() => {
          const assignedCount   = families.filter((f) => getAssignmentsForFamily(f.repId).length > 0).length;
          const unassignedCount = families.length - assignedCount;
          return (
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <h3 className="text-sm font-bold text-gray-700">🎁 가정별 배치 현황</h3>
              {families.length > 0 && (
                <>
                  <span className="text-xs text-gray-400">전체 <b className="text-gray-700">{families.length}</b>가정</span>
                  <span className="text-xs text-blue-600">배치 완료 <b>{assignedCount}</b>가정</span>
                  {unassignedCount > 0 && (
                    <span className="text-xs text-orange-500">미배치 <b>{unassignedCount}</b>가정</span>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {families.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            <p>명단 데이터가 없습니다.</p>
            <p className="text-xs mt-1">먼저 명단 탭에서 선교사를 등록하세요.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs w-40">가정</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs">배치된 선물</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs hidden md:table-cell">메모</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs hidden sm:table-cell">상태</th>
                  {isMember && giftItems.length > 0 && <th className="px-4 py-2.5 w-20" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {families.map((family) => {
                  const familyAssigns = getAssignmentsForFamily(family.repId);
                  return (
                    <tr key={family.key} className="hover:bg-gray-50 group transition-colors">

                      {/* 가정명 */}
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-gray-900">
                          {family.memberCount > 1 ? "👨‍👩‍👧" : "👤"} {family.label}
                        </div>
                        {family.memberCount > 1 && (
                          <div className="text-xs text-gray-400 mt-0.5">{family.memberCount}명</div>
                        )}
                      </td>

                      {/* 배치된 선물 (선물명만) */}
                      <td className="px-4 py-3 align-top">
                        {familyAssigns.length === 0 ? (
                          <span className="text-gray-400">배치 없음</span>
                        ) : (
                          <div className="space-y-1.5">
                            {familyAssigns.map((assign) => {
                              const gi = giftItems.find((x) => x.id === assign.gift_item_id);
                              return (
                                <div key={assign.id}>
                                  <button
                                    onClick={() => isMember && openEditAssign(family, assign)}
                                    className={`leading-tight text-left ${
                                      isMember
                                        ? "text-blue-600 hover:underline cursor-pointer"
                                        : "text-gray-800 cursor-default"
                                    } transition`}
                                  >
                                    {gi?.item_name ?? "(알 수 없음)"}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      {/* 메모 */}
                      <td className="px-4 py-3 align-top hidden md:table-cell">
                        <div className="space-y-1.5">
                          {familyAssigns.map((assign) => (
                            <span key={assign.id} className="text-gray-500 truncate max-w-[200px] block leading-tight">
                              {assign.notes || <span className="text-gray-300">—</span>}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* 상태 (메모 다음 컬럼) */}
                      <td className="px-4 py-3 align-top hidden sm:table-cell">
                        <div className="space-y-1.5">
                          {familyAssigns.length === 0 ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            familyAssigns.map((assign) => {
                              const st = STATUS[assign.status as keyof typeof STATUS]
                                ?? { label: assign.status, color: "bg-gray-100 text-gray-500", icon: "" };
                              return (
                                <span key={assign.id} className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${st.color}`}>
                                  {st.label}
                                </span>
                              );
                            })
                          )}
                        </div>
                      </td>

                      {/* 배치 버튼 */}
                      {isMember && giftItems.length > 0 && (
                        <td className="px-4 py-3 align-top text-right">
                          <button
                            onClick={() => openCreateAssign(family)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition whitespace-nowrap opacity-0 group-hover:opacity-100"
                          >
                            + 배치
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── 선물 종류 추가/수정 모달 ── */}
      <Modal
        isOpen={showItemModal}
        onClose={() => setShowItemModal(false)}
        title={selectedItem ? "선물 수정" : "선물 추가"}
        className="sm:max-w-[480px]"
        footer={
          <>
            <button onClick={() => setShowItemModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
            <button onClick={handleSaveItem} disabled={savingItem} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {savingItem ? "저장 중..." : "저장"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">선물 이름 *</label>
            <input
              type="text" value={itemForm.item_name} autoFocus
              onChange={(e) => setItemForm({ ...itemForm, item_name: e.target.value })}
              placeholder="예: 특산물 세트, 성경책"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">설명</label>
            <input
              type="text" value={itemForm.description}
              onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
              placeholder="선물에 대한 간단한 설명"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">담당자</label>
              <input
                type="text" value={itemForm.responsible_name}
                onChange={(e) => setItemForm({ ...itemForm, responsible_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">개당 예산 (원)</label>
              <input
                type="number" value={itemForm.unit_budget}
                onChange={(e) => setItemForm({ ...itemForm, unit_budget: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">메모</label>
            <textarea
              value={itemForm.notes} rows={2}
              onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          {selectedItem && isAdmin && (
            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={() => { setShowItemModal(false); handleDeleteItem(selectedItem.id); }}
                className="text-sm text-red-500 hover:text-red-700 transition"
              >
                이 선물 삭제
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* ── 가정 배치 추가/수정 모달 ── */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title={
          selectedAssign
            ? `배치 수정 — ${assigningToFamily?.label}`
            : `선물 배치 — ${assigningToFamily?.label}`
        }
        className="sm:max-w-[400px]"
        footer={
          <>
            <button onClick={() => setShowAssignModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
            <button onClick={handleSaveAssign} disabled={savingAssign} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {savingAssign ? "저장 중..." : "저장"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">선물 *</label>
            <Select
              value={assignForm.gift_item_id}
              onChange={(v) => setAssignForm({ ...assignForm, gift_item_id: v })}
              options={assigningToFamily ? buildGiftOptions(assigningToFamily.repId) : []}
              className="w-full py-2 px-3 bg-white border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">상태</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(STATUS).map(([k, v]) => (
                <label
                  key={k}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition ${
                    assignForm.status === k ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio" name="assign_status" value={k}
                    checked={assignForm.status === k}
                    onChange={() => setAssignForm({ ...assignForm, status: k })}
                    className="w-3.5 h-3.5 accent-blue-600"
                  />
                  <span className="text-sm">{v.icon} {v.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">메모</label>
            <input
              type="text" value={assignForm.notes}
              onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
              placeholder="특이사항"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {selectedAssign && (
            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={() => { setShowAssignModal(false); handleDeleteAssign(selectedAssign.id); }}
                className="text-sm text-red-500 hover:text-red-700 transition"
              >
                이 배치 삭제
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
