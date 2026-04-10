"use client";

import { useEffect, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
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

  const today = startOfDay(new Date());
  const baseMonth = startOfMonth(today);
  const prevMonth = subMonths(baseMonth, 1);
  const nextMonth = addMonths(baseMonth, 1);
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

  // 로딩 완료 후 오늘 날짜를 스크롤 컨테이너 맨 위로 스크롤
  useEffect(() => {
    if (!loading && todayRef.current && scrollRef.current && isSameMonth(currentMonth, today)) {
      setTimeout(() => {
        const container = scrollRef.current;
        const item = todayRef.current;
        if (!container || !item) return;
        const itemRect = item.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const scrollOffset = itemRect.top - containerRect.top + container.scrollTop;
        container.scrollTo({ top: Math.max(0, scrollOffset), behavior: "smooth" });
      }, 200);
    }
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

  const canGoPrev = !isSameMonth(currentMonth, prevMonth);
  const canGoNext = !isSameMonth(currentMonth, nextMonth);

  return (
    <>
      {/* ── 팝업 ── */}
      {selectedEvent && (
        <EventDetailPopup
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* ── 위젯 본체 ── */}
      <div className={`bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col w-full ${className ?? ""}`}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <span className="text-lg">📅</span>
            <h3 className="font-bold text-gray-800 text-sm">사역 일정(구글 캘린더)</h3>
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
