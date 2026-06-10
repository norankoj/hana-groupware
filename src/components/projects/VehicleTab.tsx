"use client";

import { useEffect, useState, useCallback, useMemo, useRef, Fragment } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Select from "@/components/Select";
import Modal from "@/components/Modal";
import CopyMessageModal, { type CopyTemplate } from "@/components/projects/CopyMessageModal";
import AuditLogModal from "@/components/projects/AuditLogModal";
import { uploadFile, deleteFile } from "@/utils/upload";
import { logAudit, summarizeAssignmentDiff } from "@/utils/auditLog";
import {
  buildVehicleGuestKO,
  buildVehicleGuestEN,
  buildVehicleHostKO,
} from "@/utils/messageTemplates";
import {
  checkMultiPeriodCoverage,
  getFamilyVehiclePeriods,
  getRemainingPeriods,
  formatPeriods,
  COVER_ICON,
  type Coverage,
  type DatePeriod,
} from "@/utils/projectUtils";
import { type AssignmentEntry } from "@/components/projects/AccommodationTab";

type Props = { projectId: string; myUserId: string; isMember: boolean; isAdmin: boolean };

type Driver = { name: string; license_url: string };

type MvVehicle = {
  id: string;
  provider_name: string;
  provider_contact: string | null;
  car_model: string | null;
  car_number: string | null;
  available_from: string | null;
  available_to: string | null;
  insurance_added: boolean;
  insurance_company: string | null;        // 보험사
  insurance_number: string | null;         // 보험사 연락처 번호
  is_church_owned: boolean;                // 교회 소속 (기간 제한 없음)
  drivers: Driver[];
  assignments: AssignmentEntry[] | null;   // 다중 가정 배정 (NEW)
  assigned_missionary_id: string | null;   // 레거시 단일 배정 (하위 호환)
  guide_content: string | null;
  notes: string | null;
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

type Missionary = {
  id: string;
  name: string;
  family_group: string | null;
  vehicle_periods: DatePeriod[] | null;
  vehicle_from: string | null;
  vehicle_to: string | null;
  arrival_date: string | null;
  departure_date: string | null;
};

type Family = { key: string; label: string; repId: string; memberCount: number };

type FlatRow = {
  key: string;
  family: Family;
  periods: DatePeriod[];
  coverage: Coverage;
  vehicle: MvVehicle | null;
  memberIds: Set<string>;
  assignedFrom: string;
  assignedTo: string;
};

/** "2026-07-15" → "07/15" */
const fmtD = (d: string | null | undefined) =>
  d ? d.slice(5).replace("-", "/") : "?";

const EMPTY_DRIVER: Driver = { name: "", license_url: "" };
const EMPTY_FORM = {
  provider_name: "", provider_contact: "", car_model: "", car_number: "",
  available_from: "", available_to: "", insurance_added: false,
  insurance_company: "", insurance_number: "",
  is_church_owned: false,
  drivers: [{ ...EMPTY_DRIVER }] as Driver[],
  assignments: [] as AssignmentEntry[],
  guide_content: "", notes: "",
};

export default function VehicleTab({ projectId, isMember, isAdmin }: Props) {
  const supabase = createClient();
  const licenseInputRef = useRef<HTMLInputElement>(null);
  const currentDriverIdxRef = useRef<number>(0);
  const [items, setItems] = useState<MvVehicle[]>([]);
  const [missionaries, setMissionaries] = useState<Missionary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MvVehicle | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingDriverIdx, setUploadingDriverIdx] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailItem, setDetailItem] = useState<MvVehicle | null>(null);
  const [viewMode, setViewMode] = useState<"family" | "summary" | "all">("family");

  // ── 차량 선택(픽커) 모달 ──────────────────────────────────────────────────
  const [showPickModal, setShowPickModal] = useState(false);
  const [pickFamily,    setPickFamily]    = useState<Family | null>(null);
  const [pickVehicleId, setPickVehicleId] = useState("");
  const [pickFrom,      setPickFrom]      = useState("");
  const [pickTo,        setPickTo]        = useState("");
  const [savingPick,    setSavingPick]    = useState(false);

  // ── 안내문 복사 / 변경 이력 모달 ─────────────────────────────────────────
  const [copyMsg, setCopyMsg] = useState<{ title: string; templates: CopyTemplate[] } | null>(null);
  const [showAuditLog, setShowAuditLog] = useState(false);

  const fetchData = useCallback(async () => {
    const [{ data: v }, { data: m }] = await Promise.all([
      supabase.from("marf_vehicles").select("*").eq("project_id", projectId)
        .order("available_from", { ascending: true, nullsFirst: false })
        .order("created_at"),
      supabase
        .from("marf_missionaries")
        .select("id, name, family_group, vehicle_periods, vehicle_from, vehicle_to, arrival_date, departure_date")
        .eq("project_id", projectId)
        .eq("vehicle_needed", true)
        .order("family_group").order("name"),
    ]);
    setItems((v || []) as MvVehicle[]);
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
    // ── 차량 요청 시작일 기준 날짜 정렬 ──
    const getSortDate = (repId: string): string => {
      const m = missionaries.find((x) => x.id === repId);
      if (!m) return "";
      const periods = (m.vehicle_periods ?? []).filter((p) => p.from);
      if (periods.length > 0) return [...periods.map((p) => p.from)].sort()[0];
      return m.vehicle_from ?? m.arrival_date ?? "";
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

  // 프로젝트 전체 기간 (memoized)
  const { projectFrom, projectTo } = useMemo(() => ({
    projectFrom: missionaries.map((m) => m.arrival_date).filter(Boolean).sort()[0] ?? "",
    projectTo:   missionaries.map((m) => m.departure_date).filter(Boolean).sort().at(-1) ?? "",
  }), [missionaries]);

  // 가족별 데이터(배정 차량 + 커버리지) 사전 계산 (memoized) — 폼 입력 시 재계산 방지
  const familyDataMap = useMemo(() => {
    const map = new Map<string, { vehicles: MvVehicle[]; coverage: Coverage }>();
    families.forEach((family) => {
      const memberIds = getMemberIds(family.repId);
      const vehicles = items
        .filter((item) => normalizeAssignments(item).some((a) => memberIds.has(a.missionary_id)))
        .sort((a, b) => {
          // 이 가족의 배정 시작일로 정렬
          const getFrom = (item: MvVehicle) => {
            const d = normalizeAssignments(item).filter((a) => memberIds.has(a.missionary_id)).map((a) => a.from).filter(Boolean).sort();
            return d[0] ?? item.available_from ?? "";
          };
          const da = getFrom(a), db = getFrom(b);
          if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
          return da.localeCompare(db);
        });
      const requested = getFamilyVehiclePeriods(family.repId, missionaries);
      const assignedPeriods = items.flatMap((item) =>
        normalizeAssignments(item)
          .filter((a) => memberIds.has(a.missionary_id))
          .map((a) => ({ from: a.from, to: a.to })),
      );
      const coverage = checkMultiPeriodCoverage(assignedPeriods, requested);
      map.set(family.repId, { vehicles, coverage });
    });
    return map;
  }, [families, getMemberIds, missionaries, items]);

  // 요약표용 플랫 행 목록 (날짜순 정렬, 기간별 분리) (memoized)
  const flatSummaryRows = useMemo((): FlatRow[] => {
    const rows: FlatRow[] = [];
    families.forEach((family) => {
      const { vehicles = [], coverage = "none" as Coverage } = familyDataMap.get(family.repId) ?? {};
      const periods = getFamilyVehiclePeriods(family.repId, missionaries);
      const memberIds = getMemberIds(family.repId);
      if (vehicles.length === 0) {
        rows.push({ key: `${family.key}-unassigned`, family, periods, coverage, vehicle: null, memberIds, assignedFrom: "", assignedTo: "" });
      } else {
        vehicles.forEach((v) => {
          const myA = normalizeAssignments(v).filter(as => memberIds.has(as.missionary_id));
          if (myA.length === 0) {
            rows.push({ key: `${family.key}-${v.id}`, family, periods, coverage, vehicle: v, memberIds, assignedFrom: "", assignedTo: "" });
          } else {
            myA.forEach((as, i) => {
              rows.push({
                key: `${family.key}-${v.id}-${i}`,
                family, periods,
                coverage: checkMultiPeriodCoverage([{ from: as.from, to: as.to }], periods),
                vehicle: v, memberIds,
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

  // 교회 차량: available_from/to 우선, 없으면 프로젝트 기간 폴백
  const churchVehicleBound = (item: MvVehicle) => ({
    from: item.available_from ?? projectFrom,
    to:   item.available_to   ?? projectTo,
  });

  // 미배정 풀 = 완전 미배정 + 남은 기간 있는 차량 (교회 소속·성도 차량 모두) (memoized)
  type PoolEntry = { item: MvVehicle; remainingPeriods: DatePeriod[] };
  const unassignedPool: PoolEntry[] = useMemo(() => [
    ...items.filter((item) => normalizeAssignments(item).length === 0)
            .map((item) => ({ item, remainingPeriods: [] as DatePeriod[] })),
    ...items
      .filter((item) => normalizeAssignments(item).length > 0)
      .flatMap((item) => {
        const { from, to } = item.is_church_owned
          ? churchVehicleBound(item)
          : { from: item.available_from ?? "", to: item.available_to ?? "" };
        if (!from || !to) return [];
        const remaining = getRemainingPeriods(normalizeAssignments(item), from, to);
        return remaining.length > 0 ? [{ item, remainingPeriods: remaining }] : [];
      }),
  ], [items, projectFrom, projectTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // 배정 가능 차량 = 완전 미배정 + 남은 기간 있는 차량 (memoized)
  const pickableVehicles = useMemo(() => items.filter((item) => {
    if (normalizeAssignments(item).length === 0) return true;
    const { from, to } = item.is_church_owned
      ? churchVehicleBound(item)
      : { from: item.available_from ?? "", to: item.available_to ?? "" };
    if (!from || !to) return false;
    return getRemainingPeriods(normalizeAssignments(item), from, to).length > 0;
  }), [items, projectFrom, projectTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 전체 목록 뷰용 헬퍼 ─────────────────────────────────────────────────
  const getAssignedLabels = (item: MvVehicle): { label: string; from: string; to: string }[] =>
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
    setForm({ ...EMPTY_FORM, drivers: [{ ...EMPTY_DRIVER }], assignments: repId ? [{ missionary_id: repId, from: "", to: "" }] : [] });
    setShowModal(true);
  };
  const openEdit = (v: MvVehicle) => {
    setSelected(v);
    setForm({
      provider_name: v.provider_name, provider_contact: v.provider_contact || "",
      car_model: v.car_model || "", car_number: v.car_number || "",
      available_from: v.available_from || "", available_to: v.available_to || "",
      insurance_added: v.insurance_added,
      insurance_company: v.insurance_company || "",
      insurance_number: v.insurance_number || "",
      is_church_owned: v.is_church_owned,
      drivers: v.drivers?.length ? v.drivers : [{ ...EMPTY_DRIVER }],
      assignments: normalizeAssignments(v),
      guide_content: v.guide_content || "", notes: v.notes || "",
    });
    setShowDetail(false); setShowModal(true);
  };
  const openDetail = (v: MvVehicle) => { setDetailItem(v); setShowDetail(true); };

  // ── 차량 선택 모달 핸들러 ─────────────────────────────────────────────────
  const openPickModal = (family: Family) => {
    const periods = getFamilyVehiclePeriods(family.repId, missionaries);
    setPickFamily(family);
    setPickVehicleId("");
    setPickFrom(periods[0]?.from ?? "");
    setPickTo(periods.at(-1)?.to ?? "");
    setShowPickModal(true);
  };

  const handleSavePick = async () => {
    if (!pickVehicleId) { toast.error("차량을 선택하세요."); return; }
    if (!pickFamily)    return;
    if (!pickFrom || !pickTo) { toast.error("배정 날짜를 입력하세요."); return; }
    setSavingPick(true);
    const vehicle = items.find((x) => x.id === pickVehicleId);
    if (!vehicle) { setSavingPick(false); return; }
    const before = normalizeAssignments(vehicle);
    const newAssignments: AssignmentEntry[] = [
      ...before,
      { missionary_id: pickFamily.repId, from: pickFrom, to: pickTo },
    ];
    const { error } = await supabase.from("marf_vehicles").update({
      assignments: newAssignments,
      assigned_missionary_id: newAssignments[0]?.missionary_id || null,
    }).eq("id", pickVehicleId);
    if (error) { toast.error("배정 실패"); setSavingPick(false); return; }
    toast.success("배정되었습니다.");
    const nameMap = new Map(missionaries.map((m) => [m.id, m.family_group || m.name]));
    logAudit(supabase, {
      projectId, entityType: "vehicle", entityId: pickVehicleId, action: "assign",
      summary: `[${vehicle.provider_name}] ${summarizeAssignmentDiff(before, newAssignments, nameMap)}`,
      beforeData: before, afterData: newAssignments,
    });
    setShowPickModal(false); fetchData(); setSavingPick(false);
  };

  // ── 운전자 조작 ──────────────────────────────────────────────────────────
  const addDriver = () => setForm((p) => ({ ...p, drivers: [...p.drivers, { ...EMPTY_DRIVER }] }));
  const removeDriver = (idx: number) => setForm((p) => ({ ...p, drivers: p.drivers.filter((_, i) => i !== idx) }));
  const updateDriverName = (idx: number, name: string) =>
    setForm((p) => { const d = [...p.drivers]; d[idx] = { ...d[idx], name }; return { ...p, drivers: d }; });
  const updateDriverLicense = (idx: number, license_url: string) =>
    setForm((p) => { const d = [...p.drivers]; d[idx] = { ...d[idx], license_url }; return { ...p, drivers: d }; });

  const triggerLicenseUpload = (idx: number) => {
    currentDriverIdxRef.current = idx;
    licenseInputRef.current?.click();
  };
  const handleLicenseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = currentDriverIdxRef.current;
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingDriverIdx(idx);
    const toastId = toast.loading("업로드 중...");
    try {
      const { url } = await uploadFile(file, "vehicle", `marf-licenses/${projectId}`);
      if (!url) throw new Error("URL 발급 실패");
      updateDriverLicense(idx, url);
      toast.success("면허증 업로드 완료", { id: toastId });
    } catch (err: any) {
      toast.error(err?.message ?? "업로드 실패", { id: toastId });
    } finally {
      setUploadingDriverIdx(null);
    }
  };
  const handleLicenseDelete = async (idx: number) => {
    const licenseUrl = form.drivers[idx]?.license_url;
    if (!licenseUrl) return;
    try {
      const urlObj = new URL(licenseUrl, window.location.origin);
      const objectName = urlObj.searchParams.get("object");
      if (objectName) await deleteFile(decodeURIComponent(objectName), "vehicle");
    } catch { /* ignore */ }
    updateDriverLicense(idx, "");
    toast.success("면허증 삭제됨");
  };

  const handleSave = async () => {
    if (!form.provider_name.trim()) { toast.error("제공자 이름을 입력하세요."); return; }
    setSaving(true);
    const drivers = form.drivers.filter((d) => d.name.trim() || d.license_url);
    const validAssignments = form.assignments.filter((a) => a.missionary_id && a.from && a.to);
    const payload = {
      provider_name: form.provider_name, provider_contact: form.provider_contact || null,
      car_model: form.car_model || null, car_number: form.car_number || null,
      available_from: form.available_from || null, available_to: form.available_to || null,
      insurance_added: form.insurance_added,
      insurance_company: form.insurance_company || null,
      insurance_number: form.insurance_number || null,
      is_church_owned: form.is_church_owned,
      drivers,
      assignments: validAssignments,
      assigned_missionary_id: validAssignments[0]?.missionary_id || null, // 하위 호환
      guide_content: form.guide_content || null, notes: form.notes || null,
    };
    if (selected) {
      const before = selected;
      const { error } = await supabase.from("marf_vehicles").update(payload).eq("id", selected.id);
      if (error) { toast.error("수정 실패"); setSaving(false); return; }
      toast.success("수정되었습니다.");
      logAudit(supabase, {
        projectId, entityType: "vehicle", entityId: selected.id,
        action: "update", summary: `차량 수정: ${payload.provider_name}`,
        beforeData: before, afterData: payload,
      });
    } else {
      const { data: inserted, error } = await supabase
        .from("marf_vehicles")
        .insert({ ...payload, project_id: projectId })
        .select("id")
        .single();
      if (error) { toast.error("저장 실패"); setSaving(false); return; }
      toast.success("등록되었습니다.");
      logAudit(supabase, {
        projectId, entityType: "vehicle", entityId: inserted?.id,
        action: "create", summary: `차량 추가: ${payload.provider_name}`,
        afterData: payload,
      });
    }
    setShowModal(false); fetchData(); setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    const target = items.find((x) => x.id === id);
    await supabase.from("marf_vehicles").delete().eq("id", id);
    toast.success("삭제되었습니다.");
    if (target) {
      logAudit(supabase, {
        projectId, entityType: "vehicle", entityId: id,
        action: "delete", summary: `차량 삭제: ${target.provider_name}`,
        beforeData: target,
      });
    }
    fetchData();
  };

  // ── 안내문 복사 모달 열기 ──────────────────────────────────────────────
  const openCopyForAssignment = (item: MvVehicle, assign: AssignmentEntry) => {
    const m = missionaries.find((x) => x.id === assign.missionary_id);
    const familyName = m?.family_group || m?.name || "(가정)";
    const opts = {
      familyName,
      providerName: item.provider_name,
      providerContact: item.provider_contact,
      carModel: item.car_model,
      carNumber: item.car_number,
      from: assign.from,
      to: assign.to,
      insuranceAdded: item.insurance_added,
      notes: item.notes,
    };
    const templates: CopyTemplate[] = [
      { key: "guest_ko", label: "🇰🇷 선교사용 (한국어)", body: buildVehicleGuestKO(opts) },
      { key: "guest_en", label: "🇺🇸 선교사용 (English)", body: buildVehicleGuestEN(opts) },
      { key: "host_ko",  label: "🙏 봉사자 확정 알림",   body: buildVehicleHostKO({
        providerName: item.provider_name, familyName,
        from: assign.from, to: assign.to,
        insuranceAdded: item.insurance_added, notes: item.notes,
      }) },
    ];
    setCopyMsg({ title: `${item.provider_name} → ${familyName} 안내문`, templates });
  };

  /** 배정별 사진 업로드 (이용 전/후) */
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null); // "vehicleId-aIdx-type"
  const [lightbox, setLightbox] = useState<{ photos: string[]; idx: number } | null>(null);
  const touchStartX = useRef(0);

  const handlePhotoUpload = async (
    vehicle: MvVehicle,
    assignmentIdx: number,
    photoType: "start" | "end",
    files: FileList,
  ) => {
    if (!files.length) return;
    const key = `${vehicle.id}-${assignmentIdx}-${photoType}`;
    setUploadingPhoto(key);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const { url } = await uploadFile(file, "vehicle", `marf/${vehicle.id}`);
        if (url) urls.push(url);
      }
      const asns = normalizeAssignments(vehicle).map((a, i) => {
        if (i !== assignmentIdx) return a;
        const prev = (photoType === "start" ? a.start_photos : a.end_photos) ?? [];
        return photoType === "start"
          ? { ...a, start_photos: [...prev, ...urls] }
          : { ...a, end_photos:   [...prev, ...urls] };
      });
      const { error } = await supabase.from("marf_vehicles")
        .update({ assignments: asns, assigned_missionary_id: asns[0]?.missionary_id || null })
        .eq("id", vehicle.id);
      if (error) { toast.error("사진 저장 실패"); return; }
      toast.success("사진 저장됨");
      // items + detailItem 즉시 동기화 (fetchData 기다릴 필요 없음)
      const updatedVehicle = { ...vehicle, assignments: asns };
      setItems((prev) => prev.map((v) => v.id === vehicle.id ? updatedVehicle : v));
      setDetailItem((prev) => prev?.id === vehicle.id ? updatedVehicle : prev);
    } finally {
      setUploadingPhoto(null);
    }
  };

  /** 배정 사진 삭제 */
  const handlePhotoDelete = async (
    vehicle: MvVehicle,
    assignmentIdx: number,
    photoType: "start" | "end",
    photoUrl: string,
  ) => {
    if (!confirm("사진을 삭제할까요?")) return;
    const asns = normalizeAssignments(vehicle).map((a, i) => {
      if (i !== assignmentIdx) return a;
      return photoType === "start"
        ? { ...a, start_photos: (a.start_photos ?? []).filter(u => u !== photoUrl) }
        : { ...a, end_photos:   (a.end_photos   ?? []).filter(u => u !== photoUrl) };
    });
    await supabase.from("marf_vehicles")
      .update({ assignments: asns })
      .eq("id", vehicle.id);
    // MinIO 파일 삭제 시도 (실패해도 무시)
    try {
      const obj = new URL(photoUrl).pathname.replace(/^\/vehicle\//, "");
      await deleteFile(obj, "vehicle");
    } catch {}
    toast.success("삭제됨");
    // items + detailItem 즉시 동기화
    const updatedVehicle = { ...vehicle, assignments: asns };
    setItems((prev) => prev.map((v) => v.id === vehicle.id ? updatedVehicle : v));
    setDetailItem((prev) => prev?.id === vehicle.id ? updatedVehicle : prev);
  };

  const matchedFamilies = useMemo(() =>
    families.filter((f) => (familyDataMap.get(f.repId)?.vehicles.length ?? 0) > 0).length,
  [families, familyDataMap]);
  const insuranceDone = items.filter((v) => v.insurance_added).length;
  const licenseDone = items.filter((v) => v.drivers?.length > 0 && v.drivers.every((d) => d.license_url)).length;

  if (loading) return <div className="text-center py-10 text-gray-400">로딩 중...</div>;

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-3 text-sm flex-wrap">
          <span className="text-gray-500">전체 <b className="text-gray-800">{families.length}</b>가정</span>
          <span className="text-green-500">매칭 완료 <b>{matchedFamilies}</b></span>
          <span className="text-orange-500">미배정 <b>{families.length - matchedFamilies}</b>가정</span>
          <span className="text-gray-400">차량 <b>{items.length}</b>대</span>
          {unassignedPool.length > 0 && (
            <span className="text-red-400">배정 가능 <b>{unassignedPool.length}</b>대</span>
          )}
          <span className={insuranceDone < items.length ? "text-red-500" : "text-blue-500"}>
            보험 <b>{insuranceDone}</b>/{items.length}
          </span>
          <span className={licenseDone < items.length ? "text-orange-500" : "text-green-500"}>
            면허증 <b>{licenseDone}</b>/{items.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button onClick={() => setViewMode("family")} className={`px-3 py-1.5 font-medium transition ${viewMode === "family" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>가정별</button>
            <button onClick={() => setViewMode("summary")} className={`px-3 py-1.5 font-medium transition border-l border-gray-200 ${viewMode === "summary" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>요약표</button>
            <button onClick={() => setViewMode("all")} className={`px-3 py-1.5 font-medium transition border-l border-gray-200 ${viewMode === "all" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>차량목록</button>
          </div>
          <button
            onClick={() => setShowAuditLog(true)}
            title="차량 변경 이력"
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
              차량 추가
            </button>
          )}
        </div>
      </div>

      {viewMode === "summary" ? (
        /* ── 요약표 뷰 (날짜순 플랫 리스트) ── */
        flatSummaryRows.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><p>차량이 필요한 선교사가 없습니다.</p></div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">가정</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">차량 / 제공자</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">배정 기간</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">차종 / 번호</th>
                  <th className="text-center px-3 py-3 font-semibold text-gray-600 w-16 hidden sm:table-cell">보험</th>
                  {isMember && <th className="px-4 py-3 w-20" />}
                </tr>
              </thead>
              <tbody>
                {flatSummaryRows.map((row) => {
                  if (!row.vehicle) {
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
                        <td colSpan={isMember ? 4 : 3} className="px-4 py-3">
                          <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">미배정</span>
                        </td>
                      </tr>
                    );
                  }
                  const v = row.vehicle;
                  return (
                    <tr key={row.key} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition" onClick={() => openDetail(v)}>
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
                          <span className="font-medium text-gray-900">{v.provider_name}</span>
                          {v.is_church_owned && <span className="text-xs text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">교회</span>}
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
                      <td className="px-4 py-3 align-top text-xs text-gray-500 hidden md:table-cell">
                        {v.car_model && <span className="mr-1">{v.car_model}</span>}
                        {v.car_number && <span className="text-gray-400">{v.car_number}</span>}
                        {!v.car_model && !v.car_number && <span className="text-gray-300">미입력</span>}
                      </td>
                      <td className="px-3 py-3 align-top text-center hidden sm:table-cell">
                        {v.insurance_added
                          ? <span className="text-xs text-green-600 font-semibold">✓ 완료</span>
                          : <span className="text-xs text-orange-500 font-semibold">미완료</span>}
                      </td>
                      {isMember && (
                        <td className="px-4 py-3 text-right align-top" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(v)} className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition" title="수정">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            {isAdmin && (
                              <button onClick={() => handleDelete(v.id)} className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition" title="삭제">
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
            <p>차량이 필요한 선교사가 없습니다.</p>
            <p className="text-sm mt-1">명단 탭에서 &quot;차량 필요&quot;를 체크하세요.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">차량 / 제공자</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">배정 기간</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">차종 / 번호</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-600 w-16 hidden sm:table-cell">보험</th>
                    {isMember && <th className="px-4 py-3 w-20" />}
                  </tr>
                </thead>
                <tbody>
                  {families.map((family) => {
                    const { vehicles = [], coverage = "none" as Coverage } = familyDataMap.get(family.repId) ?? {};
                    const periods = getFamilyVehiclePeriods(family.repId, missionaries);
                    const memberIds = getMemberIds(family.repId);
                    const colSpanCount = isMember ? 5 : 4;
                    const insuranceWarn = vehicles.length > 0 && vehicles.some(v => !v.insurance_added);
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
                                {vehicles.length === 0 ? (
                                  <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">미배정</span>
                                ) : (
                                  <>
                                    {insuranceWarn && (
                                      <span className="text-xs bg-orange-50 text-orange-500 border border-orange-200 px-1.5 py-0.5 rounded font-medium">보험 미완료</span>
                                    )}
                                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                                      coverage === "full"    ? "bg-green-100 text-green-700" :
                                      coverage === "partial" ? "bg-orange-100 text-orange-600" :
                                                               "bg-red-100 text-red-600"
                                    }`}>
                                      {COVER_ICON[coverage]}{" "}
                                      {coverage === "full" ? "충족" : coverage === "partial" ? "부분 충족" : "기간 불일치"}
                                      {vehicles.length > 1 && ` · ${vehicles.length}대`}
                                    </span>
                                  </>
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
                        {/* 차량 서브 행 */}
                        {vehicles.length === 0 ? (
                          <tr className="border-t border-gray-100">
                            <td colSpan={colSpanCount} className="px-8 py-3 text-xs text-gray-400 italic">
                              배정된 차량이 없습니다.
                            </td>
                          </tr>
                        ) : (
                          vehicles.map((v) => {
                            const myA = normalizeAssignments(v).filter(as => memberIds.has(as.missionary_id));
                            const missingLicense = v.drivers?.some((d) => d.name && !d.license_url);
                            return (
                              <tr key={v.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition" onClick={() => openDetail(v)}>
                                <td className="px-6 py-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-gray-900">{v.provider_name}</span>
                                    {v.is_church_owned && <span className="text-xs text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">교회</span>}
                                    {!v.insurance_added && <span className="text-xs bg-orange-100 text-orange-500 px-1.5 py-0.5 rounded font-medium">보험미완</span>}
                                    {missingLicense && <span className="text-xs bg-yellow-100 text-yellow-600 px-1.5 py-0.5 rounded font-medium">면허미첨부</span>}
                                  </div>
                                  {v.provider_contact && <p className="text-xs text-gray-400 mt-0.5">{v.provider_contact}</p>}
                                </td>
                                <td className="px-4 py-3 hidden sm:table-cell">
                                  {myA.map((as, i) => as.from ? (
                                    <span key={i} className="text-xs text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded font-medium mr-1">
                                      {fmtD(as.from)}~{fmtD(as.to)}
                                    </span>
                                  ) : null)}
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">
                                  {v.car_model && <span className="mr-1">{v.car_model}</span>}
                                  {v.car_number && <span className="text-gray-400">{v.car_number}</span>}
                                  {!v.car_model && !v.car_number && <span className="text-gray-300">미입력</span>}
                                </td>
                                <td className="px-3 py-3 text-center hidden sm:table-cell">
                                  {v.insurance_added
                                    ? <span className="text-xs text-green-600 font-semibold">✓ 완료</span>
                                    : <span className="text-xs text-orange-500 font-semibold">미완료</span>}
                                </td>
                                {isMember && (
                                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-1">
                                      {myA[0]?.from && (
                                        <button
                                          onClick={() => openCopyForAssignment(v, myA[0])}
                                          className="text-gray-400 hover:text-emerald-600 p-1 rounded hover:bg-emerald-50 transition"
                                          title="안내문 복사"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                          </svg>
                                        </button>
                                      )}
                                      <button onClick={() => openEdit(v)} className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition" title="수정">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                      </button>
                                      {isAdmin && (
                                        <button onClick={() => handleDelete(v.id)} className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition" title="삭제">
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

            {/* 배정 가능 차량 풀 */}
            {unassignedPool.length > 0 && (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-500">📦 배정 가능 차량 ({unassignedPool.length}대)</span>
                  <span className="text-xs text-gray-400">미배정 또는 남은 기간 있는 차량</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {unassignedPool.map(({ item: v, remainingPeriods }) => (
                    <div key={`${v.id}-pool`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(v)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 text-[15px]">{v.provider_name}</span>
                          {v.is_church_owned && <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-medium">교회</span>}
                          {v.car_model && <span className="text-xs text-gray-400">{v.car_model}</span>}
                          {v.car_number && <span className="text-xs text-gray-400">{v.car_number}</span>}
                          {remainingPeriods.length > 0 ? (
                            <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded font-medium">
                              남은 기간: {formatPeriods(remainingPeriods)}
                            </span>
                          ) : (
                            v.available_from && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                {fmtD(v.available_from)}~{fmtD(v.available_to)}
                              </span>
                            )
                          )}
                          {!v.insurance_added && <span className="text-xs bg-orange-100 text-orange-600 font-semibold px-1.5 py-0.5 rounded-full">보험미완</span>}
                        </div>
                      </div>
                      {isMember && (
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => openEdit(v)} className="text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition font-semibold">배정</button>
                          {isAdmin && (
                            <button onClick={() => handleDelete(v.id)} className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition" title="삭제">
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
        /* ── 차량 목록 뷰 ── */
        items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p>등록된 차량이 없습니다.</p>
            {isAdmin && <p className="text-sm mt-1">위 버튼으로 차량을 추가하세요.</p>}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs w-44">제공자</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs hidden sm:table-cell">차량</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs hidden sm:table-cell">운전자</th>
                  <th className="text-center px-3 py-3 font-semibold text-gray-500 text-xs">보험</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs w-44">배정 가정</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs hidden md:table-cell whitespace-nowrap">기간</th>
                  {isMember && <th className="px-4 py-3 w-16" />}
                </tr>
              </thead>
              <tbody>
                {items.map((v) => {
                  const assignedLabels = getAssignedLabels(v);
                  return (
                    <tr key={v.id} className="border-t border-gray-100 hover:bg-gray-50 transition cursor-pointer" onClick={() => openDetail(v)}>
                      {/* 제공자 */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-gray-900 text-[15px] leading-tight flex items-center gap-1.5">
                          {v.provider_name}
                          {v.is_church_owned && <span className="text-xs bg-indigo-100 text-indigo-600 px-1 py-0.5 rounded">🏛️</span>}
                        </div>
                      </td>
                      {/* 차량 */}
                      <td className="px-4 py-3.5 text-gray-700 hidden sm:table-cell">
                        <div className="text-[15px]">{v.car_model || "-"}</div>
                        {v.car_number && <div className="text-xs text-gray-400 mt-0.5">{v.car_number}</div>}
                      </td>
                      {/* 운전자 */}
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        {v.drivers?.length > 0 ? (
                          v.drivers.map((d, i) => (
                            <div key={i} className="flex items-center gap-1">
                              <span className="text-[15px] text-gray-800">{d.name}</span>
                              {!d.license_url && <span className="text-xs text-yellow-500">면허미첨부</span>}
                            </div>
                          ))
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </td>
                      {/* 보험 */}
                      <td className="px-3 py-3.5 text-center">
                        {v.insurance_added
                          ? <span className="text-emerald-500 font-bold text-base">✓</span>
                          : <span className="text-orange-400 text-xs font-semibold">미완</span>}
                      </td>
                      {/* 배정 가정 */}
                      <td className="px-4 py-3.5">
                        {assignedLabels.length > 0 ? (
                          <div className="space-y-1">
                            {assignedLabels.map((al, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <span className="font-medium text-[15px] text-gray-800">{al.label}</span>
                                {al.from && (
                                  <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                    {fmtD(al.from)}~{fmtD(al.to)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-orange-400 text-[15px] font-medium">미배정</span>
                        )}
                      </td>
                      {/* 기간 */}
                      <td className="px-4 py-3.5 text-gray-600 text-sm hidden md:table-cell whitespace-nowrap">
                        {v.available_from ? `${v.available_from} ~ ${v.available_to || "미정"}` : "-"}
                      </td>
                      {isMember && (
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(v)} className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition" title="수정">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            {isAdmin && (
                              <button onClick={() => handleDelete(v.id)} className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition" title="삭제">
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

      <input ref={licenseInputRef} type="file" accept="image/*,.pdf" onChange={handleLicenseUpload} className="hidden" />

      {/* ── 상세 보기 모달 ── */}
      {detailItem && (
        <Modal isOpen={showDetail} onClose={() => setShowDetail(false)} title="차량 상세 정보" className="sm:max-w-[550px]"
          footer={isMember ? <button onClick={() => openEdit(detailItem)} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">수정하기</button> : null}
        >
          {(() => {
            const v = detailItem;
            const vehAssignments = normalizeAssignments(v);
            return (
              <div className="space-y-4">

                {/* ── 기본 정보 테이블 ── */}
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <th className="w-28 px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">제공자</th>
                      <td className="px-4 py-3 text-gray-900 font-semibold">
                        {v.provider_name}
                        {v.provider_contact && <span className="ml-2 text-gray-400 font-normal">{v.provider_contact}</span>}
                      </td>
                    </tr>
                    {v.car_model && (
                      <tr>
                        <th className="px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left">차종</th>
                        <td className="px-4 py-3 text-gray-900 font-semibold">{v.car_model}</td>
                      </tr>
                    )}
                    {v.car_number && (
                      <tr>
                        <th className="px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">차량 번호</th>
                        <td className="px-4 py-3 text-gray-900 font-semibold">{v.car_number}</td>
                      </tr>
                    )}
                    <tr>
                      <th className="px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">제공 기간</th>
                      <td className="px-4 py-3 text-gray-900 font-semibold">
                        {v.available_from ? `${v.available_from} ~ ${v.available_to || "미정"}` : "미입력"}
                      </td>
                    </tr>
                    <tr>
                      <th className="px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left align-top">보험</th>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1">
                          {v.insurance_added
                            ? <span className="text-green-600 font-semibold">✓ 추가 완료</span>
                            : <span className="text-orange-500 font-semibold">⚠️ 미완료</span>}
                        </div>
                        {v.insurance_company && (
                          <div className="text-sm text-gray-700 mt-1">
                            <span className="text-gray-400 text-xs mr-1">보험사</span>
                            <span className="font-semibold">{v.insurance_company}</span>
                          </div>
                        )}
                        {v.insurance_number && (
                          <div className="text-sm text-gray-700 mt-0.5">
                            <span className="text-gray-400 text-xs mr-1">연락처</span>
                            <span>{v.insurance_number}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                    {v.notes && (
                      <tr>
                        <th className="px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left align-top">메모</th>
                        <td className="px-4 py-3 text-gray-900 whitespace-pre-wrap">{v.notes}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* ── 운전자 ── */}
                {v.drivers?.length > 0 && (
                  <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                    <tbody className="divide-y divide-gray-100">
                      <tr>
                        <th className="w-28 px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left align-top">운전자</th>
                        <td className="px-4 py-3">
                          <div className="space-y-1.5">
                            {v.drivers.map((d, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <span className="text-gray-900 font-semibold">{d.name || "이름 미입력"}</span>
                                {d.license_url
                                  ? <a href={d.license_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">면허증 보기</a>
                                  : <span className="text-xs text-yellow-500">면허증 미첨부</span>}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}

                {/* ── 배정 현황 ── */}
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <th className="w-28 px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left align-top whitespace-nowrap">배정 현황</th>
                      <td className="px-4 py-3">
                        {vehAssignments.length === 0 ? (
                          <span className="text-orange-500 font-medium">미배정</span>
                        ) : (
                          <div className="space-y-2">
                            {vehAssignments.map((assignment, i) => {
                              const m = missionaries.find((x) => x.id === assignment.missionary_id);
                              if (!m) return null;
                              const g = m.family_group?.trim();
                              const label = g || m.name;
                              const requested = getFamilyVehiclePeriods(assignment.missionary_id, missionaries);
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
                                  {/* ── 이용 전/후 사진 ── */}
                                  {/* 사진 섹션 (담당자/비담당자 공통 렌더) */}
                                  {(() => {
                                    const startPhotos = assignment.start_photos ?? [];
                                    const endPhotos   = assignment.end_photos   ?? [];
                                    if (!isMember && !startPhotos.length && !endPhotos.length) return null;
                                    return (
                                      <div className="mt-3 grid grid-cols-2 gap-3">
                                        {(["start", "end"] as const).map((pt) => {
                                          const photos   = pt === "start" ? startPhotos : endPhotos;
                                          const label    = pt === "start" ? "이용 전" : "이용 후";
                                          const uploading = uploadingPhoto === `${v.id}-${i}-${pt}`;
                                          return (
                                            <div key={pt}>
                                              <p className="text-xs font-semibold text-gray-500 mb-1.5">{label} 사진</p>
                                              {/* 가로 스크롤 썸네일 스트립 */}
                                              {(photos.length > 0 || uploading) && (
                                                <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2 snap-x snap-mandatory [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
                                                  {photos.map((url, pi) => (
                                                    <div key={pi} className="relative group shrink-0 snap-start">
                                                      <img
                                                        src={url}
                                                        alt=""
                                                        className="w-16 h-16 object-cover rounded-lg border border-gray-200 cursor-zoom-in"
                                                        onClick={() => setLightbox({ photos, idx: pi })}
                                                      />
                                                      {isMember && (
                                                        <button
                                                          onClick={() => handlePhotoDelete(v, i, pt, url)}
                                                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                                                        >✕</button>
                                                      )}
                                                    </div>
                                                  ))}
                                                  {/* 업로드 중 스피너 슬롯 */}
                                                  {uploading && (
                                                    <div className="shrink-0 snap-start w-16 h-16 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 flex flex-col items-center justify-center gap-1">
                                                      <svg className="w-5 h-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                                                      </svg>
                                                      <span className="text-[9px] text-blue-400 font-medium">저장 중</span>
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                              {/* 업로드 버튼 (담당자만) */}
                                              {isMember && (
                                                <label className={`flex items-center gap-1.5 cursor-pointer text-xs px-2.5 py-1.5 rounded-lg border transition
                                                  ${uploading
                                                    ? "border-blue-200 bg-blue-50 text-blue-400 cursor-not-allowed"
                                                    : "border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50"}`}>
                                                  {uploading ? (
                                                    <>
                                                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                                                      </svg>
                                                      <span>사진 업로드 중...</span>
                                                    </>
                                                  ) : (
                                                    <><span className="text-sm">📷</span><span>사진 추가</span></>
                                                  )}
                                                  <input
                                                    type="file" accept="image/*" multiple className="hidden" disabled={uploading}
                                                    onChange={(e) => e.target.files && handlePhotoUpload(v, i, pt, e.target.files)}
                                                  />
                                                </label>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })}
                            {vehAssignments.length > 1 && (
                              <p className="text-xs text-purple-600">🤝 {vehAssignments.length}가정이 기간을 나눠 사용합니다.</p>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* ── 사용 안내문 ── */}
                {v.guide_content && (
                  <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                    <tbody>
                      <tr>
                        <th className="w-28 px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left align-top whitespace-nowrap">사용 안내문</th>
                        <td className="px-4 py-3 text-gray-700 whitespace-pre-wrap">{v.guide_content}</td>
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
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={selected ? "차량 정보 수정" : "차량 등록"} className="sm:max-w-[600px]"
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "저장 중..." : "저장"}</button>
          </>
        }
      >
        <div className="space-y-5">
          <section>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">차량 정보</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="제공자 이름 *" value={form.provider_name} onChange={(v) => setForm({ ...form, provider_name: v })} />
              <Field label="연락처" value={form.provider_contact} onChange={(v) => setForm({ ...form, provider_contact: v })} />
              <Field label="차종" value={form.car_model} onChange={(v) => setForm({ ...form, car_model: v })} placeholder="예: 현대 아반떼" />
              <Field label="차량번호" value={form.car_number} onChange={(v) => setForm({ ...form, car_number: v })} placeholder="예: 123가4567" />
              <Field label={`이용 가능 시작일${form.is_church_owned ? " (선택)" : ""}`} value={form.available_from} onChange={(v) => setForm({ ...form, available_from: v })} type="date" />
              <Field label={`이용 가능 종료일${form.is_church_owned ? " (선택)" : ""}`} value={form.available_to} onChange={(v) => setForm({ ...form, available_to: v })} type="date" />
            </div>
          </section>

          <section>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">보험</p>
            <label className="flex items-center gap-3 bg-orange-50 border border-orange-100 rounded-lg px-4 py-3 cursor-pointer hover:bg-orange-100 transition mb-3">
              <input type="checkbox" checked={form.insurance_added} onChange={(e) => setForm({ ...form, insurance_added: e.target.checked })} className="w-4 h-4 accent-orange-500" />
              <span className="text-sm font-semibold text-gray-700">🛡️ 운전자 보험 추가 완료</span>
              {form.insurance_added && <span className="ml-auto text-xs text-green-600 font-semibold">✓ 완료</span>}
            </label>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="보험사" value={form.insurance_company} onChange={(v) => setForm({ ...form, insurance_company: v })} placeholder="예: 삼성화재" />
              <Field label="보험사 연락처" value={form.insurance_number} onChange={(v) => setForm({ ...form, insurance_number: v })} placeholder="예: 1588-0000" />
            </div>
          </section>

          <section>
            <label className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 cursor-pointer hover:bg-indigo-100 transition">
              <input type="checkbox" checked={form.is_church_owned} onChange={(e) => setForm({ ...form, is_church_owned: e.target.checked })} className="w-4 h-4 accent-indigo-500" />
              <div className="flex-1">
                <span className="text-sm font-semibold text-gray-700">🏛️ 교회 소속 차량</span>
                <p className="text-xs text-gray-500 mt-0.5">기간 제한 없이 여러 가정이 순차적으로 사용할 수 있습니다. 남은 기간은 미배정 풀에 표시됩니다.</p>
              </div>
              {form.is_church_owned && <span className="ml-auto text-xs text-indigo-600 font-semibold shrink-0">✓ 교회 소속</span>}
            </label>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">운전자 확인</p>
              <button type="button" onClick={addDriver} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold transition">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                운전자 추가
              </button>
            </div>
            <div className="space-y-3">
              {form.drivers.map((driver, idx) => (
                <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500">운전자 {idx + 1}</span>
                    {form.drivers.length > 1 && (
                      <button type="button" onClick={() => removeDriver(idx)} className="ml-auto text-gray-300 hover:text-red-400 transition">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                  <input type="text" value={driver.name} onChange={(e) => updateDriverName(idx, e.target.value)} placeholder="운전자 이름"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                  {driver.license_url ? (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <a href={driver.license_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline flex-1 truncate">면허증 보기</a>
                      <button type="button" onClick={() => handleLicenseDelete(idx)} className="text-xs text-red-400 hover:text-red-600 shrink-0">삭제</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => triggerLicenseUpload(idx)} disabled={uploadingDriverIdx === idx}
                      className="flex items-center gap-2 w-full border-2 border-dashed border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition disabled:opacity-50">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                      {uploadingDriverIdx === idx ? "업로드 중..." : "면허증 업로드 (이미지 또는 PDF)"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">배정 가정 (가족 단위)</p>
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
          </section>

          <section>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">안내문 / 메모</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">차량 사용 안내문</label>
                <textarea value={form.guide_content} onChange={(e) => setForm({ ...form, guide_content: e.target.value })} rows={3} placeholder="연료 종류, 주유소 위치, 주의사항 등..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">메모</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
          </section>

          {isAdmin && selected && (
            <div className="pt-2 border-t border-gray-100">
              <button onClick={() => { setShowModal(false); handleDelete(selected.id); }} className="text-sm text-red-500 hover:text-red-700 transition">이 차량 삭제</button>
            </div>
          )}
        </div>
      </Modal>

      {/* ── 차량 선택 모달 ── */}
      <Modal
        isOpen={showPickModal}
        onClose={() => setShowPickModal(false)}
        title={`차량 배정 — ${pickFamily?.label}`}
        className="sm:max-w-[500px]"
        footer={
          <>
            <button onClick={() => setShowPickModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
            <button onClick={handleSavePick} disabled={savingPick || !pickVehicleId} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {savingPick ? "배정 중..." : "배정하기"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* 차량 목록 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">배정할 차량 선택</label>
            {pickableVehicles.length === 0 ? (
              <div className="text-center py-5 text-sm text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <p>배정 가능한 차량이 없습니다.</p>
                <p className="text-xs mt-1">"차량 추가" 버튼으로 새 차량을 먼저 등록하세요.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                {pickableVehicles.map((v) => {
                  const assignedCount = normalizeAssignments(v).length;
                  const { from: _rFrom, to: _rTo } = v.is_church_owned
                    ? churchVehicleBound(v)
                    : { from: v.available_from ?? "", to: v.available_to ?? "" };
                  const remaining = _rFrom && _rTo
                    ? getRemainingPeriods(normalizeAssignments(v), _rFrom, _rTo)
                    : [];
                  const missingInsurance = !v.insurance_added;
                  return (
                    <label
                      key={v.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                        pickVehicleId === v.id
                          ? "border-blue-400 bg-blue-50"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio" name="pick_vehicle" value={v.id}
                        checked={pickVehicleId === v.id}
                        onChange={() => setPickVehicleId(v.id)}
                        className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-gray-900">🚗 {v.provider_name}</span>
                          {v.is_church_owned && (
                            <span className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">🏛️ 교회</span>
                          )}
                          {v.car_model && <span className="text-xs text-gray-500">{v.car_model}</span>}
                          {v.car_number && <span className="text-xs text-gray-400">({v.car_number})</span>}
                          {missingInsurance && (
                            <span className="text-xs text-orange-500 font-medium">보험미완</span>
                          )}
                          {assignedCount > 0 && remaining.length > 0 && (
                            <span className="text-xs text-purple-500 font-medium">🤝 공유중</span>
                          )}
                          {assignedCount > 0 && remaining.length === 0 && !v.is_church_owned && (
                            <span className="text-xs text-orange-500 font-medium">배정됨</span>
                          )}
                        </div>
                        {remaining.length > 0 ? (
                          <p className="text-xs text-green-600 mt-0.5">남은 기간: {formatPeriods(remaining)}</p>
                        ) : !v.is_church_owned && v.available_from ? (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {v.available_from.slice(5)}~{v.available_to?.slice(5) ?? "?"}
                          </p>
                        ) : null}
                        {v.drivers?.length > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            운전자: {v.drivers.map((d) => d.name).filter(Boolean).join(", ")}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* 날짜 입력 */}
          {pickableVehicles.length > 0 && (
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
          title="차량 변경 이력"
          entityType="vehicle"
        />
      )}

      {/* ── 사진 라이트박스 (Portal → document.body 직접 렌더링) ── */}
      {lightbox && createPortal(
        <div
          className="fixed inset-0 z-[10000] bg-black/95 flex items-center justify-center select-none"
          onClick={() => setLightbox(null)}
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            if (dx < -50 && lightbox.idx < lightbox.photos.length - 1)
              setLightbox({ ...lightbox, idx: lightbox.idx + 1 });
            else if (dx > 50 && lightbox.idx > 0)
              setLightbox({ ...lightbox, idx: lightbox.idx - 1 });
          }}
        >
          {/* 닫기 */}
          <button
            className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-full text-xl transition"
            onClick={() => setLightbox(null)}
          >×</button>
          {/* 카운터 */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm font-medium">
            {lightbox.idx + 1} / {lightbox.photos.length}
          </div>
          {/* 이전 */}
          {lightbox.idx > 0 && (
            <button
              className="absolute left-3 z-10 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/25 text-white rounded-full text-2xl transition"
              onClick={(e) => { e.stopPropagation(); setLightbox({ ...lightbox, idx: lightbox.idx - 1 }); }}
            >‹</button>
          )}
          {/* 이미지 */}
          <img
            src={lightbox.photos[lightbox.idx]}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            alt="차량 사진"
          />
          {/* 다음 */}
          {lightbox.idx < lightbox.photos.length - 1 && (
            <button
              className="absolute right-3 z-10 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/25 text-white rounded-full text-2xl transition"
              onClick={(e) => { e.stopPropagation(); setLightbox({ ...lightbox, idx: lightbox.idx + 1 }); }}
            >›</button>
          )}
          {/* 도트 인디케이터 */}
          {lightbox.photos.length > 1 && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2">
              {lightbox.photos.map((_, di) => (
                <button
                  key={di}
                  className={`w-2 h-2 rounded-full transition ${di === lightbox.idx ? "bg-white scale-125" : "bg-white/35 hover:bg-white/60"}`}
                  onClick={(e) => { e.stopPropagation(); setLightbox({ ...lightbox, idx: di }); }}
                />
              ))}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );
}
