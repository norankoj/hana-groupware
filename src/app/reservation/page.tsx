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
  subWeeks,
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
  reservee_name?: string | null;
  reservee_phone?: string | null;
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
  const [currentUserName, setCurrentUserName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // views
  const [view, setView] = useState<"list" | "book" | "weekly">("list");

  // list view – today's bars
  const [todayRsv, setTodayRsv] = useState<Reservation[]>([]);

  // book view
  const [selectedRes, setSelectedRes] = useState<Resource | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calMonth, setCalMonth] = useState<Date>(new Date());
  const [dateRsv, setDateRsv] = useState<Reservation[]>([]);
  const [monthRsv, setMonthRsv] = useState<Reservation[]>([]);

  // weekly view
  const [weeklyBld, setWeeklyBld] = useState<string | null>(null);
  const [weeklySelectedResId, setWeeklySelectedResId] = useState<number | null>(
    null,
  );
  const [weeklyWeekStart, setWeeklyWeekStart] = useState<Date>(
    startOfWeek(new Date(), { weekStartsOn: 0 }),
  );
  const [weeklyRsv, setWeeklyRsv] = useState<Reservation[]>([]);

  // time selection
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);

  // form
  const [purpose, setPurpose] = useState("");
  const [reserveeName, setReserveeName] = useState(""); // 담당자 (사용하는 사람)
  const [reserveePhone, setReserveePhone] = useState(""); // 담당자 연락처 (선택)
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurEnd, setRecurEnd] = useState(
    format(addWeeks(new Date(), 4), "yyyy-MM-dd"),
  );

  // modals
  const [detailRsv, setDetailRsv] = useState<Reservation | null>(null);
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [editPurpose, setEditPurpose] = useState("");
  const [editReserveeName, setEditReserveeName] = useState("");
  const [editReserveePhone, setEditReserveePhone] = useState("");
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
    if (user) {
      setCurrentUser(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", user.id)
        .single();
      setIsAdmin(profile?.role === "admin");
      setCurrentUserName(profile?.full_name ?? "");
    }

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

  const fetchWeeklyRsv = async () => {
    if (!weeklyBld) return;
    const weekEnd = endOfWeek(weeklyWeekStart, { weekStartsOn: 0 });
    const bldResIds = resources
      .filter((r) => r.category === weeklyBld)
      .map((r) => r.id);

    if (bldResIds.length > 0) {
      const { data } = await supabase
        .from("reservations")
        .select("*, profiles:user_id(full_name, position)")
        .in("resource_id", bldResIds)
        .gte("start_at", weeklyWeekStart.toISOString())
        .lte("end_at", weekEnd.toISOString())
        .neq("status", "cancelled");
      setWeeklyRsv(data ? (data as any) : []);
    } else {
      setWeeklyRsv([]);
    }
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
    if (view === "weekly") fetchWeeklyRsv();
  }, [view, weeklyBld, weeklyWeekStart, resources]);

  useEffect(() => {
    setSlotPopover(null);
  }, [selectedDate, view, weeklyWeekStart]);

  // ── open views ─────────────────────────────────────────────────────────────
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

  const openWeekly = (bldId: string) => {
    setWeeklyBld(bldId);
    setWeeklyWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));

    if (bldId !== "church") {
      const bldRes = resources.filter((r) => r.category === bldId);
      setWeeklySelectedResId(bldRes.length > 0 ? bldRes[0].id : null);
    } else {
      setWeeklySelectedResId(null);
    }

    setView("weekly");
  };

  // ── hour click (Book View) ─────────────────────────────────────────────────
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
      setSelEnd(hour);
    } else {
      setSelStart(hour);
      setSelEnd(null);
    }
  };

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

  const copyShareText = (
    rsv: { start_at: string; end_at: string; purpose: string },
    resourceName: string,
  ) => {
    const dateStr = format(new Date(rsv.start_at), "yyyy년 M월 d일 (EEE)", {
      locale: ko,
    });
    const startTime = format(new Date(rsv.start_at), "HH:mm");
    const endTime = format(new Date(rsv.end_at), "HH:mm");
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
    if (!reserveeName.trim()) return toast.error("담당자를 입력해주세요.");
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
          reservee_name: reserveeName.trim(),
          ...(reserveePhone.trim() ? { reservee_phone: reserveePhone.trim() } : {}),
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
        reservee_name: reserveeName.trim(),
        ...(reserveePhone.trim() ? { reservee_phone: reserveePhone.trim() } : {}),
      });
    }

    if (!(await showConfirm(`${toInsert.length}건 예약을 진행하시겠습니까?`)))
      return;
    const { error } = await supabase.from("reservations").insert(toInsert);
    if (error) toast.error("예약 실패: " + error.message);
    else {
      if (!isRecurring && toInsert.length === 1) {
        toast(
          (t) => (
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold">예약되었습니다! 🎉</span>
              <button
                onClick={() => {
                  copyShareText(
                    {
                      start_at: toInsert[0].start_at,
                      end_at: toInsert[0].end_at,
                      purpose: toInsert[0].purpose,
                    },
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
      setReserveeName("");
      setReserveePhone("");
      fetchDateRsv(selectedDate);
      fetchMonthRsv(calMonth);
      fetchInitial();
    }
  };

  // ── cancel ─────────────────────────────────────────────────────────────────
  const handleCancelOne = async () => {
    if (!detailRsv) return;
    if (!(await showConfirm("이 예약을 취소하시겠습니까?"))) return;

    const isOtherUser = detailRsv.user_id !== currentUser;
    let failed = false;

    if (isAdmin && isOtherUser) {
      const res = await fetch("/api/reservation/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: detailRsv.id }),
      });
      if (!res.ok) failed = true;
    } else {
      const { error } = await supabase
        .from("reservations")
        .update({ status: "cancelled" })
        .eq("id", detailRsv.id);
      if (error) failed = true;
    }

    if (failed) toast.error("취소 실패");
    else {
      toast.success("취소되었습니다.");
      setDetailRsv(null);
      fetchDateRsv(selectedDate);
      fetchMonthRsv(calMonth);
      if (view === "weekly") fetchWeeklyRsv();
      fetchInitial();
    }
  };

  const handleCancelAll = async () => {
    if (!detailRsv?.group_id) return;
    if (!(await showConfirm("정기 예약 전체를 취소하시겠습니까?"))) return;

    const isOtherUser = detailRsv.user_id !== currentUser;
    let failed = false;

    if (isAdmin && isOtherUser) {
      const res = await fetch("/api/reservation/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelAll: true, groupId: detailRsv.group_id }),
      });
      if (!res.ok) failed = true;
    } else {
      const { error } = await supabase
        .from("reservations")
        .update({ status: "cancelled" })
        .eq("group_id", detailRsv.group_id);
      if (error) failed = true;
    }

    if (failed) toast.error("전체 취소 실패");
    else {
      toast.success("전체 일정이 취소되었습니다.");
      setDetailRsv(null);
      fetchDateRsv(selectedDate);
      fetchMonthRsv(calMonth);
      if (view === "weekly") fetchWeeklyRsv();
      fetchInitial();
    }
  };

  // ── edit ───────────────────────────────────────────────────────────────────
  const handleEditSave = async () => {
    if (!detailRsv) return;
    if (!editReserveeName.trim()) return toast.error("담당자를 입력해주세요.");
    if (!editPurpose.trim()) return toast.error("사용 목적을 입력해주세요.");
    const { error } = await supabase
      .from("reservations")
      .update({
        purpose: editPurpose.trim(),
        reservee_name: editReserveeName.trim(),
        reservee_phone: editReserveePhone.trim() || null,
      })
      .eq("id", detailRsv.id);
    if (error) return toast.error("수정 실패: " + error.message);
    toast.success("수정되었습니다.");
    setDetailEditMode(false);
    setDetailRsv(null);
    fetchDateRsv(selectedDate);
    fetchMonthRsv(calMonth);
    if (view === "weekly") fetchWeeklyRsv();
    fetchInitial();
  };

  // ── availability bar segments for list view ────────────────────────────────
  const barSegments = (resId: number, resName: string) =>
    HOURS.map((h) => slotStatus(h, new Date(), resName, todayRsv, resId));

  const todayPeriods = (resId: number) =>
    todayRsv
      .filter((r) => r.resource_id === resId)
      .map(
        (r) =>
          `${format(new Date(r.start_at), "H")}~${format(new Date(r.end_at), "H")}시`,
      )
      .join(", ");

  // ─────────────────────────────────────────────────────────────────────────
  // Slot Cell Component (Book View)
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
  // WEEKLY VIEW HELPERS (Absolute Overlay)
  // ─────────────────────────────────────────────────────────────────────────
  const getWeeklyDayEvents = (date: Date) => {
    if (!weeklyBld) return [];
    let bldRes = resources.filter((r) => r.category === weeklyBld);

    // 교회는 전체 표출, 교육관은 선택된 탭 공간만 표출
    if (weeklyBld !== "church" && weeklySelectedResId) {
      bldRes = bldRes.filter((r) => r.id === weeklySelectedResId);
    }

    const items: {
      type: "fixed" | "rsv";
      resName: string;
      label: string;
      startH: number;
      endH: number;
      rsv?: Reservation;
    }[] = [];

    bldRes.forEach((res) => {
      // 1. 고정 일정 (교회 한정)
      if (res.name.includes("본당")) {
        const dow = getDay(date);
        if (dow === 0)
          items.push({
            type: "fixed",
            resName: res.name,
            label: "주일예배",
            startH: 8,
            endH: 17,
          });
        if (dow === 5)
          items.push({
            type: "fixed",
            resName: res.name,
            label: "금요예배",
            startH: 19,
            endH: 23,
          });
      }

      // 2. 실제 예약 일정
      const hits = weeklyRsv.filter((r) => {
        if (r.resource_id !== res.id) return false;
        return (
          format(new Date(r.start_at), "yyyy-MM-dd") ===
          format(date, "yyyy-MM-dd")
        );
      });

      hits.forEach((h) => {
        let sHour =
          getHours(new Date(h.start_at)) +
          new Date(h.start_at).getMinutes() / 60;
        let eHour =
          getHours(new Date(h.end_at)) + new Date(h.end_at).getMinutes() / 60;

        // 종료 시간이 자정이거나 다음날로 넘어갈 경우 끝 시간(23시)까지 꽉 채움
        if (
          new Date(h.end_at).getDate() !== new Date(h.start_at).getDate() ||
          eHour === 0
        ) {
          eHour = 23;
        }

        const startH = Math.max(START_HOUR, sHour);
        const endH = Math.min(END_HOUR, Math.max(startH + 0.5, eHour)); // 최소 30분 높이 보장

        if (startH < END_HOUR && endH > START_HOUR) {
          items.push({
            type: "rsv",
            resName: res.name,
            label: h.purpose,
            startH,
            endH,
            rsv: h,
          });
        }
      });
    });

    // 시간순 정렬 (겹치는 레이아웃 계산을 위함)
    items.sort((a, b) => a.startH - b.startH);
    return items;
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
              <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between min-w-0 gap-2">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {bld.label}
                  </h2>
                  <p className="text-xs text-gray-400">{bld.desc}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openWeekly(bld.id);
                    }}
                    className="flex items-center gap-1.5 text-xs text-blue-600 font-bold bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-1.5 rounded-lg transition-all shadow-sm shrink-0"
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
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    주간 시간표
                  </button>
                  {bld.notionUrl && (
                    <a
                      href={bld.notionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-all shrink-0 shadow-sm"
                    >
                      이용안내 →
                    </a>
                  )}
                </div>
              </div>
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

                    {periods ? (
                      <p className="text-xs text-red-500 -mt-1">
                        🔴 예약된 시간대: {periods}
                      </p>
                    ) : (
                      <p className="text-xs text-emerald-500 -mt-1">
                        🟢 오늘 예약 없음
                      </p>
                    )}
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
  // WEEKLY VIEW
  // ─────────────────────────────────────────────────────────────────────────
  const WeeklyView = weeklyBld && (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Back + Title */}
      <div className="flex flex-wrap items-center gap-3">
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
        <div className="h-4 w-px bg-gray-200 hidden sm:block" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-900">
            {BUILDINGS.find((b) => b.id === weeklyBld)?.label} 주간 시간표
          </h2>
        </div>
      </div>

      {/* Week Controls & Location Tabs (Same Line) */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white px-5 py-3.5 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border border-gray-200 rounded-xl p-1 bg-gray-50">
            <button
              onClick={() => setWeeklyWeekStart(subWeeks(weeklyWeekStart, 1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm text-gray-500 transition"
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
            </button>
            <span className="text-[13px] font-bold text-gray-800 tabular-nums px-1">
              {format(weeklyWeekStart, "MM.dd")} ~{" "}
              {format(endOfWeek(weeklyWeekStart), "MM.dd")}
            </span>
            <button
              onClick={() => setWeeklyWeekStart(addWeeks(weeklyWeekStart, 1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm text-gray-500 transition"
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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
          <button
            onClick={() =>
              setWeeklyWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))
            }
            className="px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
          >
            이번 주
          </button>
        </div>

        {/* 장소(공간) 선택 탭 */}
        {weeklyBld !== "church" && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide max-w-full">
            {resources
              .filter((r) => r.category === weeklyBld)
              .map((res) => (
                <button
                  key={res.id}
                  onClick={() => setWeeklySelectedResId(res.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    weeklySelectedResId === res.id
                      ? "bg-gray-800 text-white shadow-sm"
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 border border-gray-200/60"
                  }`}
                >
                  {res.name}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Timetable Grid (Absolute Positioned Events) */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto shadow-sm">
        <div className="min-w-[800px] flex flex-col text-sm text-gray-700">
          {/* Header Row */}
          <div className="flex border-b border-gray-200 bg-gray-50">
            <div className="w-[60px] shrink-0 border-r border-gray-200 p-2 flex items-center justify-center text-xs font-bold text-gray-500">
              시간
            </div>
            {Array.from({ length: 7 }).map((_, i) => {
              const d = addDays(weeklyWeekStart, i);
              const isTodayDt = isToday(d);
              const isWeekend = getDay(d) === 0 || getDay(d) === 6;
              return (
                <div
                  key={i}
                  className={`flex-1 p-2 border-r border-gray-200 text-center ${isTodayDt ? "bg-blue-50/50 text-blue-700" : ""}`}
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      className={`text-sm font-bold ${isTodayDt ? "" : isWeekend ? "text-red-500" : "text-gray-700"}`}
                    >
                      {format(d, "EEE", { locale: ko })}
                    </span>
                    <span className="text-[11px] font-medium opacity-70">
                      {format(d, "MM.dd")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grid Body */}
          <div className="flex relative">
            {/* Time Axis Column */}
            <div className="w-[60px] shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="h-10 border-b border-gray-200 flex items-center justify-center text-[11px] font-bold text-gray-400"
                >
                  {hour}:00
                </div>
              ))}
            </div>

            {/* Day Columns */}
            {Array.from({ length: 7 }).map((_, dayIdx) => {
              const d = addDays(weeklyWeekStart, dayIdx);
              const events = getWeeklyDayEvents(d);
              const isTodayDt = isToday(d);

              return (
                <div
                  key={dayIdx}
                  className={`flex-1 border-r border-gray-200 relative group min-w-[100px] ${isTodayDt ? "bg-blue-50/10" : ""}`}
                >
                  {/* Background Lines */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="h-10 border-b border-gray-100 group-hover:bg-gray-50/50 transition-colors"
                    />
                  ))}

                  {/* Absolute Events Overlay */}
                  {events.map((evt, eIdx) => {
                    // 1시간 = 40px (h-10)
                    const top = (evt.startH - START_HOUR) * 40;
                    const height = (evt.endH - evt.startH) * 40;

                    // 겹치는 일정 처리 로직
                    const overlapping = events.filter(
                      (e) =>
                        Math.max(evt.startH, e.startH) <
                        Math.min(evt.endH, e.endH),
                    );
                    const overlapCount = Math.max(1, overlapping.length);
                    const overlapIndex = overlapping.findIndex(
                      (e) => e === evt,
                    );
                    const width = `calc(${100 / overlapCount}% - 6px)`;
                    const left = `calc(${overlapIndex * (100 / overlapCount)}% + 3px)`;

                    return (
                      <div
                        key={eIdx}
                        style={{ top, height, left, width }}
                        className={`absolute p-1.5 rounded-lg text-[11px] leading-tight shadow-sm overflow-hidden flex flex-col gap-0.5 border transition-all cursor-pointer z-10 hover:z-20 ${
                          evt.type === "fixed"
                            ? "bg-gray-100/95 text-gray-500 border-gray-200"
                            : "bg-blue-50/95 text-blue-800 border-blue-200 hover:border-blue-400 hover:shadow-md"
                        }`}
                        onClick={(e) => {
                          if (evt.type === "rsv" && evt.rsv) {
                            const rect =
                              e.currentTarget.getBoundingClientRect();
                            setSlotPopover({
                              rsv: evt.rsv,
                              x: rect.left,
                              y: rect.top,
                            });
                          }
                        }}
                      >
                        {weeklyBld === "church" ? (
                          <>
                            <span className="font-extrabold truncate opacity-90">
                              {evt.resName}
                            </span>
                            <span className="truncate text-[10px] text-gray-600">
                              {evt.label}
                            </span>
                          </>
                        ) : (
                          <span className="font-extrabold whitespace-normal line-clamp-3 opacity-90 leading-snug">
                            {evt.label}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // BOOK VIEW
  // ─────────────────────────────────────────────────────────────────────────
  const BookView = selectedRes && (
    <div className="flex flex-col gap-5">
      {/* Back + Title */}
      <div className="flex flex-wrap items-center gap-3">
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
        <div className="h-4 w-px bg-gray-200 hidden sm:block" />
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
                    ? "⏱️ 종료 시간을 클릭하세요 · 시작 시간을 다시 클릭하면 1시간 예약 (종료 시간은 해당 시간까지 사용)"
                    : "✅ 범위가 선택되었습니다. 아래에서 예약을 완료하세요."}
              </p>
              <div>
                <p className="text-xs font-bold text-gray-400 mb-2">오전</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {AM_HOURS.map((h) => (
                    <SlotCell key={h} hour={h} />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 mb-2">오후</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {PM_HOURS.map((h) => (
                    <SlotCell key={h} hour={h} />
                  ))}
                </div>
              </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  예약자
                </label>
                <input
                  type="text"
                  value={currentUserName}
                  disabled
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  담당자 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="사용하는 사람 이름"
                  value={reserveeName}
                  onChange={(e) => setReserveeName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 transition"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">
                담당자 번호 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <input
                type="tel"
                placeholder="010-0000-0000"
                value={reserveePhone}
                onChange={(e) => setReserveePhone(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 transition"
              />
            </div>
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
                        (r.user_id === currentUser || isAdmin) && setDetailRsv(r)
                      }
                      className={`flex items-center justify-between p-3 rounded-xl border transition ${r.user_id === currentUser || isAdmin ? "border-blue-100 bg-blue-50 cursor-pointer hover:bg-blue-100" : "border-gray-100 bg-gray-50"}`}
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyShareText(
                              r,
                              resources.find((res) => res.id === r.resource_id)
                                ?.name ??
                                selectedRes?.name ??
                                "",
                            );
                          }}
                          title="카카오톡 공유용 복사"
                          className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 transition"
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
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
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
      ) : view === "weekly" ? (
        WeeklyView
      ) : (
        BookView
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={!!detailRsv}
        onClose={() => { setDetailRsv(null); setDetailEditMode(false); }}
        title={detailEditMode ? "예약 수정" : "예약 상세"}
        footer={null}
      >
        {detailRsv && (
          <div className="space-y-6 pt-2">
            {/* 헤더 — 이름 (직책 제거) */}
            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xl shrink-0">
                {(detailRsv.reservee_name || detailRsv.profiles?.full_name)?.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900 text-lg">
                  {detailRsv.reservee_name || detailRsv.profiles?.full_name}
                </div>
                {detailRsv.reservee_name && detailRsv.profiles?.full_name && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    예약자: {detailRsv.profiles.full_name}
                  </div>
                )}
              </div>
              {detailRsv.group_id && (
                <span className="shrink-0 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">
                  정기예약
                </span>
              )}
            </div>

            {detailEditMode ? (
              /* ── 수정 모드 ── */
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">예약자</label>
                    <input
                      type="text"
                      value={detailRsv.profiles?.full_name ?? ""}
                      disabled
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">
                      담당자 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="사용하는 사람 이름"
                      value={editReserveeName}
                      onChange={(e) => setEditReserveeName(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 transition"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">
                    담당자 번호 <span className="text-gray-400 font-normal">(선택)</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="010-0000-0000"
                    value={editReserveePhone}
                    onChange={(e) => setEditReserveePhone(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">사용 목적</label>
                  <textarea
                    value={editPurpose}
                    onChange={(e) => setEditPurpose(e.target.value)}
                    rows={3}
                    className="w-full border border-gray-200 rounded-xl p-3 text-sm text-gray-800 resize-none outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 transition bg-gray-50 focus:bg-white"
                  />
                </div>
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => setDetailEditMode(false)}
                    className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold hover:bg-gray-200 transition text-sm"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleEditSave}
                    className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-500 transition text-sm"
                  >
                    저장
                  </button>
                </div>
              </div>
            ) : (
              /* ── 상세 보기 모드 ── */
              <>
                <div className="space-y-3">
                  <div className="flex">
                    <span className="w-16 text-gray-400 text-sm shrink-0">장소</span>
                    <span className="font-bold text-gray-900">
                      {resources.find((r) => r.id === detailRsv.resource_id)?.name}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-16 text-gray-400 text-sm shrink-0">시간</span>
                    <span className="font-bold text-blue-700">
                      {format(new Date(detailRsv.start_at), "yyyy.MM.dd HH:mm")} ~{" "}
                      {format(new Date(detailRsv.end_at), "HH:mm")}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-16 text-gray-400 text-sm shrink-0">목적</span>
                    <span className="text-gray-900 whitespace-pre-wrap">
                      {detailRsv.purpose}
                    </span>
                  </div>
                  {detailRsv.reservee_phone && (
                    <div className="flex">
                      <span className="w-16 text-gray-400 text-sm shrink-0">연락처</span>
                      <span className="text-gray-900">{detailRsv.reservee_phone}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-gray-100 pt-4 space-y-2">
                  {(detailRsv.user_id === currentUser || isAdmin) && (
                    <button
                      onClick={() => {
                        setEditPurpose(detailRsv.purpose);
                        setEditReserveeName(detailRsv.reservee_name ?? "");
                        setEditReserveePhone(detailRsv.reservee_phone ?? "");
                        setDetailEditMode(true);
                      }}
                      className="w-full bg-blue-50 text-blue-700 py-3 rounded-xl font-bold hover:bg-blue-100 transition text-sm"
                    >
                      예약 수정
                    </button>
                  )}
                  {(detailRsv.user_id === currentUser || isAdmin) &&
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
                    onClick={() => { setDetailRsv(null); setDetailEditMode(false); }}
                    className="w-full bg-gray-100 text-gray-600 py-3 rounded-xl font-bold hover:bg-gray-200 transition"
                  >
                    닫기
                  </button>
                </div>
              </>
            )}
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
            <div
              className="fixed inset-0"
              style={{ zIndex: 99998 }}
              onClick={() => setSlotPopover(null)}
            />
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
                    {slotPopover.rsv.reservee_name ||
                      slotPopover.rsv.profiles?.full_name ||
                      "예약자"}
                  </p>
                  {slotPopover.rsv.reservee_name && slotPopover.rsv.profiles?.full_name && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      예약자: {slotPopover.rsv.profiles.full_name}
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
              <div className="px-5 py-4 space-y-2.5">
                <div className="flex items-start gap-3">
                  <span className="text-xs text-gray-400 w-10 shrink-0 pt-0.5">
                    장소
                  </span>
                  <span className="text-sm text-gray-800 font-semibold truncate">
                    {
                      resources.find(
                        (r) => r.id === slotPopover.rsv.resource_id,
                      )?.name
                    }
                  </span>
                </div>
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
                <button
                  onClick={() => {
                    copyShareText(
                      slotPopover.rsv,
                      resources.find(
                        (r) => r.id === slotPopover.rsv.resource_id,
                      )?.name ?? "",
                    );
                    setSlotPopover(null);
                  }}
                  className="w-full mt-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-yellow-50 hover:bg-yellow-100 text-yellow-700 font-bold text-xs transition border border-yellow-200"
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
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  카카오톡 공유용 복사
                </button>
                {(slotPopover.rsv.user_id === currentUser || isAdmin) && (
                  <>
                    <button
                      onClick={() => {
                        const rsv = slotPopover.rsv;
                        setEditPurpose(rsv.purpose);
                        setEditReserveeName(rsv.reservee_name ?? "");
                        setEditReserveePhone(rsv.reservee_phone ?? "");
                        setDetailRsv(rsv);
                        setDetailEditMode(true);
                        setSlotPopover(null);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-xs transition border border-blue-200"
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
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                      예약 수정
                    </button>
                    <button
                      onClick={() => {
                        setDetailRsv(slotPopover.rsv);
                        setSlotPopover(null);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs transition border border-red-200"
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
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                      예약 취소
                    </button>
                  </>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
