"use client";

import { useEffect, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isBefore,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import { ko } from "date-fns/locale";

/** 캘린더 이름 → 뱃지/닷 색상 매핑 */
type CalendarStyle = { badgeBg: string; badgeText: string; dot: string };

const CALENDAR_NAME_STYLE: Record<string, CalendarStyle> = {
  "고목사 공적스케쥴": {
    badgeBg: "#1739a51e",
    badgeText: "#2151ec",
    dot: "#2151ec",
  },
  교회일정: { badgeBg: "#ea3b3b1e", badgeText: "#ea5455", dot: "#ea5455" },
  "다음 세대": { badgeBg: "#4c54691e", badgeText: "#4c5469", dot: "#4c5469" },
  "대한민국의 휴일": {
    badgeBg: "#82868b1e",
    badgeText: "#82868b",
    dot: "#82868b",
  },
  "사역,훈련,참조": {
    badgeBg: "#f0af231e",
    badgeText: "#f0af23",
    dot: "#f0af23",
  },
  "선교관(기도사역)": {
    badgeBg: "#27c2811e",
    badgeText: "#1bc47d",
    dot: "#1bc47d",
  },
  "★윤목사님 일정": {
    badgeBg: "#00cfe81e",
    badgeText: "#006876",
    dot: "#006876",
  },
};
const DEFAULT_CAL_STYLE: CalendarStyle = {
  badgeBg: "#f3f4f6",
  badgeText: "#6b7280",
  dot: "#9ca3af",
};

function getCalendarStyle(name: string): CalendarStyle {
  return CALENDAR_NAME_STYLE[name] ?? DEFAULT_CAL_STYLE;
}

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  calendarName: string;
  calendarColor: string;
  location?: string;
  description?: string;
};

/** 이벤트 상세 팝업 */
function EventDetailPopup({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: () => void;
}) {
  const cs = getCalendarStyle(event.calendarName);

  const dateLabel = (() => {
    if (event.isAllDay) {
      const s = event.start.slice(0, 10);
      const rawEnd = event.end.slice(0, 10);
      // Google Calendar all-day end is exclusive
      const lastDay = format(addDays(parseISO(rawEnd), -1), "yyyy-MM-dd");
      if (s === lastDay) return format(parseISO(s), "M월 d일 (EEE)", { locale: ko });
      return `${format(parseISO(s), "M월 d일 (EEE)", { locale: ko })} – ${format(parseISO(lastDay), "M월 d일 (EEE)", { locale: ko })}`;
    }
    const s = parseISO(event.start);
    const e = parseISO(event.end);
    return `${format(s, "M월 d일 (EEE) HH:mm", { locale: ko })} – ${format(e, "HH:mm")}`;
  })();

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-gray-200 w-full max-w-sm flex flex-col max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 색상 바 */}
        <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: cs.dot }} />

        {/* 고정 헤더 */}
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 shrink-0">
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-900 leading-snug">
              {event.title}
            </h3>
            {/* 캘린더 뱃지 */}
            <span
              className="text-xs px-2 py-0.5 rounded font-semibold w-fit"
              style={{ backgroundColor: cs.badgeBg, color: cs.badgeText }}
            >
              {event.calendarName}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 mt-0.5"
          >
            ✕
          </button>
        </div>

        {/* 스크롤 가능한 본문 */}
        <div className="overflow-y-auto px-5 pb-5 space-y-2">
          {/* 날짜/시간 */}
          <div className="flex items-start gap-2 text-sm text-gray-600">
            <span className="shrink-0">📅</span>
            <span>{dateLabel}</span>
          </div>

          {/* 장소 */}
          {event.location && (
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <span className="shrink-0">📍</span>
              <span>{event.location}</span>
            </div>
          )}

          {/* 설명 */}
          {event.description && (
            <div className="mt-1 pt-3 border-t border-gray-100 text-sm text-gray-500 whitespace-pre-wrap leading-relaxed">
              {event.description}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 날짜별 일정 상세 패널 */
function DayDetailPanel({
  date,
  dayEvents,
  onClose,
}: {
  date: Date;
  dayEvents: CalendarEvent[];
  onClose: () => void;
}) {
  const dateLabel = format(date, "M월 d일 (EEE)", { locale: ko });

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/50 flex items-end sm:items-center justify-center sm:px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md flex flex-col overflow-hidden"
        style={{ maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 패널 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-2">
            {isToday(date) && (
              <span className="bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">TODAY</span>
            )}
            <h3 className="font-bold text-gray-800 text-base">{dateLabel}</h3>
            <span className="text-xs text-gray-400 font-medium">({dayEvents.length}건)</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition"
          >✕</button>
        </div>

        {/* 일정 목록 */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {dayEvents.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">등록된 일정이 없습니다.</div>
          ) : (
            dayEvents.map((ev) => {
              const cs = getCalendarStyle(ev.calendarName);

              const timeLabel = (() => {
                if (ev.isAllDay) return "하루 종일";
                const s = parseISO(ev.start);
                const e = parseISO(ev.end);
                return `${format(s, "HH:mm")} – ${format(e, "HH:mm")}`;
              })();

              return (
                <div key={ev.id} className="px-5 py-4">
                  {/* 제목 + 캘린더 뱃지 */}
                  <div className="flex items-start gap-2 mb-2">
                    <span
                      className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: cs.dot }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-sm leading-snug">{ev.title}</p>
                      <span
                        className="inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold mt-1"
                        style={{ backgroundColor: cs.badgeBg, color: cs.badgeText }}
                      >
                        {ev.calendarName}
                      </span>
                    </div>
                  </div>

                  {/* 시간 */}
                  <div className="flex items-center gap-2 text-xs text-gray-500 ml-5 pl-0.5">
                    <span>🕐</span>
                    <span>{timeLabel}</span>
                  </div>

                  {/* 장소 */}
                  {ev.location && (
                    <div className="flex items-start gap-2 text-xs text-gray-500 mt-1.5 ml-5 pl-0.5">
                      <span className="shrink-0">📍</span>
                      <span className="leading-relaxed">{ev.location}</span>
                    </div>
                  )}

                  {/* 설명 */}
                  {ev.description && (
                    <div className="mt-2 ml-5 pl-0.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed border border-gray-100">
                      {ev.description}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/** 풀스크린 달력 모달 */
function FullCalendarModal({
  events,
  onClose,
}: {
  events: CalendarEvent[];
  onClose: () => void;
}) {
  const today = startOfDay(new Date());
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // 이벤트 → 날짜별 맵
  const eventsByDay = events.reduce(
    (acc, ev) => {
      const startKey = ev.start.slice(0, 10);
      if (ev.isAllDay) {
        const endKey = ev.end.slice(0, 10);
        const startDate = parseISO(startKey);
        const lastDay = addDays(parseISO(endKey), -1);
        const actualLast = isBefore(lastDay, startDate) ? startDate : lastDay;
        eachDayOfInterval({ start: startDate, end: actualLast }).forEach((day) => {
          const key = format(day, "yyyy-MM-dd");
          if (!acc[key]) acc[key] = [];
          if (!acc[key].find((e) => e.id === ev.id)) acc[key].push(ev);
        });
      } else {
        if (!acc[startKey]) acc[startKey] = [];
        acc[startKey].push(ev);
      }
      return acc;
    },
    {} as Record<string, CalendarEvent[]>,
  );

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // 첫 날 요일 오프셋 (일=0)
  const startOffset = getDay(monthStart);
  // 항상 6주(42칸) 고정 → 달마다 높이가 달라지지 않음
  const TOTAL_CELLS = 42;
  const allCells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...monthDays,
    ...Array(TOTAL_CELLS - startOffset - monthDays.length).fill(null),
  ];
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < allCells.length; i += 7) weeks.push(allCells.slice(i, i + 7));

  const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

  // 선택된 날짜의 이벤트 (시간순 정렬)
  const selectedDayEvents = selectedDate
    ? (eventsByDay[format(selectedDate, "yyyy-MM-dd")] ?? []).sort((a, b) => {
        if (a.isAllDay && !b.isAllDay) return -1;
        if (!a.isAllDay && b.isAllDay) return 1;
        return a.start.localeCompare(b.start);
      })
    : [];

  return (
    <>
      {/* 날짜 상세 패널 */}
      {selectedDate && (
        <DayDetailPanel
          date={selectedDate}
          dayEvents={selectedDayEvents}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {/* 배경 오버레이 — 모바일: 바텀시트, 데스크탑: 센터 */}
      <div
        className="fixed inset-0 z-[9998] bg-black/60 flex items-end sm:items-center justify-center sm:p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-5xl flex flex-col overflow-hidden h-[95vh] sm:h-auto"
          style={{ maxHeight: "95vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── 모달 헤더 ── */}
          <div className="flex items-center gap-2 px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
            {/* 모바일: 닫기 왼쪽 */}
            <button
              onClick={onClose}
              className="sm:hidden w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 shrink-0"
            >✕</button>

            {/* 제목 — 모바일 숨김 */}
            <div className="hidden sm:flex items-center gap-2 mr-2">
              <span className="text-xl">📅</span>
              <h2 className="font-bold text-gray-800 text-base sm:text-lg whitespace-nowrap">사역 일정 (구글 캘린더)</h2>
            </div>

            {/* 월 이동 — 모바일: flex-1 가운데 정렬 */}
            <div className="flex items-center gap-1 flex-1 sm:flex-none justify-center sm:justify-start">
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg font-bold"
              >‹</button>
              <span className="text-sm font-bold text-gray-700 w-28 text-center whitespace-nowrap">
                {format(currentMonth, "yyyy년 M월", { locale: ko })}
              </span>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg font-bold"
              >›</button>
            </div>

            {/* 오늘 + 닫기(데스크탑) */}
            <div className="flex items-center gap-2 ml-auto shrink-0">
              <button
                onClick={() => setCurrentMonth(startOfMonth(today))}
                className="px-2.5 sm:px-3 py-1.5 text-xs font-bold bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition border border-blue-100"
              >오늘</button>
              <button
                onClick={onClose}
                className="hidden sm:flex w-8 h-8 items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition"
              >✕</button>
            </div>
          </div>

          {/* ── 달력 그리드 ── */}
          <div className="flex-1 overflow-y-auto p-1.5 sm:p-4">
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 mb-0.5">
              {DAY_LABELS.map((d, i) => (
                <div
                  key={d}
                  className={`text-center text-[11px] sm:text-xs font-bold py-1.5 sm:py-2 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"}`}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* 날짜 셀 */}
            <div className="grid grid-cols-7 gap-px sm:gap-0.5">
              {weeks.flat().map((day, idx) => {
                if (!day) return (
                  <div key={`empty-${idx}`} className="h-[56px] sm:h-[100px] bg-gray-50/30" />
                );
                const dateStr = format(day, "yyyy-MM-dd");
                const dayEvents = (eventsByDay[dateStr] ?? []).sort((a, b) => {
                  if (a.isAllDay && !b.isAllDay) return -1;
                  if (!a.isAllDay && b.isAllDay) return 1;
                  return a.start.localeCompare(b.start);
                });
                const isCurrentDay = isToday(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const dayOfWeek = getDay(day);
                const isSun = dayOfWeek === 0;
                const isSat = dayOfWeek === 6;
                // 모바일: 최대 1개, 데스크탑: 최대 3개
                const MAX_SHOW_MOBILE = 1;
                const MAX_SHOW_DESKTOP = 2;
                const overflowMobile = dayEvents.length - MAX_SHOW_MOBILE;
                const overflowDesktop = dayEvents.length - MAX_SHOW_DESKTOP;

                return (
                  <div
                    key={dateStr}
                    onClick={() => setSelectedDate(day)}
                    className={`h-[56px] sm:h-[100px] overflow-hidden rounded sm:rounded-lg p-0.5 sm:p-1 flex flex-col border transition-colors cursor-pointer active:opacity-70 ${
                      isCurrentDay
                        ? "bg-blue-50 border-blue-200"
                        : isCurrentMonth
                          ? "bg-white border-gray-100 hover:bg-gray-50"
                          : "bg-gray-50/40 border-gray-50 hover:bg-gray-100/50"
                    }`}
                  >
                    {/* 날짜 숫자 */}
                    <div className="flex justify-end mb-0.5">
                      <span
                        className={`text-[11px] sm:text-sm font-bold w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full ${
                          isCurrentDay
                            ? "bg-blue-500 text-white"
                            : isSun || !isCurrentMonth
                              ? "text-red-400"
                              : isSat
                                ? "text-blue-500"
                                : "text-gray-700"
                        }`}
                      >
                        {format(day, "d")}
                      </span>
                    </div>

                    {/* 이벤트 미리보기 — 모바일/데스크탑 각각 */}
                    <div className="flex flex-col gap-px sm:gap-0.5 flex-1">
                      {/* 모바일: 점 표시 */}
                      <div className="sm:hidden flex flex-wrap gap-px mt-0.5 justify-center">
                        {dayEvents.slice(0, 3).map((ev) => {
                          const cs = getCalendarStyle(ev.calendarName);
                          return (
                            <span
                              key={ev.id}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: cs.dot }}
                            />
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <span className="text-[8px] text-gray-400 leading-none">+</span>
                        )}
                      </div>
                      {/* 모바일: 첫 이벤트 텍스트 */}
                      <div className="sm:hidden flex flex-col gap-px">
                        {dayEvents.slice(0, MAX_SHOW_MOBILE).map((ev) => {
                          const cs = getCalendarStyle(ev.calendarName);
                          return (
                            <div
                              key={ev.id}
                              className="text-[9px] font-medium px-1 py-px rounded truncate w-full leading-tight"
                              style={{ backgroundColor: cs.badgeBg, color: cs.badgeText }}
                            >
                              {ev.title}
                            </div>
                          );
                        })}
                        {overflowMobile > 0 && (
                          <span className="text-[9px] text-gray-400 text-center leading-tight">+{overflowMobile}</span>
                        )}
                      </div>
                      {/* 데스크탑: 이벤트 뱃지 */}
                      <div className="hidden sm:flex flex-col gap-0.5">
                        {dayEvents.slice(0, MAX_SHOW_DESKTOP).map((ev) => {
                          const cs = getCalendarStyle(ev.calendarName);
                          return (
                            <div
                              key={ev.id}
                              className="text-xs font-medium px-1.5 py-0.5 rounded truncate w-full leading-tight"
                              style={{ backgroundColor: cs.badgeBg, color: cs.badgeText }}
                            >
                              {!ev.isAllDay && (
                                <span className="mr-0.5 opacity-70">{format(parseISO(ev.start), "HH:mm")}</span>
                              )}
                              {ev.title}
                            </div>
                          );
                        })}
                        {overflowDesktop > 0 && (
                          <span className="text-[10px] text-gray-400 font-medium text-center">+{overflowDesktop}건 더</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 범례 ── */}
          <div className="px-3 sm:px-5 py-2 sm:py-3 border-t border-gray-100 bg-gray-50/30 shrink-0">
            <div className="flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1">
              {Object.entries(CALENDAR_NAME_STYLE).map(([name, cs]) => (
                <div key={name} className="flex items-center gap-1 sm:gap-1.5">
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0" style={{ backgroundColor: cs.dot }} />
                  <span className="text-[10px] sm:text-[11px] text-gray-500 font-medium">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

type GoogleCalendarWidgetProps = {
  className?: string;
  /** 외부에서 데이터를 주입할 경우 (중복 fetch 방지) */
  initialEvents?: CalendarEvent[];
  initialLoading?: boolean;
  initialError?: boolean;
  initialUpdatedAt?: string | null;
};

export default function GoogleCalendarWidget({
  className,
  initialEvents,
  initialLoading,
  initialError,
  initialUpdatedAt,
}: GoogleCalendarWidgetProps) {
  const externalData = initialEvents !== undefined;

  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents ?? []);
  const [loading, setLoading] = useState(externalData ? (initialLoading ?? false) : true);
  const [error, setError] = useState(externalData ? (initialError ?? false) : false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt ?? null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isFullCalendarOpen, setIsFullCalendarOpen] = useState(false);

  const today = startOfDay(new Date());
  const baseMonth = startOfMonth(today);
  const [currentMonth, setCurrentMonth] = useState(baseMonth);

  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);

  // 외부 데이터가 업데이트되면 동기화
  useEffect(() => {
    if (externalData) {
      setEvents(initialEvents ?? []);
      setLoading(initialLoading ?? false);
      setError(initialError ?? false);
      setUpdatedAt(initialUpdatedAt ?? null);
    }
  }, [externalData, initialEvents, initialLoading, initialError, initialUpdatedAt]);

  // 외부 데이터가 없을 때만 자체 fetch
  useEffect(() => {
    if (externalData) return;
    fetch("/api/calendar")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) { setError(true); return; }
        setEvents(json.events ?? []);
        setUpdatedAt(json.updatedAt ?? null);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // 오늘 날짜 행으로 스크롤
  // - display:none 상태(숨겨진 인스턴스)이면 getBoundingClientRect()가 0을 반환하므로 스킵
  // - window resize 시 재실행: 화면 폭 변화로 이 위젯이 보이게 될 때도 올바르게 스크롤
  useEffect(() => {
    if (loading || !isSameMonth(currentMonth, today)) return;

    const doScroll = (animate: boolean) => {
      const container = scrollRef.current;
      const item = todayRef.current;
      if (!container || !item) return;
      // offsetParent === null → 해당 요소 또는 부모가 display:none → 숨겨진 인스턴스 스킵
      if (container.offsetParent === null) return;
      const offset =
        item.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop;
      container.scrollTo({ top: Math.max(0, offset), behavior: animate ? "smooth" : "instant" });
    };

    // 초기 로딩 후 스크롤 (smooth)
    const initTimer = setTimeout(() => doScroll(true), 200);

    // 화면 크기 변경 시 재스크롤 (instant, 150ms debounce)
    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => doScroll(false), 150);
    };
    window.addEventListener("resize", onResize);

    return () => {
      clearTimeout(initTimer);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    };
  }, [loading, currentMonth]);

  /**
   * 멀티데이 이벤트 확장
   * 종일 이벤트: start.date ~ end.date (end는 exclusive)
   */
  const eventsByDay = events.reduce(
    (acc, ev) => {
      const startKey = ev.start.slice(0, 10);
      if (ev.isAllDay) {
        const endKey = ev.end.slice(0, 10);
        const startDate = parseISO(startKey);
        const lastDay = addDays(parseISO(endKey), -1);
        const actualLast = isBefore(lastDay, startDate) ? startDate : lastDay;
        eachDayOfInterval({ start: startDate, end: actualLast }).forEach((day) => {
          const key = format(day, "yyyy-MM-dd");
          if (!acc[key]) acc[key] = [];
          if (!acc[key].find((e) => e.id === ev.id)) acc[key].push(ev);
        });
      } else {
        if (!acc[startKey]) acc[startKey] = [];
        acc[startKey].push(ev);
      }
      return acc;
    },
    {} as Record<string, CalendarEvent[]>,
  );

  const monthDays = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  // 현재월 기준 -3개월 ~ +6개월 탐색 허용 (동적)
  const yearStart = startOfMonth(addMonths(today, -3));
  const yearEnd = startOfMonth(addMonths(today, 6));
  const canGoPrev = !isSameMonth(currentMonth, yearStart);
  const canGoNext = !isSameMonth(currentMonth, yearEnd);

  return (
    <>
      {/* ── 팝업 ── */}
      {selectedEvent && (
        <EventDetailPopup
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* ── 풀스크린 달력 모달 ── */}
      {isFullCalendarOpen && (
        <FullCalendarModal
          events={events}
          onClose={() => setIsFullCalendarOpen(false)}
        />
      )}

      {/* ── 위젯 본체 ── */}
      <div className={`bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col w-full ${className ?? ""}`}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => !loading && !error && setIsFullCalendarOpen(true)}
              title="달력으로 보기"
              className={`text-lg leading-none transition-transform hover:scale-110 ${!loading && !error ? "cursor-pointer" : "cursor-default"}`}
            >📅</button>
            <h3 className="font-bold text-gray-800 text-sm">사역 일정<span className="hidden sm:inline">(구글 캘린더)</span></h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                disabled={!canGoPrev}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed text-gray-500 text-base font-bold"
              >‹</button>
              <span className="text-sm font-bold text-gray-700 w-12 text-center">
                {format(currentMonth, "M월", { locale: ko })}
              </span>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                disabled={!canGoNext}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed text-gray-500 text-base font-bold"
              >›</button>
            </div>
            {updatedAt && (
              <span className="text-[10px] text-gray-300">
                {format(parseISO(updatedAt), "HH:mm")} 기준
              </span>
            )}
          </div>
        </div>

        {/* 본문 스크롤 */}
        <div
          ref={scrollRef}
          className="divide-y divide-gray-50 flex-1 min-h-0 overflow-y-auto max-h-[300px] sm:max-h-[520px]"
        >
          {loading && (
            <div className="p-5 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse flex gap-3">
                  <div className="w-14 h-4 bg-gray-100 rounded" />
                  <div className="flex-1 h-4 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="p-5 text-center text-sm text-gray-400">
              일정을 불러오지 못했습니다.
            </div>
          )}

          {!loading && !error &&
            monthDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay[key] ?? [];
              const isCurrentDay = isToday(day);

              return (
                <div
                  key={key}
                  ref={isCurrentDay ? todayRef : null}
                  className={[
                    "px-5 py-3 transition-colors",
                    isCurrentDay ? "bg-blue-50" : "",
                  ].join(" ")}
                >
                  {/* 날짜 헤더 */}
                  <p className={`text-xs font-bold mb-1.5 flex items-center gap-1.5 ${
                    isCurrentDay ? "text-blue-600" : "text-gray-500"
                  }`}>
                    {format(day, "d일 (E)", { locale: ko })}
                    {isCurrentDay && (
                      <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full leading-none">
                        TODAY
                      </span>
                    )}
                  </p>

                  {/* 이벤트 or 일정없음 */}
                  {dayEvents.length === 0 ? (
                    <p className="text-[11px] text-gray-300 pl-1">일정 없음</p>
                  ) : (
                    <div className="space-y-1.5">
                      {[...dayEvents]
                        .sort((a, b) => {
                          if (a.isAllDay && !b.isAllDay) return -1;
                          if (!a.isAllDay && b.isAllDay) return 1;
                          return a.start.localeCompare(b.start);
                        })
                        .map((ev) => {
                          const cs = getCalendarStyle(ev.calendarName);
                          return (
                            <div
                              key={`${key}-${ev.id}`}
                              className="flex items-start gap-2 cursor-pointer rounded-lg px-1 py-0.5 hover:bg-gray-50 transition-colors group"
                              onClick={() => setSelectedEvent(ev)}
                            >
                              <span
                                className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: cs.dot }}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate leading-tight text-gray-800 group-hover:text-blue-600 transition-colors">
                                  {ev.title}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {ev.isAllDay ? (
                                    <span className="text-[11px] text-gray-400">하루 종일</span>
                                  ) : (
                                    <span className="text-[11px] text-gray-400">
                                      {format(parseISO(ev.start), "HH:mm")}
                                      {" – "}
                                      {format(parseISO(ev.end), "HH:mm")}
                                    </span>
                                  )}
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded-sm font-semibold truncate max-w-[140px]"
                                    style={{
                                      backgroundColor: cs.badgeBg,
                                      color: cs.badgeText,
                                    }}
                                  >
                                    {ev.calendarName}
                                  </span>
                                </div>
                                {ev.location && (
                                  <p className="text-[11px] text-gray-400 truncate mt-0.5">
                                    📍 {ev.location}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}
