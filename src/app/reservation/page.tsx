"use client";

import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/utils/supabase/client";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "@/styles/calendar.css";
import {
  format,
  addWeeks,
  addDays,
  isBefore,
  isToday,
  startOfDay,
  endOfDay,
  getDay,
  getHours,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { ko } from "date-fns/locale";
import toast from "react-hot-toast";
import { showConfirm } from "@/utils/alert";
import { HOLIDAYS } from "@/constants/holidays";
import Modal from "@/components/Modal";
import ExcelUploadModal from "@/components/reservation/ExcelUploadModal";

// ─── Types ────────────────────────────────────────────────────────────────────
type Resource = {
  id: number;
  name: string;
  category: string;
  location: string;
  description: string;
  color: string;
};
type Reservation = {
  id: number | string;
  resource_id: number;
  user_id: string;
  start_at: string;
  end_at: string;
  purpose: string;
  status: string;
  reservee_name?: string | null;   // 엑셀 업로드 시 성도 이름
  profiles?: { full_name: string; position: string };
  group_id?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const BUILDINGS = [
  { id: "church", label: "교회", desc: "예배실 및 교회 공간", notionUrl: null },
  {
    id: "edu1",
    label: "교육관 1",
    desc: "교육관 2층~3층",
    notionUrl: "https://pibear.notion.site/1-c01cd2ba204a44d7a49596ed22cdd639",
  },
  {
    id: "edu2",
    label: "교육관 2",
    desc: "교육관 1층",
    notionUrl:
      "https://pibear.notion.site/2-a90180e7d5b1497eb99d02474a1c0b87?pvs=143",
  },
];
const START_HOUR = 7;
const END_HOUR = 23;
const HOURS = Array.from(
  { length: END_HOUR - START_HOUR },
  (_, i) => START_HOUR + i,
); // 7~22
const AM_HOURS = HOURS.filter((h) => h < 12);
const PM_HOURS = HOURS.filter((h) => h >= 12);

// ─── 고정 일정 (본당 주일예배/금요성령집회) ──────────────────────────────────
function fixedLabel(
  resourceName: string,
  date: Date,
  hour: number,
): string | null {
  if (!resourceName.includes("본당")) return null;
  const dow = getDay(date);
  if (dow === 0 && hour >= 8 && hour < 17) return "주일예배";
  if (dow === 5 && hour >= 19 && hour < 23) return "금요예배";
  return null;
}

// ─── 슬롯 상태 ───────────────────────────────────────────────────────────────
type SlotStatus = "available" | "reserved" | "fixed" | "past" | "current";

function slotStatus(
  hour: number,
  date: Date,
  resourceName: string,
  reservations: Reservation[],
  resourceId: number,
): SlotStatus {
  if (fixedLabel(resourceName, date, hour)) return "fixed";
  if (isToday(date)) {
    const nowH = getHours(new Date());
    if (hour < nowH) return "past";
    if (hour === nowH) return "current";
  }
  const hit = reservations.some((r) => {
    if (r.resource_id !== resourceId) return false;
    const s = getHours(new Date(r.start_at));
    const e = getHours(new Date(r.end_at));
    return hour >= s && hour < e;
  });
  return hit ? "reserved" : "available";
}

// ─── 슬롯 셀 스타일 ──────────────────────────────────────────────────────────
function cellCls(status: SlotStatus, inRange: boolean): string {
  if (inRange) return "bg-blue-600 border-blue-600 text-white shadow-sm";
  switch (status) {
    case "fixed":
      return "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed";
    case "reserved":
      return "bg-gray-100 border-gray-200 text-gray-400 cursor-pointer hover:bg-gray-200";
    case "past":
      return "bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed opacity-60";
    case "current":
      return "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 cursor-pointer";
    default:
      return "bg-white border-gray-200 text-gray-700 hover:border-blue-400 hover:bg-blue-50 cursor-pointer";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function FacilityReservationPage() {
  const supabase = createClient();

  // core
  const [resources, setResources] = useState<Resource[]>([]);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // list view – today's bars
  const [todayRsv, setTodayRsv] = useState<Reservation[]>([]);

  // book view
  const [view, setView] = useState<"list" | "book">("list");
  const [selectedRes, setSelectedRes] = useState<Resource | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calMonth, setCalMonth] = useState<Date>(new Date());
  const [dateRsv, setDateRsv] = useState<Reservation[]>([]);
  const [monthRsv, setMonthRsv] = useState<Reservation[]>([]);

  // time selection
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);

  // form
  const [purpose, setPurpose] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurEnd, setRecurEnd] = useState(
    format(addWeeks(new Date(), 4), "yyyy-MM-dd"),
  );

  // modals
  const [detailRsv, setDetailRsv] = useState<Reservation | null>(null);
  const [showExcel, setShowExcel] = useState(false);
  const [slotPopover, setSlotPopover] = useState<{
    rsv: Reservation;
    x: number;
    y: number;
  } | null>(null);

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchInitial = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) setCurrentUser(user.id);

    const { data: resData } = await supabase
      .from("resources")
      .select("*")
      .eq("is_active", true)
      .neq("category", "vehicle")
      .order("id");
    if (resData) setResources(resData);

    const { data: td } = await supabase
      .from("reservations")
      .select("*")
      .gte("start_at", startOfDay(new Date()).toISOString())
      .lte("end_at", endOfDay(new Date()).toISOString())
      .neq("status", "cancelled");
    setTodayRsv(td ? (td as any) : []);

    setLoading(false);
  };

  const fetchDateRsv = async (date: Date) => {
    const { data } = await supabase
      .from("reservations")
      .select("*, profiles:user_id(full_name, position)")
      .gte("start_at", startOfDay(date).toISOString())
      .lte("end_at", endOfDay(date).toISOString())
      .neq("status", "cancelled");
    setDateRsv(data ? (data as any) : []);
  };

  const fetchMonthRsv = async (month: Date) => {
    const ms = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const me = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    const { data } = await supabase
      .from("reservations")
      .select("id, resource_id, start_at")
      .gte("start_at", ms.toISOString())
      .lte("start_at", me.toISOString())
      .neq("status", "cancelled");
    setMonthRsv(data ? (data as any) : []);
  };

  useEffect(() => {
    fetchInitial();
  }, []);
  useEffect(() => {
    if (view === "book" && selectedRes) fetchDateRsv(selectedDate);
  }, [view, selectedDate, selectedRes]);
  useEffect(() => {
    if (view === "book") fetchMonthRsv(calMonth);
  }, [view, calMonth, selectedRes]);
  useEffect(() => {
    setSlotPopover(null);
  }, [selectedDate, view]);

  // ── open book ──────────────────────────────────────────────────────────────
  const openBook = (res: Resource) => {
    setSelectedRes(res);
    setSelectedDate(new Date());
    setCalMonth(new Date());
    setSelStart(null);
    setSelEnd(null);
    setPurpose("");
    setIsRecurring(false);
    setRecurEnd(format(addWeeks(new Date(), 4), "yyyy-MM-dd"));
    setView("book");
  };

  // ── hour click ─────────────────────────────────────────────────────────────
  const handleHourClick = (hour: number) => {
    if (!selectedRes) return;
    const st = slotStatus(
      hour,
      selectedDate,
      selectedRes.name,
      dateRsv,
      selectedRes.id,
    );
    if (st === "fixed" || st === "reserved" || st === "past") return;

    if (selStart === null) {
      setSelStart(hour);
      setSelEnd(null);
    } else if (selEnd === null) {
      if (hour === selStart) {
        setSelStart(null);
        return;
      }
      setSelEnd(hour);
    } else {
      setSelStart(hour);
      setSelEnd(null);
    }
  };

  // ── recurring dates set (for calendar highlight) ───────────────────────
  const recurDates = useMemo<Set<string>>(() => {
    if (!isRecurring || !selectedRes) return new Set();
    const dates = new Set<string>();
    let iter = new Date(selectedDate);
    const limitDate = new Date(recurEnd);
    while (iter <= limitDate) {
      dates.add(format(iter, "yyyy-MM-dd"));
      iter = addDays(iter, 7);
    }
    return dates;
  }, [isRecurring, selectedDate, recurEnd, selectedRes]);

  const inRange = (hour: number) => {
    if (selStart === null) return false;
    if (selEnd === null) return hour === selStart;
    const lo = Math.min(selStart, selEnd);
    const hi = Math.max(selStart, selEnd);
    return hour >= lo && hour <= hi;
  };

  // ── 카카오톡 공유 복사 ──────────────────────────────────────────────────────
  const copyShareText = (
    rsv: { start_at: string; end_at: string; purpose: string },
    resourceName: string,
  ) => {
    const dateStr   = format(new Date(rsv.start_at), "yyyy년 M월 d일 (EEE)", { locale: ko });
    const startTime = format(new Date(rsv.start_at), "HH:mm");
    const endTime   = format(new Date(rsv.end_at),   "HH:mm");
    const text = `[장소사용]\n\n* 날짜 : ${dateStr}\n* 시간 : ${startTime} ~ ${endTime}\n* 장소 : ${resourceName}\n* 사용목적 : ${rsv.purpose}`;
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("복사 완료! 카카오톡에 붙여넣기 하세요 📋"))
      .catch(() => toast.error("복사에 실패했습니다."));
  };

  // ── reserve ────────────────────────────────────────────────────────────────
  const handleReserve = async () => {
    if (!selectedRes || selStart === null || selEnd === null)
      return toast.error("시간을 선택해주세요.");
    if (!purpose.trim()) return toast.error("사용 목적을 입력해주세요.");

    const startH = Math.min(selStart, selEnd);
    const endH = Math.max(selStart, selEnd) + 1;
    const baseStart = new Date(selectedDate);
    baseStart.setHours(startH, 0, 0, 0);
    const baseEnd = new Date(selectedDate);
    baseEnd.setHours(endH, 0, 0, 0);

    const groupId = isRecurring ? crypto.randomUUID() : null;
    const toInsert: any[] = [];

    const checkOverlap = async (s: Date, e: Date) => {
      const { data } = await supabase
        .from("reservations")
        .select("id")
        .eq("resource_id", selectedRes.id)
        .neq("status", "cancelled")
        .lt("start_at", e.toISOString())
        .gt("end_at", s.toISOString());
      return (data?.length ?? 0) > 0;
    };

    if (isRecurring) {
      const limitDate = new Date(recurEnd);
      limitDate.setHours(23, 59, 59);
      const maxLimit = addWeeks(new Date(), 26);
      if (isBefore(maxLimit, limitDate))
        return toast.error("정기 예약은 최대 6개월까지 가능합니다.");
      let iterS = new Date(baseStart),
        iterE = new Date(baseEnd);
      while (iterS <= limitDate) {
        if (await checkOverlap(iterS, iterE))
          return toast.error(
            `${format(iterS, "M월 d일")}에 이미 예약이 있습니다.`,
          );
        toInsert.push({
          resource_id: selectedRes.id,
          user_id: currentUser,
          start_at: iterS.toISOString(),
          end_at: iterE.toISOString(),
          purpose,
          group_id: groupId,
          status: "confirmed",
        });
        iterS = addDays(iterS, 7);
        iterE = addDays(iterE, 7);
      }
    } else {
      if (await checkOverlap(baseStart, baseEnd))
        return toast.error("해당 시간에 이미 예약이 있습니다.");
      toInsert.push({
        resource_id: selectedRes.id,
        user_id: currentUser,
        start_at: baseStart.toISOString(),
        end_at: baseEnd.toISOString(),
        purpose,
        status: "confirmed",
      });
    }

    if (!(await showConfirm(`${toInsert.length}건 예약을 진행하시겠습니까?`)))
      return;
    const { error } = await supabase.from("reservations").insert(toInsert);
    if (error) toast.error("예약 실패: " + error.message);
    else {
      // 단일 예약이면 바로 복사 토스트 제공
      if (!isRecurring && toInsert.length === 1) {
        toast(
          (t) => (
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold">예약되었습니다! 🎉</span>
              <button
                onClick={() => {
                  copyShareText(
                    { start_at: toInsert[0].start_at, end_at: toInsert[0].end_at, purpose: toInsert[0].purpose },
                    selectedRes!.name,
                  );
                  toast.dismiss(t.id);
                }}
                className="shrink-0 text-xs bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-bold px-2.5 py-1 rounded-lg transition"
              >
                카카오톡 복사
              </button>
            </div>
          ),
          { duration: 8000 },
        );
      } else {
        toast.success(`${toInsert.length}건 예약되었습니다!`);
      }
      setSelStart(null);
      setSelEnd(null);
      setPurpose("");
      fetchDateRsv(selectedDate);
      fetchInitial();
    }
  };

  // ── cancel ─────────────────────────────────────────────────────────────────
  const handleCancelOne = async () => {
    if (!detailRsv) return;
    if (!(await showConfirm("이 예약을 취소하시겠습니까?"))) return;
    const { error } = await supabase
      .from("reservations")
      .update({ status: "cancelled" })
      .eq("id", detailRsv.id);
    if (error) toast.error("취소 실패");
    else {
      toast.success("취소되었습니다.");
      setDetailRsv(null);
      fetchDateRsv(selectedDate);
      fetchInitial();
    }
  };
  const handleCancelAll = async () => {
    if (!detailRsv?.group_id) return;
    if (!(await showConfirm("정기 예약 전체를 취소하시겠습니까?"))) return;
    const { error } = await supabase
      .from("reservations")
      .update({ status: "cancelled" })
      .eq("group_id", detailRsv.group_id);
    if (error) toast.error("전체 취소 실패");
    else {
      toast.success("전체 일정이 취소되었습니다.");
      setDetailRsv(null);
      fetchDateRsv(selectedDate);
      fetchInitial();
    }
  };

  // ── availability bar segments for list view ────────────────────────────────
  const barSegments = (resId: number, resName: string) =>
    HOURS.map((h) => slotStatus(h, new Date(), resName, todayRsv, resId));

  // ── reserved period string (today) ────────────────────────────────────────
  const todayPeriods = (resId: number) =>
    todayRsv
      .filter((r) => r.resource_id === resId)
      .map(
        (r) =>
          `${format(new Date(r.start_at), "H")}~${format(new Date(r.end_at), "H")}시`,
      )
      .join(", ");

  // ─────────────────────────────────────────────────────────────────────────
  // Slot Cell
  // ─────────────────────────────────────────────────────────────────────────
  const SlotCell = ({ hour }: { hour: number }) => {
    if (!selectedRes) return null;
    const st = slotStatus(
      hour,
      selectedDate,
      selectedRes.name,
      dateRsv,
      selectedRes.id,
    );
    const isRange = inRange(hour);
    const fl = fixedLabel(selectedRes.name, selectedDate, hour);
    const rsvHit = dateRsv.find((r) => {
      if (r.resource_id !== selectedRes.id) return false;
      const s = getHours(new Date(r.start_at));
      const e = getHours(new Date(r.end_at));
      return hour >= s && hour < e;
    });
    const tooltipTxt = fl
      ? fl
      : rsvHit
        ? `${rsvHit.reservee_name || rsvHit.profiles?.full_name || "예약됨"} · ${format(new Date(rsvHit.start_at), "H:mm")}~${format(new Date(rsvHit.end_at), "H:mm")}`
        : `${hour}:00`;

    return (
      <button
        key={hour}
        disabled={st === "fixed" || st === "past"}
        onClick={(e) => {
          if (st === "reserved" && rsvHit) {
            setSlotPopover({ rsv: rsvHit, x: e.clientX, y: e.clientY });
            return;
          }
          handleHourClick(hour);
        }}
        title={tooltipTxt}
        className={`relative shrink-0 w-[58px] h-[62px] rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-all ${cellCls(st, isRange)}`}
      >
        <span className="text-xs font-bold leading-none">
          {hour < 12
            ? `오전 ${hour}`
            : hour === 12
              ? "오후 12"
              : `오후 ${hour - 12}`}
        </span>
        <span className="text-[9px] leading-none opacity-70">
          {isRange
            ? "✓ 선택"
            : fl
              ? "고정"
              : st === "reserved"
                ? "예약됨"
                : st === "past"
                  ? "지난 시간"
                  : st === "current"
                    ? "현재"
                    : ""}
        </span>
        {/* Striped overlay for reserved/fixed */}
        {(st === "reserved" || st === "fixed") && (
          <div
            className="absolute inset-0 rounded-xl opacity-[0.12] pointer-events-none"
            style={{
              background:
                "repeating-linear-gradient(-45deg,#6b7280,#6b7280 2px,transparent 2px,transparent 8px)",
            }}
          />
        )}
      </button>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // LIST VIEW
  // ─────────────────────────────────────────────────────────────────────────
  const ListView = (
    <div className="space-y-10">
      {BUILDINGS?.map((bld) => {
        const bldRes = resources.filter((r) => r.category === bld.id);
        if (bldRes.length === 0) return null;
        return (
          <div key={bld.id}>
            {/* Building header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1 h-7 bg-blue-600 rounded-full" />
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">{bld.label}</h2>
                <p className="text-xs text-gray-400">{bld.desc}</p>
              </div>
              {bld.notionUrl && (
                <a
                  href={bld.notionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-blue-300 hover:shadow transition-all shrink-0"
                >
                  이용안내 →
                </a>
              )}
            </div>

            {/* Space cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {bldRes.map((res) => {
                const segs = barSegments(res.id, res.name);
                const freeCount = segs.filter(
                  (s) => s === "available" || s === "current",
                ).length;
                const periods = todayPeriods(res.id);

                return (
                  <div
                    key={res.id}
                    onClick={() => openBook(res)}
                    className="bg-white border border-gray-200 rounded-2xl p-5 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group flex flex-col gap-4"
                  >
                    {/* Card top */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div>
                          <h3 className="text-base font-bold text-gray-900">
                            {res.name}
                          </h3>
                          {(res.description || res.location) && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {res.description || res.location}
                            </p>
                          )}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
                          freeCount >= 8
                            ? "bg-green-50 text-green-600"
                            : freeCount >= 4
                              ? "bg-yellow-50 text-yellow-600"
                              : freeCount > 0
                                ? "bg-orange-50 text-orange-500"
                                : "bg-red-50 text-red-500"
                        }`}
                      >
                        오늘 {freeCount}h 가용
                      </span>
                    </div>

                    {/* Availability bar */}
                    <div>
                      <div className="flex h-4 rounded-lg overflow-hidden gap-[1px]">
                        {segs.map((st, i) => (
                          <div
                            key={i}
                            title={`${HOURS[i]}:00 · ${st === "reserved" ? "예약됨" : st === "fixed" ? "고정일정" : st === "past" ? "지남" : st === "current" ? "현재" : "예약가능"}`}
                            className={`flex-1 transition-colors ${
                              st === "reserved"
                                ? "bg-red-400"
                                : st === "fixed"
                                  ? "bg-gray-400"
                                  : st === "past"
                                    ? "bg-gray-200"
                                    : st === "current"
                                      ? "bg-amber-400"
                                      : "bg-emerald-200 group-hover:bg-emerald-300"
                            }`}
                          />
                        ))}
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-300 mt-1">
                        <span>7시</span>
                        <span>15시</span>
                        <span>23시</span>
                      </div>
                    </div>

                    {/* Today status */}
                    {periods ? (
                      <p className="text-xs text-red-500 -mt-1">
                        🔴 예약된 시간대: {periods}
                      </p>
                    ) : (
                      <p className="text-xs text-emerald-500 -mt-1">
                        🟢 오늘 예약 없음
                      </p>
                    )}

                    {/* Book button */}
                    {/* <button className="w-full py-2.5 bg-blue-600 group-hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 mt-auto">
                      예약하기
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button> */}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // BOOK VIEW
  // ─────────────────────────────────────────────────────────────────────────
  const BookView = selectedRes && (
    <div className="flex flex-col gap-5">
      {/* Back + Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setView("list")}
          className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-800 transition px-2 py-1.5 rounded-lg hover:bg-gray-100"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          목록으로
        </button>
        <div className="h-4 w-px bg-gray-200" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-900">
            {selectedRes.name}
          </h2>
          {(selectedRes.description || selectedRes.location) && (
            <span className="text-sm text-gray-400 truncate">
              {selectedRes.description || selectedRes.location}
            </span>
          )}
        </div>
        {(() => {
          const bld = BUILDINGS.find((b) => b.id === selectedRes.category);
          return bld?.notionUrl ? (
            <a
              href={bld.notionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-blue-300 hover:shadow transition-all"
            >
              이용안내 →
            </a>
          ) : null;
        })()}
      </div>

      {/* Main 2-column layout */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* ── Left: Calendar ── */}
        <div className="lg:w-[320px] shrink-0">
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <p className="text-sm font-bold text-gray-700">날짜 선택</p>
              <p className="text-sm font-bold text-blue-600">
                {format(selectedDate, "yyyy.MM.dd (EEE)", { locale: ko })}
              </p>
            </div>
            <div className="p-3 range-calendar-wrapper">
              <Calendar
                onChange={(val) => {
                  setSelectedDate(val as Date);
                  setSelStart(null);
                  setSelEnd(null);
                }}
                value={selectedDate}
                formatDay={(_, date) => format(date, "d")}
                calendarType="gregory"
                locale="ko-KR"
                minDate={new Date()}
                onActiveStartDateChange={({ activeStartDate }) => {
                  if (activeStartDate) setCalMonth(activeStartDate);
                }}
                tileClassName={({ date, view }) => {
                  if (view !== "month") return null;
                  const ds = format(date, "yyyy-MM-dd");
                  if (HOLIDAYS[ds]) return "holiday-day";
                  if (recurDates.has(ds)) return "recurring-highlight";
                  const hasRsv = monthRsv.some(
                    (r) =>
                      r.resource_id === selectedRes.id &&
                      format(new Date(r.start_at), "yyyy-MM-dd") === ds,
                  );
                  return hasRsv ? "has-reservation" : null;
                }}
              />
            </div>
            {/* Legend */}
            <div className="px-5 pb-4 flex items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />{" "}
                예약있음
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-100 border border-blue-200 inline-block" />{" "}
                오늘
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />{" "}
                선택
              </span>
            </div>
          </div>
        </div>

        {/* ── Right: Time + Form ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Time slot picker */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <p className="text-sm font-bold text-gray-700">시간 선택</p>
              {selStart !== null && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-blue-700">
                    {selEnd !== null
                      ? `${Math.min(selStart, selEnd)}:00 ~ ${Math.max(selStart, selEnd) + 1}:00`
                      : `${selStart}:00 선택됨`}
                  </span>
                  <button
                    onClick={() => {
                      setSelStart(null);
                      setSelEnd(null);
                    }}
                    className="text-xs text-gray-400 hover:text-red-400 transition px-1.5 py-0.5 rounded bg-gray-100 hover:bg-red-50"
                  >
                    초기화
                  </button>
                </div>
              )}
            </div>

            <div className="p-4 space-y-4">
              <p className="text-xs text-gray-400">
                {selStart === null
                  ? "💡 시작 시간을 먼저 클릭하세요"
                  : selEnd === null
                    ? "⏱️ 종료 시간을 클릭하세요 (선택한 시간 +1시간까지 예약됩니다)"
                    : "✅ 범위가 선택되었습니다. 아래에서 예약을 완료하세요."}
              </p>

              {/* AM */}
              <div>
                <p className="text-xs font-bold text-gray-400 mb-2">오전</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {AM_HOURS.map((h) => (
                    <SlotCell key={h} hour={h} />
                  ))}
                </div>
              </div>

              {/* PM */}
              <div>
                <p className="text-xs font-bold text-gray-400 mb-2">오후</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {PM_HOURS.map((h) => (
                    <SlotCell key={h} hour={h} />
                  ))}
                </div>
              </div>

              {/* Color legend */}
              <div className="flex flex-wrap gap-4 pt-3 border-t border-gray-100">
                {[
                  { cls: "bg-blue-600", label: "선택" },
                  { cls: "bg-amber-200", label: "현재 시간" },
                  {
                    cls: "bg-white border border-gray-200",
                    label: "예약 가능",
                  },
                  { cls: "bg-gray-200", label: "예약됨 / 고정" },
                ].map(({ cls, label }) => (
                  <div
                    key={label}
                    className="flex items-center gap-1.5 text-xs text-gray-500"
                  >
                    <div className={`w-3 h-3 rounded ${cls}`} />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Booking form */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
            {/* Summary */}
            {selStart !== null && selEnd !== null && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs font-bold text-blue-700 mb-2">
                  예약 요약
                </p>
                <div className="space-y-1 text-sm text-blue-800">
                  <p>
                    📅{" "}
                    {format(selectedDate, "yyyy년 M월 d일 (EEE)", {
                      locale: ko,
                    })}
                  </p>
                  <p>
                    🕐 {Math.min(selStart, selEnd)}:00 ~{" "}
                    {Math.max(selStart, selEnd) + 1}:00
                    <span className="text-xs text-blue-500 ml-1">
                      ({Math.abs(selEnd - selStart) + 1}시간)
                    </span>
                  </p>
                  <p>📍 {selectedRes.name}</p>
                  {isRecurring && <p>🔁 매주 반복 · {recurEnd}까지</p>}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                사용 목적 <span className="text-red-500">*</span>
              </label>
              <textarea
                placeholder="예: 선지국 회의, 찬양팀 연습..."
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm text-gray-800 resize-none outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 transition bg-gray-50 focus:bg-white"
              />
            </div>

            {/* Recurring toggle */}
            <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100">
              <span className="text-sm font-bold text-gray-700">
                정기 예약 (매주 반복)
              </span>
              <button
                onClick={() => setIsRecurring(!isRecurring)}
                className={`w-11 h-6 rounded-full transition-colors relative ${isRecurring ? "bg-blue-600" : "bg-gray-300"}`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${isRecurring ? "left-6" : "left-1"}`}
                />
              </button>
            </div>
            {isRecurring && (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  반복 종료일 (최대 6개월)
                </label>
                <input
                  type="date"
                  value={recurEnd}
                  onChange={(e) => setRecurEnd(e.target.value)}
                  min={format(new Date(), "yyyy-MM-dd")}
                  max={format(addWeeks(new Date(), 26), "yyyy-MM-dd")}
                  className="w-full border border-gray-200 rounded-xl p-2.5 text-sm bg-white outline-none focus:border-blue-400"
                />
              </div>
            )}

            <button
              onClick={handleReserve}
              disabled={selStart === null || selEnd === null || !purpose.trim()}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-100 disabled:text-gray-400 text-white font-bold rounded-xl transition-all shadow-sm disabled:shadow-none text-sm"
            >
              {selStart === null || selEnd === null
                ? "시간을 먼저 선택하세요"
                : !purpose.trim()
                  ? "사용 목적을 입력해주세요"
                  : "예약 완료"}
            </button>
          </div>

          {/* Selected date reservations */}
          {dateRsv.filter((r) => r.resource_id === selectedRes.id).length >
            0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <p className="text-sm font-bold text-gray-700 mb-3">
                {format(selectedDate, "M월 d일 (EEE)", { locale: ko })} 예약
                현황
              </p>
              <div className="space-y-2">
                {dateRsv
                  .filter((r) => r.resource_id === selectedRes.id)
                  .sort(
                    (a, b) =>
                      new Date(a.start_at).getTime() -
                      new Date(b.start_at).getTime(),
                  )
                  .map((r) => (
                    <div
                      key={r.id}
                      onClick={() =>
                        r.user_id === currentUser && setDetailRsv(r)
                      }
                      className={`flex items-center justify-between p-3 rounded-xl border transition ${r.user_id === currentUser ? "border-blue-100 bg-blue-50 cursor-pointer hover:bg-blue-100" : "border-gray-100 bg-gray-50"}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-500 tabular-nums">
                          {format(new Date(r.start_at), "H:mm")}~
                          {format(new Date(r.end_at), "H:mm")}
                        </span>
                        <span className="text-sm text-gray-800">
                          {r.purpose}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {r.group_id && (
                          <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold">
                            정기
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {r.reservee_name || r.profiles?.full_name}
                        </span>
                        {r.user_id === currentUser && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">
                            내 예약
                          </span>
                        )}
                        {/* 카카오톡 공유 복사 버튼 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyShareText(
                              r,
                              resources.find((res) => res.id === r.resource_id)?.name ?? selectedRes?.name ?? "",
                            );
                          }}
                          title="카카오톡 공유용 복사"
                          className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 transition"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-7xl mx-auto p-2 pb-14">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            시설 예약
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">공간 예약 및 시설 관리</p>
        </div>
        <button
          onClick={() => setShowExcel(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs transition shadow-sm"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span className="hidden sm:inline">엑셀 업로드</span>
        </button>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : view === "list" ? (
        ListView
      ) : (
        BookView
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={!!detailRsv}
        onClose={() => setDetailRsv(null)}
        title="예약 상세"
        footer={null}
      >
        {detailRsv && (
          <div className="space-y-6 pt-2">
            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xl">
                {(detailRsv.reservee_name || detailRsv.profiles?.full_name)?.slice(0, 1)}
              </div>
              <div>
                <div className="font-bold text-gray-900 text-lg">
                  {detailRsv.reservee_name || detailRsv.profiles?.full_name}
                </div>
                <div className="text-sm text-gray-500">
                  {detailRsv.profiles?.position}
                </div>
              </div>
              {detailRsv.group_id && (
                <span className="ml-auto bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">
                  정기예약
                </span>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex">
                <span className="w-16 text-gray-400 text-sm">장소</span>
                <span className="font-bold text-gray-900">
                  {resources.find((r) => r.id === detailRsv.resource_id)?.name}
                </span>
              </div>
              <div className="flex">
                <span className="w-16 text-gray-400 text-sm">시간</span>
                <span className="font-bold text-blue-700">
                  {format(new Date(detailRsv.start_at), "yyyy.MM.dd HH:mm")} ~{" "}
                  {format(new Date(detailRsv.end_at), "HH:mm")}
                </span>
              </div>
              <div className="flex">
                <span className="w-16 text-gray-400 text-sm">목적</span>
                <span className="text-gray-900 whitespace-pre-wrap">
                  {detailRsv.purpose}
                </span>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-4 space-y-2">
              {detailRsv.user_id === currentUser &&
                (detailRsv.group_id ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancelOne}
                      className="flex-1 bg-red-50 text-red-600 py-3 rounded-xl font-bold hover:bg-red-100 transition text-sm"
                    >
                      이 예약만 취소
                    </button>
                    <button
                      onClick={handleCancelAll}
                      className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition text-sm"
                    >
                      전체 일정 취소
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleCancelOne}
                    className="w-full bg-red-50 text-red-600 py-3 rounded-xl font-bold hover:bg-red-100 transition"
                  >
                    예약 취소
                  </button>
                ))}
              <button
                onClick={() => setDetailRsv(null)}
                className="w-full bg-gray-100 text-gray-600 py-3 rounded-xl font-bold hover:bg-gray-200 transition"
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Excel Modal */}
      <ExcelUploadModal
        isOpen={showExcel}
        onClose={() => setShowExcel(false)}
        resources={resources}
        onSuccess={fetchInitial}
        currentUserId={currentUser ?? ""}
      />

      {/* ── 예약된 슬롯 팝오버 ────────────────────────────────────────────── */}
      {slotPopover &&
        typeof window !== "undefined" &&
        createPortal(
          <>
            {/* 외부 클릭 닫기 */}
            <div
              className="fixed inset-0"
              style={{ zIndex: 99998 }}
              onClick={() => setSlotPopover(null)}
            />
            {/* 팝오버 카드 */}
            <div
              className="fixed bg-white rounded-2xl shadow-2xl w-[272px] overflow-hidden border border-gray-100"
              style={{
                zIndex: 99999,
                top: Math.max(
                  16,
                  Math.min(slotPopover.y - 10, window.innerHeight - 220),
                ),
                left:
                  slotPopover.x + 288 < window.innerWidth
                    ? slotPopover.x + 8
                    : slotPopover.x - 280,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="px-5 py-4 bg-blue-50 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-blue-500 uppercase mb-1">
                    {format(
                      new Date(slotPopover.rsv.start_at),
                      "M월 d일 (EEE)",
                      { locale: ko },
                    )}{" "}
                    · 예약됨
                  </p>
                  <p className="text-base font-extrabold text-gray-900 leading-snug">
                    {slotPopover.rsv.reservee_name || slotPopover.rsv.profiles?.full_name || "예약자"}
                  </p>
                  {slotPopover.rsv.profiles?.position && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {slotPopover.rsv.profiles.position}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSlotPopover(null)}
                  className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full hover:bg-black/10 transition text-gray-400"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              {/* 본문 */}
              <div className="px-5 py-4 space-y-2.5">
                <div className="flex items-start gap-3">
                  <span className="text-xs text-gray-400 w-10 shrink-0 pt-0.5">
                    시간
                  </span>
                  <span className="text-sm text-gray-800 font-semibold tabular-nums">
                    {format(new Date(slotPopover.rsv.start_at), "HH:mm")} ~{" "}
                    {format(new Date(slotPopover.rsv.end_at), "HH:mm")}
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-xs text-gray-400 w-10 shrink-0 pt-0.5">
                    목적
                  </span>
                  <span className="text-sm text-gray-800 font-medium leading-snug">
                    {slotPopover.rsv.purpose}
                  </span>
                </div>
                {slotPopover.rsv.group_id && (
                  <div className="flex items-center gap-1.5 pt-2 border-t border-gray-100">
                    <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold">
                      정기예약
                    </span>
                    <span className="text-xs text-gray-400">매주 반복</span>
                  </div>
                )}
                {/* 카카오톡 공유 복사 버튼 */}
                <button
                  onClick={() => {
                    copyShareText(
                      slotPopover.rsv,
                      resources.find((r) => r.id === slotPopover.rsv.resource_id)?.name ?? "",
                    );
                    setSlotPopover(null);
                  }}
                  className="w-full mt-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-yellow-50 hover:bg-yellow-100 text-yellow-700 font-bold text-xs transition border border-yellow-200"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  카카오톡 공유용 복사
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
