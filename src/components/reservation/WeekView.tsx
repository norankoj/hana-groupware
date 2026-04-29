"use client";

import { format, addDays, isSameDay, differenceInMinutes, setHours, setMinutes } from "date-fns";
import { ko } from "date-fns/locale";
import { useState } from "react";

const START_HOUR = 7;
const END_HOUR = 23;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const TIME_SLOTS = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i);
const HOUR_HEIGHT = 40;
const HEADER_HEIGHT_PX = 52;
const TOTAL_GRID_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;

const TABS = [
  { id: "church", label: "교회 (예배실)" },
  { id: "edu1",   label: "교육관 1" },
  { id: "edu2",   label: "교육관 2" },
];

type Resource = { id: number; name: string; category: string; color: string };
type Reservation = {
  id: number | string;
  resource_id: number;
  user_id: string;
  start_at: string;
  end_at: string;
  purpose: string;
  status: string;
  profiles?: { full_name: string; position: string };
  isFixed?: boolean;
  group_id?: string;
};

interface WeekViewProps {
  weekStart: Date;
  resources: Resource[];
  reservations: Reservation[];
  activeTab: string;
  currentUser: string | null;
  onSlotClick: (resId: number, date: Date, hour: number, minute: number) => void;
  onReservationClick: (r: Reservation) => void;
}

function getBarStyle(startStr: string, endStr: string, dayDate: Date) {
  const start = new Date(startStr);
  const end   = new Date(endStr);
  const gridStart = setHours(setMinutes(new Date(dayDate), 0), START_HOUR);
  let startDiff = differenceInMinutes(start, gridStart);
  let duration  = differenceInMinutes(end, start);
  if (startDiff < 0) { duration += startDiff; startDiff = 0; }
  return {
    top:    `${Math.max(0, (startDiff / 60) * HOUR_HEIGHT)}px`,
    height: `${Math.max(4, (duration / 60) * HOUR_HEIGHT)}px`,
  };
}

export default function WeekView({
  weekStart,
  resources,
  reservations,
  activeTab,
  currentUser,
  onSlotClick,
  onReservationClick,
}: WeekViewProps) {
  const tabResources = resources.filter((r) => r.category === activeTab);
  const [selectedResId, setSelectedResId] = useState<number | null>(null);
  const activeRes = tabResources.find((r) => r.id === selectedResId) ?? tabResources[0] ?? null;

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const nowPos = (() => {
    const now = new Date();
    const minutes = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
    return { minutes, percent: (minutes / 60) * HOUR_HEIGHT };
  })();

  return (
    <div className="flex flex-col h-full">
      {/* 시설 선택 */}
      {tabResources.length > 1 && (
        <div className="flex gap-2 px-1 py-2 flex-wrap">
          {tabResources.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedResId(r.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                activeRes?.id === r.id
                  ? "text-white border-transparent"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
              style={activeRes?.id === r.id ? { backgroundColor: r.color, borderColor: r.color } : {}}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      {/* 그리드 */}
      <div
        className="bg-white border border-gray-200 rounded-xl flex flex-col relative overflow-auto custom-scrollbar pb-px flex-1"
        style={{ maxHeight: "calc(100vh - 260px)" }}
      >
        <div className="flex relative min-w-full">
          {/* 시간 레이블 */}
          <div className="sticky left-0 z-30 bg-white border-r border-gray-200 w-14 shrink-0 flex flex-col shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
            <div className="border-b border-gray-200 bg-gray-50 shrink-0 sticky top-0 z-40" style={{ height: HEADER_HEIGHT_PX }} />
            <div className="relative" style={{ height: TOTAL_GRID_HEIGHT }}>
              {TIME_SLOTS.map((hour, i) => (
                <div
                  key={hour}
                  className="absolute w-full flex items-start justify-center pr-1"
                  style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                >
                  <span className={`text-[10px] font-bold text-gray-400 bg-white px-1 ${i === 0 ? "top-0" : "-top-2.5"} relative z-10`}>
                    {hour}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 7일 컬럼 */}
          <div className="flex flex-1 min-w-0">
            {weekDays.map((day) => {
              const isToday = isSameDay(day, today);
              const dayNum  = day.getDay();
              const isSun   = dayNum === 0;
              const isSat   = dayNum === 6;

              const dayRsv = activeRes
                ? reservations.filter(
                    (r) =>
                      r.resource_id === activeRes.id &&
                      isSameDay(new Date(r.start_at), day),
                  )
                : [];

              return (
                <div key={day.toISOString()} className="flex-1 min-w-[80px] border-r border-gray-200 flex flex-col">
                  {/* 날짜 헤더 */}
                  <div
                    className={`sticky top-0 z-30 border-b border-gray-200 flex flex-col items-center justify-center shrink-0 ${isToday ? "bg-blue-50" : "bg-gray-50"}`}
                    style={{ height: HEADER_HEIGHT_PX }}
                  >
                    <span className={`text-[10px] font-bold ${isSun ? "text-red-500" : isSat ? "text-blue-500" : "text-gray-500"}`}>
                      {format(day, "EEE", { locale: ko })}
                    </span>
                    <span className={`text-sm font-extrabold ${isToday ? "text-blue-600" : isSun ? "text-red-500" : isSat ? "text-blue-500" : "text-gray-800"}`}>
                      {format(day, "d")}
                    </span>
                  </div>

                  {/* 시간 그리드 */}
                  <div className="relative" style={{ height: TOTAL_GRID_HEIGHT }}>
                    {TIME_SLOTS.map((hour, i) => (
                      <div
                        key={hour}
                        className="absolute w-full border-b border-gray-100 flex flex-col"
                        style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                      >
                        {activeRes && (
                          <>
                            <div
                              className="flex-1 border-b border-gray-50 border-dashed cursor-pointer hover:bg-blue-50/40 transition-colors"
                              onClick={() => onSlotClick(activeRes.id, day, hour, 0)}
                            />
                            <div
                              className="flex-1 cursor-pointer hover:bg-blue-50/40 transition-colors"
                              onClick={() => onSlotClick(activeRes.id, day, hour, 30)}
                            />
                          </>
                        )}
                      </div>
                    ))}

                    {/* 예약 블록 */}
                    {dayRsv.map((r) => {
                      const style = getBarStyle(r.start_at, r.end_at, day);
                      const isMyRes = r.user_id === currentUser;
                      return (
                        <div
                          key={r.id}
                          className={`absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-white text-[10px] z-10 flex flex-col justify-center overflow-hidden hover:scale-[1.02] transition-transform cursor-pointer border border-white/20 ${isMyRes ? "brightness-110 ring-1 ring-white" : "opacity-90"}`}
                          style={{ ...style, backgroundColor: r.isFixed ? "#e5e7eb" : activeRes?.color, color: r.isFixed ? "#9ca3af" : "white" }}
                          onClick={(e) => { e.stopPropagation(); if (!r.isFixed) onReservationClick(r); }}
                        >
                          <div className="font-bold truncate leading-tight">{r.profiles?.full_name}</div>
                          <div className="truncate opacity-80 leading-tight">{r.purpose}</div>
                        </div>
                      );
                    })}

                    {/* 현재 시간 선 */}
                    {isToday && nowPos.minutes >= 0 && nowPos.minutes <= TOTAL_HOURS * 60 && (
                      <div
                        className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none flex items-center"
                        style={{ top: nowPos.percent }}
                      >
                        <div className="w-2 h-2 bg-red-500 rounded-full -ml-1" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {activeRes == null && (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
          {tabResources.length === 0 ? "등록된 시설이 없습니다." : "시설을 선택해주세요."}
        </div>
      )}
    </div>
  );
}
