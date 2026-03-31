"use client";

import { useEffect, useState } from "react";
import { format, isToday, isTomorrow, parseISO, isWithinInterval, addDays, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  calendarName: string;
  calendarColor: string;
  location?: string;
};

function getDayLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return "오늘";
  if (isTomorrow(d)) return "내일";
  return format(d, "M월 d일 (E)", { locale: ko });
}

function groupByDay(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  return events.reduce(
    (acc, ev) => {
      const key = ev.isAllDay ? ev.start : ev.start.slice(0, 10);
      if (!acc[key]) acc[key] = [];
      acc[key].push(ev);
      return acc;
    },
    {} as Record<string, CalendarEvent[]>,
  );
}

export default function GoogleCalendarWidget() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
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

  // 오늘~7일 이내만 표시
  const filtered = events.filter((ev) => {
    const d = parseISO(ev.start);
    return isWithinInterval(d, {
      start: startOfDay(new Date()),
      end: addDays(new Date(), 7),
    });
  });

  const grouped = groupByDay(filtered);
  const days = Object.keys(grouped).sort();

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-lg">📅</span>
          <h3 className="font-bold text-gray-800 text-sm">사역 일정 (7일)</h3>
        </div>
        {updatedAt && (
          <span className="text-[10px] text-gray-300">
            {format(parseISO(updatedAt), "HH:mm")} 기준
          </span>
        )}
      </div>

      {/* 본문 */}
      <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
        {loading && (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((i) => (
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

        {!loading && !error && days.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-2xl mb-2">📭</p>
            <p className="text-sm text-gray-400">앞으로 7일간 일정이 없습니다.</p>
          </div>
        )}

        {!loading && !error && days.map((day) => (
          <div key={day} className="px-5 py-3">
            {/* 날짜 헤더 */}
            <p className={`text-xs font-bold mb-2 ${
              isToday(parseISO(day)) ? "text-blue-600" : "text-gray-400"
            }`}>
              {getDayLabel(day)}
              {isToday(parseISO(day)) && (
                <span className="ml-1.5 bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded text-[10px]">
                  TODAY
                </span>
              )}
            </p>

            {/* 이벤트 목록 */}
            <div className="space-y-1.5">
              {grouped[day].map((ev) => (
                <div key={ev.id} className="flex items-start gap-2 group">
                  {/* 캘린더 색상 점 */}
                  <span
                    className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: ev.calendarColor }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate leading-tight">
                      {ev.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {/* 시간 */}
                      {ev.isAllDay ? (
                        <span className="text-[11px] text-gray-400">하루 종일</span>
                      ) : (
                        <span className="text-[11px] text-gray-400">
                          {format(parseISO(ev.start), "HH:mm")}
                          {" – "}
                          {format(parseISO(ev.end), "HH:mm")}
                        </span>
                      )}
                      {/* 캘린더명 */}
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium truncate max-w-[120px]"
                        style={{
                          backgroundColor: ev.calendarColor + "22",
                          color: ev.calendarColor,
                        }}
                      >
                        {ev.calendarName}
                      </span>
                    </div>
                    {/* 장소 */}
                    {ev.location && (
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">
                        📍 {ev.location}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
