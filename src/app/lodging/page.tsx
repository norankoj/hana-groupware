"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "@/styles/calendar.css";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ko } from "date-fns/locale";
import toast from "react-hot-toast";
import { showConfirm } from "@/utils/alert";
import { HOLIDAYS } from "@/constants/holidays";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import { btnStyles } from "@/components/fund/shared";

// 안식관/선교관 — resources.category = 'lodging', 예약은 reservations 를 그대로 쓴다.
// start_at = 입실, end_at = 퇴실. 선교관은 구글 캘린더 일정도 함께 보여준다(읽기 전용).

type Room = {
  id: number;
  name: string;
  description: string | null; // 구분: 안식관 / 선교관
  color: string | null;
  location: string | null; // 예: 교회 옆
  guide_url: string | null; // 이용 안내문 (노션)
};
type Stay = {
  id: number | string;
  resource_id: number;
  user_id?: string;
  start_at: string;
  end_at: string;
  purpose: string;
  reservee_name?: string | null;
  reservee_phone?: string | null;
  profiles?: { full_name: string } | null;
  google?: boolean; // 구글 캘린더에서 가져온 일정
};
type Form = {
  id?: number | string;
  resource_id: number | null;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  name: string;
  phone: string;
  purpose: string;
};

const GOOGLE_CAL_NAME = "선교관(기도사역)";
const DEFAULT_IN = "16:00";
const DEFAULT_OUT = "14:00";
const FALLBACK_COLOR = "#6366f1";

const inputCls =
  "w-full border border-line rounded-xl px-3 py-2.5 text-sm bg-table-header focus:bg-white outline-none focus:border-primary focus:ring-1 focus:ring-primary-soft transition";
const labelCls = "block text-sm font-bold text-gray-700 mb-1.5";

const fmt = (iso: string) =>
  format(new Date(iso), "M.d (EEE) HH:mm", { locale: ko });
const guestOf = (s: Stay) =>
  s.reservee_name || s.profiles?.full_name || s.purpose || "사용자";
const nightsOf = (s: Stay) =>
  differenceInCalendarDays(new Date(s.end_at), new Date(s.start_at));
const isMission = (r?: Room) => r?.description === "선교관";

// 시 단위 선택지 (분은 쓰지 않는다) — 공용 Select 드롭다운에 넘긴다
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: `${String(h).padStart(2, "0")}:00`,
  label: `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}시`,
}));

const emptyForm = (resource_id: number | null, day = new Date()): Form => ({
  resource_id,
  startDate: format(day, "yyyy-MM-dd"),
  startTime: DEFAULT_IN,
  endDate: format(addDays(day, 1), "yyyy-MM-dd"),
  endTime: DEFAULT_OUT,
  name: "",
  phone: "",
  purpose: "",
});

export default function LodgingPage() {
  const supabase = createClient();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [googleStays, setGoogleStays] = useState<Stay[]>([]);
  const [googleFailed, setGoogleFailed] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(startOfMonth(new Date()));

  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<Stay | null>(null);
  const [calView, setCalView] = useState<"timeline" | "month">("timeline");
  const [dayOpen, setDayOpen] = useState<Date | null>(null);
  const [calOpen, setCalOpen] = useState<"start" | "end" | null>(null);

  const missionRoom = rooms.find((r) => isMission(r));

  // 달력 범위 + 현황 카드(지금 ~ 90일)를 한 번에 가져온다
  const range = useMemo(() => {
    const now = startOfDay(new Date());
    const ms = month < now ? month : now;
    const me0 = addMonths(month, 1);
    const me1 = addDays(now, 90);
    return { start: ms, end: me0 > me1 ? me0 : me1 };
  }, [month]);

  const fetchStays = async (roomIds: number[]) => {
    if (roomIds.length === 0) return setStays([]);
    const { data } = await supabase
      .from("reservations")
      .select("*, profiles:user_id(full_name)")
      .in("resource_id", roomIds)
      .neq("status", "cancelled")
      .lt("start_at", range.end.toISOString())
      .gt("end_at", range.start.toISOString())
      .order("start_at");
    setStays((data as Stay[]) ?? []);
  };

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser(user.id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        setIsAdmin(profile?.role === "admin");
      }
      const { data } = await supabase
        .from("resources")
        .select("id, name, description, color, location, guide_url")
        .eq("category", "lodging")
        .eq("is_active", true)
        .order("id");
      setRooms(data ?? []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (rooms.length) fetchStays(rooms.map((r) => r.id));
  }, [rooms, range]);

  // 구글 캘린더 「선교관(기도사역)」 → 선교관 일정으로 변환
  useEffect(() => {
    if (!missionRoom) return;
    fetch("/api/calendar")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(({ events }) => {
        setGoogleStays(
          (events ?? [])
            .filter((e: any) => e.calendarName === GOOGLE_CAL_NAME)
            .map((e: any) => ({
              id: `g_${e.id}`,
              resource_id: missionRoom.id,
              // 종일 일정은 'yyyy-MM-dd' — parseISO 로 현지 자정 기준으로 맞춘다
              start_at: parseISO(e.start).toISOString(),
              end_at: parseISO(e.end).toISOString(),
              purpose: e.title,
              reservee_name: e.title,
              google: true,
            })),
        );
      })
      // 구글을 못 불러오면 선교관 겹침 확인이 반쪽이 되므로 예약 창에 경고를 띄운다
      .catch(() => setGoogleFailed(true));
  }, [missionRoom?.id]);

  const allStays = useMemo(
    () =>
      [...stays, ...googleStays].sort(
        (a, b) => +new Date(a.start_at) - +new Date(b.start_at),
      ),
    [stays, googleStays],
  );

  const refresh = () => fetchStays(rooms.map((r) => r.id));
  const canEdit = (s: Stay) =>
    !s.google && (s.user_id === currentUser || isAdmin);

  // ── 저장 (등록 / 수정) ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form) return;
    const room = rooms.find((r) => r.id === form.resource_id);
    if (!room) return toast.error("숙소를 선택해주세요.");
    if (!form.name.trim()) return toast.error("사용하시는 분을 입력해주세요.");
    const start = new Date(`${form.startDate}T${form.startTime}`);
    const end = new Date(`${form.endDate}T${form.endTime}`);
    if (isNaN(+start) || isNaN(+end))
      return toast.error("입실/퇴실 일시를 확인해주세요.");
    if (end <= start) return toast.error("퇴실은 입실 이후여야 합니다.");

    setSaving(true);
    // 겹침 확인 — 퇴실 14시 / 다음 입실 16시처럼 시각 단위로 판단한다
    let q = supabase
      .from("reservations")
      .select("start_at, end_at, reservee_name")
      .eq("resource_id", room.id)
      .neq("status", "cancelled")
      .lt("start_at", end.toISOString())
      .gt("end_at", start.toISOString());
    if (form.id) q = q.neq("id", form.id);
    const { data: hits } = await q;
    const gHit = googleStays.find(
      (g) =>
        g.resource_id === room.id &&
        new Date(g.start_at) < end &&
        new Date(g.end_at) > start,
    );
    const hit = hits?.[0] ?? gHit;
    if (hit) {
      setSaving(false);
      return toast.error(
        `${hit.reservee_name ?? "다른 일정"} (${fmt(hit.start_at)} ~ ${fmt(hit.end_at)})${gHit && !hits?.length ? " · 구글 캘린더" : ""}과 겹칩니다.`,
        { duration: 5000 },
      );
    }

    const row = {
      resource_id: room.id,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      reservee_name: form.name.trim(),
      reservee_phone: form.phone.trim() || null,
      purpose: form.purpose.trim() || "숙박",
    };
    // .select() 로 실제 바뀐 줄을 받아온다 — 권한(RLS)에 막히면 에러 없이 0줄이 되기 때문
    const { data: saved, error } = form.id
      ? await supabase.from("reservations").update(row).eq("id", form.id).select("id")
      : await supabase
          .from("reservations")
          .insert({ ...row, user_id: currentUser, status: "confirmed" })
          .select("id");
    setSaving(false);
    if (error) return toast.error("저장 실패: " + error.message);
    if (!saved?.length)
      return toast.error("저장 권한이 없습니다. 예약한 본인 또는 관리자만 수정할 수 있어요.");
    toast.success(form.id ? "수정되었습니다." : "예약되었습니다!");
    setForm(null);
    setDetail(null);
    refresh();
  };

  // ── 취소 ───────────────────────────────────────────────────────────────
  const handleCancel = async (s: Stay) => {
    if (!(await showConfirm("이 예약을 취소하시겠습니까?"))) return;
    let failed = false;
    if (isAdmin && s.user_id !== currentUser) {
      const res = await fetch("/api/reservation/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: s.id }),
      });
      failed = !res.ok;
    } else {
      const { error } = await supabase
        .from("reservations")
        .update({ status: "cancelled" })
        .eq("id", s.id);
      failed = !!error;
    }
    if (failed) return toast.error("취소 실패");
    toast.success("취소되었습니다.");
    setDetail(null);
    refresh();
  };

  const openEdit = (s: Stay) => {
    const st = new Date(s.start_at);
    const en = new Date(s.end_at);
    setForm({
      id: s.id,
      resource_id: s.resource_id,
      startDate: format(st, "yyyy-MM-dd"),
      startTime: format(st, "HH:mm"),
      endDate: format(en, "yyyy-MM-dd"),
      endTime: format(en, "HH:mm"),
      name: s.reservee_name ?? "",
      phone: s.reservee_phone ?? "",
      purpose: s.purpose === "숙박" ? "" : s.purpose,
    });
    setDetail(null);
  };

  const copyShareText = (s: Stay) => {
    const room = rooms.find((r) => r.id === s.resource_id)?.name ?? "";
    const text = `[${room} 사용]\n\n* 사용자 : ${guestOf(s)}\n* 입실 : ${fmt(s.start_at)}\n* 퇴실 : ${fmt(s.end_at)}${s.purpose && s.purpose !== "숙박" ? `\n* 메모 : ${s.purpose}` : ""}`;
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("복사 완료! 카카오톡에 붙여넣기 하세요 📋"))
      .catch(() => toast.error("복사에 실패했습니다."));
  };

  // ── 타임라인 계산 ─────────────────────────────────────────────────────────
  const days = eachDayOfInterval({ start: month, end: endOfMonth(month) });
  const t0 = +month;
  const span = +addMonths(month, 1) - t0;
  const pct = (d: Date | string) =>
    Math.min(100, Math.max(0, ((+new Date(d) - t0) / span) * 100));
  const nowPct = pct(new Date());
  const showNow = nowPct > 0 && nowPct < 100;

  const now = new Date();
  const upcoming = allStays.filter((s) => new Date(s.end_at) > now).slice(0, 12);

  // 그날 하루 중 조금이라도 머무는 일정
  const staysOn = (d: Date) => {
    const ds = startOfDay(d);
    const de = addDays(ds, 1);
    return allStays.filter(
      (s) => new Date(s.start_at) < de && new Date(s.end_at) > ds,
    );
  };
  const roomOf = (s: Stay) => rooms.find((r) => r.id === s.resource_id);
  // 월간 달력: 일요일 시작 6주 고정. 숙소마다 고정된 줄(lane)에 기간 막대를 이어 그린다
  const gridStart = startOfWeek(month, { weekStartsOn: 0 });
  const weeks = Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i)),
  );
  const WEEK_MS = 7 * 86400000;
  // 일정 상태 라벨 (그날 기준)
  const dayTag = (s: Stay, d: Date) => {
    const k = format(d, "yyyy-MM-dd");
    if (format(new Date(s.start_at), "yyyy-MM-dd") === k) return "입실";
    if (format(new Date(s.end_at), "yyyy-MM-dd") === k) return "퇴실";
    return "숙박중";
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (loading)
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );

  return (
    <div className="w-full max-w-7xl mx-auto p-2 pb-14 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading tracking-tight">
            안식관 · 선교관
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            숙소 사용 현황과 입·퇴실 일정 관리
          </p>
        </div>
        <button
          onClick={() => setForm(emptyForm(rooms[0]?.id ?? null))}
          disabled={rooms.length === 0}
          className={`${btnStyles.cta} px-4 py-2.5 text-sm`}
        >
          + 숙소 예약
        </button>
      </div>

      {rooms.length === 0 ? (
        <div className="bg-white border border-line rounded-2xl p-10 text-center text-sm text-gray-400">
          등록된 숙소가 없습니다. (resources.category = &apos;lodging&apos;)
        </div>
      ) : (
        <>
          {/* ── 지금 현황 카드 ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
            {rooms.map((room) => {
              const mine = allStays.filter((s) => s.resource_id === room.id);
              const cur = mine.find(
                (s) => new Date(s.start_at) <= now && new Date(s.end_at) > now,
              );
              const next = mine.find((s) => new Date(s.start_at) > now);
              const color = room.color || FALLBACK_COLOR;
              return (
                <div
                  key={room.id}
                  onClick={() => (cur ? setDetail(cur) : setForm(emptyForm(room.id)))}
                  className="bg-white border border-line rounded-2xl p-5 cursor-pointer hover:border-primary-soft hover:shadow-md transition-all flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 self-center"
                        style={{ background: color }}
                      />
                      <h3 className="text-base font-bold text-heading shrink-0">
                        {room.name}
                      </h3>
                      {room.location && (
                        <span className="text-xs text-gray-400 truncate">{room.location}</span>
                      )}
                    </div>
                    <span
                      className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
                        cur ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600"
                      }`}
                    >
                      {cur ? "사용중" : "비어있음"}
                    </span>
                  </div>
                  {cur ? (
                    <div>
                      <p className="text-lg font-extrabold text-heading truncate">
                        {guestOf(cur)}
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        ~ {fmt(cur.end_at)} 퇴실
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">지금 사용하는 분이 없어요</p>
                  )}
                  <div className="mt-auto pt-3 border-t border-line-soft flex items-center gap-2 text-xs text-muted">
                    <span className="flex-1 min-w-0 truncate">
                      {next ? (
                        <>
                          <span className="font-bold text-gray-600">다음</span>{" "}
                          {fmt(next.start_at)} · {guestOf(next)}
                        </>
                      ) : (
                        "예정된 입실 없음"
                      )}
                    </span>
                    {room.guide_url && (
                      <a
                        href={room.guide_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="이용 안내문 열기"
                        className="shrink-0 font-bold text-gray-400 hover:text-primary transition"
                      >
                        안내문 ↗
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── 월간 타임라인 ── */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-1 h-7 bg-primary rounded-full" />
                <h2 className="text-lg font-bold text-heading">이용 달력</h2>
                <div className="flex bg-primary-wash p-1 rounded-xl">
                  {(
                    [
                      ["timeline", "숙소별"],
                      ["month", "월간"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setCalView(v)}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                        calView === v
                          ? "bg-white text-primary shadow-sm ring-1 ring-black/5"
                          : "text-primary/60 hover:text-primary"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 border border-line rounded-xl p-1 bg-white">
                  <button
                    onClick={() => setMonth(subMonths(month, 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-table-header text-muted transition"
                  >
                    ‹
                  </button>
                  <span className="text-[13px] font-bold text-gray-800 tabular-nums px-1">
                    {format(month, "yyyy년 M월")}
                  </span>
                  <button
                    onClick={() => setMonth(addMonths(month, 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-table-header text-muted transition"
                  >
                    ›
                  </button>
                </div>
                <button
                  onClick={() => setMonth(startOfMonth(new Date()))}
                  className="px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:text-primary hover:bg-primary-wash rounded-lg transition"
                >
                  이번 달
                </button>
              </div>
            </div>

            {calView === "month" ? (
              <div className="bg-white border border-line rounded-2xl shadow-sm overflow-hidden [--lane:10px] sm:[--lane:22px]">
                {/* 숙소 범례 — 줄 순서와 같다 */}
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 sm:px-5 py-3 border-b border-line-soft">
                  {rooms.map((r) => (
                    <span key={r.id} className="flex items-center gap-1.5 text-xs">
                      <span className="w-3 h-1.5 rounded-full" style={{ background: r.color || FALLBACK_COLOR }} />
                      <span className="font-bold text-heading">{r.name}</span>
                      {r.location && <span className="text-gray-400">{r.location}</span>}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 bg-table-header border-b border-line-soft">
                  {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
                    <div
                      key={d}
                      className={`text-center text-[11px] sm:text-xs font-bold py-2 ${i === 0 ? "text-red-500" : i === 6 ? "text-primary" : "text-muted"}`}
                    >
                      {d}
                    </div>
                  ))}
                </div>
                {weeks.map((week) => {
                  const w0 = +week[0];
                  const w1 = w0 + WEEK_MS;
                  const segs = allStays.filter(
                    (s) => +new Date(s.start_at) < w1 && +new Date(s.end_at) > w0,
                  );
                  return (
                    <div
                      key={w0}
                      className="relative grid grid-cols-7 border-b border-line-soft last:border-b-0"
                      style={{ height: `calc(30px + var(--lane) * ${rooms.length} + 8px)` }}
                    >
                      {week.map((day) => {
                        const inMonth = isSameMonth(day, month);
                        const dow = getDay(day);
                        const red = dow === 0 || HOLIDAYS[format(day, "yyyy-MM-dd")];
                        return (
                          <button
                            key={+day}
                            onClick={() => setDayOpen(day)}
                            className={`flex items-start border-r border-line-soft last:border-r-0 text-left px-1.5 sm:px-2 pt-1 transition-colors ${
                              inMonth ? "hover:bg-primary-wash/40" : "bg-table-header/70"
                            }`}
                          >
                            <span
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] sm:text-xs font-bold tabular-nums ${
                                isToday(day)
                                  ? "bg-primary text-white"
                                  : !inMonth
                                    ? "text-gray-300"
                                    : red
                                      ? "text-red-500"
                                      : dow === 6
                                        ? "text-primary"
                                        : "text-gray-700"
                              }`}
                            >
                              {format(day, "d")}
                            </span>
                          </button>
                        );
                      })}
                      {/* 기간 막대 — 숙소 순서대로 줄을 고정, 입·퇴실 시각 비율로 위치 */}
                      {segs.map((s) => {
                        const lane = rooms.findIndex((r) => r.id === s.resource_id);
                        const c = roomOf(s)?.color || FALLBACK_COLOR;
                        const a = Math.max(+new Date(s.start_at), w0);
                        const b = Math.min(+new Date(s.end_at), w1);
                        const left = ((a - w0) / WEEK_MS) * 100;
                        const width = Math.max(((b - a) / WEEK_MS) * 100, 2);
                        const headCut = +new Date(s.start_at) < w0;
                        const tailCut = +new Date(s.end_at) > w1;
                        return (
                          <button
                            key={s.id}
                            onClick={() => setDetail(s)}
                            title={`${roomOf(s)?.name} ${guestOf(s)} (${fmt(s.start_at)} ~ ${fmt(s.end_at)})`}
                            className={`absolute flex items-center gap-1 px-1.5 overflow-hidden text-left transition hover:brightness-95 ${
                              headCut ? "" : "rounded-l-md"
                            } ${tailCut ? "" : "rounded-r-md"}`}
                            style={{
                              top: `calc(32px + var(--lane) * ${lane})`,
                              height: "calc(var(--lane) - 3px)",
                              left: `${left}%`,
                              width: `${width}%`,
                              background: `${c}26`,
                              color: c,
                            }}
                          >
                            {s.google && (
                              <span
                                className="hidden sm:inline shrink-0 text-[9px] font-extrabold text-white rounded px-1"
                                style={{ background: c }}
                              >
                                G
                              </span>
                            )}
                            <span className="hidden sm:inline text-[11px] font-bold truncate">
                              {guestOf(s)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ) : (
            <div className="bg-white border border-line rounded-2xl overflow-x-auto shadow-sm">
              <div className="min-w-[960px]">
                {/* 날짜 헤더 */}
                <div className="flex border-b border-line bg-table-header">
                  <div className="w-[120px] shrink-0 sticky left-0 z-20 bg-table-header border-r border-line px-3 py-2 text-xs font-bold text-muted flex items-center">
                    숙소
                  </div>
                  <div className="flex-1 flex">
                    {days.map((d) => {
                      const red = getDay(d) === 0 || HOLIDAYS[format(d, "yyyy-MM-dd")];
                      return (
                        <div
                          key={+d}
                          className={`flex-1 py-1.5 text-center border-r border-line-soft last:border-r-0 ${
                            isToday(d) ? "bg-primary-wash text-primary-active" : ""
                          }`}
                        >
                          <div
                            className={`text-[11px] font-bold tabular-nums ${
                              isToday(d) ? "" : red ? "text-red-500" : getDay(d) === 6 ? "text-blue-500" : "text-gray-700"
                            }`}
                          >
                            {format(d, "d")}
                          </div>
                          <div className="text-[9px] text-gray-400">
                            {format(d, "EEEEE", { locale: ko })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 숙소별 줄 */}
                {rooms.map((room) => {
                  const color = room.color || FALLBACK_COLOR;
                  const bars = allStays.filter(
                    (s) =>
                      s.resource_id === room.id &&
                      new Date(s.end_at) > month &&
                      new Date(s.start_at) < addMonths(month, 1),
                  );
                  return (
                    <div key={room.id} className="flex border-b border-line-soft last:border-b-0">
                      <div className="w-[120px] shrink-0 sticky left-0 z-20 bg-white border-r border-line px-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-heading truncate">{room.name}</p>
                          {room.location && (
                            <p className="text-[11px] text-gray-400 truncate">{room.location}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 relative h-14">
                        {/* 빈 칸 클릭 → 그날 입실로 예약 */}
                        <div className="absolute inset-0 flex">
                          {days.map((d) => (
                            <button
                              key={+d}
                              title={`${format(d, "M월 d일")} 입실 예약`}
                              onClick={() => setForm(emptyForm(room.id, d))}
                              className={`flex-1 border-r border-line-soft last:border-r-0 hover:bg-primary-wash/60 transition-colors ${
                                isToday(d) ? "bg-primary-wash/40" : getDay(d) === 0 || getDay(d) === 6 ? "bg-table-header/60" : ""
                              }`}
                            />
                          ))}
                        </div>
                        {showNow && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none"
                            style={{ left: `${nowPct}%` }}
                          />
                        )}
                        {bars.map((s) => {
                          const left = pct(s.start_at);
                          const width = Math.max(pct(s.end_at) - left, 0.8);
                          return (
                            <button
                              key={s.id}
                              onClick={() => setDetail(s)}
                              title={`${guestOf(s)} · ${fmt(s.start_at)} ~ ${fmt(s.end_at)}`}
                              style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                background: `${color}26`,
                                color,
                              }}
                              className="absolute top-2.5 bottom-2.5 z-10 rounded-lg px-2 flex items-center gap-1 overflow-hidden text-left hover:brightness-95 hover:z-20 transition"
                            >
                              {s.google && (
                                <span
                                  className="shrink-0 text-[9px] font-extrabold text-white rounded px-1"
                                  style={{ background: color }}
                                >
                                  G
                                </span>
                              )}
                              <span className="text-[11px] font-bold truncate">
                                {guestOf(s)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            )}
            <div className="flex flex-wrap gap-4 text-xs text-muted">
              <span>
                💡{" "}
                {calView === "month"
                  ? "날짜를 누르면 그날 이용 현황을 볼 수 있어요"
                  : `빈 칸을 누르면 그날 입실로 예약할 수 있어요 (기본 입실 ${DEFAULT_IN} · 퇴실 ${DEFAULT_OUT})`}
              </span>
              {missionRoom && (
                <span className="flex items-center gap-1.5">
                  <span
                    className="text-[9px] font-extrabold text-white rounded px-1"
                    style={{ background: missionRoom.color || FALLBACK_COLOR }}
                  >
                    G
                  </span>
                  구글 캘린더 「{GOOGLE_CAL_NAME}」 일정
                </span>
              )}
            </div>
          </div>

          {/* ── 다가오는 일정 ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-1 h-7 bg-primary rounded-full" />
              <h2 className="text-lg font-bold text-heading">다가오는 일정</h2>
            </div>
            <div className="bg-white border border-line rounded-2xl divide-y divide-line-soft">
              {upcoming.length === 0 && (
                <p className="p-6 text-center text-sm text-gray-400">예정된 일정이 없습니다.</p>
              )}
              {upcoming.map((s) => {
                const room = rooms.find((r) => r.id === s.resource_id);
                const using = new Date(s.start_at) <= now;
                return (
                  <button
                    key={s.id}
                    onClick={() => setDetail(s)}
                    className="w-full flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-5 py-3.5 text-left hover:bg-table-header transition"
                  >
                    <div className="flex items-center gap-2 sm:w-[120px] shrink-0">
                      <span className="w-2 h-2 rounded-full" style={{ background: room?.color || FALLBACK_COLOR }} />
                      <span className="text-sm font-bold text-heading">{room?.name}</span>
                    </div>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-800 truncate">{guestOf(s)}</span>
                      {s.google && (
                        <span className="shrink-0 text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded font-bold">
                          구글캘린더
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted tabular-nums">
                      {fmt(s.start_at)} → {fmt(s.end_at)}
                      <span className="ml-1 text-gray-400">({nightsOf(s)}박)</span>
                    </span>
                    <span
                      className={`self-start sm:self-auto shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        using ? "bg-red-50 text-red-500" : "bg-primary-wash text-primary"
                      }`}
                    >
                      {using ? "사용중" : "예정"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── 날짜별 현황 모달 (월간 달력) ── */}
      <Modal
        isOpen={!!dayOpen}
        onClose={() => setDayOpen(null)}
        size="sm"
        bodyClassName="p-0"
        title={
          dayOpen ? (
            <div className="flex items-center gap-2">
              {isToday(dayOpen) && (
                <span className="bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full">TODAY</span>
              )}
              <span>{format(dayOpen, "M월 d일 (EEE)", { locale: ko })}</span>
              <span className="text-xs text-gray-400 font-normal">({staysOn(dayOpen).length}건)</span>
            </div>
          ) : (
            ""
          )
        }
        footer={
          <>
            <button onClick={() => setDayOpen(null)} className={btnStyles.cancel}>
              닫기
            </button>
            <button
              onClick={() => {
                setForm(emptyForm(rooms[0]?.id ?? null, dayOpen ?? new Date()));
                setDayOpen(null);
              }}
              className={btnStyles.save}
            >
              이 날 입실 예약
            </button>
          </>
        }
      >
        {dayOpen && (
          <div className="divide-y divide-line-soft">
            {staysOn(dayOpen).length === 0 && (
              <div className="py-12 text-center text-sm text-gray-400">모든 숙소가 비어있어요.</div>
            )}
            {staysOn(dayOpen).map((s) => {
              const room = roomOf(s);
              const tag = dayTag(s, dayOpen);
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setDetail(s);
                    setDayOpen(null);
                  }}
                  className="w-full text-left px-5 py-4 hover:bg-table-header transition"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: room?.color || FALLBACK_COLOR }} />
                    <span className="text-sm font-bold text-heading">{room?.name}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        tag === "입실"
                          ? "bg-primary-wash text-primary"
                          : tag === "퇴실"
                            ? "bg-orange-50 text-orange-500"
                            : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {tag}
                    </span>
                    {s.google && (
                      <span className="text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded font-bold">
                        구글캘린더
                      </span>
                    )}
                  </div>
                  <p className="ml-[18px] text-sm font-bold text-gray-800">{guestOf(s)}</p>
                  <p className="ml-[18px] text-xs text-muted tabular-nums mt-0.5">
                    {fmt(s.start_at)} → {fmt(s.end_at)} ({nightsOf(s)}박)
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </Modal>

      {/* ── 상세 모달 ── */}
      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title="이용 상세" size="sm">
        {detail && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 pb-4 border-b border-line-soft">
              <div className="w-12 h-12 rounded-full bg-primary-soft flex items-center justify-center text-primary-active font-bold text-xl shrink-0">
                {guestOf(detail).slice(0, 1)}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-heading text-lg truncate">{guestOf(detail)}</div>
                {detail.profiles?.full_name && (
                  <div className="text-xs text-gray-400 mt-0.5">예약자: {detail.profiles.full_name}</div>
                )}
              </div>
            </div>
            <div className="space-y-3 text-sm">
              {[
                [
                  "숙소",
                  [roomOf(detail)?.name, roomOf(detail)?.location && `(${roomOf(detail)?.location})`]
                    .filter(Boolean)
                    .join(" "),
                ],
                ["입실", fmt(detail.start_at)],
                ["퇴실", fmt(detail.end_at)],
                ["기간", `${nightsOf(detail)}박`],
                ["연락처", detail.reservee_phone],
                ["메모", detail.purpose !== "숙박" && !detail.google ? detail.purpose : null],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex">
                    <span className="w-14 text-gray-400 shrink-0">{k}</span>
                    <span className="font-bold text-heading whitespace-pre-wrap">{v}</span>
                  </div>
                ))}
            </div>
            {detail.google && (
              <p className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
                구글 캘린더 「{GOOGLE_CAL_NAME}」에서 가져온 일정입니다. 수정은 구글 캘린더에서 해주세요.
              </p>
            )}
            <div className="border-t border-line-soft pt-4 flex flex-wrap gap-2">
              {canEdit(detail) && (
                <button onClick={() => handleCancel(detail)} className={`${btnStyles.dangerSoft} sm:mr-auto`}>
                  예약 취소
                </button>
              )}
              <button onClick={() => copyShareText(detail)} className={btnStyles.cancel}>
                카톡 복사
              </button>
              {canEdit(detail) && (
                <button onClick={() => openEdit(detail)} className={btnStyles.save}>
                  수정
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── 예약 / 수정 모달 ── */}
      <Modal
        isOpen={!!form}
        onClose={() => {
          setForm(null);
          setCalOpen(null);
        }}
        title={form?.id ? "예약 수정" : "숙소 예약"}
        footer={
          <>
            <button onClick={() => setForm(null)} className={btnStyles.cancel}>
              취소
            </button>
            <button onClick={handleSave} disabled={saving} className={btnStyles.save}>
              {saving ? "저장 중..." : form?.id ? "수정" : "예약"}
            </button>
          </>
        }
      >
        {form && (
          <div className="space-y-5">
            <div>
              <label className={labelCls}>숙소</label>
              <div className="flex flex-wrap gap-2">
                {rooms.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setForm({ ...form, resource_id: r.id })}
                    className={`px-3.5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${
                      form.resource_id === r.id
                        ? "bg-gray-800 text-white shadow-sm"
                        : "bg-table-header text-muted hover:bg-gray-100 border border-line/60"
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: r.color || FALLBACK_COLOR }} />
                    {r.name}
                  </button>
                ))}
              </div>
              {(() => {
                const r = rooms.find((x) => x.id === form.resource_id);
                if (!r?.location && !r?.guide_url) return null;
                return (
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                    {r.location && <span>📍 {r.location}</span>}
                    {r.guide_url && (
                      <a href={r.guide_url} target="_blank" rel="noopener noreferrer" className="font-bold text-primary hover:underline">
                        이용 안내문 →
                      </a>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* 입실 / 퇴실 — 날짜는 달력 팝업, 시간은 시 단위 드롭다운 */}
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["start", "입실", "startDate", "startTime"],
                  ["end", "퇴실", "endDate", "endTime"],
                ] as const
              ).map(([which, label, dk, tk]) => (
                <div key={which} className="relative space-y-2">
                  <label className={labelCls}>
                    {label} <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setCalOpen(calOpen === which ? null : which)}
                    className={`w-full border rounded-lg p-3 bg-white flex items-center justify-between gap-2 text-sm font-bold text-heading transition ${
                      calOpen === which
                        ? "border-primary ring-2 ring-primary-soft"
                        : "border-line-strong hover:border-primary"
                    }`}
                  >
                    {format(parseISO(form[dk]), "M월 d일 (EEE)", { locale: ko })}
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                  {calOpen === which && (
                    <div
                      className={`absolute top-[76px] z-50 bg-white border border-line rounded-xl shadow-2xl p-3 range-calendar-wrapper animate-fadeIn w-[300px] sm:w-[330px] ${
                        which === "end" ? "right-0" : "left-0"
                      }`}
                    >
                      <Calendar
                        value={parseISO(form[dk])}
                        minDate={which === "end" ? parseISO(form.startDate) : undefined}
                        onChange={(v) => {
                          if (!(v instanceof Date)) return;
                          const ds = format(v, "yyyy-MM-dd");
                          // 입실일을 퇴실일 이후로 옮기면 퇴실을 다음 날로 같이 민다
                          if (which === "start" && ds >= form.endDate)
                            setForm({ ...form, startDate: ds, endDate: format(addDays(v, 1), "yyyy-MM-dd") });
                          else setForm({ ...form, [dk]: ds });
                          setCalOpen(null);
                        }}
                        formatDay={(_, d) => format(d, "d")}
                        calendarType="gregory"
                        locale="ko-KR"
                        tileClassName={({ date, view }) => {
                          if (view !== "month") return null;
                          if (HOLIDAYS[format(date, "yyyy-MM-dd")]) return "holiday-day";
                          // 선택한 숙소가 그날 사용중이면 점 표시
                          const busy = staysOn(date).some(
                            (s) => s.resource_id === form.resource_id && s.id !== form.id,
                          );
                          return busy ? "has-reservation" : null;
                        }}
                      />
                    </div>
                  )}
                  <Select
                    value={form[tk]}
                    onChange={(v) => setForm({ ...form, [tk]: v })}
                    options={HOUR_OPTIONS}
                    className="w-full p-3 bg-white border border-line-strong rounded-lg text-sm"
                  />
                </div>
              ))}
            </div>

            {(() => {
              const s = new Date(`${form.startDate}T${form.startTime}`);
              const e = new Date(`${form.endDate}T${form.endTime}`);
              if (isNaN(+s) || isNaN(+e) || e <= s) return null;
              return (
                <div className="bg-primary-wash border border-primary-soft rounded-xl px-4 py-3 text-sm text-primary-active">
                  🛏️ {format(s, "M월 d일 (EEE) HH:mm", { locale: ko })} →{" "}
                  {format(e, "M월 d일 (EEE) HH:mm", { locale: ko })}
                  <span className="ml-1 font-bold">({differenceInCalendarDays(e, s)}박)</span>
                </div>
              );
            })()}

            {isMission(rooms.find((r) => r.id === form.resource_id)) && (
              <p className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
                {googleFailed
                  ? `⚠️ 구글 캘린더 「${GOOGLE_CAL_NAME}」를 불러오지 못해 구글 일정과의 겹침은 확인되지 않습니다. 구글 캘린더를 직접 확인해주세요.`
                  : `구글 캘린더 「${GOOGLE_CAL_NAME}」 일정과 겹치는지도 함께 확인합니다.`}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  사용하시는 분 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="예: 홍길동 선생님 가정"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>
                  연락처 <span className="text-gray-400 font-normal">(선택)</span>
                </label>
                <input
                  type="tel"
                  placeholder="010-0000-0000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>
                메모 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <textarea
                rows={3}
                placeholder="예: 안식월, 인원 4명, 침구 추가 요청..."
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                className={`${inputCls} resize-none`}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
