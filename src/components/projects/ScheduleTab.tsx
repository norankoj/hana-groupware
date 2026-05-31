"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Select from "@/components/Select";
import Modal from "@/components/Modal";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, addMonths, subMonths, parseISO, isToday,
} from "date-fns";
import { ko } from "date-fns/locale";

type Props = {
  projectId: string;
  myUserId: string;
  isMember: boolean;
  isAdmin: boolean;
  isMarf?: boolean;
};

type Schedule = {
  id: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  description: string | null;
  location: string | null;
  category: string;
  responsible_name: string | null;
};

/* ── 선교사 관련 타입 (MARF only) ──────────────────────────────── */
type MissionaryBrief = {
  id: string;
  name: string;
  family_group: string | null;
  arrival_date: string | null;
  arrival_time: string | null;
  arrival_flight: string | null;
  arrival_terminal: string | null;
  departure_date: string | null;
  departure_time: string | null;
  departure_flight: string | null;
  departure_terminal: string | null;
  accommodation_needed: boolean;
  vehicle_needed: boolean;
  ride_needed: boolean;
  dietary_notes: string | null;
  notes: string | null;
};

type ResourceAssignment = { missionary_id: string; from: string; to: string };

type AccomBrief = {
  id: string;
  provider_name: string;
  provider_contact: string | null;
  address: string | null;
  assigned_missionary_id: string | null;
  assignments: ResourceAssignment[] | null;
  available_from: string | null;
  available_to: string | null;
};

type VehicleBrief = {
  id: string;
  provider_name: string;
  provider_contact: string | null;
  car_model: string | null;
  car_number: string | null;
  insurance_added: boolean;
  assigned_missionary_id: string | null;
  assignments: ResourceAssignment[] | null;
  available_from: string | null;
  available_to: string | null;
};

/* ── Constants ─────────────────────────────────────────────────── */
const CATEGORIES: Record<string, { label: string; color: string; dot: string }> = {
  arrival:   { label: "도착",   color: "bg-blue-100 text-blue-700",   dot: "bg-blue-500" },
  event:     { label: "행사",   color: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  meeting:   { label: "모임",   color: "bg-green-100 text-green-700",  dot: "bg-green-500" },
  departure: { label: "출발",   color: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  general:   { label: "일반",   color: "bg-gray-100 text-gray-600",    dot: "bg-gray-400" },
};

const EMPTY_FORM = {
  event_date: "", start_time: "", end_time: "", title: "", description: "",
  location: "", category: "general", responsible_name: "",
};

/* ── Helper: 일정 날짜와 관련된 선교사 찾기 ───────────────────── */
function getRelated(schedule: Schedule, missionaries: MissionaryBrief[]): MissionaryBrief[] {
  const d = schedule.event_date;
  return missionaries.filter((m) => {
    if (m.arrival_date === d) return true;
    if (m.departure_date === d) return true;
    if (m.arrival_date && m.departure_date && d > m.arrival_date && d < m.departure_date) return true;
    return false;
  });
}

/* ── Helper: 선교사 숙소/차량 찾기 ─────────────────────────────── */
function getMissionaryAccom(mId: string, accoms: AccomBrief[]): AccomBrief | undefined {
  return accoms.find((a) =>
    a.assigned_missionary_id === mId ||
    a.assignments?.some((as) => as.missionary_id === mId),
  );
}
function getMissionaryVehicle(mId: string, vehicles: VehicleBrief[]): VehicleBrief | undefined {
  return vehicles.find((v) =>
    v.assigned_missionary_id === mId ||
    v.assignments?.some((as) => as.missionary_id === mId),
  );
}
function getAssignedPeriod(mId: string, resource: AccomBrief | VehicleBrief): string {
  const asgn = resource.assignments?.find((a) => a.missionary_id === mId);
  if (asgn?.from) return `${asgn.from} ~ ${asgn.to || "미정"}`;
  if (resource.available_from) return `${resource.available_from} ~ ${resource.available_to || "미정"}`;
  return "";
}

/* ── Main Component ─────────────────────────────────────────────── */
export default function ScheduleTab({ projectId, isMember, isAdmin, isMarf }: Props) {
  const supabase = useMemo(() => createClient(), []);

  /* 일정 */
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading,   setLoading]   = useState(true);

  /* MARF 선교사 / 자원 */
  const [missionaries, setMissionaries] = useState<MissionaryBrief[]>([]);
  const [accoms,       setAccoms]       = useState<AccomBrief[]>([]);
  const [vehicles,     setVehicles]     = useState<VehicleBrief[]>([]);

  /* 편집 모달 */
  const [selected,  setSelected]  = useState<Schedule | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);

  /* 뷰 */
  const [viewMode,       setViewMode]       = useState<"list" | "calendar">("list");
  const [calMonth,       setCalMonth]       = useState(new Date());
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null);

  /* 상세 모달 (클릭) */
  const [showDetail,    setShowDetail]    = useState(false);
  const [detailSchedule, setDetailSchedule] = useState<Schedule | null>(null);

  /* 자동 스크롤 */
  const dateRefs   = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrolledRef = useRef(false);

  /* ── Fetch ──────────────────────────────────────────────────── */
  const fetchAll = useCallback(async () => {
    const queries: any[] = [
      supabase.from("project_schedules").select("*").eq("project_id", projectId)
        .order("event_date").order("start_time"),
    ];
    if (isMarf) {
      queries.push(
        supabase.from("marf_missionaries").select(
          "id,name,family_group,arrival_date,arrival_time,arrival_flight,arrival_terminal,departure_date,departure_time,departure_flight,departure_terminal,accommodation_needed,vehicle_needed,ride_needed,dietary_notes,notes",
        ).eq("project_id", projectId).order("arrival_date"),
        supabase.from("marf_accommodations").select(
          "id,provider_name,provider_contact,address,assigned_missionary_id,assignments,available_from,available_to",
        ).eq("project_id", projectId),
        supabase.from("marf_vehicles").select(
          "id,provider_name,provider_contact,car_model,car_number,insurance_added,assigned_missionary_id,assignments,available_from,available_to",
        ).eq("project_id", projectId),
      );
    }
    const [sched, miss, acom, veh] = await Promise.all(queries);
    setSchedules((sched.data ?? []) as Schedule[]);
    if (isMarf) {
      setMissionaries((miss?.data ?? []) as MissionaryBrief[]);
      setAccoms((acom?.data ?? []) as AccomBrief[]);
      setVehicles((veh?.data ?? []) as VehicleBrief[]);
    }
    setLoading(false);
  }, [projectId, isMarf, supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── 자동 스크롤: 오늘 or 다가오는 날짜로 ────────────────────── */
  useEffect(() => {
    if (loading || viewMode !== "list" || !schedules.length || scrolledRef.current) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const sortedDates = [...new Set(schedules.map((s) => s.event_date))].sort();
    // 오늘 이상 되는 가장 가까운 날짜 (없으면 마지막 과거 날짜)
    const target = sortedDates.find((d) => d >= today) ?? null;
    if (target) {
      scrolledRef.current = true;
      requestAnimationFrame(() => {
        dateRefs.current.get(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [loading, viewMode, schedules]);

  /* ── Edit/Create handlers ──────────────────────────────────── */
  const openCreate = (date?: string) => {
    setSelected(null);
    setForm(date ? { ...EMPTY_FORM, event_date: date } : EMPTY_FORM);
    setShowModal(true);
  };
  const openEdit = (s: Schedule) => {
    setSelected(s);
    setForm({
      event_date: s.event_date, start_time: s.start_time || "", end_time: s.end_time || "",
      title: s.title, description: s.description || "", location: s.location || "",
      category: s.category, responsible_name: s.responsible_name || "",
    });
    setShowModal(true);
    setShowDetail(false);
  };
  const openDetail = (s: Schedule) => {
    setDetailSchedule(s);
    setShowDetail(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.event_date) { toast.error("날짜와 제목을 입력하세요."); return; }
    setSaving(true);
    const payload = {
      ...form,
      start_time: form.start_time || null, end_time: form.end_time || null,
      description: form.description || null, location: form.location || null,
      responsible_name: form.responsible_name || null,
    };
    if (selected) {
      const { error } = await supabase.from("project_schedules").update(payload).eq("id", selected.id);
      if (error) { toast.error("수정 실패"); setSaving(false); return; }
      toast.success("수정되었습니다.");
    } else {
      const { error } = await supabase.from("project_schedules").insert({ ...payload, project_id: projectId });
      if (error) { toast.error("저장 실패"); setSaving(false); return; }
      toast.success("등록되었습니다.");
    }
    setShowModal(false);
    fetchAll();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await supabase.from("project_schedules").delete().eq("id", id);
    toast.success("삭제되었습니다.");
    fetchAll();
  };

  /* ── Derived ────────────────────────────────────────────────── */
  const grouped = useMemo(
    () => schedules.reduce<Record<string, Schedule[]>>((acc, s) => {
      if (!acc[s.event_date]) acc[s.event_date] = [];
      acc[s.event_date].push(s);
      return acc;
    }, {}),
    [schedules],
  );

  const calDays = useMemo(() => {
    const ms = startOfMonth(calMonth);
    const me = endOfMonth(calMonth);
    const start = startOfWeek(ms, { weekStartsOn: 0 });
    const end   = endOfWeek(me, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [calMonth]);

  const calSelectedItems = calSelectedDate ? (grouped[calSelectedDate] ?? []) : [];

  /* ── Render ─────────────────────────────────────────────────── */
  if (loading) return <div className="text-center py-10 text-gray-400">로딩 중...</div>;

  /* 일정 카드 (목록 + 달력 세부) 공통 */
  const ScheduleCard = ({ s, showDate = false }: { s: Schedule; showDate?: boolean }) => {
    const cat = CATEGORIES[s.category] ?? CATEGORIES.general;
    return (
      <div
        className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-start gap-3 hover:shadow-sm hover:border-blue-200 transition cursor-pointer"
        onClick={() => openDetail(s)}
      >
        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5 ${cat.color}`}>{cat.label}</span>
        <div className="flex-1 min-w-0">
          {showDate && <div className="text-xs text-gray-400 mb-0.5">{s.event_date}</div>}
          <div className="font-medium text-gray-900">{s.title}</div>
          <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-3">
            {(s.start_time || s.end_time) && (
              <span>{s.start_time?.slice(0, 5)}{s.end_time ? ` ~ ${s.end_time.slice(0, 5)}` : ""}</span>
            )}
            {s.location && <span>📍 {s.location}</span>}
            {s.responsible_name && <span>👤 {s.responsible_name}</span>}
          </div>
          {s.description && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{s.description}</p>}
        </div>
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
            className="text-red-300 hover:text-red-500 text-xs px-2 py-1 rounded hover:bg-red-50 transition shrink-0"
          >
            삭제
          </button>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* ── 헤더 ── */}
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">전체 일정 {schedules.length}건</p>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 font-medium transition ${viewMode === "list" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >목록</button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 font-medium transition ${viewMode === "calendar" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >달력</button>
          </div>
          {isAdmin && (
            <button
              onClick={() => openCreate()}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              일정 추가
            </button>
          )}
        </div>
      </div>

      {schedules.length === 0 ? (
        <div className="text-center py-16 text-gray-400">등록된 일정이 없습니다.</div>
      ) : viewMode === "list" ? (

        /* ══════════════════════════════════════════
            목록 뷰
        ══════════════════════════════════════════ */
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, items]) => {
            const today = format(new Date(), "yyyy-MM-dd");
            const isDateToday = date === today;
            return (
              <div
                key={date}
                ref={(el) => { if (el) dateRefs.current.set(date, el); else dateRefs.current.delete(date); }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className={`font-bold ${isDateToday ? "text-blue-600" : "text-gray-800"}`}>
                    {date}
                    {isDateToday && (
                      <span className="ml-2 text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-semibold">오늘</span>
                    )}
                  </span>
                  <span className="text-xs text-gray-400">{format(parseISO(date), "EEEE", { locale: ko })}</span>
                </div>
                <div className="space-y-2">
                  {items.map((s) => <ScheduleCard key={s.id} s={s} />)}
                </div>
              </div>
            );
          })}
        </div>

      ) : (

        /* ══════════════════════════════════════════
            달력 뷰
        ══════════════════════════════════════════ */
        <div>
          {/* 월 네비게이션 */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => { setCalMonth(subMonths(calMonth, 1)); setCalSelectedDate(null); }}
              className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 className="font-bold text-gray-800 text-lg">
              {format(calMonth, "yyyy년 M월", { locale: ko })}
            </h3>
            <button
              onClick={() => { setCalMonth(addMonths(calMonth, 1)); setCalSelectedDate(null); }}
              className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* 달력 그리드 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-200">
              {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
                <div key={d} className={`text-center text-xs font-semibold py-2 ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-500"}`}>
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calDays.map((day, i) => {
                const dateStr    = format(day, "yyyy-MM-dd");
                const dayEvents  = grouped[dateStr] ?? [];
                const inMonth    = isSameMonth(day, calMonth);
                const isSelected = calSelectedDate === dateStr;
                const todayFlag  = isToday(day);
                const dow        = day.getDay();
                return (
                  <div
                    key={i}
                    onClick={() => setCalSelectedDate(isSelected ? null : dateStr)}
                    className={`min-h-[72px] p-1.5 border-b border-r border-gray-100 cursor-pointer transition
                      ${!inMonth ? "bg-gray-50" : "bg-white"}
                      ${isSelected ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : "hover:bg-gray-50"}
                    `}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full
                        ${!inMonth ? "text-gray-300" : todayFlag ? "bg-blue-600 text-white" : dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-gray-700"}
                      `}>
                        {format(day, "d")}
                      </span>
                      {isAdmin && inMonth && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openCreate(dateStr); }}
                          className="text-gray-300 hover:text-blue-500 transition"
                          title="일정 추가"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((s) => {
                        const cat = CATEGORIES[s.category] ?? CATEGORIES.general;
                        return (
                          <div key={s.id} className={`text-xs px-1 py-0.5 rounded truncate font-medium ${cat.color}`}>
                            {s.start_time ? `${s.start_time.slice(0, 5)} ` : ""}{s.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-gray-400 px-1">+{dayEvents.length - 3}건</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 선택된 날짜 상세 */}
          {calSelectedDate && (
            <div className="mt-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-bold text-gray-800">{calSelectedDate}</span>
                <span className="text-xs text-gray-400">{format(parseISO(calSelectedDate), "EEEE", { locale: ko })}</span>
                {isAdmin && (
                  <button
                    onClick={() => openCreate(calSelectedDate)}
                    className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    이 날 일정 추가
                  </button>
                )}
              </div>
              {calSelectedItems.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
                  이 날 일정이 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {calSelectedItems.map((s) => <ScheduleCard key={s.id} s={s} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          일정 상세 모달 (클릭)
      ══════════════════════════════════════════ */}
      {detailSchedule && (
        <Modal
          isOpen={showDetail}
          onClose={() => setShowDetail(false)}
          title={(() => {
            const cat = CATEGORIES[detailSchedule.category] ?? CATEGORIES.general;
            return (
              <span className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cat.color}`}>{cat.label}</span>
                {detailSchedule.title}
              </span>
            ) as any;
          })()}
          className="sm:max-w-[620px]"
          footer={
            isAdmin ? (
              <button
                onClick={() => openEdit(detailSchedule)}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
              >
                수정하기
              </button>
            ) : null
          }
        >
          <div className="space-y-4">
            {/* ── 일정 기본 정보 ── */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <span className="text-gray-400 w-12 shrink-0">날짜</span>
                <span className="font-semibold text-gray-900">
                  {detailSchedule.event_date}
                  <span className="ml-2 font-normal text-gray-500">
                    {format(parseISO(detailSchedule.event_date), "EEEE", { locale: ko })}
                  </span>
                </span>
              </div>
              {(detailSchedule.start_time || detailSchedule.end_time) && (
                <div className="flex items-center gap-2 text-gray-700">
                  <span className="text-gray-400 w-12 shrink-0">시간</span>
                  <span>
                    {detailSchedule.start_time?.slice(0, 5)}
                    {detailSchedule.end_time ? ` ~ ${detailSchedule.end_time.slice(0, 5)}` : ""}
                  </span>
                </div>
              )}
              {detailSchedule.location && (
                <div className="flex items-center gap-2 text-gray-700">
                  <span className="text-gray-400 w-12 shrink-0">장소</span>
                  <span>📍 {detailSchedule.location}</span>
                </div>
              )}
              {detailSchedule.responsible_name && (
                <div className="flex items-center gap-2 text-gray-700">
                  <span className="text-gray-400 w-12 shrink-0">담당</span>
                  <span>👤 {detailSchedule.responsible_name}</span>
                </div>
              )}
              {detailSchedule.description && (
                <div className="flex items-start gap-2 text-gray-700">
                  <span className="text-gray-400 w-12 shrink-0 pt-0.5">내용</span>
                  <span className="whitespace-pre-wrap">{detailSchedule.description}</span>
                </div>
              )}
            </div>

            {/* ── MARF: 관련 선교사 ── */}
            {isMarf && (() => {
              const related = getRelated(detailSchedule, missionaries);
              if (related.length === 0) return null;

              // 가족 그룹 묶기
              const groupMap = new Map<string, MissionaryBrief[]>();
              const solos: MissionaryBrief[] = [];
              related.forEach((m) => {
                const g = m.family_group?.trim();
                if (g) {
                  if (!groupMap.has(g)) groupMap.set(g, []);
                  groupMap.get(g)!.push(m);
                } else {
                  solos.push(m);
                }
              });

              const renderMissionary = (m: MissionaryBrief) => {
                const accom   = getMissionaryAccom(m.id, accoms);
                const vehicle = getMissionaryVehicle(m.id, vehicles);
                const isArrival   = m.arrival_date === detailSchedule.event_date;
                const isDeparture = m.departure_date === detailSchedule.event_date;
                return (
                  <div key={m.id} className="text-sm space-y-1.5">
                    {/* 입출국 표시 */}
                    {isArrival && (
                      <div className="flex items-center gap-1.5 text-blue-700 text-xs font-medium">
                        <span>✈️ 입국</span>
                        {m.arrival_time && <span>{m.arrival_time}</span>}
                        {m.arrival_terminal && <span>· {m.arrival_terminal}</span>}
                        {m.arrival_flight && <span className="font-bold">{m.arrival_flight}</span>}
                      </div>
                    )}
                    {isDeparture && (
                      <div className="flex items-center gap-1.5 text-orange-600 text-xs font-medium">
                        <span>✈️ 출국</span>
                        {m.departure_time && <span>{m.departure_time}</span>}
                        {m.departure_terminal && <span>· {m.departure_terminal}</span>}
                        {m.departure_flight && <span className="font-bold">{m.departure_flight}</span>}
                      </div>
                    )}
                    {/* 숙소 */}
                    {m.accommodation_needed && (
                      <div className="flex items-start gap-1.5 text-xs text-gray-600">
                        <span className="shrink-0">🏠</span>
                        {accom ? (
                          <span>
                            <span className="font-medium text-gray-800">{accom.provider_name}</span>
                            {accom.address && <span className="text-gray-400 ml-1">{accom.address}</span>}
                            {getAssignedPeriod(m.id, accom) && (
                              <span className="text-gray-400 ml-1">({getAssignedPeriod(m.id, accom)})</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-orange-400 font-medium">숙소 미배정</span>
                        )}
                      </div>
                    )}
                    {/* 차량 */}
                    {m.vehicle_needed && (
                      <div className="flex items-start gap-1.5 text-xs text-gray-600">
                        <span className="shrink-0">🚗</span>
                        {vehicle ? (
                          <span>
                            <span className="font-medium text-gray-800">{vehicle.provider_name}</span>
                            {vehicle.car_model && <span className="text-gray-400 ml-1">{vehicle.car_model}</span>}
                            {vehicle.car_number && <span className="text-gray-400 ml-1">({vehicle.car_number})</span>}
                            {!vehicle.insurance_added && <span className="text-orange-500 ml-1 font-medium">보험미완료</span>}
                            {getAssignedPeriod(m.id, vehicle) && (
                              <span className="text-gray-400 ml-1">({getAssignedPeriod(m.id, vehicle)})</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-orange-400 font-medium">차량 미배정</span>
                        )}
                      </div>
                    )}
                    {m.ride_needed && (
                      <div className="text-xs text-purple-600">🚕 공항 라이드 필요</div>
                    )}
                    {/* 특이사항 / 메모 */}
                    {m.dietary_notes && (
                      <div className="text-xs text-gray-500">🍽️ {m.dietary_notes}</div>
                    )}
                    {m.notes && (
                      <div className="text-xs text-gray-500 bg-yellow-50 px-2 py-1 rounded border border-yellow-100">
                        📝 {m.notes}
                      </div>
                    )}
                  </div>
                );
              };

              return (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-bold text-gray-700">관련 선교사</h3>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{related.length}명</span>
                  </div>
                  <div className="space-y-3">
                    {/* 가족 그룹 */}
                    {[...groupMap.entries()].map(([groupName, members]) => (
                      <div key={groupName} className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="font-semibold text-gray-800 text-sm mb-2">
                          👨‍👩‍👧 {groupName}
                          <span className="ml-1.5 text-xs text-gray-400 font-normal">{members.length}명</span>
                        </div>
                        {/* 멤버별 세부 (대표 1명으로 리소스 조회) */}
                        {renderMissionary(members[0])}
                        {members.length > 1 && (
                          <div className="mt-1.5 pt-1.5 border-t border-gray-100 text-xs text-gray-400">
                            동반: {members.slice(1).map((m) => m.name).join(", ")}
                          </div>
                        )}
                      </div>
                    ))}
                    {/* 개인 */}
                    {solos.map((m) => (
                      <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="font-semibold text-gray-800 text-sm mb-2">👤 {m.name}</div>
                        {renderMissionary(m)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </Modal>
      )}

      {/* ══════════════════════════════════════════
          일정 등록/편집 모달
      ══════════════════════════════════════════ */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={selected ? "일정 수정" : "일정 추가"}
        footer={
          <>
            <button
              onClick={() => setShowModal(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">날짜 *</label>
              <input
                type="date" value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">구분</label>
              <Select
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
                options={Object.entries(CATEGORIES).map(([k, v]) => ({ value: k, label: v.label }))}
                className="w-full py-2 px-3 bg-white border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">시작 시간</label>
              <input
                type="time" value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">종료 시간</label>
              <input
                type="time" value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">제목 *</label>
            <input
              type="text" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">장소</label>
              <input
                type="text" value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">담당자</label>
              <input
                type="text" value={form.responsible_name}
                onChange={(e) => setForm({ ...form, responsible_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">내용</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          {isAdmin && selected && (
            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={() => { setShowModal(false); handleDelete(selected.id); }}
                className="text-sm text-red-500 hover:text-red-700 transition"
              >
                이 일정 삭제
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
