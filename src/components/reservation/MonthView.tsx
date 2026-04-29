"use client";

import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { ko } from "date-fns/locale";
import { HOLIDAYS } from "@/constants/holidays";

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
};

interface MonthViewProps {
  currentDate: Date;
  resources: Resource[];
  reservations: Reservation[];
  activeTab: string;
  onDayClick: (date: Date) => void;
  onReservationClick: (r: Reservation) => void;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export default function MonthView({
  currentDate,
  resources,
  reservations,
  activeTab,
  onDayClick,
  onReservationClick,
}: MonthViewProps) {
  const tabResources = resources.filter((r) => r.category === activeTab);
  const monthStart = startOfMonth(currentDate);
  const monthEnd   = endOfMonth(currentDate);
  // 달력 첫/마지막 날 (일요일 시작)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd   = endOfWeek(monthEnd,   { weekStartsOn: 0 });
  const days     = eachDayOfInterval({ start: calStart, end: calEnd });

  const MAX_PILLS = 3;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {DAY_LABELS.map((d, i) => (
          <div
            key={d}
            className={`py-2 text-center text-xs font-bold ${
              i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          const inMonth     = isSameMonth(day, currentDate);
          const todayFlag   = isToday(day);
          const dayStr      = format(day, "yyyy-MM-dd");
          const dayOfWeek   = day.getDay();
          const isSun       = dayOfWeek === 0;
          const isSat       = dayOfWeek === 6;
          const holidayName = HOLIDAYS[dayStr];

          const dayRsv = reservations.filter((r) =>
            tabResources.some((res) => res.id === r.resource_id) &&
            isSameDay(new Date(r.start_at), day),
          );

          const pillsToShow  = dayRsv.slice(0, MAX_PILLS);
          const overflowCount = dayRsv.length - MAX_PILLS;

          return (
            <div
              key={dayStr}
              onClick={() => onDayClick(day)}
              className={`min-h-[90px] border-b border-r border-gray-100 p-1.5 cursor-pointer transition-colors ${
                inMonth ? "bg-white hover:bg-gray-50" : "bg-gray-50/50 hover:bg-gray-100/50"
              } ${todayFlag ? "ring-2 ring-inset ring-blue-400" : ""}`}
              style={{ borderRight: (idx + 1) % 7 === 0 ? "none" : undefined }}
            >
              {/* 날짜 숫자 */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                    todayFlag
                      ? "bg-blue-600 text-white"
                      : isSun || holidayName
                        ? "text-red-500"
                        : isSat
                          ? "text-blue-500"
                          : inMonth
                            ? "text-gray-800"
                            : "text-gray-300"
                  }`}
                >
                  {format(day, "d")}
                </span>
                {holidayName && (
                  <span className="text-[9px] text-red-400 font-medium truncate max-w-[50px] text-right leading-tight">
                    {holidayName}
                  </span>
                )}
              </div>

              {/* 예약 pills */}
              <div className="space-y-0.5">
                {pillsToShow.map((r) => {
                  const res = tabResources.find((res) => res.id === r.resource_id);
                  return (
                    <div
                      key={r.id}
                      onClick={(e) => { e.stopPropagation(); if (!r.isFixed) onReservationClick(r); }}
                      className="rounded px-1.5 py-0.5 text-white text-[10px] truncate font-medium leading-tight cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: r.isFixed ? "#d1d5db" : res?.color ?? "#6b7280" }}
                    >
                      {format(new Date(r.start_at), "HH:mm")} {r.profiles?.full_name ?? r.purpose}
                    </div>
                  );
                })}
                {overflowCount > 0 && (
                  <div className="text-[10px] text-gray-400 font-bold px-1">
                    +{overflowCount}건 더보기
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
