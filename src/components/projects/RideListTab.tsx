"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "@/styles/calendar.css";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

/* ── Types ─────────────────────────────────────────────────────────── */

type Props = {
  projectId: string;
  myUserId:  string;
  isMember:  boolean;
  isAdmin:   boolean;
};

type Ride = {
  id:                  string;
  ride_number:         string | null;
  status:              string;
  is_important:        boolean;
  event_date:          string;
  event_name:          string | null;
  responsible_org:     string | null;
  coordinator_name:    string | null;
  coordinator_contact: string | null;
  rider_name:          string | null;
  direction:           string;
  departure_location:  string | null;
  departure_time:      string | null;
  arrival_location:    string | null;
  arrival_time:        string | null;
  estimated_duration:  string | null;
  arrival_contact:     string | null;
  message_time:        string | null;
  message_title:       string | null;
  message_body:        string | null;
  notes:               string | null;
};

type RideForm = Omit<Ride, "id">;

/* ── Constants ──────────────────────────────────────────────────────── */

const EMPTY_FORM: RideForm = {
  ride_number: "",
  status: "pending",
  is_important: false,
  event_date: "",
  event_name: "",
  responsible_org: "",
  coordinator_name: "",
  coordinator_contact: "",
  rider_name: "",
  direction: "왕복",
  departure_location: "",
  departure_time: "",
  arrival_location: "",
  arrival_time: "",
  estimated_duration: "",
  arrival_contact: "",
  message_time: "",
  message_title: "",
  message_body: "",
  notes: "",
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:   { label: "미정", cls: "bg-gray-100 text-gray-600" },
  confirmed: { label: "확정", cls: "bg-blue-100 text-blue-700" },
  completed: { label: "완료", cls: "bg-green-100 text-green-700" },
};

const DIRECTIONS = ["왕복", "편도"];

const DIRECTION_MAP: Record<string, { cls: string }> = {
  왕복: { cls: "bg-purple-100 text-purple-700" },
  편도: { cls: "bg-green-100 text-green-700" },
};

/* Excel 컬럼 정의 (import/export) */
const EXCEL_COLS = [
  { header: "번호",                   field: "ride_number" },
  { header: "상태(미정/확정/완료)",   field: "status" },
  { header: "중요(Y/N)",              field: "is_important" },
  { header: "날짜(YYYY-MM-DD)*",      field: "event_date" },
  { header: "집회명",                 field: "event_name" },
  { header: "담당단체",               field: "responsible_org" },
  { header: "담당자",                 field: "coordinator_name" },
  { header: "담당자연락처",           field: "coordinator_contact" },
  { header: "라이더(운전담당)",       field: "rider_name" },
  { header: "방향(왕복/편도)",         field: "direction" },
  { header: "출발장소",               field: "departure_location" },
  { header: "출발시간(HH:MM)",        field: "departure_time" },
  { header: "도착장소",               field: "arrival_location" },
  { header: "도착시간(HH:MM)",        field: "arrival_time" },
  { header: "예상소요시간",           field: "estimated_duration" },
  { header: "도착지연락처",           field: "arrival_contact" },
  { header: "메시지시간",             field: "message_time" },
  { header: "메시지제목",             field: "message_title" },
  { header: "메시지본문",             field: "message_body" },
  { header: "특이사항",               field: "notes" },
];

/* ── Component ──────────────────────────────────────────────────────── */

export default function RideListTab({ projectId, isMember, isAdmin }: Props) {
  const supabase = createClient();

  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);

  // 필터
  const [filterStatus, setFilterStatus]   = useState<string>("all");
  const [filterMonths, setFilterMonths]   = useState<string[]>(() => {
    const now = new Date();
    return Array.from({ length: 4 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
  });
  const [filterRider, setFilterRider]     = useState<string>("");

  // 모달
  const [showModal, setShowModal]   = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState<RideForm>(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);

  // 정렬
  const [sortDesc, setSortDesc] = useState(false);

  // 운전자 현황 접기/펼치기
  const [statsOpen, setStatsOpen] = useState(false);

  // 상세 보기
  const [viewRide, setViewRide] = useState<Ride | null>(null);

  // 달력/목록 뷰
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const currentYear = new Date().getFullYear().toString();

  // 행 펼치기
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // 운전자 풀 (project_drivers + profiles)
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [showDriversModal, setShowDriversModal] = useState(false);

  // Excel import
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  /* ── Data Fetch ─────────────────────────────────────────────────── */

  const fetchRides = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pastor_rides")
      .select("*")
      .eq("project_id", projectId)
      .order("event_date", { ascending: true });
    if (error) { toast.error("데이터를 불러오지 못했습니다."); }
    else { setRides(data ?? []); }
    setLoading(false);
  }, [projectId]);

  const fetchDrivers = useCallback(async () => {
    const { data } = await supabase
      .from("project_drivers")
      .select("id, user_id, custom_name, profiles(full_name)")
      .eq("project_id", projectId);
    if (data) {
      setDrivers(
        data.flatMap((d) => {
          if (d.custom_name) return [{ id: d.id, name: d.custom_name }];
          const p = d.profiles as { full_name?: string } | null;
          const name = p?.full_name ?? "";
          return name ? [{ id: d.user_id ?? d.id, name }] : [];
        })
      );
    }
  }, [projectId]);

  useEffect(() => { fetchRides(); fetchDrivers(); }, [fetchRides, fetchDrivers]);

  /* ── Derived Values ─────────────────────────────────────────────── */

  const filtered = rides.filter((r) => {
    if (filterStatus === "ongoing" && r.status === "completed") return false;
    if (filterStatus !== "all" && filterStatus !== "ongoing" && r.status !== filterStatus) return false;
    if (filterMonths.length > 0 && !filterMonths.some((m) => r.event_date.startsWith(m))) return false;
    if (filterRider && !r.rider_name?.includes(filterRider)) return false;
    return true;
  });

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => {
      const cmp = a.event_date.localeCompare(b.event_date);
      return sortDesc ? -cmp : cmp;
    }),
    [filtered, sortDesc]
  );

  /* ── CRUD ───────────────────────────────────────────────────────── */

  const openAdd = async () => {
    setEditId(null);
    const yearPrefix = String(new Date().getFullYear()).slice(2);
    const { data } = await supabase
      .from("pastor_rides")
      .select("ride_number")
      .eq("project_id", projectId)
      .like("ride_number", `${yearPrefix}-%`)
      .order("ride_number", { ascending: false })
      .limit(1);
    let nextNum = `${yearPrefix}-001`;
    if (data?.[0]?.ride_number) {
      const n = parseInt(data[0].ride_number.split("-")[1] ?? "0") + 1;
      nextNum = `${yearPrefix}-${String(n).padStart(3, "0")}`;
    }
    setForm({ ...EMPTY_FORM, ride_number: nextNum });
    setShowModal(true);
  };

  const openEdit = (ride: Ride) => {
    setEditId(ride.id);
    setForm({
      ride_number:         ride.ride_number ?? "",
      status:              ride.status,
      is_important:        ride.is_important,
      event_date:          ride.event_date,
      event_name:          ride.event_name ?? "",
      responsible_org:     ride.responsible_org ?? "",
      coordinator_name:    ride.coordinator_name ?? "",
      coordinator_contact: ride.coordinator_contact ?? "",
      rider_name:          ride.rider_name ?? "",
      direction:           ride.direction,
      departure_location:  ride.departure_location ?? "",
      departure_time:      ride.departure_time ?? "",
      arrival_location:    ride.arrival_location ?? "",
      arrival_time:        ride.arrival_time ?? "",
      estimated_duration:  ride.estimated_duration ?? "",
      arrival_contact:     ride.arrival_contact ?? "",
      message_time:        ride.message_time ?? "",
      message_title:       ride.message_title ?? "",
      message_body:        ride.message_body ?? "",
      notes:               ride.notes ?? "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.event_date) { toast.error("날짜를 입력하세요."); return; }
    setSaving(true);

    const payload = {
      ...form,
      project_id: projectId,
      departure_time: form.departure_time || null,
      arrival_time:   form.arrival_time || null,
      ride_number:    form.ride_number || null,
      event_name:     form.event_name || null,
      responsible_org:     form.responsible_org || null,
      coordinator_name:    form.coordinator_name || null,
      coordinator_contact: form.coordinator_contact || null,
      rider_name:          form.rider_name || null,
      departure_location:  form.departure_location || null,
      arrival_location:    form.arrival_location || null,
      estimated_duration:  form.estimated_duration || null,
      arrival_contact:     form.arrival_contact || null,
      message_time:        form.message_time || null,
      message_title:       form.message_title || null,
      message_body:        form.message_body || null,
      notes:               form.notes || null,
    };

    if (editId) {
      const { error } = await supabase
        .from("pastor_rides")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", editId);
      if (error) { toast.error("수정 실패: " + error.message); }
      else { toast.success("수정되었습니다."); setShowModal(false); fetchRides(); }
    } else {
      const { error } = await supabase.from("pastor_rides").insert(payload);
      if (error) { toast.error("추가 실패: " + error.message); }
      else { toast.success("추가되었습니다."); setShowModal(false); fetchRides(); }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 일정을 삭제할까요?")) return;
    const { error } = await supabase.from("pastor_rides").delete().eq("id", id);
    if (error) toast.error("삭제 실패");
    else { toast.success("삭제되었습니다."); fetchRides(); }
  };

  const handleStatusCycle = async (ride: Ride) => {
    if (!isMember) return;
    const next: Record<string, string> = { pending: "confirmed", confirmed: "completed", completed: "pending" };
    const { error } = await supabase
      .from("pastor_rides")
      .update({ status: next[ride.status], updated_at: new Date().toISOString() })
      .eq("id", ride.id);
    if (error) toast.error("상태 변경 실패");
    else fetchRides();
  };

  /* ── Excel Export ───────────────────────────────────────────────── */

  const handleExportExcel = () => {
    const rows = filtered.map((r) => ({
      번호:                  r.ride_number ?? "",
      "상태(미정/확정/완료)": r.status === "pending" ? "미정" : r.status === "confirmed" ? "확정" : "완료",
      "중요(Y/N)":           r.is_important ? "Y" : "N",
      "날짜(YYYY-MM-DD)*":   r.event_date,
      집회명:                r.event_name ?? "",
      담당단체:              r.responsible_org ?? "",
      담당자:                r.coordinator_name ?? "",
      담당자연락처:          r.coordinator_contact ?? "",
      "라이더(운전담당)":    r.rider_name ?? "",
      "방향(왕복/편도)": r.direction,
      출발장소:              r.departure_location ?? "",
      "출발시간(HH:MM)":     r.departure_time ?? "",
      도착장소:              r.arrival_location ?? "",
      "도착시간(HH:MM)":     r.arrival_time ?? "",
      예상소요시간:          r.estimated_duration ?? "",
      도착지연락처:          r.arrival_contact ?? "",
      메시지시간:            r.message_time ?? "",
      메시지제목:            r.message_title ?? "",
      메시지본문:            r.message_body ?? "",
      특이사항:              r.notes ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "라이드일정");
    XLSX.writeFile(wb, `라이드일정_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const headers = EXCEL_COLS.map((c) => c.header);
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "라이드일정");
    XLSX.writeFile(wb, "라이드일정_양식.xlsx");
  };

  /* ── Excel Import ───────────────────────────────────────────────── */

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);

    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: "array", cellDates: true });
      const ws  = wb.Sheets[wb.SheetNames[0]];

      // 헤더 행 확인으로 형식 감지
      const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      if (allRows.length < 2) { toast.error("가져올 데이터가 없습니다."); setImporting(false); return; }

      const headerRow = allRows[0] as unknown[];
      // 실제 엑셀 형식: 2열이 "No", 3열이 "완료여부"
      const isNativeFormat = String(headerRow[1] ?? "").trim() === "No" && String(headerRow[2] ?? "").includes("완료");

      const records: Omit<Ride, "id">[] = [];
      const errors: string[] = [];

      if (isNativeFormat) {
        // ── 실제 엑셀 형식 파싱 ──────────────────────────────────────
        const extractTime = (raw: string): string | null => {
          const m = raw.match(/^(\d{1,2}:\d{2})/);
          return m ? m[1].padStart(5, "0") : null;
        };

        allRows.slice(1).forEach((rawRow, idx) => {
          const row = rawRow as unknown[];
          const line = idx + 2;

          // 날짜 없는 빈 행 스킵
          const dateRaw = row[3];
          if (dateRaw == null || dateRaw === "") return;

          const date = parseExcelDate(dateRaw);
          if (!date) {
            errors.push(`${line}행: 날짜 파싱 실패 — "${String(dateRaw)}"`);
            return;
          }

          const s = (col: number) => {
            const v = row[col];
            if (v == null || v instanceof Date) return "";
            return String(v).trim();
          };

          // 담당자 + 연락처: "이다민 간사\n(010-3723-2325)"
          const coordRaw = s(6);
          let coordName: string | null = null;
          let coordContact: string | null = null;
          if (coordRaw && coordRaw !== "-") {
            const parts = coordRaw.split("\n");
            coordName = parts[0].trim() || null;
            if (parts[1]) {
              const m = parts[1].match(/\(([^)]+)\)/);
              coordContact = m ? m[1].trim() : parts[1].trim();
            }
          }

          // 라이더: 여러 명이면 개행 구분 → 쉼표로
          const riderRaw = s(7);
          const riderName = riderRaw && riderRaw !== "-"
            ? riderRaw.split("\n").map((r) => r.trim()).filter(Boolean).join(", ")
            : null;

          // 방향
          const dirRaw = s(8);
          const direction = (["왕복", "편도"] as string[]).includes(dirRaw) ? dirRaw : "왕복";

          // 출발시간 (첫 줄에서 시간 추출)
          const departureTime = extractTime(s(10));

          // 도착시간 + 예상소요시간: "17:13\n(1시간 43분)"
          const arrRaw = s(12);
          const arrivalTime = extractTime(arrRaw);
          const durMatch = arrRaw.match(/\(([^)]+)\)/);
          const estimatedDuration = durMatch && /시간|분/.test(durMatch[1]) ? durMatch[1].trim() : null;

          const nullIfDash = (v: string) => (v && v !== "-" ? v : null);

          records.push({
            ride_number:         s(1) || null,
            status:              s(2) === "완료" ? "completed" : "pending",
            is_important:        false,
            event_date:          date,
            event_name:          nullIfDash(s(4)),
            responsible_org:     nullIfDash(s(5)),
            coordinator_name:    coordName,
            coordinator_contact: coordContact,
            rider_name:          riderName,
            direction,
            departure_location:  nullIfDash(s(9)),
            departure_time:      departureTime,
            arrival_location:    nullIfDash(s(11)),
            arrival_time:        arrivalTime,
            estimated_duration:  estimatedDuration,
            arrival_contact:     nullIfDash(s(13)),
            message_time:        nullIfDash(s(14)),
            message_title:       null,
            message_body:        nullIfDash(s(15)),
            notes:               nullIfDash(s(16)),
          });
        });
      } else {
        // ── 표준 양식 형식 파싱 ──────────────────────────────────────
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

        const parseTime = (val: string) => {
          const v = val.trim();
          return v && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, "0") : null;
        };

        rows.forEach((row, idx) => {
          const line = idx + 2;
          const date = parseExcelDate(row["날짜(YYYY-MM-DD)*"]);
          if (!date) {
            errors.push(`${line}행: 날짜 형식 오류 — YYYY-MM-DD, YY.MM.DD, 또는 엑셀 날짜 셀 사용`);
            return;
          }
          const str = (key: string) => String(row[key] ?? "").trim();
          const statusMap: Record<string, string> = { 미정: "pending", 확정: "confirmed", 완료: "completed" };
          records.push({
            ride_number:         str("번호") || null,
            status:              statusMap[str("상태(미정/확정/완료)")] ?? "pending",
            is_important:        str("중요(Y/N)").toUpperCase() === "Y",
            event_date:          date,
            event_name:          str("집회명") || null,
            responsible_org:     str("담당단체") || null,
            coordinator_name:    str("담당자") || null,
            coordinator_contact: str("담당자연락처") || null,
            rider_name:          str("라이더(운전담당)") || null,
            direction:           str("방향(왕복/편도/귀도)") || "왕복",
            departure_location:  str("출발장소") || null,
            departure_time:      parseTime(str("출발시간(HH:MM)")),
            arrival_location:    str("도착장소") || null,
            arrival_time:        parseTime(str("도착시간(HH:MM)")),
            estimated_duration:  str("예상소요시간") || null,
            arrival_contact:     str("도착지연락처") || null,
            message_time:        str("메시지시간") || null,
            message_title:       str("메시지제목") || null,
            message_body:        str("메시지본문") || null,
            notes:               str("특이사항") || null,
          });
        });
      }

      if (errors.length > 0) {
        toast.error(`오류 ${errors.length}건:\n${errors.slice(0, 3).join("\n")}`);
        setImporting(false);
        return;
      }

      if (records.length === 0) { toast.error("가져올 데이터가 없습니다."); setImporting(false); return; }

      const payload = records.map((r) => ({ ...r, project_id: projectId }));
      const { error } = await supabase.from("pastor_rides").insert(payload);
      if (error) toast.error("가져오기 실패: " + error.message);
      else { toast.success(`${records.length}건 가져오기 완료`); fetchRides(); }
    } catch (err) {
      console.error(err);
      toast.error("파일을 읽을 수 없습니다.");
    }
    setImporting(false);
  };

  /* ── 운전자 inline 업데이트 ─────────────────────────────────────── */

  const handleRiderUpdate = useCallback(async (rideId: string, riderName: string | null) => {
    // 낙관적 업데이트: DB 응답 전에 UI 먼저 반영 (스크롤 위치 유지)
    setRides((prev) =>
      prev.map((r) => r.id === rideId ? { ...r, rider_name: riderName } : r)
    );
    const { error } = await supabase
      .from("pastor_rides")
      .update({ rider_name: riderName, updated_at: new Date().toISOString() })
      .eq("id", rideId);
    if (error) {
      toast.error("운전자 변경 실패");
      fetchRides(); // 오류 시에만 서버 데이터로 복구
    }
  }, [fetchRides]);

  /* ── canExpand 헬퍼 ─────────────────────────────────────────────── */

  const canExpand = (ride: Ride) => !!(
    ride.responsible_org || ride.coordinator_name ||
    ride.arrival_contact || ride.estimated_duration ||
    ride.message_time    || ride.message_title ||
    ride.message_body    || ride.notes
  );

  /* ── Render ─────────────────────────────────────────────────────── */

  const stats = {
    total:     rides.length,
    pending:   rides.filter((r) => r.status === "pending").length,
    confirmed: rides.filter((r) => r.status === "confirmed").length,
    completed: rides.filter((r) => r.status === "completed").length,
  };

  const driverStats = useMemo(() => {
    const map: Record<string, number> = {};
    rides
      .filter((r) => r.event_date.startsWith(currentYear) && r.rider_name)
      .forEach((r) => {
        (r.rider_name ?? "").split(",").map((n) => n.trim()).filter(Boolean).forEach((name) => {
          map[name] = (map[name] || 0) + 1;
        });
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [rides, currentYear]);

  return (
    <div className="space-y-4">

      {/* 요약 통계 카드 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "전체",   value: "all",       count: stats.total,     numCls: "text-gray-800" },
          { label: "미정",   value: "pending",   count: stats.pending,   numCls: "text-gray-600" },
          { label: "확정",   value: "confirmed", count: stats.confirmed, numCls: "text-blue-600" },
          { label: "완료",   value: "completed", count: stats.completed, numCls: "text-green-600" },
        ].map((s) => {
          const isActive = filterStatus === s.value;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => setFilterStatus(isActive ? "all" : s.value)}
              className={`rounded-xl p-4 text-center border transition-all cursor-pointer ${
                isActive
                  ? "border-blue-400 bg-blue-50 shadow-sm"
                  : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
              }`}
            >
              <div className={`text-2xl font-bold tabular-nums ${isActive ? "text-blue-600" : s.numCls}`}>
                {s.count}
              </div>
              <div className="text-xs mt-0.5 text-gray-500">{s.label}</div>
            </button>
          );
        })}
      </div>

      {/* 운전자 현황 (접기/펼치기) */}
      {(() => {
        const validStats = driverStats.filter(([name]) => name && name !== "?" && name !== "-");
        if (validStats.length === 0) return null;
        const maxCount = validStats[0][1];
        const rankBg  = ["bg-yellow-400","bg-gray-300","bg-orange-300"];
        const rankBar = ["bg-yellow-400","bg-gray-400","bg-orange-400"];
        const grouped: { count: number; names: string[] }[] = [];
        validStats.forEach(([name, count]) => {
          const g = grouped.find((x) => x.count === count);
          if (g) g.names.push(name);
          else grouped.push({ count, names: [name] });
        });
        let rankIdx = 0;
        return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setStatsOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition"
            >
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                운전자 현황 · {currentYear}년
                <span className="ml-2 text-gray-300 font-normal normal-case tracking-normal">{validStats.length}명</span>
              </span>
              <svg
                className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${statsOpen ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {statsOpen && (
              <div className="px-4 pb-3 space-y-1.5 border-t border-gray-100">
                <div className="pt-2.5 space-y-1.5">
                  {grouped.map(({ count, names }) => {
                    const ri = rankIdx;
                    rankIdx += names.length;
                    const barCls = ri < 3 ? rankBar[ri] : "bg-blue-300";
                    const dotCls = ri < 3 ? rankBg[ri]  : "bg-gray-200";
                    const textCls = ri === 0 ? "text-yellow-600" : "text-gray-600";
                    return (
                      <div key={count} className="flex items-center gap-2.5">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
                        <span className={`text-sm font-bold shrink-0 ${textCls}`} style={{ minWidth: "5rem" }}>
                          {names.join(" · ")}
                        </span>
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${barCls}`}
                            style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-gray-500 shrink-0 tabular-nums w-7 text-right">{count}회</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 도구바 */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        <div className="flex gap-2 flex-wrap flex-1 items-center">
          <div className="w-36">
            <Select
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: "all",       label: "전체 상태" },
                { value: "pending",   label: "미정" },
                { value: "confirmed", label: "확정" },
                { value: "completed", label: "완료" },
              ]}
              className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <MonthPicker selected={filterMonths} onChange={setFilterMonths} />
          <input
            type="text"
            placeholder="라이더 검색..."
            value={filterRider}
            onChange={(e) => setFilterRider(e.target.value)}
            className="p-2.5 border border-gray-300 rounded-lg text-sm bg-white w-36 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-normal"
          />
          <button
            onClick={() => setSortDesc((d) => !d)}
            className="flex items-center gap-1 p-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-600 hover:bg-gray-50 font-bold hover:border-blue-400 transition-colors"
          >
            날짜 {sortDesc ? "↓" : "↑"}
          </button>
        </div>
        <div className="flex gap-2 shrink-0">
          {/* 뷰 모드 토글 */}
          <div className="flex border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-sm transition ${viewMode === "list" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 text-sm border-l border-gray-300 transition ${viewMode === "calendar" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowDriversModal(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              운전자 관리
            </button>
          )}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            내보내기
          </button>
          {isMember && (
            <>
              <button onClick={handleDownloadTemplate} className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
                양식
              </button>
              <button
                onClick={() => importRef.current?.click()}
                disabled={importing}
                className="text-sm px-3 py-1.5 border border-blue-300 rounded-lg hover:bg-blue-50 text-blue-600 disabled:opacity-50"
              >
                {importing ? "가져오는 중..." : "엑셀 가져오기"}
              </button>
              <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
              <button
                onClick={openAdd}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                추가
              </button>
            </>
          )}
        </div>
      </div>

      {/* 달력 뷰 */}
      {viewMode === "calendar" && (
        <RideCalendarView
          rides={rides}
          filterStatus={filterStatus}
          calendarMonth={calendarMonth}
          onMonthChange={setCalendarMonth}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          isMember={isMember}
          isAdmin={isAdmin}
          onEdit={openEdit}
          onDelete={handleDelete}
          onStatusCycle={handleStatusCycle}
          drivers={drivers}
          onRiderUpdate={handleRiderUpdate}
          expandedIds={expandedIds}
          onToggleExpand={toggleExpanded}
        />
      )}

      {/* 카드 목록 */}
      {viewMode === "list" && loading ? (
        <div className="flex justify-center py-12 text-gray-400">불러오는 중...</div>
      ) : viewMode === "list" && sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {rides.length === 0 ? "등록된 일정이 없습니다." : "필터 조건에 맞는 일정이 없습니다."}
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-2 overflow-y-auto custom-scrollbar pr-0.5" style={{ maxHeight: "calc(100vh - 380px)", minHeight: "200px" }}>
          {sorted.map((ride) => {
            const d = new Date(ride.event_date + "T00:00:00");
            const [, mm, dd] = ride.event_date.split("-");
            const dayLabel = ["일","월","화","수","목","금","토"][d.getDay()];
            const dayColor = d.getDay() === 0 ? "text-red-500" : d.getDay() === 6 ? "text-blue-500" : "text-gray-700";
            const isExpanded = expandedIds.has(ride.id);
            const expandable = canExpand(ride);
            const statusInfo = STATUS_MAP[ride.status] ?? STATUS_MAP.pending;

            return (
              <div
                key={ride.id}
                className={`rounded-xl border bg-white transition-shadow ${
                  ride.is_important ? "border-blue-200" : "border-gray-200"
                } ${isExpanded ? "shadow-sm" : "hover:shadow-sm"}`}
              >
                {/* 메인 행 */}
                <div className="flex items-center gap-3 px-4 py-3">

                  {/* 날짜 */}
                  <div className="shrink-0 w-14 text-center">
                    <div className={`text-base font-bold tabular-nums ${dayColor}`}>{mm}/{dd}</div>
                    <div className={`text-[11px] font-medium ${dayColor} opacity-70`}>{dayLabel}</div>
                  </div>

                  <div className="w-px h-10 bg-gray-100 shrink-0" />

                  {/* 중앙 정보 */}
                  <div className="flex-1 min-w-0">
                    {/* 상태 + 이름 + 번호 */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusInfo.cls}`}>
                        {statusInfo.label}
                      </span>
                      {ride.is_important && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">중요</span>
                      )}
                      <span className="font-semibold text-gray-900 text-sm">
                        {ride.event_name ?? <span className="text-gray-400 font-normal">집회명 없음</span>}
                      </span>
                      {ride.ride_number && (
                        <span className="text-[11px] text-gray-400 font-mono">{ride.ride_number}</span>
                      )}
                    </div>

                    {/* 경로 */}
                    <div className="flex items-center gap-1.5 text-sm text-gray-600 flex-wrap">
                      <span className="font-medium text-gray-800">{ride.departure_location ?? "-"}</span>
                      {ride.departure_time && (
                        <span className="text-gray-400 text-xs">{ride.departure_time.slice(0,5)}</span>
                      )}
                      <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                      {ride.arrival_location && ride.arrival_location !== "-" ? (
                        <a
                          href={`https://map.kakao.com/?q=${encodeURIComponent(ride.arrival_location)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-gray-800 hover:text-blue-600 hover:underline flex items-center gap-0.5 transition-colors"
                        >
                          {ride.arrival_location}
                          <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </a>
                      ) : (
                        <span className="font-medium text-gray-800">-</span>
                      )}
                      {ride.arrival_time && (
                        <span className="text-gray-400 text-xs">{ride.arrival_time.slice(0,5)}</span>
                      )}
                      <span className={`ml-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${DIRECTION_MAP[ride.direction]?.cls ?? "bg-gray-100 text-gray-500"}`}>{ride.direction}</span>
                      {ride.estimated_duration && (
                        <span className="text-[11px] text-gray-400">{ride.estimated_duration}</span>
                      )}
                    </div>
                  </div>

                  {/* 운전자 선택 */}
                  <RiderSelector
                    ride={ride}
                    members={drivers}
                    isMember={isMember}
                    onUpdate={handleRiderUpdate}
                  />

                  {/* 액션 */}
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    <button
                      onClick={() => setViewRide(ride)}
                      className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition"
                      title="상세 보기"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                    {isMember && (
                      <button
                        onClick={() => openEdit(ride)}
                        className="text-xs text-gray-400 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition"
                      >
                        수정
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(ride.id)}
                        className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition"
                      >
                        삭제
                      </button>
                    )}
                    {expandable && (
                      <button
                        onClick={() => toggleExpanded(ride.id)}
                        className="text-gray-300 hover:text-gray-500 p-1 rounded hover:bg-gray-100 transition ml-1"
                      >
                        <svg
                          className={`w-4 h-4 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* 상태 클릭 영역 */}
                {isMember && (
                  <div
                    className="absolute"
                    onClick={() => handleStatusCycle(ride)}
                  />
                )}

                {/* 확장 상세 */}
                {isExpanded && expandable && (
                  <div className={`px-5 pb-4 pt-3 border-t ${ride.is_important ? "border-blue-100" : "border-gray-100"}`}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                      {ride.responsible_org && (
                        <div>
                          <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">담당단체</div>
                          <div className="text-gray-800">{ride.responsible_org}</div>
                        </div>
                      )}
                      {ride.coordinator_name && (
                        <div>
                          <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">담당자</div>
                          <div className="text-gray-800">{ride.coordinator_name}</div>
                          {ride.coordinator_contact && (
                            <div className="text-xs text-gray-500 mt-0.5">{ride.coordinator_contact}</div>
                          )}
                        </div>
                      )}
                      {ride.arrival_contact && (
                        <div>
                          <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">도착지 연락처</div>
                          <div className="text-gray-800">{ride.arrival_contact}</div>
                        </div>
                      )}
                      {ride.estimated_duration && (
                        <div>
                          <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">예상 소요</div>
                          <div className="text-gray-800">{ride.estimated_duration}</div>
                        </div>
                      )}
                    </div>
                    {(ride.message_time || ride.message_title || ride.message_body) && (
                      <div className="mt-3">
                        <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">
                          메시지 {ride.message_time && <span className="normal-case font-normal">({ride.message_time})</span>}
                        </div>
                        {ride.message_title && <div className="font-semibold text-gray-800 text-sm">{ride.message_title}</div>}
                        {ride.message_body && <div className="text-gray-600 text-sm mt-0.5 whitespace-pre-wrap">{ride.message_body}</div>}
                      </div>
                    )}
                    {ride.notes && (
                      <div className="mt-3 text-sm text-gray-600">
                        <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wide mr-2">특이사항</span>
                        <span className="whitespace-pre-wrap">{ride.notes}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* 건수 */}
      {sorted.length > 0 && (
        <div className="text-xs text-gray-400 text-right">{sorted.length}건</div>
      )}

      {/* 추가/수정 모달 */}
      <RideFormModal
        isOpen={showModal}
        form={form}
        editId={editId}
        saving={saving}
        drivers={drivers}
        onChange={(f) => setForm(f)}
        onSave={handleSave}
        onClose={() => setShowModal(false)}
      />

      {/* 운전자 관리 모달 */}
      <DriversModal
        isOpen={showDriversModal}
        projectId={projectId}
        onClose={() => { setShowDriversModal(false); fetchDrivers(); }}
      />

      {/* 상세 보기 모달 */}
      {viewRide && (
        <RideViewModal
          ride={viewRide}
          isMember={isMember}
          isAdmin={isAdmin}
          onEdit={() => { setViewRide(null); openEdit(viewRide); }}
          onDelete={() => { setViewRide(null); handleDelete(viewRide.id); }}
          onClose={() => setViewRide(null)}
        />
      )}
    </div>
  );
}


/* ── 운전자 선택 드롭다운 ──────────────────────────────────────────── */

function RiderSelector({
  ride, members, isMember, onUpdate,
}: {
  ride: Ride;
  members: { id: string; name: string }[];
  isMember: boolean;
  onUpdate: (rideId: string, name: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentNames = ride.rider_name
    ? ride.rider_name.split(",").map((n) => n.trim()).filter(Boolean)
    : [];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = async (name: string) => {
    setSaving(true);
    const next = currentNames.includes(name)
      ? currentNames.filter((n) => n !== name)
      : [...currentNames, name];
    await onUpdate(ride.id, next.length > 0 ? next.join(", ") : null);
    setSaving(false);
  };

  const clearAll = async () => {
    setSaving(true);
    await onUpdate(ride.id, null);
    setSaving(false);
    setOpen(false);
  };

  const hasRider = currentNames.length > 0;
  const displayLabel = !hasRider
    ? "배치 필요"
    : currentNames.length === 1
    ? currentNames[0]
    : `${currentNames[0]} 외 ${currentNames.length - 1}명`;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        disabled={!isMember || saving}
        onClick={() => isMember && setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition
          ${hasRider
            ? "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
            : "bg-orange-50 text-orange-500 border-orange-200 hover:border-orange-300"
          } ${!isMember ? "cursor-default opacity-80" : "cursor-pointer"}`}
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span className="max-w-[9rem] truncate">{displayLabel}</span>
        {isMember && (
          <svg className={`w-3 h-3 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 w-52 py-1 text-sm max-h-64 overflow-y-auto custom-scrollbar">
          <button
            onClick={clearAll}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-400 flex items-center gap-2"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            배치 없음
          </button>
          <div className="border-t border-gray-100 my-1" />
          {members.length === 0 && (
            <div className="px-3 py-2 text-gray-400 text-xs">운전자 관리에서 추가하세요</div>
          )}
          {members.map((m) => {
            const isSelected = currentNames.includes(m.name);
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.name)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition ${
                  isSelected ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50 text-gray-800"
                }`}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${
                  isSelected ? "bg-blue-600 border-blue-600" : "border-gray-300"
                }`}>
                  {isSelected && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={isSelected ? "font-medium" : ""}>{m.name}</span>
              </button>
            );
          })}
          {currentNames.length > 0 && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <div className="px-3 py-1.5 text-[11px] text-blue-500 font-medium">
                {currentNames.length}명 선택됨
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 상세 보기 모달 ──────────────────────────────────────────────────── */

function RideViewModal({
  ride, isMember, isAdmin, onEdit, onDelete, onClose,
}: {
  ride:     Ride;
  isMember: boolean;
  isAdmin:  boolean;
  onEdit:   () => void;
  onDelete: () => void;
  onClose:  () => void;
}) {
  const statusInfo = STATUS_MAP[ride.status] ?? STATUS_MAP.pending;
  const dirCls = DIRECTION_MAP[ride.direction]?.cls ?? "bg-gray-100 text-gray-500";

  const Field = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div>
        <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">{label}</div>
        <div className="text-gray-800 text-sm">{value}</div>
      </div>
    ) : null;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`${ride.ride_number ? `[${ride.ride_number}] ` : ""}${ride.event_name ?? "라이드 상세"}`}
      footer={
        <div className="flex items-center gap-2 w-full">
          <div className="flex-1 flex gap-2">
            {isAdmin && (
              <button onClick={onDelete} className="text-sm px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg transition border border-red-200">
                삭제
              </button>
            )}
          </div>
          {isMember && (
            <button onClick={onEdit} className={formBtnSave}>수정</button>
          )}
          <button onClick={onClose} className={formBtnCancel}>닫기</button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* 상태 + 날짜 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-bold px-3 py-1 rounded-full ${statusInfo.cls}`}>{statusInfo.label}</span>
          <span className={`text-sm font-bold px-3 py-1 rounded-full ${dirCls}`}>{ride.direction}</span>
          {ride.is_important && <span className="text-sm font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-700">중요</span>}
          <span className="text-sm font-semibold text-gray-700 ml-1">
            {(() => {
              const d = new Date(ride.event_date + "T00:00:00");
              const [, mm, dd] = ride.event_date.split("-");
              const day = ["일","월","화","수","목","금","토"][d.getDay()];
              return `${mm}월 ${dd}일 (${day})`;
            })()}
          </span>
        </div>

        {/* 이동 경로 */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1">출발</div>
              <div className="font-semibold text-gray-800 break-words">{ride.departure_location ?? "-"}</div>
              {ride.departure_time && <div className="text-sm text-gray-500 mt-0.5">{ride.departure_time.slice(0,5)}</div>}
            </div>
            <div>
              <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1">도착</div>
              {ride.arrival_location && ride.arrival_location !== "-" ? (
                <a
                  href={`https://map.kakao.com/?q=${encodeURIComponent(ride.arrival_location)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="font-semibold text-gray-800 hover:text-blue-600 hover:underline break-words"
                >
                  {ride.arrival_location}
                </a>
              ) : (
                <div className="font-semibold text-gray-800">-</div>
              )}
              {ride.arrival_time && <div className="text-sm text-gray-500 mt-0.5">{ride.arrival_time.slice(0,5)}</div>}
            </div>
          </div>
          {ride.estimated_duration && (
            <div className="text-xs text-gray-400 border-t border-gray-200 pt-2 mt-1">예상 소요 {ride.estimated_duration}</div>
          )}
        </div>

        {/* 담당 / 운전 */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="운전담당" value={ride.rider_name} />
          <Field label="담당단체" value={ride.responsible_org} />
          <Field label="담당자" value={ride.coordinator_name} />
          <Field label="담당자 연락처" value={ride.coordinator_contact} />
          <Field label="도착지 연락처" value={ride.arrival_contact} />
        </div>

        {/* 메시지 */}
        {(ride.message_time || ride.message_title || ride.message_body) && (
          <div>
            <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">
              메시지{ride.message_time && <span className="normal-case font-normal"> ({ride.message_time})</span>}
            </div>
            <div className="text-gray-800 text-sm">
              {ride.message_title && <div className="font-semibold">{ride.message_title}</div>}
              {ride.message_body && <div className="whitespace-pre-wrap mt-0.5">{ride.message_body}</div>}
            </div>
          </div>
        )}

        {/* 특이사항 */}
        {ride.notes && (
          <div>
            <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1">특이사항</div>
            <div className="text-gray-600 text-sm whitespace-pre-wrap">{ride.notes}</div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ── 폼 모달 ────────────────────────────────────────────────────────── */

function RideFormModal({
  isOpen, form, editId, saving, drivers, onChange, onSave, onClose,
}: {
  isOpen:   boolean;
  form:     RideForm;
  editId:   string | null;
  saving:   boolean;
  drivers:  { id: string; name: string }[];
  onChange: (f: RideForm) => void;
  onSave:   () => void;
  onClose:  () => void;
}) {
  const set = (key: keyof RideForm, value: string | boolean) =>
    onChange({ ...form, [key]: value });

  const [dateOpen, setDateOpen] = useState(false);
  const dateRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dateOpen) return;
    const h = (e: MouseEvent) => { if (dateRef.current && !dateRef.current.contains(e.target as Node)) setDateOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [dateOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editId ? "라이드 수정" : "라이드 추가"}
      footer={
        <>
          <button
            onClick={onSave}
            disabled={saving}
            className={`${formBtnSave} ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {saving ? "저장 중..." : editId ? "수정 저장" : "추가"}
          </button>
          <button onClick={onClose} className={formBtnCancel}>취소</button>
        </>
      }
    >
      <div className="space-y-5">

        {/* 라이드 번호 + 날짜 / 상태 / 중요 */}
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
          <div>
            <label className={labelCls}>라이드 번호</label>
            <input
              className={inputCls}
              placeholder="예: 26-037"
              value={form.ride_number ?? ""}
              onChange={(e) => set("ride_number", e.target.value)}
            />
          </div>
          <div className="flex items-end gap-3">
          <div ref={dateRef} className="flex-1 relative">
            <label className={labelCls}>날짜 *</label>
            <button
              type="button"
              onClick={() => setDateOpen((o) => !o)}
              className="w-full p-2.5 border border-gray-300 rounded-md text-sm bg-white text-left font-bold text-gray-900 flex items-center gap-2 hover:border-blue-400 transition"
            >
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className={form.event_date ? "text-gray-900" : "text-gray-400"}>
                {form.event_date
                  ? format(new Date(form.event_date + "T00:00:00"), "yyyy.MM.dd(EEE)", { locale: ko })
                  : "날짜 선택"}
              </span>
            </button>
            {dateOpen && (
              <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 w-[280px] range-calendar-wrapper animate-fadeIn">
                <Calendar
                  onChange={(v) => {
                    if (v instanceof Date) {
                      set("event_date", format(v, "yyyy-MM-dd"));
                      setDateOpen(false);
                    }
                  }}
                  value={form.event_date ? new Date(form.event_date + "T00:00:00") : undefined}
                  formatDay={(_, date) => format(date, "d")}
                  calendarType="gregory"
                  locale="ko-KR"
                />
              </div>
            )}
          </div>
          <div className="w-28">
            <label className={labelCls}>상태</label>
            <Select
              value={form.status}
              onChange={(v) => set("status", v)}
              options={[
                { value: "pending",   label: "미정" },
                { value: "confirmed", label: "확정" },
                { value: "completed", label: "완료" },
              ]}
              className="w-full p-2.5 border border-gray-300 rounded-md text-sm font-bold"
            />
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer select-none pb-2.5">
            <input
              type="checkbox"
              checked={form.is_important}
              onChange={(e) => set("is_important", e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm text-gray-600 whitespace-nowrap">중요</span>
          </label>
          </div>
        </div>

        {/* 집회명 */}
        <FormField label="집회명">
          <input
            className={inputCls}
            placeholder="예: 이집트 PK conference"
            value={form.event_name ?? ""}
            onChange={(e) => set("event_name", e.target.value)}
          />
        </FormField>

        <FormSectionDivider title="이동 정보" />

        <FormField label="방향">
          <Select
            value={form.direction}
            onChange={(v) => set("direction", v)}
            options={DIRECTIONS.map((d) => ({ value: d, label: d }))}
            className="w-full p-2.5 border border-gray-300 rounded-md text-sm font-bold"
          />
        </FormField>

        <FormField label="출발 장소">
          <div className="flex gap-2">
            <input className={`${inputCls} flex-1`} placeholder="장소" value={form.departure_location ?? ""} onChange={(e) => set("departure_location", e.target.value)} />
            <input type="time" className="p-2.5 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white w-32 shrink-0" value={form.departure_time ?? ""} onChange={(e) => set("departure_time", e.target.value)} />
          </div>
        </FormField>

        <FormField label="도착 장소">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                className={`${inputCls} pr-9`}
                placeholder="장소"
                value={form.arrival_location ?? ""}
                onChange={(e) => set("arrival_location", e.target.value)}
              />
              {form.arrival_location && (
                <a
                  href={`https://map.kakao.com/?q=${encodeURIComponent(form.arrival_location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="카카오맵 검색"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </a>
              )}
            </div>
            <input type="time" className="p-2.5 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white w-32 shrink-0" value={form.arrival_time ?? ""} onChange={(e) => set("arrival_time", e.target.value)} />
          </div>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="예상 소요시간">
            <input className={inputCls} placeholder="예: 1시간 13분" value={form.estimated_duration ?? ""} onChange={(e) => set("estimated_duration", e.target.value)} />
          </FormField>
          <FormField label="도착지 연락처">
            <input className={inputCls} value={form.arrival_contact ?? ""} onChange={(e) => set("arrival_contact", e.target.value)} />
          </FormField>
        </div>

        <FormSectionDivider title="담당자 정보" />

        <div className="grid grid-cols-2 gap-3">
          <FormField label="담당단체">
            <input className={inputCls} value={form.responsible_org ?? ""} onChange={(e) => set("responsible_org", e.target.value)} />
          </FormField>
          <FormField label="담당자">
            <input className={inputCls} value={form.coordinator_name ?? ""} onChange={(e) => set("coordinator_name", e.target.value)} />
          </FormField>
        </div>

        <FormField label="담당자 연락처">
          <input className={inputCls} value={form.coordinator_contact ?? ""} onChange={(e) => set("coordinator_contact", e.target.value)} />
        </FormField>

        <FormField label="운전담당">
          {drivers.length > 0 ? (() => {
            const selectedNames = (form.rider_name ?? "").split(",").map((n) => n.trim()).filter(Boolean);
            const available = drivers.filter((d) => !selectedNames.includes(d.name));
            const addName = (name: string) => set("rider_name", [...selectedNames, name].join(", "));
            const removeName = (name: string) => set("rider_name", selectedNames.filter((n) => n !== name).join(", "));
            return (
              <div className="space-y-2">
                {selectedNames.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNames.map((name) => (
                      <span key={name} className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium rounded-full">
                        {name}
                        <button type="button" onClick={() => removeName(name)} className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-blue-200 text-blue-400 hover:text-blue-700 transition">
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {available.length > 0 && (
                  <Select
                    value=""
                    onChange={(name) => { if (name) addName(name); }}
                    placeholder="운전자 추가..."
                    options={available.map((d) => ({ value: d.name, label: d.name }))}
                    className="w-full p-2.5 border border-gray-300 rounded-md text-sm"
                  />
                )}
                {available.length === 0 && selectedNames.length > 0 && (
                  <p className="text-xs text-gray-400">모든 운전자가 선택됨</p>
                )}
              </div>
            );
          })() : (
            <input className={inputCls} placeholder="이름 직접 입력" value={form.rider_name ?? ""} onChange={(e) => set("rider_name", e.target.value)} />
          )}
        </FormField>

        <FormSectionDivider title="메시지 정보" />

        <div className="grid grid-cols-2 gap-3">
          <FormField label="메시지 시간">
            <input className={inputCls} placeholder="18:25" value={form.message_time ?? ""} onChange={(e) => set("message_time", e.target.value)} />
          </FormField>
          <FormField label="메시지 제목">
            <input className={inputCls} value={form.message_title ?? ""} onChange={(e) => set("message_title", e.target.value)} />
          </FormField>
        </div>

        <FormField label="메시지 본문">
          <textarea
            className={`${inputCls} resize-none`}
            rows={3}
            value={form.message_body ?? ""}
            onChange={(e) => set("message_body", e.target.value)}
          />
        </FormField>

        <FormSectionDivider title="특이사항" />

        <textarea
          className={`${inputCls} resize-none`}
          rows={3}
          placeholder="주의사항, 특이사항 등"
          value={form.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
    </Modal>
  );
}

/* ── UI 헬퍼 ────────────────────────────────────────────────────────── */

const inputCls = "w-full p-2.5 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white";
const labelCls = "block text-xs font-medium text-gray-500 uppercase mb-1";
const formBtnSave   = "px-5 py-2.5 bg-[#2151EC] text-white font-medium rounded-lg hover:bg-[#1a43c9] transition text-sm shadow-md";
const formBtnCancel = "px-5 py-2.5 bg-white border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition text-sm sm:min-w-[80px]";

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function FormSectionDivider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{title}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

/* ── DriversModal ───────────────────────────────────────────────────── */

/* ── 달력 뷰 ────────────────────────────────────────────────────────── */

function RideCalendarView({
  rides, filterStatus, calendarMonth, onMonthChange, selectedDate, onSelectDate,
  isMember, isAdmin, onEdit, onDelete, onStatusCycle, drivers, onRiderUpdate,
  expandedIds, onToggleExpand,
}: {
  rides:           Ride[];
  filterStatus:    string;
  calendarMonth:   Date;
  onMonthChange:   (d: Date) => void;
  selectedDate:    string | null;
  onSelectDate:    (d: string | null) => void;
  isMember:        boolean;
  isAdmin:         boolean;
  onEdit:          (r: Ride) => void;
  onDelete:        (id: string) => void;
  onStatusCycle:   (r: Ride) => void;
  drivers:         { id: string; name: string }[];
  onRiderUpdate:   (rideId: string, name: string | null) => Promise<void>;
  expandedIds:     Set<string>;
  onToggleExpand:  (id: string) => void;
}) {
  const filtered = rides.filter((r) => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    return true;
  });

  // 날짜별 라이드 맵
  const byDate = useMemo(() => {
    const m: Record<string, Ride[]> = {};
    filtered.forEach((r) => {
      (m[r.event_date] ??= []).push(r);
    });
    return m;
  }, [filtered]);

  const dayRides = selectedDate ? (byDate[selectedDate] ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden range-calendar-wrapper">
        <Calendar
          activeStartDate={calendarMonth}
          onActiveStartDateChange={({ activeStartDate }) => activeStartDate && onMonthChange(activeStartDate)}
          onChange={(v) => {
            if (v instanceof Date) {
              const key = `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
              onSelectDate(selectedDate === key ? null : key);
            }
          }}
          value={selectedDate ? new Date(selectedDate + "T00:00:00") : null}
          formatDay={(_, date) => String(date.getDate())}
          calendarType="gregory"
          locale="ko-KR"
          tileContent={({ date }) => {
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
            const dayRidesArr = byDate[key];
            if (!dayRidesArr?.length) return null;
            const hasImportant = dayRidesArr.some((r) => r.is_important);
            return (
              <div className="flex justify-center gap-0.5 mt-0.5 flex-wrap">
                {dayRidesArr.slice(0, 3).map((r) => (
                  <div
                    key={r.id}
                    className={`w-1.5 h-1.5 rounded-full ${
                      r.status === "confirmed" ? "bg-blue-500" :
                      r.status === "completed" ? "bg-green-500" :
                      "bg-gray-400"
                    }`}
                  />
                ))}
                {dayRidesArr.length > 3 && (
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                )}
                {hasImportant && (
                  <div className="w-1 h-1 rounded-full bg-orange-400" />
                )}
              </div>
            );
          }}
          tileClassName={({ date }) => {
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
            return byDate[key]?.length ? "has-rides" : null;
          }}
        />
      </div>

      {/* 선택한 날짜의 라이드 */}
      {selectedDate && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-700">
              {(() => {
                const d = new Date(selectedDate + "T00:00:00");
                const [, mm, dd] = selectedDate.split("-");
                const day = ["일","월","화","수","목","금","토"][d.getDay()];
                return `${mm}월 ${dd}일 (${day})`;
              })()}
            </span>
            <span className="text-xs text-gray-400">{dayRides.length}건</span>
            <button onClick={() => onSelectDate(null)} className="ml-auto text-gray-400 hover:text-gray-600 text-xs">닫기</button>
          </div>
          {dayRides.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-4">일정 없음</div>
          ) : (
            dayRides.map((ride) => {
              const statusInfo = STATUS_MAP[ride.status] ?? STATUS_MAP.pending;
              const isExpanded = expandedIds.has(ride.id);
              const expandable = !!(
                ride.responsible_org || ride.coordinator_name ||
                ride.arrival_contact || ride.estimated_duration ||
                ride.message_time    || ride.message_title ||
                ride.message_body    || ride.notes
              );
              return (
                <div key={ride.id} className={`rounded-xl border bg-white transition-shadow ${ride.is_important ? "border-blue-200" : "border-gray-200"} ${isExpanded ? "shadow-sm" : "hover:shadow-sm"}`}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusInfo.cls}`}>{statusInfo.label}</span>
                        {ride.is_important && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">중요</span>}
                        <span className="font-semibold text-gray-900 text-sm">{ride.event_name ?? <span className="text-gray-400 font-normal">집회명 없음</span>}</span>
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${DIRECTION_MAP[ride.direction]?.cls ?? "bg-gray-100 text-gray-500"}`}>{ride.direction}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-gray-600 flex-wrap">
                        <span className="font-medium text-gray-800">{ride.departure_location ?? "-"}</span>
                        {ride.departure_time && <span className="text-gray-400 text-xs">{ride.departure_time.slice(0,5)}</span>}
                        <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                        <span className="font-medium text-gray-800">{ride.arrival_location ?? "-"}</span>
                        {ride.arrival_time && <span className="text-gray-400 text-xs">{ride.arrival_time.slice(0,5)}</span>}
                      </div>
                    </div>
                    <RiderSelector ride={ride} members={drivers} isMember={isMember} onUpdate={onRiderUpdate} />
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      {isMember && <button onClick={() => onEdit(ride)} className="text-xs text-gray-400 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition">수정</button>}
                      {isAdmin && <button onClick={() => onDelete(ride.id)} className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition">삭제</button>}
                      {expandable && (
                        <button onClick={() => onToggleExpand(ride.id)} className="text-gray-300 hover:text-gray-500 p-1 rounded hover:bg-gray-100 transition">
                          <svg className={`w-4 h-4 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  {isExpanded && expandable && (
                    <div className={`px-5 pb-4 pt-3 border-t ${ride.is_important ? "border-blue-100" : "border-gray-100"}`}>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                        {ride.responsible_org && <div><div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">담당단체</div><div className="text-gray-800">{ride.responsible_org}</div></div>}
                        {ride.coordinator_name && <div><div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">담당자</div><div className="text-gray-800">{ride.coordinator_name}</div>{ride.coordinator_contact && <div className="text-xs text-gray-500 mt-0.5">{ride.coordinator_contact}</div>}</div>}
                        {ride.arrival_contact && <div><div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">도착지 연락처</div><div className="text-gray-800">{ride.arrival_contact}</div></div>}
                        {ride.estimated_duration && <div><div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">예상 소요</div><div className="text-gray-800">{ride.estimated_duration}</div></div>}
                      </div>
                      {(ride.message_time || ride.message_title || ride.message_body) && (
                        <div className="mt-3">
                          <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">메시지 {ride.message_time && <span className="normal-case font-normal">({ride.message_time})</span>}</div>
                          {ride.message_title && <div className="font-semibold text-gray-800 text-sm">{ride.message_title}</div>}
                          {ride.message_body && <div className="text-gray-600 text-sm mt-0.5 whitespace-pre-wrap">{ride.message_body}</div>}
                        </div>
                      )}
                      {ride.notes && <div className="mt-3 text-sm text-gray-600"><span className="text-[11px] text-gray-400 font-bold uppercase tracking-wide mr-2">특이사항</span><span className="whitespace-pre-wrap">{ride.notes}</span></div>}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/* ── DriversModal ───────────────────────────────────────────────────── */

function DriversModal({
  isOpen, projectId, onClose,
}: {
  isOpen:    boolean;
  projectId: string;
  onClose:   () => void;
}) {
  const supabase = createClient();
  const [allProfiles, setAllProfiles]           = useState<{ id: string; name: string }[]>([]);
  const [profileDriverIds, setProfileDriverIds] = useState<Set<string>>(new Set());
  const [customDrivers, setCustomDrivers]       = useState<{ id: string; name: string }[]>([]);
  const [customInput, setCustomInput]           = useState("");
  const [search, setSearch]                     = useState("");
  const [busy, setBusy]                         = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSearch(""); setCustomInput("");
    supabase.from("profiles").select("id, full_name").neq("role", "pending").order("full_name").then(({ data }) => {
      setAllProfiles(
        (data ?? []).filter((p) => p.full_name).map((p) => ({ id: p.id, name: p.full_name as string }))
      );
    });
    supabase.from("project_drivers").select("id, user_id, custom_name").eq("project_id", projectId).then(({ data }) => {
      const ids = new Set<string>();
      const customs: { id: string; name: string }[] = [];
      (data ?? []).forEach((d) => {
        if (d.custom_name) customs.push({ id: d.id, name: d.custom_name });
        else if (d.user_id) ids.add(d.user_id);
      });
      setProfileDriverIds(ids);
      setCustomDrivers(customs);
    });
  }, [isOpen, projectId]);

  const add = async (userId: string) => {
    if (profileDriverIds.has(userId) || busy) return;
    setBusy(true);
    await supabase.from("project_drivers").insert({ project_id: projectId, user_id: userId });
    setProfileDriverIds((prev) => new Set([...prev, userId]));
    setBusy(false);
  };

  const remove = async (userId: string) => {
    if (busy) return;
    setBusy(true);
    await supabase.from("project_drivers").delete().eq("project_id", projectId).eq("user_id", userId);
    setProfileDriverIds((prev) => { const n = new Set(prev); n.delete(userId); return n; });
    setBusy(false);
  };

  const addCustom = async () => {
    const name = customInput.trim();
    if (!name || busy) return;
    setBusy(true);
    const { data } = await supabase
      .from("project_drivers")
      .insert({ project_id: projectId, custom_name: name })
      .select("id").single();
    if (data) setCustomDrivers((prev) => [...prev, { id: data.id, name }]);
    setCustomInput("");
    setBusy(false);
  };

  const removeCustom = async (id: string) => {
    if (busy) return;
    setBusy(true);
    await supabase.from("project_drivers").delete().eq("id", id);
    setCustomDrivers((prev) => prev.filter((d) => d.id !== id));
    setBusy(false);
  };

  const selected   = allProfiles.filter((p) => profileDriverIds.has(p.id));
  const unselected = allProfiles.filter(
    (p) => !profileDriverIds.has(p.id) && (search ? p.name.includes(search) : true)
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="운전자 관리"
      className="sm:!max-w-3xl"
      footer={<button onClick={onClose} className={formBtnSave}>완료</button>}
    >
      <div className="grid grid-cols-2 gap-4" style={{ height: 420 }}>

        {/* 왼쪽: 전체 목록 */}
        <div className="flex flex-col border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50 shrink-0">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름 검색..."
              className="w-full text-sm outline-none bg-transparent placeholder-gray-400 text-gray-800"
            />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {unselected.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                {search ? "검색 결과 없음" : "모두 추가됨"}
              </div>
            ) : (
              unselected.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => add(p.id)}
                  disabled={busy}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors text-left group"
                >
                  <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="font-bold text-base">{p.name}</span>
                </button>
              ))
            )}
          </div>
          <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 text-[11px] text-gray-400 shrink-0">
            클릭하면 오른쪽에 추가됩니다
          </div>
        </div>

        {/* 오른쪽: 선택된 운전자 */}
        <div className="flex flex-col border border-blue-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-50 shrink-0">
            <span className="text-sm font-bold text-blue-700">
              선택된 운전자
              <span className="ml-1.5 text-blue-500 font-semibold">
                {selected.length + customDrivers.length}명
              </span>
            </span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {selected.length === 0 && customDrivers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-sm text-gray-400 gap-2">
                <svg className="w-9 h-9 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>왼쪽에서 추가하세요</span>
              </div>
            ) : (
              <>
                {selected.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 transition-colors group">
                    <div className="flex items-center gap-2 text-base text-gray-800 font-bold">
                      <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {p.name}
                    </div>
                    <button type="button" onClick={() => remove(p.id)} disabled={busy}
                      className="w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {customDrivers.length > 0 && (
                  <>
                    {selected.length > 0 && <div className="mx-4 border-t border-blue-100" />}
                    <div className="px-4 py-1 text-[11px] font-bold text-gray-400 uppercase tracking-wide">직접 추가</div>
                    {customDrivers.map((d) => (
                      <div key={d.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 transition-colors group">
                        <div className="flex items-center gap-2 text-base text-gray-800 font-bold">
                          <svg className="w-3.5 h-3.5 text-purple-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                          {d.name}
                        </div>
                        <button type="button" onClick={() => removeCustom(d.id)} disabled={busy}
                          className="w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
          {/* 직접 이름 입력 */}
          <div className="border-t border-blue-100 p-3 shrink-0 bg-blue-50/30">
            <div className="text-[11px] text-gray-400 font-medium mb-1.5">이름 직접 추가 (비사역자)</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustom()}
                placeholder="이름 입력 후 Enter 또는 추가..."
                className="flex-1 text-sm px-2.5 py-1.5 border border-blue-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-400 bg-white"
              />
              <button
                type="button"
                onClick={addCustom}
                disabled={!customInput.trim() || busy}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40 font-medium shrink-0"
              >
                추가
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ── MonthPicker ────────────────────────────────────────────────────── */

function MonthPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (months: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const MONTH_LABELS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

  const toggle = (ym: string) => {
    onChange(
      selected.includes(ym)
        ? selected.filter((m) => m !== ym)
        : [...selected, ym].sort()
    );
  };

  // 선택된 달을 "8~11월" 또는 "3개월" 형식으로
  const label = (() => {
    if (selected.length === 0) return "전체 월";
    const sorted = [...selected].sort();
    if (sorted.length === 1) {
      const [y, m] = sorted[0].split("-");
      return `${y}년 ${Number(m)}월`;
    }
    const allSameYear = sorted.every((m) => m.startsWith(sorted[0].slice(0, 4)));
    if (allSameYear) {
      const months = sorted.map((m) => Number(m.slice(5)));
      const consecutive = months.every((m, i) => i === 0 || m === months[i - 1] + 1);
      if (consecutive) {
        return `${months[0]}~${months[months.length - 1]}월`;
      }
      return `${months.length}개월 선택`;
    }
    return `${sorted.length}개월 선택`;
  })();

  const hasSelection = selected.length > 0;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-between gap-2 px-3 py-2.5 border rounded-lg text-sm font-bold transition-all whitespace-nowrap
          ${hasSelection
            ? "border-blue-400 text-blue-600 bg-blue-50"
            : "border-gray-300 text-gray-900 bg-white"
          }
          ${open ? "ring-2 ring-blue-200 border-blue-500" : ""}
        `}
      >
        <span>{label}</span>
        <svg
          className={`w-4 h-4 transition-transform shrink-0 ${open ? "rotate-180" : ""} ${hasSelection ? "text-blue-400" : "text-gray-400"}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 w-64 animate-fadeIn">
          {/* 년도 네비게이션 */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="font-bold text-gray-800 text-sm">{viewYear}년</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* 월 칩 */}
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {MONTH_LABELS.map((lbl, idx) => {
              const ym = `${viewYear}-${String(idx + 1).padStart(2, "0")}`;
              const isSel = selected.includes(ym);
              return (
                <button
                  key={ym}
                  type="button"
                  onClick={() => toggle(ym)}
                  className={`py-2 rounded-lg text-sm font-medium transition ${
                    isSel
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {lbl}
                </button>
              );
            })}
          </div>

          {/* 하단 액션 */}
          <div className="flex gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex-1 py-2 text-xs text-gray-500 hover:bg-gray-50 rounded-lg border border-gray-200 transition font-medium"
            >
              전체 보기
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 py-2 text-xs bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 날짜 포맷 헬퍼 ─────────────────────────────────────────────────── */

function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr + "T00:00:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${dateStr.slice(5).replace("-", "/")}(${days[d.getDay()]})`;
}

/* ── 엑셀 날짜 파싱 헬퍼 ────────────────────────────────────────────── */
// 지원 형식:
//   - JS Date 객체      (cellDates: true 옵션으로 파싱된 경우)
//   - "YYYY-MM-DD"      (템플릿 표준 형식)
//   - "YY.MM.DD"        (기존 엑셀 형식, 예: 26.07.27)
//   - "YY.MM.DD(요일)"  (기존 엑셀 형식, 예: 26.07.27(월))
//   - "YYYY.MM.DD"      (예: 2026.07.27)
//   - 엑셀 시리얼 숫자  (예: 46264)

function parseExcelDate(value: unknown): string | null {
  if (value == null || value === "") return null;

  // 1) JS Date 객체 (cellDates: true)
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // 2) YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // 3) YY.MM.DD 또는 YY.MM.DD(요일)  →  20YY-MM-DD
  const short = raw.match(/^(\d{2})\.(\d{2})\.(\d{2})/);
  if (short) return `20${short[1]}-${short[2]}-${short[3]}`;

  // 4) YYYY.MM.DD
  const long = raw.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (long) return `${long[1]}-${long[2]}-${long[3]}`;

  // 5) 엑셀 시리얼 숫자 (xlsx SSF 사용)
  const num = Number(raw);
  if (!isNaN(num) && num > 1) {
    try {
      const parsed = XLSX.SSF.parse_date_code(num);
      if (parsed) {
        const y = parsed.y;
        const m = String(parsed.m).padStart(2, "0");
        const d = String(parsed.d).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    } catch {
      return null;
    }
  }

  return null;
}
