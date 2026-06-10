"use client";

import { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Select from "@/components/Select";
import Modal from "@/components/Modal";
import CopyMessageModal, { type CopyTemplate } from "@/components/projects/CopyMessageModal";
import AuditLogModal from "@/components/projects/AuditLogModal";
import { logAudit, summarizeAssignmentDiff } from "@/utils/auditLog";
import {
  buildAccomGuestKO,
  buildAccomGuestEN,
  buildAccomHostKO,
} from "@/utils/messageTemplates";
import {
  checkMultiPeriodCoverage,
  getFamilyAccomPeriods,
  getRemainingPeriods,
  formatPeriods,
  COVER_ICON,
  type Coverage,
  type DatePeriod,
} from "@/utils/projectUtils";

type Props = { projectId: string; myUserId: string; isMember: boolean; isAdmin: boolean };

// 가정별 배정 항목 (기간 + 차량 사진 포함)
export type AssignmentEntry = {
  missionary_id: string;
  from: string;
  to: string;
  start_photos?: string[];   // 이용 전 사진 URL 목록
  end_photos?: string[];     // 이용 후 사진 URL 목록
};

type Accommodation = {
  id: string;
  provider_name: string;
  provider_contact: string | null;
  address: string | null;
  capacity: number;
  amenities: string[] | null;
  available_from: string | null;
  available_to: string | null;
  is_church_owned: boolean;                // 교회 소속 (기간 제한 없음)
  assignments: AssignmentEntry[] | null;   // 다중 가정 배정 (NEW)
  assigned_missionary_id: string | null;   // 레거시 단일 배정 (하위 호환)
  guide_content: string | null;
  notes: string | null;
};

type Missionary = {
  id: string;
  name: string;
  family_group: string | null;
  accommodation_periods: DatePeriod[] | null;
  accommodation_from: string | null;
  accommodation_to: string | null;
  arrival_date: string | null;
  departure_date: string | null;
};

type Family = { key: string; label: string; repId: string; memberCount: number };

type FlatRow = {
  key: string;
  family: Family;
  periods: DatePeriod[];
  coverage: Coverage;
  accom: Accommodation | null;
  memberIds: Set<string>;
  assignedFrom: string;
  assignedTo: string;
};


/** assignments JSONB 우선, 없으면 legacy assigned_missionary_id → 마이그레이션 */
function normalizeAssignments(item: {
  assignments?: AssignmentEntry[] | null;
  assigned_missionary_id: string | null;
  available_from: string | null;
  available_to: string | null;
}): AssignmentEntry[] {
  if (item.assignments && item.assignments.length > 0) return item.assignments;
  if (item.assigned_missionary_id) {
    return [{
      missionary_id: item.assigned_missionary_id,
      from: item.available_from || "",
      to: item.available_to || "",
    }];
  }
  return [];
}

const EMPTY_FORM = {
  provider_name: "", provider_contact: "", address: "", capacity: 2,
  amenities: [] as string[], available_from: "", available_to: "",
  is_church_owned: false,
  assignments: [] as AssignmentEntry[],
  guide_content: "", notes: "",
};

export default function AccommodationTab({ projectId, isMember, isAdmin }: Props) {
  const supabase = createClient();
  const [items, setItems] = useState<Accommodation[]>([]);
  const [missionaries, setMissionaries] = useState<Missionary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Accommodation | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detailItem, setDetailItem] = useState<Accommodation | null>(null);
  const [viewMode, setViewMode] = useState<"family" | "summary" | "all">("family");

  // ── 숙소 선택(픽커) 모달 ──────────────────────────────────────────────────
  const [showPickModal, setShowPickModal] = useState(false);
  const [pickFamily,    setPickFamily]    = useState<Family | null>(null);
  const [pickAccomId,   setPickAccomId]   = useState("");
  const [pickFrom,      setPickFrom]      = useState("");
  const [pickTo,        setPickTo]        = useState("");
  const [savingPick,    setSavingPick]    = useState(false);

  // ── 안내문 복사 모달 / 변경 이력 모달 ─────────────────────────────────────
  const [copyMsg, setCopyMsg] = useState<{ title: string; templates: CopyTemplate[] } | null>(null);
  const [showAuditLog, setShowAuditLog] = useState(false);

  const fetchData = useCallback(async () => {
    const [{ data: a }, { data: m }] = await Promise.all([
      supabase.from("marf_accommodations").select("*").eq("project_id", projectId)
        .order("available_from", { ascending: true, nullsFirst: false })
        .order("created_at"),
      supabase
        .from("marf_missionaries")
        .select("id, name, family_group, accommodation_periods, accommodation_from, accommodation_to, arrival_date, departure_date")
        .eq("project_id", projectId)
        .eq("accommodation_needed", true)
        .order("family_group").order("name"),
    ]);
    setItems((a || []) as Accommodation[]);
    setMissionaries((m || []) as Missionary[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── 가족 목록 구성 (memoized) ──────────────────────────────────────────────
  const { groupMap, soloMissionaries, families } = useMemo(() => {
    const groupMap = new Map<string, Missionary[]>();
    const soloMissionaries: Missionary[] = [];
    missionaries.forEach((m) => {
      const g = m.family_group?.trim();
      if (g) { if (!groupMap.has(g)) groupMap.set(g, []); groupMap.get(g)!.push(m); }
      else soloMissionaries.push(m);
    });
    const families: Family[] = [];
    groupMap.forEach((members, group) =>
      families.push({ key: group, label: group, repId: members[0].id, memberCount: members.length }),
    );
    soloMissionaries.forEach((m) =>
      families.push({ key: m.id, label: m.name, repId: m.id, memberCount: 1 }),
    );
    // ── 숙소 요청 시작일 기준 날짜 정렬 ──
    const getSortDate = (repId: string): string => {
      const m = missionaries.find((x) => x.id === repId);
      if (!m) return "";
      const periods = (m.accommodation_periods ?? []).filter((p) => p.from);
      if (periods.length > 0) return [...periods.map((p) => p.from)].sort()[0];
      return m.accommodation_from ?? m.arrival_date ?? "";
    };
    families.sort((a, b) => {
      const da = getSortDate(a.repId), db = getSortDate(b.repId);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
    return { groupMap, soloMissionaries, families };
  }, [missionaries]);

  // ── 가족 멤버 ID 집합 (memoized callback) ─────────────────────────────────
  const getMemberIds = useCallback((repId: string): Set<string> => {
    const m = missionaries.find((x) => x.id === repId);
    if (!m?.family_group?.trim()) return new Set([repId]);
    return new Set(
      missionaries.filter((x) => x.family_group?.trim() === m.family_group!.trim()).map((x) => x.id),
    );
  }, [missionaries]);

  /** "2026-07-15" → "07/15" */
  const fmtD = (d: string | null | undefined) => d ? d.slice(5).replace('-', '/') : "?";

  // 프로젝트 전체 기간 (memoized)
  const { projectFrom, projectTo } = useMemo(() => ({
    projectFrom: missionaries.map((m) => m.arrival_date).filter(Boolean).sort()[0] ?? "",
    projectTo:   missionaries.map((m) => m.departure_date).filter(Boolean).sort().at(-1) ?? "",
  }), [missionaries]);

  // 가족별 데이터(배정 숙소 + 커버리지) 사전 계산 (memoized) — 폼 입력 시 재계산 방지
  const familyDataMap = useMemo(() => {
    const map = new Map<string, { accoms: Accommodation[]; coverage: Coverage }>();
    families.forEach((family) => {
      const memberIds = getMemberIds(family.repId);
      const accoms = items
        .filter((item) => normalizeAssignments(item).some((a) => memberIds.has(a.missionary_id)))
        .sort((a, b) => {
          // 이 가족의 배정 시작일로 정렬
          const getFrom = (item: Accommodation) => {
            const d = normalizeAssignments(item).filter((a) => memberIds.has(a.missionary_id)).map((a) => a.from).filter(Boolean).sort();
            return d[0] ?? item.available_from ?? "";
          };
          const da = getFrom(a), db = getFrom(b);
          if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
          return da.localeCompare(db);
        });
      const requested = getFamilyAccomPeriods(family.repId, missionaries);
      const assignedPeriods = items.flatMap((item) =>
        normalizeAssignments(item)
          .filter((a) => memberIds.has(a.missionary_id))
          .map((a) => ({ from: a.from, to: a.to })),
      );
      const coverage = checkMultiPeriodCoverage(assignedPeriods, requested);
      map.set(family.repId, { accoms, coverage });
    });
    return map;
  }, [families, getMemberIds, missionaries, items]);

  // 요약표용 플랫 행 목록 (날짜순 정렬, 기간별 분리) (memoized)
  const flatSummaryRows = useMemo((): FlatRow[] => {
    const rows: FlatRow[] = [];
    families.forEach((family) => {
      const { accoms = [], coverage = "none" as Coverage } = familyDataMap.get(family.repId) ?? {};
      const periods = getFamilyAccomPeriods(family.repId, missionaries);
      const memberIds = getMemberIds(family.repId);
      if (accoms.length === 0) {
        rows.push({ key: `${family.key}-unassigned`, family, periods, coverage, accom: null, memberIds, assignedFrom: "", assignedTo: "" });
      } else {
        accoms.forEach((a) => {
          const myA = normalizeAssignments(a).filter(as => memberIds.has(as.missionary_id));
          if (myA.length === 0) {
            rows.push({ key: `${family.key}-${a.id}`, family, periods, coverage, accom: a, memberIds, assignedFrom: "", assignedTo: "" });
          } else {
            myA.forEach((as, i) => {
              rows.push({
                key: `${family.key}-${a.id}-${i}`,
                family, periods,
                coverage: checkMultiPeriodCoverage([{ from: as.from, to: as.to }], periods),
                accom: a, memberIds,
                assignedFrom: as.from, assignedTo: as.to,
              });
            });
          }
        });
      }
    });
    rows.sort((a, b) => {
      if (!a.assignedFrom && !b.assignedFrom) return 0;
      if (!a.assignedFrom) return 1;
      if (!b.assignedFrom) return -1;
      return a.assignedFrom.localeCompare(b.assignedFrom);
    });
    return rows;
  }, [families, familyDataMap, missionaries, getMemberIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // 교회 숙소: available_from/to 우선, 없으면 프로젝트 기간 폴백
  const churchAccomBound = (item: Accommodation) => ({
    from: item.available_from ?? projectFrom,
    to:   item.available_to   ?? projectTo,
  });

  // 미배정 풀 = 완전 미배정 + 남은 기간 있는 숙소 (교회·성도 모두) (memoized)
  type PoolEntry = { item: Accommodation; remainingPeriods: DatePeriod[] };
  const unassignedPool: PoolEntry[] = useMemo(() => [
    ...items.filter((item) => normalizeAssignments(item).length === 0)
            .map((item) => ({ item, remainingPeriods: [] as DatePeriod[] })),
    ...items
      .filter((item) => normalizeAssignments(item).length > 0)
      .flatMap((item) => {
        const { from, to } = item.is_church_owned
          ? churchAccomBound(item)
          : { from: item.available_from ?? "", to: item.available_to ?? "" };
        if (!from || !to) return [];
        const remaining = getRemainingPeriods(normalizeAssignments(item), from, to);
        return remaining.length > 0 ? [{ item, remainingPeriods: remaining }] : [];
      }),
  ], [items, projectFrom, projectTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // 배정 가능 숙소 (memoized)
  const pickableAccoms = useMemo(() =>
    items.filter((item) => normalizeAssignments(item).length === 0 || item.is_church_owned),
  [items]);

  // ── 전체 목록 뷰용 헬퍼 ─────────────────────────────────────────────────
  const getAssignedLabels = (item: Accommodation): { label: string; from: string; to: string }[] =>
    normalizeAssignments(item).map((a) => {
      const m = missionaries.find((x) => x.id === a.missionary_id);
      if (!m) return null;
      const g = m.family_group?.trim();
      return { label: g || m.name, from: a.from, to: a.to };
    }).filter(Boolean) as { label: string; from: string; to: string }[];

  // ── 드롭다운 옵션 (memoized) ─────────────────────────────────────────────
  const familyOptions = useMemo(() => [
    { value: "", label: "— 선택 —" },
    ...Array.from(groupMap.entries()).map(([group, members]) => ({
      value: members[0].id,
      label: `👨‍👩‍👧 ${group} (${members.length}명)`,
    })),
    ...soloMissionaries.map((m) => ({ value: m.id, label: `👤 ${m.name}` })),
  ], [groupMap, soloMissionaries]);

  const openCreate = (repId?: string) => {
    setSelected(null);
    setForm({ ...EMPTY_FORM, assignments: repId ? [{ missionary_id: repId, from: "", to: "" }] : [] });
    setShowModal(true);
  };
  const openEdit = (a: Accommodation) => {
    setSelected(a);
    setForm({
      provider_name: a.provider_name, provider_contact: a.provider_contact || "",
      address: a.address || "", capacity: a.capacity, amenities: a.amenities || [],
      available_from: a.available_from || "", available_to: a.available_to || "",
      is_church_owned: a.is_church_owned,
      assignments: normalizeAssignments(a),
      guide_content: a.guide_content || "", notes: a.notes || "",
    });
    setShowDetail(false);
    setShowModal(true);
  };
  const openDetail = (a: Accommodation) => { setDetailItem(a); setShowDetail(true); };

  // ── 숙소 선택 모달 핸들러 ─────────────────────────────────────────────────
  const openPickModal = (family: Family) => {
    const periods = getFamilyAccomPeriods(family.repId, missionaries);
    setPickFamily(family);
    setPickAccomId("");
    setPickFrom(periods[0]?.from ?? "");
    setPickTo(periods.at(-1)?.to ?? "");
    setShowPickModal(true);
  };

  const handleSavePick = async () => {
    if (!pickAccomId)  { toast.error("숙소를 선택하세요."); return; }
    if (!pickFamily)   return;
    if (!pickFrom || !pickTo) { toast.error("배정 날짜를 입력하세요."); return; }
    setSavingPick(true);
    const accom = items.find((x) => x.id === pickAccomId);
    if (!accom) { setSavingPick(false); return; }
    const before = normalizeAssignments(accom);
    const newAssignments: AssignmentEntry[] = [
      ...before,
      { missionary_id: pickFamily.repId, from: pickFrom, to: pickTo },
    ];
    const { error } = await supabase.from("marf_accommodations").update({
      assignments: newAssignments,
      assigned_missionary_id: newAssignments[0]?.missionary_id || null,
    }).eq("id", pickAccomId);
    if (error) { toast.error("배정 실패"); setSavingPick(false); return; }
    await syncCleaningChecklists(pickAccomId, accom.provider_name, newAssignments);
    toast.success("배정되었습니다.");
    // 변경 이력
    const nameMap = new Map(missionaries.map((m) => [m.id, m.family_group || m.name]));
    logAudit(supabase, {
      projectId, entityType: "accommodation", entityId: pickAccomId, action: "assign",
      summary: `[${accom.provider_name}] ${summarizeAssignmentDiff(before, newAssignments, nameMap)}`,
      beforeData: before, afterData: newAssignments,
    });
    setShowPickModal(false); fetchData(); setSavingPick(false);
  };

  const handleSave = async () => {
    if (!form.provider_name.trim()) { toast.error("제공자 이름을 입력하세요."); return; }
    setSaving(true);
    const validAssignments = form.assignments.filter((a) => a.missionary_id && a.from && a.to);
    const payload = {
      provider_name: form.provider_name,
      provider_contact: form.provider_contact || null,
      address: form.address || null,
      capacity: form.capacity,
      amenities: form.amenities,
      available_from: form.available_from || null,
      available_to: form.available_to || null,
      is_church_owned: form.is_church_owned,
      assignments: validAssignments,
      assigned_missionary_id: validAssignments[0]?.missionary_id || null, // 하위 호환
      guide_content: form.guide_content || null,
      notes: form.notes || null,
    };
    if (selected) {
      const before = selected;
      const { error } = await supabase.from("marf_accommodations").update(payload).eq("id", selected.id);
      if (error) { toast.error("수정 실패"); setSaving(false); return; }
      await syncCleaningChecklists(selected.id, form.provider_name, validAssignments);
      toast.success("수정되었습니다.");
      logAudit(supabase, {
        projectId, entityType: "accommodation", entityId: selected.id,
        action: "update", summary: `숙소 수정: ${payload.provider_name}`,
        beforeData: before, afterData: payload,
      });
    } else {
      const { data: inserted, error } = await supabase
        .from("marf_accommodations")
        .insert({ ...payload, project_id: projectId })
        .select("id")
        .single();
      if (error) { toast.error("저장 실패"); setSaving(false); return; }
      await syncCleaningChecklists(inserted.id, form.provider_name, validAssignments);
      toast.success("등록되었습니다.");
      logAudit(supabase, {
        projectId, entityType: "accommodation", entityId: inserted.id,
        action: "create", summary: `숙소 추가: ${payload.provider_name}`,
        afterData: payload,
      });
    }
    setShowModal(false); fetchData(); setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    const target = items.find((x) => x.id === id);
    await supabase.from("marf_accommodations").delete().eq("id", id);
    // 자동 생성된 청소 체크리스트 함께 삭제
    await supabase.from("project_checklists")
      .delete()
      .eq("project_id", projectId)
      .eq("source_id", id)
      .eq("source_type", "accommodation_cleaning");
    toast.success("삭제되었습니다.");
    if (target) {
      logAudit(supabase, {
        projectId, entityType: "accommodation", entityId: id,
        action: "delete", summary: `숙소 삭제: ${target.provider_name}`,
        beforeData: target,
      });
    }
    fetchData();
  };

  // ── 안내문 복사 모달 열기 (배정된 가정용 안내) ─────────────────────────
  const openCopyForAssignment = (item: Accommodation, assign: AssignmentEntry) => {
    const m = missionaries.find((x) => x.id === assign.missionary_id);
    const familyName = m?.family_group || m?.name || "(가정)";
    const opts = {
      familyName,
      providerName: item.provider_name,
      providerContact: item.provider_contact,
      address: item.address,
      from: assign.from,
      to: assign.to,
      amenities: item.amenities,
      notes: item.notes,
    };
    const templates: CopyTemplate[] = [
      { key: "guest_ko", label: "🇰🇷 선교사용 (한국어)", body: buildAccomGuestKO(opts) },
      { key: "guest_en", label: "🇺🇸 선교사용 (English)", body: buildAccomGuestEN(opts) },
      { key: "host_ko",  label: "🙏 봉사자 확정 알림",   body: buildAccomHostKO({
        providerName: item.provider_name, familyName,
        from: assign.from, to: assign.to, notes: item.notes,
      }) },
    ];
    setCopyMsg({ title: `${item.provider_name} → ${familyName} 안내문`, templates });
  };

  /**
   * 숙소 배정이 저장/수정될 때마다 청소 체크리스트를 동기화한다.
   * - 기존 자동 생성 항목(source_id=accommodationId) 전체 삭제 후 재생성
   * - 각 배정의 퇴실일(to)이 due_date가 됨
   * - 이미 완료된 항목도 날짜 변경 시 재생성 (수정 반영 우선)
   */
  const syncCleaningChecklists = async (
    accommodationId: string,
    providerName: string,
    assignments: AssignmentEntry[],
  ) => {
    // 기존 항목 삭제
    await supabase
      .from("project_checklists")
      .delete()
      .eq("project_id", projectId)
      .eq("source_id", accommodationId)
      .eq("source_type", "accommodation_cleaning");

    // 퇴실일(to)이 있는 배정만 체크리스트 생성
    const rows = assignments
      .filter((a) => a.missionary_id && a.to)
      .map((a) => {
        const m = missionaries.find((x) => x.id === a.missionary_id);
        const familyLabel = m
          ? (m.family_group?.trim() || m.name)
          : "";
        return {
          project_id: projectId,
          title: `🧹 숙소 청소 - ${providerName}${familyLabel ? ` (${familyLabel} 퇴실)` : ""}`,
          category: "숙소",
          due_date: a.to,
          source_id: accommodationId,
          source_type: "accommodation_cleaning",
          sort_order: 999,
          is_completed: false,
        };
      });

    if (rows.length > 0) {
      await supabase.from("project_checklists").insert(rows);
    }
  };

  const matchedFamilies = useMemo(() =>
    families.filter((f) => (familyDataMap.get(f.repId)?.accoms.length ?? 0) > 0).length,
  [families, familyDataMap]);

  if (loading) return <div className="text-center py-10 text-gray-400">로딩 중...</div>;

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-3 text-sm flex-wrap">
          <span className="text-gray-500">전체 <b className="text-gray-800">{families.length}</b>가정</span>
          <span className="text-green-500">매칭 완료 <b>{matchedFamilies}</b></span>
          <span className="text-orange-500">미배정 <b>{families.length - matchedFamilies}</b>가정</span>
          <span className="text-gray-400">숙소 <b>{items.length}</b>개</span>
          {unassignedPool.length > 0 && (
            <span className="text-red-400">배정 가능 <b>{unassignedPool.length}</b>개</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button onClick={() => setViewMode("family")} className={`px-3 py-1.5 font-medium transition ${viewMode === "family" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>가정별</button>
            <button onClick={() => setViewMode("summary")} className={`px-3 py-1.5 font-medium transition border-l border-gray-200 ${viewMode === "summary" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>요약표</button>
            <button onClick={() => setViewMode("all")} className={`px-3 py-1.5 font-medium transition border-l border-gray-200 ${viewMode === "all" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>숙소목록</button>
          </div>
          <button
            onClick={() => setShowAuditLog(true)}
            title="숙소 변경 이력"
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden sm:inline">이력</span>
          </button>
          {isAdmin && (
            <button onClick={() => openCreate()} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              숙소 추가
            </button>
          )}
        </div>
      </div>

      {viewMode === "summary" ? (
        /* ── 요약표 뷰 (날짜순 플랫 리스트) ── */
        flatSummaryRows.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><p>숙소가 필요한 선교사가 없습니다.</p></div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">가정</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">숙소 / 제공자</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">배정 기간</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">주소</th>
                  {isMember && <th className="px-4 py-3 w-20" />}
                </tr>
              </thead>
              <tbody>
                {flatSummaryRows.map((row) => {
                  if (!row.accom) {
                    return (
                      <tr key={row.key} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">
                            {row.family.memberCount > 1 ? "👨‍👩‍👧" : "👤"} {row.family.label}
                          </div>
                          {row.periods.length > 0 && (
                            <div className="text-xs text-gray-400 mt-0.5">{formatPeriods(row.periods, false)}</div>
                          )}
                        </td>
                        <td colSpan={isMember ? 3 : 2} className="px-4 py-3">
                          <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">미배정</span>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={row.key} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition" onClick={() => openDetail(row.accom!)}>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-gray-900">
                          {row.family.memberCount > 1 ? "👨‍👩‍👧" : "👤"} {row.family.label}
                        </div>
                        {row.periods.length > 0 && (
                          <div className="text-xs text-gray-400 mt-0.5">{formatPeriods(row.periods, false)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900">{row.accom.provider_name}</span>
                          {row.accom.is_church_owned && <span className="text-xs text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">교회</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top hidden sm:table-cell">
                        {row.assignedFrom ? (
                          <span className="text-xs text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded font-medium">
                            {fmtD(row.assignedFrom)}~{fmtD(row.assignedTo)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">미입력</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-gray-400 hidden md:table-cell truncate max-w-[200px]">
                        {row.accom.address || <span className="text-gray-300">미입력</span>}
                      </td>
                      {isMember && (
                        <td className="px-4 py-3 text-right align-top" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(row.accom!)} className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition" title="수정">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            {isAdmin && (
                              <button onClick={() => handleDelete(row.accom!.id)} className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition" title="삭제">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : viewMode === "family" ? (
        missionaries.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>숙소가 필요한 선교사가 없습니다.</p>
            <p className="text-sm mt-1">명단 탭에서 &quot;숙소 필요&quot;를 체크하세요.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">숙소 / 제공자</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">배정 기간</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">주소</th>
                    {isMember && <th className="px-4 py-3 w-20" />}
                  </tr>
                </thead>
                <tbody>
                  {families.map((family) => {
                    const { accoms = [], coverage = "none" as Coverage } = familyDataMap.get(family.repId) ?? {};
                    const periods = getFamilyAccomPeriods(family.repId, missionaries);
                    const memberIds = getMemberIds(family.repId);
                    const colSpanCount = isMember ? 4 : 3;
                    return (
                      <Fragment key={family.key}>
                        {/* 가정 그룹 헤더 행 — 그레이 톤 */}
                        <tr className="bg-gray-50 border-t border-b border-gray-200">
                          <td colSpan={colSpanCount} className="px-4 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="text-xs font-bold text-gray-700">
                                  {family.memberCount > 1 ? "👨‍👩‍👧" : "👤"} {family.label}
                                </span>
                                {periods.length > 0 && (
                                  <span className="text-xs text-gray-400">{formatPeriods(periods, false)}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {accoms.length === 0 ? (
                                  <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">미배정</span>
                                ) : (
                                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                                    coverage === "full"    ? "bg-green-100 text-green-700" :
                                    coverage === "partial" ? "bg-orange-100 text-orange-600" :
                                                             "bg-red-100 text-red-600"
                                  }`}>
                                    {COVER_ICON[coverage]}{" "}
                                    {coverage === "full" ? "충족" : coverage === "partial" ? "부분 충족" : "기간 불일치"}
                                    {accoms.length > 1 && ` · ${accoms.length}개`}
                                  </span>
                                )}
                                {isAdmin && (
                                  <button onClick={() => openPickModal(family)} className="text-xs text-blue-600 bg-blue-100 hover:bg-blue-200 px-2 py-1 rounded font-semibold transition">
                                    배정
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                        {/* 숙소 서브 행 */}
                        {accoms.length === 0 ? (
                          <tr className="border-t border-gray-100">
                            <td colSpan={colSpanCount} className="px-8 py-3 text-xs text-gray-400 italic">
                              배정된 숙소가 없습니다.
                            </td>
                          </tr>
                        ) : (
                          accoms.map((a) => {
                            const myA = normalizeAssignments(a).filter(as => memberIds.has(as.missionary_id));
                            return (
                              <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition" onClick={() => openDetail(a)}>
                                <td className="px-6 py-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-gray-900">{a.provider_name}</span>
                                    {a.is_church_owned && <span className="text-xs text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">교회</span>}
                                  </div>
                                  {a.provider_contact && <p className="text-xs text-gray-400 mt-0.5">{a.provider_contact}</p>}
                                </td>
                                <td className="px-4 py-3 hidden sm:table-cell">
                                  {myA.map((as, i) => as.from ? (
                                    <span key={i} className="text-xs text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded font-medium mr-1">
                                      {fmtD(as.from)}~{fmtD(as.to)}
                                    </span>
                                  ) : null)}
                                  {!a.is_church_owned && a.available_from && myA.every(as => !as.from) && (
                                    <span className="text-xs text-gray-400">{fmtD(a.available_from)}~{fmtD(a.available_to)}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell truncate max-w-[200px]">
                                  {a.address || <span className="text-gray-300">미입력</span>}
                                </td>
                                {isMember && (
                                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-1">
                                      {myA[0]?.from && (
                                        <button
                                          onClick={() => openCopyForAssignment(a, myA[0])}
                                          className="text-gray-400 hover:text-emerald-600 p-1 rounded hover:bg-emerald-50 transition"
                                          title="안내문 복사"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                          </svg>
                                        </button>
                                      )}
                                      <button onClick={() => openEdit(a)} className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition" title="수정">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                      </button>
                                      {isAdmin && (
                                        <button onClick={() => handleDelete(a.id)} className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition" title="삭제">
                                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 배정 가능 숙소 풀 (완전 미배정 + 교회 소속 남은 기간) */}
            {unassignedPool.length > 0 && (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-500">📦 배정 가능 숙소 ({unassignedPool.length}개)</span>
                  <span className="text-xs text-gray-400">미배정 또는 남은 기간 있는 숙소</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {unassignedPool.map(({ item: a, remainingPeriods }) => (
                    <div key={`${a.id}-pool`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(a)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm">{a.provider_name}</span>
                          <span className="text-xs text-gray-400">{a.capacity}인</span>
                          {remainingPeriods.length > 0 ? (
                            <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded font-medium">
                              남은 기간: {formatPeriods(remainingPeriods)}
                            </span>
                          ) : (
                            a.available_from && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                {a.available_from.slice(5)}~{a.available_to?.slice(5) ?? "?"}
                              </span>
                            )
                          )}
                        </div>
                        {a.address && <p className="text-xs text-gray-400 mt-0.5 truncate">{a.address}</p>}
                      </div>
                      {isMember && (
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => openEdit(a)} className="text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition font-semibold">배정</button>
                          {isAdmin && (
                            <button onClick={() => handleDelete(a.id)} className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition" title="삭제">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        /* ── 숙소 목록 뷰 ── */
        items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p>등록된 숙소가 없습니다.</p>
            {isAdmin && <p className="text-sm mt-1">위 버튼으로 숙소를 추가하세요.</p>}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs w-44">제공자</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs hidden sm:table-cell">주소</th>
                  <th className="text-center px-3 py-3 font-semibold text-gray-500 text-xs w-14">수용</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs w-44">배정 가정</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs hidden md:table-cell whitespace-nowrap">기간</th>
                  {isMember && <th className="px-4 py-3 w-16" />}
                </tr>
              </thead>
              <tbody>
                {items.map((a) => {
                  const assignedLabels = getAssignedLabels(a);
                  return (
                    <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50 transition cursor-pointer" onClick={() => openDetail(a)}>
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-gray-900 text-[15px] leading-tight">
                          {a.provider_name}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-gray-700 hidden sm:table-cell text-[15px]">{a.address || "-"}</td>
                      <td className="px-3 py-3.5 text-center text-gray-700 text-[15px] whitespace-nowrap">{a.capacity}인</td>
                      <td className="px-4 py-3.5">
                        {assignedLabels.length > 0 ? (
                          <div className="space-y-1">
                            {assignedLabels.map((al, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <span className="font-medium text-[15px] text-gray-800">{al.label}</span>
                                {al.from && <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded whitespace-nowrap">{fmtD(al.from)}~{fmtD(al.to)}</span>}
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-orange-400 text-[15px] font-medium">미배정</span>}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 text-sm hidden md:table-cell whitespace-nowrap">
                        {a.available_from ? `${a.available_from} ~ ${a.available_to || "미정"}` : "-"}
                      </td>
                      {isMember && (
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(a)} className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition" title="수정">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            {isAdmin && (
                              <button onClick={() => handleDelete(a.id)} className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition" title="삭제">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── 상세 보기 모달 ── */}
      {detailItem && (
        <Modal isOpen={showDetail} onClose={() => setShowDetail(false)} title="숙소 상세 정보" className="sm:max-w-[550px]"
          footer={isMember ? <button onClick={() => openEdit(detailItem)} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">수정하기</button> : null}
        >
          {(() => {
            const a = detailItem;
            const accomAssignments = normalizeAssignments(a);
            return (
              <div className="space-y-4">

                {/* ── 기본 정보 테이블 ── */}
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <th className="w-28 px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">제공자</th>
                      <td className="px-4 py-3 text-gray-900 font-semibold">
                        {a.provider_name}
                        {a.provider_contact && <span className="ml-2 text-gray-400 font-normal">{a.provider_contact}</span>}
                      </td>
                    </tr>
                    <tr>
                      <th className="px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left">수용 인원</th>
                      <td className="px-4 py-3 text-gray-900 font-semibold">{a.capacity}명</td>
                    </tr>
                    {a.address && (
                      <tr>
                        <th className="px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left">주소</th>
                        <td className="px-4 py-3 text-gray-900 font-semibold">{a.address}</td>
                      </tr>
                    )}
                    <tr>
                      <th className="px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left">제공 기간</th>
                      <td className="px-4 py-3 text-gray-900 font-semibold">
                        {a.available_from ? `${a.available_from} ~ ${a.available_to || "미정"}` : "미입력"}
                      </td>
                    </tr>
                    {a.notes && (
                      <tr>
                        <th className="px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left align-top">메모</th>
                        <td className="px-4 py-3 text-gray-900 whitespace-pre-wrap">{a.notes}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* ── 배정 현황 ── */}
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <th className="w-28 px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left align-top">배정 현황</th>
                      <td className="px-4 py-3">
                        {accomAssignments.length === 0 ? (
                          <span className="text-orange-500 font-medium">미배정</span>
                        ) : (
                          <div className="space-y-2">
                            {accomAssignments.map((assignment, i) => {
                              const m = missionaries.find((x) => x.id === assignment.missionary_id);
                              if (!m) return null;
                              const g = m.family_group?.trim();
                              const label = g || m.name;
                              const requested = getFamilyAccomPeriods(assignment.missionary_id, missionaries);
                              const memberIds = getMemberIds(assignment.missionary_id);
                              const allAssignedPeriods = items.flatMap((item) =>
                                normalizeAssignments(item)
                                  .filter((as) => memberIds.has(as.missionary_id))
                                  .map((as) => ({ from: as.from, to: as.to })),
                              );
                              const cov = checkMultiPeriodCoverage(allAssignedPeriods, requested);
                              return (
                                <div key={i} className={`rounded-lg px-3 py-2.5 border ${cov === "full" ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"}`}>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`font-bold ${cov === "full" ? "text-green-700" : "text-orange-600"}`}>
                                      {COVER_ICON[cov]} {label}
                                    </span>
                                    {assignment.from && (
                                      <span className="text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-100 font-medium">
                                        {fmtD(assignment.from)} ~ {fmtD(assignment.to)}
                                      </span>
                                    )}
                                  </div>
                                  {requested.length > 0 && (
                                    <p className="text-xs text-gray-500 mt-1">요청 기간: {formatPeriods(requested, false)}</p>
                                  )}
                                </div>
                              );
                            })}
                            {accomAssignments.length > 1 && (
                              <p className="text-xs text-purple-600">🤝 {accomAssignments.length}가정이 기간을 나눠 사용합니다.</p>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* ── 사용 안내문 ── */}
                {a.guide_content && (
                  <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                    <tbody>
                      <tr>
                        <th className="w-28 px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left align-top">사용 안내문</th>
                        <td className="px-4 py-3 text-gray-700 whitespace-pre-wrap">{a.guide_content}</td>
                      </tr>
                    </tbody>
                  </table>
                )}

              </div>
            );
          })()}
        </Modal>
      )}

      {/* ── 등록/편집 모달 ── */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={selected ? "숙소 정보 수정" : "숙소 등록"} className="sm:max-w-[650px]"
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "저장 중..." : "저장"}</button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">제공자 이름 *</label>
              <input type="text" value={form.provider_name} onChange={(e) => setForm({ ...form, provider_name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">연락처</label>
              <input type="text" value={form.provider_contact} onChange={(e) => setForm({ ...form, provider_contact: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">주소</label>
              <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">수용 인원</label>
              <input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} min={1} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                이용 가능 시작일{form.is_church_owned && <span className="text-gray-400 font-normal ml-1">(선택)</span>}
              </label>
              <input type="date" value={form.available_from} onChange={(e) => setForm({ ...form, available_from: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                이용 가능 종료일{form.is_church_owned && <span className="text-gray-400 font-normal ml-1">(선택)</span>}
              </label>
              <input type="date" value={form.available_to} onChange={(e) => setForm({ ...form, available_to: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* 교회 소속 체크박스 */}
          <label className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 cursor-pointer hover:bg-indigo-100 transition">
            <input type="checkbox" checked={form.is_church_owned} onChange={(e) => setForm({ ...form, is_church_owned: e.target.checked })} className="w-4 h-4 accent-indigo-500" />
            <div className="flex-1">
              <span className="text-sm font-semibold text-gray-700">🏛️ 교회 소속 숙소</span>
              <p className="text-xs text-gray-500 mt-0.5">기간 제한 없이 여러 가정이 순차적으로 사용할 수 있습니다. 남은 기간은 미배정 풀에 표시됩니다.</p>
            </div>
            {form.is_church_owned && <span className="ml-auto text-xs text-indigo-600 font-semibold shrink-0">✓ 교회 소속</span>}
          </label>

          {/* ── 배정 가정 (다중) ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">배정 가정</label>
              {form.assignments.length > 1 && (
                <span className="text-xs text-purple-600 font-medium">🤝 {form.assignments.length}가정 공유</span>
              )}
            </div>
            {form.assignments.length === 0 ? (
              <p className="text-xs text-gray-400 mb-2">배정된 가정이 없습니다.</p>
            ) : (
              <div className="space-y-2 mb-2">
                {form.assignments.map((assignment, i) => (
                  <div key={i} className="flex items-end gap-2 bg-gray-50 rounded-lg p-2 border border-gray-200">
                    <div className="flex-1 min-w-0">
                      <label className="block text-xs font-medium text-gray-500 mb-1">가정</label>
                      <Select
                        value={assignment.missionary_id}
                        onChange={(v) => setForm({ ...form, assignments: form.assignments.map((a, idx) => idx === i ? { ...a, missionary_id: v } : a) })}
                        options={familyOptions}
                        className="w-full py-1.5 px-2 bg-white border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div className="w-28 shrink-0">
                      <label className="block text-xs font-medium text-gray-500 mb-1">시작일</label>
                      <input type="date" value={assignment.from}
                        onChange={(e) => setForm({ ...form, assignments: form.assignments.map((a, idx) => idx === i ? { ...a, from: e.target.value } : a) })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="w-28 shrink-0">
                      <label className="block text-xs font-medium text-gray-500 mb-1">종료일</label>
                      <input type="date" value={assignment.to}
                        onChange={(e) => setForm({ ...form, assignments: form.assignments.map((a, idx) => idx === i ? { ...a, to: e.target.value } : a) })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, assignments: form.assignments.filter((_, idx) => idx !== i) })}
                      className="shrink-0 mb-1 w-7 h-7 flex items-center justify-center rounded-full text-red-400 hover:text-red-600 hover:bg-red-50 transition"
                      title="이 배정 삭제"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setForm({ ...form, assignments: [...form.assignments, { missionary_id: "", from: form.available_from || "", to: form.available_to || "" }] })}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium py-0.5 hover:underline"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              가정 추가
            </button>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">사용 안내문</label>
            <textarea value={form.guide_content} onChange={(e) => setForm({ ...form, guide_content: e.target.value })} rows={4} placeholder="주차 방법, 쓰레기 분리수거, 규칙 등..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">메모</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {isAdmin && selected && (
            <div className="pt-2 border-t border-gray-100">
              <button onClick={() => { setShowModal(false); handleDelete(selected.id); }} className="text-sm text-red-500 hover:text-red-700 transition">이 숙소 삭제</button>
            </div>
          )}
        </div>
      </Modal>

      {/* ── 숙소 선택 모달 ── */}
      <Modal
        isOpen={showPickModal}
        onClose={() => setShowPickModal(false)}
        title={`숙소 배정 — ${pickFamily?.label}`}
        className="sm:max-w-[500px]"
        footer={
          <>
            <button onClick={() => setShowPickModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
            <button onClick={handleSavePick} disabled={savingPick || !pickAccomId} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {savingPick ? "배정 중..." : "배정하기"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* 숙소 목록 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">배정할 숙소 선택</label>
            {pickableAccoms.length === 0 ? (
              <div className="text-center py-5 text-sm text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <p>배정 가능한 숙소가 없습니다.</p>
                <p className="text-xs mt-1">"숙소 추가" 버튼으로 새 숙소를 먼저 등록하세요.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                {pickableAccoms.map((a) => {
                  const assignedCount = normalizeAssignments(a).length;
                  const accomStartBound = a.available_from ?? projectFrom;
                  const accomEndBound = (a.available_to && a.available_to < projectTo)
                    ? a.available_to : projectTo;
                  const remaining = a.is_church_owned && accomStartBound && accomEndBound
                    ? getRemainingPeriods(normalizeAssignments(a), accomStartBound, accomEndBound)
                    : [];
                  return (
                    <label
                      key={a.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                        pickAccomId === a.id
                          ? "border-blue-400 bg-blue-50"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio" name="pick_accom" value={a.id}
                        checked={pickAccomId === a.id}
                        onChange={() => setPickAccomId(a.id)}
                        className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-gray-900">
                            {a.provider_name}
                          </span>
                          <span className="text-xs text-gray-400">{a.capacity}인</span>
                          {assignedCount > 0 && !a.is_church_owned && (
                            <span className="text-xs text-orange-500 font-medium">배정됨</span>
                          )}
                        </div>
                        {a.address && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{a.address}</p>
                        )}
                        {remaining.length > 0 ? (
                          <p className="text-xs text-green-600 mt-0.5">남은 기간: {formatPeriods(remaining)}</p>
                        ) : !a.is_church_owned && a.available_from ? (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {a.available_from.slice(5)}~{a.available_to?.slice(5) ?? "?"}
                          </p>
                        ) : null}
                        {a.amenities && a.amenities.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {a.amenities.map((am) => (
                              <span key={am} className="text-xs bg-gray-100 text-gray-500 px-1 py-0.5 rounded">{am}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* 날짜 입력 */}
          {pickableAccoms.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">배정 시작일</label>
                <input
                  type="date" value={pickFrom}
                  onChange={(e) => setPickFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">배정 종료일</label>
                <input
                  type="date" value={pickTo}
                  onChange={(e) => setPickTo(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* 안내문 복사 모달 */}
      {copyMsg && (
        <CopyMessageModal
          isOpen={!!copyMsg}
          onClose={() => setCopyMsg(null)}
          title={copyMsg.title}
          templates={copyMsg.templates}
          hint="복사 후 카카오톡/이메일에 붙여넣으세요. 보내기 전에 내용을 자유롭게 수정할 수 있어요."
        />
      )}

      {/* 변경 이력 모달 */}
      {showAuditLog && (
        <AuditLogModal
          isOpen={showAuditLog}
          onClose={() => setShowAuditLog(false)}
          projectId={projectId}
          title="숙소 변경 이력"
          entityType="accommodation"
        />
      )}
    </div>
  );
}
