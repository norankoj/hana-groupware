"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Select from "@/components/Select";
import Modal from "@/components/Modal";
import WelcomePackModal from "@/components/projects/WelcomePackModal";
import AuditLogModal from "@/components/projects/AuditLogModal";
import * as XLSX from "xlsx";
import { logAudit } from "@/utils/auditLog";
import {
  type DatePeriod,
  checkMultiPeriodCoverage,
  getFamilyAccomPeriods,
  getFamilyVehiclePeriods,
  formatPeriods,
  COVER_ICON,
} from "@/utils/projectUtils";

type Props = { projectId: string; myUserId: string; isMember: boolean; isAdmin: boolean };

type Missionary = {
  id: string;
  name: string;
  affiliation: string | null;          // 소속
  country: string | null;              // 국가
  departure_location: string | null;   // 출발지
  family_group: string | null;         // 가족 그룹
  phone: string | null;                // 연락처
  arrival_date: string | null;
  arrival_time: string | null;         // 도착 시간
  arrival_terminal: string | null;     // 도착 터미널
  arrival_flight: string | null;
  departure_date: string | null;
  departure_time: string | null;       // 출발 시간
  departure_terminal: string | null;   // 출발 터미널
  departure_flight: string | null;
  accommodation_needed: boolean;
  accommodation_periods: DatePeriod[] | null; // 숙소 필요 기간 (다중)
  accommodation_from: string | null;          // 레거시 단일 기간
  accommodation_to: string | null;
  vehicle_needed: boolean;
  vehicle_periods: DatePeriod[] | null;       // 차량 필요 기간 (다중)
  vehicle_from: string | null;                // 레거시 단일 기간
  vehicle_to: string | null;
  ride_needed: boolean;
  dietary_notes: string | null;
  notes: string | null;
  share_token: string | null;
};

const EMPTY: Omit<Missionary, "id"> = {
  name: "", affiliation: "", country: "", departure_location: "",
  family_group: "", phone: "",
  arrival_date: "", arrival_time: "", arrival_terminal: "", arrival_flight: "",
  departure_date: "", departure_time: "", departure_terminal: "", departure_flight: "",
  accommodation_needed: false, accommodation_periods: [], accommodation_from: "", accommodation_to: "",
  vehicle_needed: false, vehicle_periods: [], vehicle_from: "", vehicle_to: "",
  ride_needed: false,
  dietary_notes: "", notes: "",
  share_token: null,
};

const EXCEL_COLUMNS = [
  { header: "이름*",              field: "name" },
  { header: "소속",               field: "affiliation" },
  { header: "국가",               field: "country" },
  { header: "출발지",             field: "departure_location" },
  { header: "가족그룹",           field: "family_group" },
  { header: "연락처",             field: "phone" },
  { header: "한국IN날짜(YYYY-MM-DD)", field: "arrival_date" },
  { header: "도착시간(HH:MM)",    field: "arrival_time" },
  { header: "터미널(IN)",         field: "arrival_terminal" },
  { header: "항공편(IN)",         field: "arrival_flight" },
  { header: "한국OUT날짜(YYYY-MM-DD)", field: "departure_date" },
  { header: "출발시간(HH:MM)",    field: "departure_time" },
  { header: "터미널(OUT)",        field: "departure_terminal" },
  { header: "항공편(OUT)",        field: "departure_flight" },
  { header: "숙소필요(Y/N)",      field: "accommodation_needed" },
  { header: "차량필요(Y/N)",      field: "vehicle_needed" },
  { header: "라이드필요(Y/N)",    field: "ride_needed" },
  { header: "식이제한",           field: "dietary_notes" },
  { header: "메모",               field: "notes" },
] as const;

// 상세 뷰에서 보여줄 숙소/차량 타입
type DetailAssignment = { missionary_id: string; from: string; to: string };
type DetailAccom = {
  id: string; provider_name: string; provider_contact: string | null;
  address: string | null; capacity: number;
  available_from: string | null; available_to: string | null;
  assignments: DetailAssignment[] | null;
  assigned_missionary_id: string | null;
};
type DetailVehicle = {
  id: string; provider_name: string; provider_contact: string | null;
  car_model: string | null; car_number: string | null;
  available_from: string | null; available_to: string | null;
  insurance_added: boolean;
  assignments: DetailAssignment[] | null;
  assigned_missionary_id: string | null;
};

export default function MissionaryTab({ projectId, isMember, isAdmin }: Props) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [missionaries, setMissionaries] = useState<Missionary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "accommodation" | "vehicle" | "ride" | "unmatched">("all");
  const [selected, setSelected] = useState<Missionary | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Omit<Missionary, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [sortKey, setSortKey] = useState<"name" | "affiliation" | "country" | "arrival_date" | "departure_date">("arrival_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // 상세 뷰 모달
  const [showDetail, setShowDetail] = useState(false);
  const [detailM, setDetailM] = useState<Missionary | null>(null);
  const [detailAccoms, setDetailAccoms] = useState<DetailAccom[]>([]);
  const [detailVehicles, setDetailVehicles] = useState<DetailVehicle[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // 가족 숙소/차량 요청 수정 모달
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [familyGroup, setFamilyGroup] = useState("");
  const [familyForm, setFamilyForm] = useState<{
    accommodation_needed: boolean;
    accommodation_periods: DatePeriod[];
    vehicle_needed: boolean;
    vehicle_periods: DatePeriod[];
  }>({
    accommodation_needed: false,
    accommodation_periods: [{ from: "", to: "" }],
    vehicle_needed: false,
    vehicle_periods: [{ from: "", to: "" }],
  });
  const [savingFamily, setSavingFamily] = useState(false);

  // 환영팩 / 공유 / 이력 모달
  const [welcomePack, setWelcomePack] = useState<{ familyGroup: string | null; repId: string } | null>(null);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [projectName, setProjectName] = useState<string>("MARF");

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };
  const [uploading, setUploading] = useState(false);
  const [matchedAccom, setMatchedAccom] = useState<Set<string>>(new Set());
  const [matchedVehicle, setMatchedVehicle] = useState<Set<string>>(new Set());

  const fetch = useCallback(async () => {
    const [{ data: m }, { data: a }, { data: v }, { data: proj }] = await Promise.all([
      supabase.from("marf_missionaries").select("*").eq("project_id", projectId).order("family_group").order("arrival_date"),
      supabase.from("marf_accommodations").select("assigned_missionary_id").eq("project_id", projectId).not("assigned_missionary_id", "is", null),
      supabase.from("marf_vehicles").select("assigned_missionary_id").eq("project_id", projectId).not("assigned_missionary_id", "is", null),
      supabase.from("projects").select("name").eq("id", projectId).maybeSingle(),
    ]);
    setMissionaries((m || []) as Missionary[]);
    setMatchedAccom(new Set((a || []).map((x: any) => x.assigned_missionary_id)));
    setMatchedVehicle(new Set((v || []).map((x: any) => x.assigned_missionary_id)));
    if (proj?.name) setProjectName(proj.name);
    setLoading(false);
  }, [projectId]);

  // 공유 링크 복사 (절대 URL)
  const copyShareLink = async (m: Missionary) => {
    if (!m.share_token) {
      toast.error("이 선교사는 공유 토큰이 없습니다. (SQL 마이그레이션 실행 필요)");
      return;
    }
    const url = `${window.location.origin}/share/m/${m.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("공유 링크가 복사되었습니다");
    } catch {
      toast.error("복사 실패");
    }
  };

  useEffect(() => { fetch(); }, [fetch]);

  const openCreate = () => { setSelected(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (m: Missionary) => {
    setSelected(m);
    const accomPeriods = getFamilyAccomPeriods(m.id, missionaries);
    const vehiclePeriods = getFamilyVehiclePeriods(m.id, missionaries);
    setForm({
      ...m,
      accommodation_periods: accomPeriods.length > 0 ? accomPeriods : [],
      vehicle_periods: vehiclePeriods.length > 0 ? vehiclePeriods : [],
    });
    setShowDetail(false);
    setShowModal(true);
  };

  const openDetail = async (m: Missionary) => {
    setDetailM(m);
    setDetailAccoms([]);
    setDetailVehicles([]);
    setShowDetail(true);
    setDetailLoading(true);
    const familyIds = m.family_group?.trim()
      ? missionaries.filter((x) => x.family_group?.trim() === m.family_group!.trim()).map((x) => x.id)
      : [m.id];
    const familyIdSet = new Set(familyIds);
    // 전체 자원 fetch 후 client-side 필터 (assignments JSONB + legacy 모두 커버)
    const [{ data: allAccoms }, { data: allVehicles }] = await Promise.all([
      supabase.from("marf_accommodations")
        .select("id, provider_name, provider_contact, address, capacity, available_from, available_to, assignments, assigned_missionary_id")
        .eq("project_id", projectId),
      supabase.from("marf_vehicles")
        .select("id, provider_name, provider_contact, car_model, car_number, available_from, available_to, insurance_added, assignments, assigned_missionary_id")
        .eq("project_id", projectId),
    ]);
    const filterByFamily = (items: any[]) => items.filter((item) => {
      if (item.assignments?.length > 0)
        return item.assignments.some((a: any) => familyIdSet.has(a.missionary_id));
      return item.assigned_missionary_id && familyIdSet.has(item.assigned_missionary_id);
    });
    setDetailAccoms(filterByFamily(allAccoms || []) as DetailAccom[]);
    setDetailVehicles(filterByFamily(allVehicles || []) as DetailVehicle[]);
    setDetailLoading(false);
  };

  const openFamilyEdit = (groupName: string) => {
    const members = missionaries.filter((m) => m.family_group?.trim() === groupName);
    if (members.length === 0) return;
    const first = members[0];
    setFamilyGroup(groupName);
    const accomPeriods = getFamilyAccomPeriods(first.id, missionaries);
    const vehiclePeriods = getFamilyVehiclePeriods(first.id, missionaries);
    setFamilyForm({
      accommodation_needed: first.accommodation_needed,
      accommodation_periods: accomPeriods.length > 0 ? accomPeriods : [{ from: "", to: "" }],
      vehicle_needed: first.vehicle_needed,
      vehicle_periods: vehiclePeriods.length > 0 ? vehiclePeriods : [{ from: "", to: "" }],
    });
    setShowFamilyModal(true);
  };

  const handleFamilySave = async () => {
    setSavingFamily(true);
    const members = missionaries.filter((m) => m.family_group?.trim() === familyGroup);
    const ids = members.map((m) => m.id);
    const accomPeriods = familyForm.accommodation_needed
      ? familyForm.accommodation_periods.filter((p) => p.from && p.to)
      : [];
    const vehiclePeriods = familyForm.vehicle_needed
      ? familyForm.vehicle_periods.filter((p) => p.from && p.to)
      : [];
    const { error } = await supabase
      .from("marf_missionaries")
      .update({
        accommodation_needed: familyForm.accommodation_needed,
        accommodation_periods: accomPeriods,
        accommodation_from: accomPeriods[0]?.from || null,
        accommodation_to: accomPeriods[accomPeriods.length - 1]?.to || null,
        vehicle_needed: familyForm.vehicle_needed,
        vehicle_periods: vehiclePeriods,
        vehicle_from: vehiclePeriods[0]?.from || null,
        vehicle_to: vehiclePeriods[vehiclePeriods.length - 1]?.to || null,
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);
    if (error) { toast.error("저장 실패"); setSavingFamily(false); return; }
    toast.success("가족 숙소/차량 정보 저장 완료");
    setShowFamilyModal(false);
    fetch();
    setSavingFamily(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("이름을 입력하세요."); return; }
    setSaving(true);
    const accomPeriods = form.accommodation_needed
      ? (form.accommodation_periods ?? []).filter((p) => p.from && p.to)
      : [];
    const vehiclePeriods = form.vehicle_needed
      ? (form.vehicle_periods ?? []).filter((p) => p.from && p.to)
      : [];
    const payload = {
      ...form,
      family_group: form.family_group?.trim() || null,
      affiliation: form.affiliation?.trim() || null,
      accommodation_periods: accomPeriods,
      accommodation_from: accomPeriods[0]?.from || null,
      accommodation_to: accomPeriods[accomPeriods.length - 1]?.to || null,
      vehicle_periods: vehiclePeriods,
      vehicle_from: vehiclePeriods[0]?.from || null,
      vehicle_to: vehiclePeriods[vehiclePeriods.length - 1]?.to || null,
    };
    if (selected) {
      const { error } = await supabase.from("marf_missionaries").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", selected.id);
      if (error) { toast.error("수정 실패"); setSaving(false); return; }
      toast.success("수정되었습니다.");
      logAudit(supabase, {
        projectId, entityType: "missionary", entityId: selected.id,
        action: "update", summary: `선교사 정보 수정: ${payload.name}`,
        beforeData: selected, afterData: payload,
      });
    } else {
      const { data: inserted, error } = await supabase.from("marf_missionaries").insert({ ...payload, project_id: projectId }).select().single();
      if (error) { toast.error("저장 실패"); setSaving(false); return; }
      toast.success("등록되었습니다.");
      logAudit(supabase, {
        projectId, entityType: "missionary", entityId: inserted?.id,
        action: "create", summary: `선교사 추가: ${payload.name}`,
        afterData: payload,
      });
    }
    setShowModal(false);
    fetch();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    const target = missionaries.find((m) => m.id === id);
    await supabase.from("marf_missionaries").delete().eq("id", id);
    toast.success("삭제되었습니다.");
    if (target) {
      logAudit(supabase, {
        projectId, entityType: "missionary", entityId: id,
        action: "delete", summary: `선교사 삭제: ${target.name}`,
        beforeData: target,
      });
    }
    fetch();
  };

  const handleDeleteAll = async () => {
    if (missionaries.length === 0) { toast.error("삭제할 데이터가 없습니다."); return; }
    if (!confirm(`전체 명단 ${missionaries.length}명을 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    const toastId = toast.loading("삭제 중...");
    const { error } = await supabase.from("marf_missionaries").delete().eq("project_id", projectId);
    if (error) { toast.error("삭제 실패", { id: toastId }); return; }
    toast.success("전체 삭제 완료", { id: toastId });
    fetch();
  };

  // ── 엑셀 템플릿 다운로드 ────────────────────────────────────
  const handleDownloadTemplate = () => {
    const headers = EXCEL_COLUMNS.map((c) => c.header);
    const sample = [
      "김영두", "수원하나", "이스라엘", "이스라엘", "김영두 가족", "010-1234-5678",
      "2026-07-18", "17:00", "T1", "EK322",
      "2026-08-02", "23:55", "T1", "EK323",
      "Y", "N", "Y", "", "",
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    ws["!cols"] = EXCEL_COLUMNS.map((c) => ({ wch: Math.max(c.header.length + 4, 14) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "명단");
    XLSX.writeFile(wb, "MARF_명단_템플릿.xlsx");
    toast.success("템플릿 다운로드 완료");
  };

  // ── 엑셀 업로드 ──────────────────────────────────────────────
  const handleUploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    const toastId = toast.loading("파일 읽는 중...");
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (rows.length < 2) { toast.error("데이터가 없습니다.", { id: toastId }); setUploading(false); return; }

      const headerRow: string[] = rows[0].map((h: any) => String(h).trim());
      const colIdx: Record<string, number> = {};
      EXCEL_COLUMNS.forEach(({ header, field }) => {
        const idx = headerRow.indexOf(header);
        if (idx !== -1) colIdx[field] = idx;
      });
      if (colIdx["name"] === undefined) {
        toast.error("'이름*' 컬럼을 찾을 수 없습니다. 템플릿을 사용해주세요.", { id: toastId });
        setUploading(false); return;
      }

      const formatDate = (val: any): string | null => {
        if (!val) return null;
        if (val instanceof Date) return val.toISOString().slice(0, 10);
        const s = String(val).trim();
        if (!s) return null;
        // MM/DD → 현재 연도 적용 (예: 07/18 → 2026-07-18)
        const mmdd = s.match(/^(\d{1,2})\/(\d{1,2})$/);
        if (mmdd) {
          const y = new Date().getFullYear();
          return `${y}-${mmdd[1].padStart(2, "0")}-${mmdd[2].padStart(2, "0")}`;
        }
        // MM/DD/YYYY → YYYY-MM-DD
        const mmddyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (mmddyyyy) {
          return `${mmddyyyy[3]}-${mmddyyyy[1].padStart(2, "0")}-${mmddyyyy[2].padStart(2, "0")}`;
        }
        // YYYY-MM-DD 형식이면 그대로
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        // 그 외 (X, -, 빈칸 등) → null
        return null;
      };
      const toBool = (val: any) => String(val).trim().toUpperCase() === "Y";
      const toStr = (val: any) => String(val ?? "").trim() || null;
      // Excel 시간 소수값(0~1) → "HH:MM" 변환
      const toTime = (val: any): string | null => {
        if (val === null || val === undefined || val === "") return null;
        if (typeof val === "number" && val >= 0 && val < 1) {
          const totalMin = Math.round(val * 24 * 60);
          const h = Math.floor(totalMin / 60);
          const m = totalMin % 60;
          return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        }
        if (val instanceof Date) {
          const h = val.getHours();
          const m = val.getMinutes();
          return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        }
        return String(val).trim() || null;
      };

      const records = rows.slice(1)
        .filter((row) => String(row[colIdx["name"]] ?? "").trim())
        .map((row) => ({
          project_id:          projectId,
          name:                String(row[colIdx["name"]]).trim(),
          affiliation:         toStr(row[colIdx["affiliation"]]),
          country:             toStr(row[colIdx["country"]]),
          departure_location:  toStr(row[colIdx["departure_location"]]),
          family_group:        toStr(row[colIdx["family_group"]]),
          phone:               toStr(row[colIdx["phone"]]),
          arrival_date:        formatDate(row[colIdx["arrival_date"]]),
          arrival_time:        toTime(row[colIdx["arrival_time"]]),
          arrival_terminal:    toStr(row[colIdx["arrival_terminal"]]),
          arrival_flight:      toStr(row[colIdx["arrival_flight"]]),
          departure_date:      formatDate(row[colIdx["departure_date"]]),
          departure_time:      toTime(row[colIdx["departure_time"]]),
          departure_terminal:  toStr(row[colIdx["departure_terminal"]]),
          departure_flight:    toStr(row[colIdx["departure_flight"]]),
          accommodation_needed: toBool(row[colIdx["accommodation_needed"]]),
          vehicle_needed:      toBool(row[colIdx["vehicle_needed"]]),
          ride_needed:         toBool(row[colIdx["ride_needed"]]),
          dietary_notes:       toStr(row[colIdx["dietary_notes"]]),
          notes:               toStr(row[colIdx["notes"]]),
        }));

      if (records.length === 0) { toast.error("유효한 데이터가 없습니다.", { id: toastId }); setUploading(false); return; }

      const { error } = await supabase.from("marf_missionaries").insert(records);
      if (error) throw error;
      toast.success(`${records.length}명 등록 완료!`, { id: toastId });
      fetch();
    } catch (err: any) {
      toast.error(err?.message ?? "업로드 실패", { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  // ── 가족 단위 카운트 (통계용 — 전체 명단 기준) ──────────────
  const countUnits = (arr: Missionary[]) => {
    const groups = new Set<string>();
    let s = 0;
    arr.forEach(m => {
      const g = m.family_group?.trim();
      if (g) groups.add(g);
      else s++;
    });
    return groups.size + s;
  };

  // 전체 명단의 가족/개별 카운트 (통계 뱃지용)
  const allFamilyGroups = new Set<string>();
  let allSoloCount = 0;
  missionaries.forEach(m => {
    const g = m.family_group?.trim();
    if (g) allFamilyGroups.add(g);
    else allSoloCount++;
  });

  // 가족 그룹 내 한 명이라도 배정되면 전체 가족을 배정 완료로 표시
  const matchedFamilyGroupsAccom = new Set<string>();
  const matchedFamilyGroupsVehicle = new Set<string>();
  missionaries.forEach(m => {
    const g = m.family_group?.trim();
    if (g) {
      if (matchedAccom.has(m.id)) matchedFamilyGroupsAccom.add(g);
      if (matchedVehicle.has(m.id)) matchedFamilyGroupsVehicle.add(g);
    }
  });
  const isAccomMatched = (m: Missionary) =>
    matchedAccom.has(m.id) || !!(m.family_group?.trim() && matchedFamilyGroupsAccom.has(m.family_group.trim()));
  const isVehicleMatched = (m: Missionary) =>
    matchedVehicle.has(m.id) || !!(m.family_group?.trim() && matchedFamilyGroupsVehicle.has(m.family_group.trim()));

  // ── 필터링 ────────────────────────────────────────────────────
  const filtered = missionaries.filter((m) => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || m.name.toLowerCase().includes(q)
      || (m.country || "").toLowerCase().includes(q)
      || (m.affiliation || "").toLowerCase().includes(q)
      || (m.family_group || "").toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (filter === "accommodation") return m.accommodation_needed;
    if (filter === "vehicle") return m.vehicle_needed;
    if (filter === "ride") return m.ride_needed;
    if (filter === "unmatched") return (m.accommodation_needed && !isAccomMatched(m)) || (m.vehicle_needed && !isVehicleMatched(m));
    return true;
  });

  // ── 정렬 (null/빈값은 항상 맨 뒤) ──────────────────────────
  const sorted = [...filtered].sort((a, b) => {
    const av = (a[sortKey] ?? "") as string;
    const bv = (b[sortKey] ?? "") as string;
    if (!av && !bv) return 0;
    if (!av) return 1;
    if (!bv) return -1;
    const cmp = av.localeCompare(bv, "ko");
    if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;
    // 도착일 동일 → 도착시간 2차 정렬
    if (sortKey === "arrival_date") {
      const at = a.arrival_time ?? "", bt = b.arrival_time ?? "";
      if (!at && !bt) return 0;
      if (!at) return 1;
      if (!bt) return -1;
      const tc = at.localeCompare(bt);
      return sortDir === "asc" ? tc : -tc;
    }
    return 0;
  });

  // ── 가족 그룹핑 ───────────────────────────────────────────────
  type GroupedRow =
    | { type: "header"; key: string; count: number; rep: Missionary }
    | { type: "solo-header"; data: Missionary }
    | { type: "member"; data: Missionary; inGroup: boolean };

  const rows: GroupedRow[] = [];
  const groupMap = new Map<string, Missionary[]>();
  const solo: Missionary[] = [];

  sorted.forEach((m) => {
    const g = m.family_group?.trim();
    if (g) {
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g)!.push(m);
    } else {
      solo.push(m);
    }
  });

  // 그룹 + 솔로를 sortKey 기준으로 함께 정렬하여 행 구성
  type EntryForSort =
    | { ev: "group"; sv: string; key: string; members: Missionary[] }
    | { ev: "solo";  sv: string; data: Missionary };
  const allEntries: EntryForSort[] = [];
  groupMap.forEach((members, key) => {
    let sv: string;
    if (sortKey === "arrival_date") {
      const ds = members.map(m => m.arrival_date).filter(Boolean) as string[];
      sv = ds.length ? [...ds].sort()[0] : "";
    } else if (sortKey === "departure_date") {
      const ds = members.map(m => m.departure_date).filter(Boolean) as string[];
      sv = ds.length ? [...ds].sort().at(-1)! : "";
    } else {
      sv = String(members[0][sortKey] ?? "");
    }
    allEntries.push({ ev: "group", sv, key, members });
  });
  solo.forEach((m) => allEntries.push({ ev: "solo", sv: String(m[sortKey] ?? ""), data: m }));
  allEntries.sort((a, b) => {
    if (!a.sv && !b.sv) return 0;
    if (!a.sv) return 1;
    if (!b.sv) return -1;
    const cmp = a.sv.localeCompare(b.sv, "ko");
    return sortDir === "asc" ? cmp : -cmp;
  });
  allEntries.forEach((entry) => {
    if (entry.ev === "group") {
      rows.push({ type: "header", key: entry.key, count: entry.members.length, rep: entry.members[0] });
      entry.members.forEach((m) => rows.push({ type: "member", data: m, inGroup: true }));
    } else {
      rows.push({ type: "solo-header", data: entry.data });
      rows.push({ type: "member", data: entry.data, inGroup: false });
    }
  });

  const colSpan = isMember ? 8 : 7;

  return (
    <div>
      {/* 툴바 */}
      <div className="mb-4 space-y-2">
        {/* 1행: 검색 + 필터 */}
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="이름·국가·소속·가족 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="w-28 sm:w-36 shrink-0">
            <Select
              value={filter}
              onChange={(v) => setFilter(v as any)}
              options={[
                { value: "all",           label: "전체" },
                { value: "accommodation", label: "숙소 필요" },
                { value: "vehicle",       label: "차량 필요" },
                { value: "ride",          label: "라이드 필요" },
                { value: "unmatched",     label: "미배정" },
              ]}
              className="w-full py-2 px-3 bg-white border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        {/* 2행: 어드민 액션 버튼 */}
        {isAdmin && (
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleUploadExcel} className="hidden" />
            <button
              onClick={handleDownloadTemplate}
              title="템플릿 다운로드"
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span className="hidden sm:inline">템플릿</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="엑셀 업로드"
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
              </svg>
              <span className="hidden sm:inline">{uploading ? "업로드 중..." : "엑셀 업로드"}</span>
            </button>
            <button
              onClick={() => setShowAuditLog(true)}
              title="변경 이력"
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="hidden sm:inline">이력</span>
            </button>
            <button
              onClick={openCreate}
              title="명단 추가"
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">명단 추가</span>
            </button>
            {missionaries.length > 0 && (
              <button
                onClick={handleDeleteAll}
                title="전체 삭제"
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-red-300 text-red-500 text-sm font-medium rounded-lg hover:bg-red-50 transition"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="hidden sm:inline">전체 삭제</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 통계 뱃지 */}
      <div className="flex gap-3 mb-4 text-sm flex-wrap">
        <span className="text-gray-500">
          전체 <b className="text-gray-800">{missionaries.length}</b>명
          <span className="text-gray-400 ml-1 font-normal">({allFamilyGroups.size}가족 + 개별 {allSoloCount}명)</span>
        </span>
        <span className="text-blue-500">
          숙소필요 <b>{countUnits(missionaries.filter(m => m.accommodation_needed))}</b>가구
        </span>
        <span className="text-green-500">
          차량필요 <b>{countUnits(missionaries.filter(m => m.vehicle_needed))}</b>가구
        </span>
        <span className="text-purple-500">
          라이드필요 <b>{countUnits(missionaries.filter(m => m.ride_needed))}</b>가구
        </span>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>명단 정보가 없습니다.</p>
          {isAdmin && <p className="text-sm mt-1">위 버튼으로 추가하세요.</p>}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {(["이름", "소속", "국가 / 출발지", "IN (날짜·시간·편)", "OUT (날짜·시간·편)"] as const).map((label, i) => {
                  const keys = ["name", "affiliation", "country", "arrival_date", "departure_date"] as const;
                  const key = keys[i];
                  const hidden = ["", "hidden sm:table-cell", "hidden md:table-cell", "hidden lg:table-cell", "hidden lg:table-cell"][i];
                  const active = sortKey === key;
                  return (
                    <th key={key}
                      onClick={() => handleSort(key)}
                      className={`text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:bg-gray-100 transition ${hidden}`}
                    >
                      <span className="flex items-center gap-1">
                        {label}
                        <span className={`text-xs ${active ? "text-blue-500" : "text-gray-300"}`}>
                          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </span>
                    </th>
                  );
                })}
                <th className="text-center px-3 py-3 font-semibold text-gray-600">숙소</th>
                <th className="text-center px-3 py-3 font-semibold text-gray-600">차량/라이드</th>
                {isMember && <th className="px-4 py-3 w-20" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                if (row.type === "header") {
                  const rep = row.rep;
                  return (
                    <tr key={`group-${row.key}`} className="bg-blue-50 border-t border-b border-blue-100">
                      <td colSpan={colSpan} className="px-4 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="text-xs font-bold text-blue-600 shrink-0">👨‍👩‍👧 {row.key}</span>
                            <span className="text-xs text-blue-400 shrink-0">{row.count}명</span>
                            {rep?.accommodation_needed && (() => {
                              const periods = getFamilyAccomPeriods(rep.id, missionaries);
                              return (
                                <span className="text-xs bg-white text-blue-600 px-1.5 py-0.5 rounded border border-blue-200 shrink-0">
                                  🏠{periods.length > 0 ? ` ${formatPeriods(periods)}` : ""}
                                </span>
                              );
                            })()}
                            {rep?.vehicle_needed && (() => {
                              const periods = getFamilyVehiclePeriods(rep.id, missionaries);
                              return (
                                <span className="text-xs bg-white text-green-600 px-1.5 py-0.5 rounded border border-green-200 shrink-0">
                                  🚗{periods.length > 0 ? ` ${formatPeriods(periods)}` : ""}
                                </span>
                              );
                            })()}
                          </div>
                          {isMember && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openFamilyEdit(row.key); }}
                              className="shrink-0 text-blue-400 hover:text-blue-600 p-1 rounded hover:bg-blue-100 transition"
                              title="가족 숙소/차량 요청 수정"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }

                if (row.type === "solo-header") {
                  const m = row.data;
                  return (
                    <tr key={`solo-header-${m.id}`} className="bg-blue-50 border-t border-b border-blue-100">
                      <td colSpan={colSpan} className="px-4 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="text-xs font-bold text-blue-600 shrink-0">👤 {m.name}</span>
                            {m.accommodation_needed && (() => {
                              const periods = getFamilyAccomPeriods(m.id, missionaries);
                              return (
                                <span className="text-xs bg-white text-blue-600 px-1.5 py-0.5 rounded border border-blue-200 shrink-0">
                                  🏠{periods.length > 0 ? ` ${formatPeriods(periods)}` : ""}
                                </span>
                              );
                            })()}
                            {m.vehicle_needed && (() => {
                              const periods = getFamilyVehiclePeriods(m.id, missionaries);
                              return (
                                <span className="text-xs bg-white text-green-600 px-1.5 py-0.5 rounded border border-green-200 shrink-0">
                                  🚗{periods.length > 0 ? ` ${formatPeriods(periods)}` : ""}
                                </span>
                              );
                            })()}
                          </div>
                          {isMember && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openEdit(m); }}
                              className="shrink-0 text-blue-400 hover:text-blue-600 p-1 rounded hover:bg-blue-100 transition"
                              title="숙소/차량 요청 수정"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }

                const m = row.data;
                return (
                  <tr key={m.id}
                    className={`hover:bg-gray-50 border-t border-gray-100 ${row.inGroup ? "bg-white" : ""} cursor-pointer`}
                    onClick={() => openDetail(m)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{m.name}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 hidden sm:table-cell text-sm">{m.affiliation || "-"}</td>
                    <td className="px-4 py-3 text-gray-700 hidden md:table-cell">
                      <div className="text-sm">{m.country || "-"}</div>
                      {m.departure_location && <div className="text-gray-500 text-xs mt-0.5">{m.departure_location}</div>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {m.arrival_date ? (
                        <div className="text-sm text-gray-800">
                          <span className="font-medium">{m.arrival_date}</span>
                          {m.arrival_time && <span className="text-gray-500 ml-1">{m.arrival_time}</span>}
                          {m.arrival_terminal && <span className="text-gray-500 ml-1">· {m.arrival_terminal}</span>}
                          {m.arrival_flight && <span className="text-blue-600 ml-1 font-medium">{m.arrival_flight}</span>}
                        </div>
                      ) : <span className="text-gray-400 text-sm">-</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {m.departure_date ? (
                        <div className="text-sm text-gray-800">
                          <span className="font-medium">{m.departure_date}</span>
                          {m.departure_time && <span className="text-gray-500 ml-1">{m.departure_time}</span>}
                          {m.departure_terminal && <span className="text-gray-500 ml-1">· {m.departure_terminal}</span>}
                          {m.departure_flight && <span className="text-blue-600 ml-1 font-medium">{m.departure_flight}</span>}
                        </div>
                      ) : <span className="text-gray-400 text-sm">-</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {m.accommodation_needed ? (
                        isAccomMatched(m)
                          ? <span className="text-green-500 font-bold" title="배정완료">✓</span>
                          : <span className="text-orange-400 font-bold" title="미배정">!</span>
                      ) : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex justify-center gap-1">
                        {m.vehicle_needed ? (
                          isVehicleMatched(m)
                            ? <span className="text-green-500 font-bold" title="차량 배정완료">✓</span>
                            : <span className="text-orange-400 font-bold" title="차량 미배정">!</span>
                        ) : null}
                        {m.ride_needed && <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-semibold">라이드</span>}
                        {!m.vehicle_needed && !m.ride_needed && <span className="text-gray-300">-</span>}
                      </div>
                    </td>
                    {isMember && (
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setWelcomePack({ familyGroup: m.family_group, repId: m.id })}
                            className="text-gray-400 hover:text-emerald-600 p-1 rounded hover:bg-emerald-50 transition" title="환영팩 인쇄"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => copyShareLink(m)}
                            className="text-gray-400 hover:text-indigo-600 p-1 rounded hover:bg-indigo-50 transition" title="공유 링크 복사"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                          </button>
                          <button onClick={() => openEdit(m)} className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition" title="수정">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          {isAdmin && (
                            <button onClick={() => handleDelete(m.id)} className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition" title="삭제">
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
      )}

      {/* ── 가족 숙소/차량 요청 수정 모달 ── */}
      <Modal
        isOpen={showFamilyModal}
        onClose={() => setShowFamilyModal(false)}
        title={`👨‍👩‍👧 ${familyGroup} — 숙소/차량 요청 수정`}
        className="sm:max-w-[480px]"
        footer={
          <>
            <button onClick={() => setShowFamilyModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
            <button onClick={handleFamilySave} disabled={savingFamily} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {savingFamily ? "저장 중..." : "저장"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">가족 전체 인원에게 동일하게 적용됩니다.</p>
          {/* 숙소 */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={familyForm.accommodation_needed}
                onChange={(e) => setFamilyForm({ ...familyForm, accommodation_needed: e.target.checked })}
                className="w-4 h-4 rounded" />
              <span className="text-sm font-medium text-gray-700">🏠 숙소 필요</span>
            </label>
            {familyForm.accommodation_needed && (
              <PeriodListEditor
                periods={familyForm.accommodation_periods}
                onChange={(periods) => setFamilyForm({ ...familyForm, accommodation_periods: periods })}
              />
            )}
          </div>
          {/* 차량 */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={familyForm.vehicle_needed}
                onChange={(e) => setFamilyForm({ ...familyForm, vehicle_needed: e.target.checked })}
                className="w-4 h-4 rounded" />
              <span className="text-sm font-medium text-gray-700">🚗 차량 필요</span>
            </label>
            {familyForm.vehicle_needed && (
              <PeriodListEditor
                periods={familyForm.vehicle_periods}
                onChange={(periods) => setFamilyForm({ ...familyForm, vehicle_periods: periods })}
              />
            )}
          </div>
        </div>
      </Modal>

      {/* ── 상세 보기 모달 ── */}
      {detailM && (
        <Modal
          isOpen={showDetail}
          onClose={() => setShowDetail(false)}
          title={`${detailM.family_group?.trim() ? `👨‍👩‍👧 ${detailM.family_group} 가족` : detailM.name} 상세 정보`}
          className="sm:max-w-[600px]"
          footer={
            isMember ? (
              <button onClick={() => openEdit(detailM)} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">
                수정하기
              </button>
            ) : null
          }
        >
          {(() => {
            const familyIdSet = new Set(
              detailM.family_group?.trim()
                ? missionaries.filter(x => x.family_group?.trim() === detailM.family_group!.trim()).map(x => x.id)
                : [detailM.id],
            );
            const getAssignedPeriods = (items: DetailAccom[] | DetailVehicle[]) =>
              items.flatMap(item => {
                const asgns = item.assignments?.length
                  ? item.assignments
                  : item.assigned_missionary_id
                    ? [{ missionary_id: item.assigned_missionary_id, from: item.available_from || "", to: item.available_to || "" }]
                    : [];
                return asgns.filter(a => familyIdSet.has(a.missionary_id)).map(a => ({ from: a.from, to: a.to }));
              });

            return (
              <div className="space-y-4">
                {/* ── 기본 정보 ── */}
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <th className="w-28 px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">이름</th>
                      <td className="px-4 py-3 text-gray-900 font-semibold">
                        {detailM.name}
                        {detailM.family_group && <span className="ml-2 text-xs text-blue-500 font-normal">👨‍👩‍👧 {detailM.family_group}</span>}
                      </td>
                    </tr>
                    {detailM.affiliation && (
                      <tr>
                        <th className="px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left">소속</th>
                        <td className="px-4 py-3 text-gray-900 font-semibold">{detailM.affiliation}</td>
                      </tr>
                    )}
                    {detailM.country && (
                      <tr>
                        <th className="px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">국가 / 출발지</th>
                        <td className="px-4 py-3 text-gray-900 font-semibold">{detailM.country}{detailM.departure_location ? ` / ${detailM.departure_location}` : ""}</td>
                      </tr>
                    )}
                    {detailM.phone && (
                      <tr>
                        <th className="px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left">연락처</th>
                        <td className="px-4 py-3 text-gray-700 text-xs whitespace-pre-wrap">{detailM.phone}</td>
                      </tr>
                    )}
                    <tr>
                      <th className="px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">한국 입국</th>
                      <td className="px-4 py-3 text-gray-900 font-semibold">
                        {detailM.arrival_date ? (
                          <>
                            {detailM.arrival_date}
                            {detailM.arrival_time && <span className="text-gray-500 font-normal ml-1">{detailM.arrival_time}</span>}
                            {detailM.arrival_terminal && <span className="text-gray-500 font-normal ml-1">· {detailM.arrival_terminal}</span>}
                            {detailM.arrival_flight && <span className="text-blue-600 ml-1">{detailM.arrival_flight}</span>}
                          </>
                        ) : <span className="text-gray-400 font-normal">미입력</span>}
                      </td>
                    </tr>
                    <tr>
                      <th className="px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">한국 출국</th>
                      <td className="px-4 py-3 text-gray-900 font-semibold">
                        {detailM.departure_date ? (
                          <>
                            {detailM.departure_date}
                            {detailM.departure_time && <span className="text-gray-500 font-normal ml-1">{detailM.departure_time}</span>}
                            {detailM.departure_terminal && <span className="text-gray-500 font-normal ml-1">· {detailM.departure_terminal}</span>}
                            {detailM.departure_flight && <span className="text-blue-600 ml-1">{detailM.departure_flight}</span>}
                          </>
                        ) : <span className="text-gray-400 font-normal">미입력</span>}
                      </td>
                    </tr>
                    {(detailM.accommodation_needed || detailM.vehicle_needed || detailM.ride_needed || detailM.dietary_notes) && (
                      <tr>
                        <th className="px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left">필요사항</th>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 flex-wrap">
                            {detailM.accommodation_needed && (() => {
                              const periods = getFamilyAccomPeriods(detailM.id, missionaries);
                              return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">🏠 숙소{periods.length > 0 ? ` · ${formatPeriods(periods, false)}` : ""}</span>;
                            })()}
                            {detailM.vehicle_needed && (() => {
                              const periods = getFamilyVehiclePeriods(detailM.id, missionaries);
                              return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">🚗 차량{periods.length > 0 ? ` · ${formatPeriods(periods, false)}` : ""}</span>;
                            })()}
                            {detailM.ride_needed && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">✈️ 공항 라이드</span>}
                            {detailM.dietary_notes && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">🍽️ {detailM.dietary_notes}</span>}
                          </div>
                        </td>
                      </tr>
                    )}
                    {detailM.notes && (
                      <tr>
                        <th className="px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left align-top">메모</th>
                        <td className="px-4 py-3 text-gray-700 whitespace-pre-wrap">{detailM.notes}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* ── 숙소 배정 ── */}
                {detailM.accommodation_needed && (
                  <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                    <tbody>
                      <tr>
                        <th className="w-28 px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left align-top whitespace-nowrap">🏠 숙소 배정</th>
                        <td className="px-4 py-3">
                          {detailLoading ? (
                            <span className="text-gray-400 text-sm">불러오는 중...</span>
                          ) : detailAccoms.length > 0 ? (() => {
                            const requestedPeriods = getFamilyAccomPeriods(detailM.id, missionaries);
                            const allPeriods = getAssignedPeriods(detailAccoms);
                            const combinedCov = checkMultiPeriodCoverage(allPeriods, requestedPeriods);
                            return (
                              <div className="space-y-2">
                                <div className={`flex items-center gap-2 flex-wrap text-sm font-semibold rounded-lg px-3 py-2 border ${combinedCov === "full" ? "bg-green-50 border-green-200 text-green-700" : "bg-orange-50 border-orange-200 text-orange-600"}`}>
                                  <span>{COVER_ICON[combinedCov]}</span>
                                  <span>{combinedCov === "full" ? "기간 완전 커버됨" : combinedCov === "partial" ? "기간 일부 미충족" : "기간 미겹침"}</span>
                                  {detailAccoms.length > 1 && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">분산 {detailAccoms.length}개</span>}
                                  {requestedPeriods.length > 0 && <span className="text-xs text-gray-500 ml-auto">요청: {formatPeriods(requestedPeriods, false)}</span>}
                                </div>
                                {detailAccoms.map((accom) => {
                                  const myA = (accom.assignments?.length ? accom.assignments : (accom.assigned_missionary_id ? [{ missionary_id: accom.assigned_missionary_id, from: accom.available_from || "", to: accom.available_to || "" }] : [])).filter(a => familyIdSet.has(a.missionary_id));
                                  return (
                                    <div key={accom.id} className="rounded-lg p-3 border border-gray-200 bg-white">
                                      <p className="text-sm font-semibold text-gray-800">{accom.provider_name}</p>
                                      {accom.address && <p className="text-xs text-gray-600 mt-0.5">{accom.address}</p>}
                                      {accom.provider_contact && <p className="text-xs text-gray-500">{accom.provider_contact}</p>}
                                      {myA.map((as, i) => as.from && (
                                        <p key={i} className="text-xs text-blue-600 mt-1 font-medium">배정: {as.from} ~ {as.to || "미정"}</p>
                                      ))}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })() : <span className="text-orange-500 font-medium">미배정</span>}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}

                {/* ── 차량 배정 ── */}
                {detailM.vehicle_needed && (
                  <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                    <tbody>
                      <tr>
                        <th className="w-28 px-4 py-3 bg-gray-50 text-gray-500 font-medium text-left align-top whitespace-nowrap">🚗 차량 배정</th>
                        <td className="px-4 py-3">
                          {detailLoading ? (
                            <span className="text-gray-400 text-sm">불러오는 중...</span>
                          ) : detailVehicles.length > 0 ? (() => {
                            const requestedPeriods = getFamilyVehiclePeriods(detailM.id, missionaries);
                            const allPeriods = getAssignedPeriods(detailVehicles);
                            const combinedCov = checkMultiPeriodCoverage(allPeriods, requestedPeriods);
                            return (
                              <div className="space-y-2">
                                {detailVehicles.length > 1 && (
                                  <div className={`flex items-center gap-2 flex-wrap text-sm font-semibold rounded-lg px-3 py-2 border ${combinedCov === "full" ? "bg-green-50 border-green-200 text-green-700" : "bg-orange-50 border-orange-200 text-orange-600"}`}>
                                    <span>{COVER_ICON[combinedCov]}</span>
                                    <span>{combinedCov === "full" ? "기간 완전 커버됨" : "기간 일부 미충족"}</span>
                                    <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">분산 {detailVehicles.length}대</span>
                                    {requestedPeriods.length > 0 && <span className="text-xs text-gray-500 ml-auto">요청: {formatPeriods(requestedPeriods, false)}</span>}
                                  </div>
                                )}
                                {detailVehicles.map((v) => {
                                  const myA = (v.assignments?.length ? v.assignments : (v.assigned_missionary_id ? [{ missionary_id: v.assigned_missionary_id, from: v.available_from || "", to: v.available_to || "" }] : [])).filter(a => familyIdSet.has(a.missionary_id));
                                  const vCov = checkMultiPeriodCoverage(myA.map(a => ({ from: a.from, to: a.to })), requestedPeriods);
                                  return (
                                    <div key={v.id} className={`rounded-lg p-3 border ${vCov === "full" ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"}`}>
                                      <div className={`flex items-center gap-2 text-sm font-semibold ${vCov === "full" ? "text-green-700" : "text-orange-600"}`}>
                                        <span>{COVER_ICON[vCov]}</span>
                                        <span>{v.provider_name}</span>
                                      </div>
                                      {v.car_model && <p className="text-xs text-gray-600 mt-1">{v.car_model}{v.car_number ? ` (${v.car_number})` : ""}</p>}
                                      {v.provider_contact && <p className="text-xs text-gray-500 mt-0.5">{v.provider_contact}</p>}
                                      {myA.map((as, i) => as.from && (
                                        <p key={i} className="text-xs text-blue-600 mt-1 font-medium">배정: {as.from} ~ {as.to || "미정"}</p>
                                      ))}
                                      {detailVehicles.length === 1 && requestedPeriods.length > 0 && (
                                        <p className="text-xs text-gray-500 mt-0.5">요청: {formatPeriods(requestedPeriods, false)}</p>
                                      )}
                                      <p className={`text-xs mt-1 ${v.insurance_added ? "text-blue-600" : "text-orange-500"}`}>
                                        {v.insurance_added ? "🛡️ 보험 추가 완료" : "⚠️ 보험 미완료"}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })() : <span className="text-orange-500 font-medium">미배정</span>}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            );
          })()}
        </Modal>
      )}

      {/* 등록/편집 모달 */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={selected ? "명단 정보 수정" : "명단 등록"}
        className="sm:max-w-[720px]"
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "저장 중..." : "저장"}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          {/* 기본 정보 */}
          <section>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">기본 정보</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="이름 *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label="소속" value={form.affiliation || ""} onChange={(v) => setForm({ ...form, affiliation: v })} placeholder="예: 수원하나" />
              <Field label="국가" value={form.country || ""} onChange={(v) => setForm({ ...form, country: v })} placeholder="예: 이스라엘" />
              <Field label="출발지" value={form.departure_location || ""} onChange={(v) => setForm({ ...form, departure_location: v })} placeholder="예: 텔아비브 공항" />
              <div className="sm:col-span-2">
                <Field label="가족 그룹" value={form.family_group || ""} onChange={(v) => setForm({ ...form, family_group: v })} placeholder="예: 김영두 가족  (같은 가족은 동일하게 입력)" />
              </div>
            </div>
          </section>

          {/* 한국 입국 */}
          <section>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">한국 입국 (IN)</p>
            <div className="grid sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <Field label="날짜" value={form.arrival_date || ""} onChange={(v) => setForm({ ...form, arrival_date: v })} type="date" />
              </div>
              <Field label="도착 시간" value={form.arrival_time || ""} onChange={(v) => setForm({ ...form, arrival_time: v })} placeholder="17:00" />
              <Field label="터미널" value={form.arrival_terminal || ""} onChange={(v) => setForm({ ...form, arrival_terminal: v })} placeholder="T1" />
              <div className="sm:col-span-4">
                <Field label="항공편" value={form.arrival_flight || ""} onChange={(v) => setForm({ ...form, arrival_flight: v })} placeholder="예: EK322" />
              </div>
            </div>
          </section>

          {/* 한국 출국 */}
          <section>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">한국 출국 (OUT)</p>
            <div className="grid sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <Field label="날짜" value={form.departure_date || ""} onChange={(v) => setForm({ ...form, departure_date: v })} type="date" />
              </div>
              <Field label="출발 시간" value={form.departure_time || ""} onChange={(v) => setForm({ ...form, departure_time: v })} placeholder="23:55" />
              <Field label="터미널" value={form.departure_terminal || ""} onChange={(v) => setForm({ ...form, departure_terminal: v })} placeholder="T1" />
              <div className="sm:col-span-4">
                <Field label="항공편" value={form.departure_flight || ""} onChange={(v) => setForm({ ...form, departure_flight: v })} placeholder="예: EK323" />
              </div>
            </div>
          </section>

          {/* 필요사항 */}
          <section>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">필요사항</p>
            <div className="space-y-3 mb-3">
              {/* 숙소 필요 */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.accommodation_needed} onChange={(e) => setForm({ ...form, accommodation_needed: e.target.checked })} className="w-4 h-4 rounded" />
                  <span className="text-sm font-medium text-gray-700">숙소 필요</span>
                </label>
                {form.accommodation_needed && (
                  <PeriodListEditor
                    periods={form.accommodation_periods ?? []}
                    onChange={(periods) => setForm({ ...form, accommodation_periods: periods })}
                  />
                )}
              </div>
              {/* 차량 필요 */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.vehicle_needed} onChange={(e) => setForm({ ...form, vehicle_needed: e.target.checked })} className="w-4 h-4 rounded" />
                  <span className="text-sm font-medium text-gray-700">차량 필요</span>
                </label>
                {form.vehicle_needed && (
                  <PeriodListEditor
                    periods={form.vehicle_periods ?? []}
                    onChange={(periods) => setForm({ ...form, vehicle_periods: periods })}
                  />
                )}
              </div>
              {/* 공항 라이드 */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.ride_needed} onChange={(e) => setForm({ ...form, ride_needed: e.target.checked })} className="w-4 h-4 rounded" />
                <span className="text-sm font-medium text-gray-700">공항 라이드 필요</span>
              </label>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="식이 제한" value={form.dietary_notes || ""} onChange={(v) => setForm({ ...form, dietary_notes: v })} placeholder="알레르기, 채식 등" />
            </div>
          </section>

          {/* 연락처 & 메모 */}
          <section>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">연락처 / 메모</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">연락처</label>
                <textarea
                  value={form.phone || ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  rows={3}
                  placeholder={"전화: 010-1234-5678\n이메일: hong@example.com\n카카오: 홍길동"}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">메모</label>
                <textarea
                  value={form.notes || ""}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
          </section>
        </div>
      </Modal>

      {/* 환영팩 인쇄 모달 */}
      {welcomePack && (
        <WelcomePackModal
          isOpen={!!welcomePack}
          onClose={() => setWelcomePack(null)}
          projectId={projectId}
          projectName={projectName}
          familyGroup={welcomePack.familyGroup}
          representativeMissionaryId={welcomePack.repId}
        />
      )}

      {/* 변경 이력 모달 */}
      {showAuditLog && (
        <AuditLogModal
          isOpen={showAuditLog}
          onClose={() => setShowAuditLog(false)}
          projectId={projectId}
          title="명단 변경 이력"
          entityType="missionary"
        />
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

// 다중 기간 입력 컴포넌트 (숙소/차량 기간 추가/삭제)
function PeriodListEditor({ periods, onChange }: {
  periods: DatePeriod[];
  onChange: (periods: DatePeriod[]) => void;
}) {
  const add = () => onChange([...periods, { from: "", to: "" }]);
  const remove = (i: number) => onChange(periods.filter((_, idx) => idx !== i));
  const update = (i: number, key: "from" | "to", val: string) =>
    onChange(periods.map((p, idx) => idx === i ? { ...p, [key]: val } : p));

  return (
    <div className="mt-2 ml-6 space-y-2">
      {periods.map((p, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1 grid grid-cols-2 gap-2">
            <Field
              label={periods.length > 1 ? `기간 ${i + 1} 시작` : "시작일"}
              value={p.from}
              onChange={(v) => update(i, "from", v)}
              type="date"
            />
            <Field
              label="종료일"
              value={p.to}
              onChange={(v) => update(i, "to", v)}
              type="date"
            />
          </div>
          {periods.length > 1 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="mb-1 flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-red-400 hover:text-red-600 hover:bg-red-50 transition"
              title="이 기간 삭제"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium py-0.5 hover:underline"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        기간 추가
      </button>
    </div>
  );
}
