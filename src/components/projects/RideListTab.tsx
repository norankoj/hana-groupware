"use client";

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";

/* ── Types ──────────────────────────────────────────────────────────── */

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

const DIRECTIONS = ["왕복", "편도", "귀도"];

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
  { header: "방향(왕복/편도/귀도)",   field: "direction" },
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
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterMonth, setFilterMonth]   = useState<string>("all");
  const [filterRider, setFilterRider]   = useState<string>("");

  // 모달
  const [showModal, setShowModal]   = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState<RideForm>(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);

  // 상세 펼치기
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  useEffect(() => { fetchRides(); }, [fetchRides]);

  /* ── Derived Values ─────────────────────────────────────────────── */

  const months = Array.from(
    new Set(rides.map((r) => r.event_date.slice(0, 7)))
  ).sort();

  const filtered = rides.filter((r) => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterMonth !== "all" && !r.event_date.startsWith(filterMonth)) return false;
    if (filterRider && !r.rider_name?.includes(filterRider)) return false;
    return true;
  });

  /* ── CRUD ───────────────────────────────────────────────────────── */

  const openAdd = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
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
      "방향(왕복/편도/귀도)": r.direction,
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
      // cellDates: true → 날짜 셀을 JS Date 객체로 파싱
      const wb  = XLSX.read(buf, { type: "array", cellDates: true });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

      const records: Omit<Ride, "id">[] = [];
      const errors: string[] = [];

      rows.forEach((row, idx) => {
        const line = idx + 2;
        const date = parseExcelDate(row["날짜(YYYY-MM-DD)*"]);
        if (!date) {
          errors.push(`${line}행: 날짜 형식 오류 — YYYY-MM-DD, YY.MM.DD, 또는 엑셀 날짜 셀 사용`);
          return;
        }

        const str = (key: string) => String(row[key] ?? "").trim();

        const statusRaw = str("상태(미정/확정/완료)");
        const statusMap: Record<string, string> = { 미정: "pending", 확정: "confirmed", 완료: "completed" };
        const status = statusMap[statusRaw] ?? "pending";

        const parseTime = (val: string) => {
          const v = val.trim();
          return v && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, "0") : null;
        };

        records.push({
          ride_number:         str("번호") || null,
          status,
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
    } catch {
      toast.error("파일을 읽을 수 없습니다.");
    }
    setImporting(false);
  };

  /* ── Render ─────────────────────────────────────────────────────── */

  const stats = {
    total:     rides.length,
    pending:   rides.filter((r) => r.status === "pending").length,
    confirmed: rides.filter((r) => r.status === "confirmed").length,
    completed: rides.filter((r) => r.status === "completed").length,
  };

  return (
    <div className="space-y-4">

      {/* 요약 통계 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "전체",   count: stats.total,     cls: "bg-gray-50 text-gray-700" },
          { label: "미정",   count: stats.pending,   cls: "bg-gray-100 text-gray-600" },
          { label: "확정",   count: stats.confirmed, cls: "bg-blue-50 text-blue-700" },
          { label: "완료",   count: stats.completed, cls: "bg-green-50 text-green-700" },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl p-3 text-center ${s.cls} border border-gray-200`}>
            <div className="text-xl font-bold">{s.count}</div>
            <div className="text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 도구바 */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        {/* 필터 */}
        <div className="flex gap-2 flex-wrap flex-1">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="all">전체 상태</option>
            <option value="pending">미정</option>
            <option value="confirmed">확정</option>
            <option value="completed">완료</option>
          </select>
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="all">전체 월</option>
            {months.map((m) => (
              <option key={m} value={m}>{m.slice(0, 7)}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="라이더 검색..."
            value={filterRider}
            onChange={(e) => setFilterRider(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white w-32"
          />
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2 shrink-0">
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
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
              >
                양식
              </button>
              <button
                onClick={() => importRef.current?.click()}
                disabled={importing}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-blue-300 rounded-lg hover:bg-blue-50 text-blue-600 disabled:opacity-50"
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

      {/* 테이블 */}
      {loading ? (
        <div className="flex justify-center py-12 text-gray-400">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {rides.length === 0 ? "등록된 일정이 없습니다." : "필터 조건에 맞는 일정이 없습니다."}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs">
                  <th className="px-3 py-2.5 text-left font-semibold w-16">번호</th>
                  <th className="px-3 py-2.5 text-left font-semibold w-20">상태</th>
                  <th className="px-3 py-2.5 text-left font-semibold w-28">날짜</th>
                  <th className="px-3 py-2.5 text-left font-semibold">집회명</th>
                  <th className="px-3 py-2.5 text-left font-semibold w-24">라이더</th>
                  <th className="px-3 py-2.5 text-left font-semibold w-16">방향</th>
                  <th className="px-3 py-2.5 text-left font-semibold">출발 → 도착</th>
                  <th className="px-3 py-2.5 text-left font-semibold w-20">메시지</th>
                  <th className="px-3 py-2.5 text-right font-semibold w-20">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((ride) => (
                  <Fragment key={ride.id}>
                    <tr
                      className={`hover:bg-gray-50 transition cursor-pointer ${
                        ride.is_important ? "bg-blue-50" : ""
                      }`}
                      onClick={() => setExpandedId(expandedId === ride.id ? null : ride.id)}
                    >
                      <td className="px-3 py-2.5 text-gray-500 font-mono text-xs">
                        {ride.is_important && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 mb-0.5" />}
                        {ride.ride_number ?? "-"}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleStatusCycle(ride); }}
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_MAP[ride.status]?.cls ?? "bg-gray-100 text-gray-600"} hover:opacity-80 transition`}
                          title="클릭하여 상태 변경"
                          disabled={!isMember}
                        >
                          {STATUS_MAP[ride.status]?.label ?? ride.status}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-gray-700 font-medium whitespace-nowrap">
                        {formatDate(ride.event_date)}
                      </td>
                      <td className="px-3 py-2.5 text-gray-800 font-medium">
                        {ride.event_name ?? <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">
                        {ride.rider_name ?? <span className="text-gray-400 text-xs">미배치</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          {ride.direction}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 text-xs">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span>{ride.departure_location ?? "-"}</span>
                          {ride.departure_time && <span className="text-gray-400">({ride.departure_time.slice(0, 5)})</span>}
                          <span className="text-gray-400">→</span>
                          <span>{ride.arrival_location ?? "-"}</span>
                          {ride.arrival_time && <span className="text-gray-400">({ride.arrival_time.slice(0, 5)})</span>}
                          {ride.estimated_duration && <span className="text-gray-400 text-xs">약 {ride.estimated_duration}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 text-xs">
                        {ride.message_time ?? "-"}
                      </td>
                      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        {isMember && (
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => openEdit(ride)}
                              className="text-xs text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-50"
                            >
                              수정
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleDelete(ride.id)}
                                className="text-xs text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50"
                              >
                                삭제
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* 확장 상세 행 */}
                    {expandedId === ride.id && (
                      <tr key={`${ride.id}-detail`} className={ride.is_important ? "bg-blue-50" : "bg-gray-50"}>
                        <td colSpan={9} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <DetailField label="담당단체" value={ride.responsible_org} />
                            <DetailField label="담당자" value={ride.coordinator_name} />
                            <DetailField label="담당자 연락처" value={ride.coordinator_contact} />
                            <DetailField label="도착지 연락처" value={ride.arrival_contact} />
                            <DetailField label="예상 소요시간" value={ride.estimated_duration} />
                            {(ride.message_title || ride.message_body || ride.message_time) && (
                              <div className="col-span-2 md:col-span-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                <div className="text-xs font-semibold text-yellow-800 mb-1">
                                  메시지 {ride.message_time && `(${ride.message_time})`}
                                </div>
                                {ride.message_title && <div className="font-medium text-gray-800">{ride.message_title}</div>}
                                {ride.message_body && <div className="text-gray-600 mt-0.5 whitespace-pre-wrap">{ride.message_body}</div>}
                              </div>
                            )}
                            {ride.notes && (
                              <div className="col-span-2 md:col-span-3">
                                <span className="text-xs text-gray-500 font-semibold">특이사항: </span>
                                <span className="text-gray-700 whitespace-pre-wrap">{ride.notes}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 추가/수정 모달 */}
      {showModal && (
        <RideFormModal
          form={form}
          editId={editId}
          saving={saving}
          onChange={(f) => setForm(f)}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

/* ── 상세 필드 컴포넌트 ─────────────────────────────────────────────── */

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-xs text-gray-500 font-semibold">{label}: </span>
      <span className="text-gray-700">{value}</span>
    </div>
  );
}

/* ── 폼 모달 ────────────────────────────────────────────────────────── */

function RideFormModal({
  form, editId, saving, onChange, onSave, onClose,
}: {
  form:    RideForm;
  editId:  string | null;
  saving:  boolean;
  onChange: (f: RideForm) => void;
  onSave:  () => void;
  onClose: () => void;
}) {
  const set = (key: keyof RideForm, value: string | boolean) =>
    onChange({ ...form, [key]: value });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-10 px-4 pb-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">
            {editId ? "라이드 일정 수정" : "라이드 일정 추가"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* 기본 정보 */}
          <Section title="기본 정보">
            <div className="grid grid-cols-2 gap-3">
              <Field label="번호 (예: 26-037)">
                <input
                  className={inputCls}
                  placeholder="자동 입력 또는 직접 입력"
                  value={form.ride_number ?? ""}
                  onChange={(e) => set("ride_number", e.target.value)}
                />
              </Field>
              <Field label="날짜 *">
                <input
                  type="date"
                  className={inputCls}
                  value={form.event_date}
                  onChange={(e) => set("event_date", e.target.value)}
                />
              </Field>
              <Field label="상태">
                <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value)}>
                  <option value="pending">미정</option>
                  <option value="confirmed">확정</option>
                  <option value="completed">완료</option>
                </select>
              </Field>
              <Field label="">
                <label className="flex items-center gap-2 cursor-pointer mt-6">
                  <input
                    type="checkbox"
                    checked={form.is_important}
                    onChange={(e) => set("is_important", e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-gray-700">중요 일정 (파란색 표시)</span>
                </label>
              </Field>
            </div>
            <Field label="집회명">
              <input
                className={inputCls}
                placeholder="예: 이집트 PK conference (출국)"
                value={form.event_name ?? ""}
                onChange={(e) => set("event_name", e.target.value)}
              />
            </Field>
          </Section>

          {/* 담당자 정보 */}
          <Section title="담당자 정보">
            <div className="grid grid-cols-2 gap-3">
              <Field label="담당단체">
                <input className={inputCls} value={form.responsible_org ?? ""} onChange={(e) => set("responsible_org", e.target.value)} />
              </Field>
              <Field label="담당자">
                <input className={inputCls} value={form.coordinator_name ?? ""} onChange={(e) => set("coordinator_name", e.target.value)} />
              </Field>
              <Field label="담당자 연락처">
                <input className={inputCls} value={form.coordinator_contact ?? ""} onChange={(e) => set("coordinator_contact", e.target.value)} />
              </Field>
              <Field label="라이더 (운전담당)">
                <input
                  className={inputCls}
                  placeholder="이름 또는 미배치"
                  value={form.rider_name ?? ""}
                  onChange={(e) => set("rider_name", e.target.value)}
                />
              </Field>
            </div>
          </Section>

          {/* 이동 정보 */}
          <Section title="이동 정보">
            <div className="grid grid-cols-2 gap-3">
              <Field label="방향">
                <select className={inputCls} value={form.direction} onChange={(e) => set("direction", e.target.value)}>
                  {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="예상 소요시간">
                <input
                  className={inputCls}
                  placeholder="예: 1시간 13분"
                  value={form.estimated_duration ?? ""}
                  onChange={(e) => set("estimated_duration", e.target.value)}
                />
              </Field>
              <Field label="출발장소">
                <input className={inputCls} value={form.departure_location ?? ""} onChange={(e) => set("departure_location", e.target.value)} />
              </Field>
              <Field label="출발시간 (HH:MM)">
                <input type="time" className={inputCls} value={form.departure_time ?? ""} onChange={(e) => set("departure_time", e.target.value)} />
              </Field>
              <Field label="도착장소">
                <input className={inputCls} value={form.arrival_location ?? ""} onChange={(e) => set("arrival_location", e.target.value)} />
              </Field>
              <Field label="도착시간 (HH:MM)">
                <input type="time" className={inputCls} value={form.arrival_time ?? ""} onChange={(e) => set("arrival_time", e.target.value)} />
              </Field>
              <Field label="도착지 연락처" className="col-span-2">
                <input className={inputCls} value={form.arrival_contact ?? ""} onChange={(e) => set("arrival_contact", e.target.value)} />
              </Field>
            </div>
          </Section>

          {/* 메시지 정보 */}
          <Section title="메시지 정보">
            <div className="grid grid-cols-2 gap-3">
              <Field label="메시지 시간">
                <input
                  className={inputCls}
                  placeholder="예: 18:25"
                  value={form.message_time ?? ""}
                  onChange={(e) => set("message_time", e.target.value)}
                />
              </Field>
              <Field label="메시지 제목">
                <input className={inputCls} value={form.message_title ?? ""} onChange={(e) => set("message_title", e.target.value)} />
              </Field>
            </div>
            <Field label="메시지 본문">
              <textarea
                className={`${inputCls} resize-none`}
                rows={3}
                value={form.message_body ?? ""}
                onChange={(e) => set("message_body", e.target.value)}
              />
            </Field>
          </Section>

          {/* 특이사항 */}
          <Section title="특이사항">
            <textarea
              className={`${inputCls} resize-none`}
              rows={3}
              placeholder="특이사항, 주의사항 등"
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Section>
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            취소
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "저장 중..." : editId ? "수정 저장" : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── UI 헬퍼 컴포넌트 ───────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label, children, className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>}
      {children}
    </div>
  );
}

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

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
