"use client";

import { useState } from "react";
import {
  format,
  startOfWeek,
  addDays,
  addWeeks,
  subWeeks,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import { ko } from "date-fns/locale";

type VehicleLog = {
  id: number;
  resource_id: number;
  user_id: string;
  start_at: string;
  end_at: string;
  driver_name: string;
  department?: string;
  destination: string;
  purpose: string;
  vehicle_status: "reserved" | "in_use" | "returned" | "noshow";
  resources?: { name: string; description: string; insurance_info?: string; fuel_segments?: number };
};

type Vehicle = {
  id: number;
  name: string;
};

type Props = {
  vehicles: Vehicle[];
  logs: VehicleLog[];
  onSelectLog: (log: VehicleLog) => void;
};

type ViewMode = "week" | "month";

const STATUS_BG: Record<string, string> = {
  reserved: "bg-blue-500",
  in_use: "bg-green-500",
  returned: "bg-gray-400",
  noshow: "bg-orange-400",
};
const STATUS_LABEL: Record<string, string> = {
  reserved: "예약",
  in_use: "운행중",
  returned: "반납",
  noshow: "노쇼",
};

const DAY_KO = ["월", "화", "수", "목", "금", "토", "일"];

function overlapsDay(log: VehicleLog, day: Date) {
  const start = new Date(log.start_at);
  const end = new Date(log.end_at);
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);
  return start <= dayEnd && end >= dayStart;
}

/** 주간 뷰 헤더 + 월간 뷰 헤더 공통 네비게이션 */
function NavHeader({
  label,
  onPrev,
  onNext,
  onToday,
  viewMode,
  setViewMode,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
}) {
  return (
    <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-1.5">
        <button
          onClick={onPrev}
          className="p-1.5 hover:bg-gray-200 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-bold text-gray-700 min-w-[170px] text-center">{label}</span>
        <button
          onClick={onNext}
          className="p-1.5 hover:bg-gray-200 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          onClick={onToday}
          className="px-2.5 py-1 text-xs font-bold bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition ml-1"
        >
          오늘
        </button>
      </div>
      <div className="flex gap-1 bg-gray-200 p-1 rounded-lg">
        <button
          onClick={() => setViewMode("week")}
          className={`px-3 py-1 text-xs font-bold rounded-md transition ${
            viewMode === "week" ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          주간
        </button>
        <button
          onClick={() => setViewMode("month")}
          className={`px-3 py-1 text-xs font-bold rounded-md transition ${
            viewMode === "month" ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          월간
        </button>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-500 bg-white">
      {Object.entries(STATUS_LABEL).map(([key, label]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-sm ${STATUS_BG[key]}`} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

export default function ScheduleTab({ vehicles, logs, onSelectLog }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  // ── 주간 뷰 ────────────────────────────────────────────────────────────────
  if (viewMode === "week") {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const weekLabel = `${format(weekStart, "yyyy년 M월 d일")} ~ ${format(weekDays[6], "M월 d일")}`;

    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <NavHeader
          label={weekLabel}
          onPrev={() => setCurrentDate(subWeeks(currentDate, 1))}
          onNext={() => setCurrentDate(addWeeks(currentDate, 1))}
          onToday={() => setCurrentDate(new Date())}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="w-[90px] min-w-[90px] px-3 py-2.5 text-left text-xs font-bold text-gray-500 bg-gray-50 sticky left-0 z-10 border-r border-gray-200">
                  차량
                </th>
                {weekDays.map((day, i) => {
                  const isSat = i === 5;
                  const isSun = i === 6;
                  const today = isToday(day);
                  return (
                    <th
                      key={i}
                      className={`px-1 py-2.5 text-center text-xs font-bold ${
                        today ? "text-blue-600" : isSat ? "text-blue-400" : isSun ? "text-red-400" : "text-gray-500"
                      } bg-gray-50`}
                    >
                      <div>{DAY_KO[i]}</div>
                      <div
                        className={`text-base font-bold mt-0.5 leading-none ${
                          today
                            ? "w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto"
                            : ""
                        }`}
                      >
                        {format(day, "d")}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vehicles.map((vehicle) => (
                <tr key={vehicle.id} className="hover:bg-gray-50/30 transition">
                  <td className="px-3 py-2 text-xs font-bold text-gray-700 bg-white sticky left-0 z-10 border-r border-gray-200 align-top whitespace-nowrap">
                    {vehicle.name}
                  </td>
                  {weekDays.map((day, i) => {
                    const isSat = i === 5;
                    const isSun = i === 6;
                    const today = isToday(day);
                    const dayLogs = logs.filter(
                      (l) => l.resource_id === vehicle.id && overlapsDay(l, day)
                    );
                    return (
                      <td
                        key={i}
                        className={`px-1 py-1.5 align-top ${
                          today
                            ? "bg-blue-50/40"
                            : isSat || isSun
                            ? "bg-slate-50/60"
                            : ""
                        }`}
                        style={{ minHeight: 56 }}
                      >
                        <div className="flex flex-col gap-0.5 min-h-[40px]">
                          {dayLogs.map((log) => (
                            <button
                              key={log.id}
                              onClick={() => onSelectLog(log)}
                              title={`${log.driver_name}(${log.department}) · ${format(new Date(log.start_at), "HH:mm")}~${format(new Date(log.end_at), "HH:mm")} · ${log.destination}`}
                              className={`w-full text-left px-1.5 py-1 rounded text-[10px] font-bold leading-tight cursor-pointer hover:opacity-80 transition text-white ${STATUS_BG[log.vehicle_status]}`}
                            >
                              <div className="truncate">{log.driver_name}</div>
                              <div className="opacity-80 font-normal text-[9px]">
                                {format(new Date(log.start_at), "HH:mm")}~{format(new Date(log.end_at), "HH:mm")}
                              </div>
                            </button>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {vehicles.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-sm text-gray-400">
                    등록된 차량이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Legend />
      </div>
    );
  }

  // ── 월간 뷰 ────────────────────────────────────────────────────────────────
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDow = monthStart.getDay(); // 0=Sun
  const startPad = startDow === 0 ? 6 : startDow - 1; // Mon-based padding

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <NavHeader
        label={format(currentDate, "yyyy년 M월", { locale: ko })}
        onPrev={() => setCurrentDate(subMonths(currentDate, 1))}
        onNext={() => setCurrentDate(addMonths(currentDate, 1))}
        onToday={() => setCurrentDate(new Date())}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      <div className="p-3">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_KO.map((d, i) => (
            <div
              key={d}
              className={`text-center text-xs font-bold py-1 ${
                i === 5 ? "text-blue-400" : i === 6 ? "text-red-400" : "text-gray-500"
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startPad }, (_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {monthDays.map((day) => {
            const dow = day.getDay(); // 0=Sun,6=Sat
            const isSat = dow === 6;
            const isSun = dow === 0;
            const today = isToday(day);
            const dayLogs = logs.filter(
              (l) => l.vehicle_status !== "noshow" && overlapsDay(l, day)
            );
            return (
              <div
                key={day.toISOString()}
                className={`min-h-[80px] border rounded-lg p-1 transition ${
                  today
                    ? "border-blue-400 bg-blue-50/50"
                    : "border-gray-100 hover:border-gray-300"
                }`}
              >
                <div
                  className={`text-xs font-bold mb-1 ${
                    today
                      ? "text-blue-600"
                      : isSat
                      ? "text-blue-400"
                      : isSun
                      ? "text-red-400"
                      : "text-gray-700"
                  }`}
                >
                  {format(day, "d")}
                </div>
                <div className="flex flex-col gap-0.5">
                  {dayLogs.slice(0, 4).map((log) => (
                    <button
                      key={log.id}
                      onClick={() => onSelectLog(log)}
                      title={`${log.resources?.name} · ${log.driver_name}(${log.department}) · ${format(new Date(log.start_at), "HH:mm")}~${format(new Date(log.end_at), "HH:mm")}`}
                      className={`w-full text-left px-1 py-0.5 rounded text-[9px] font-bold truncate cursor-pointer hover:opacity-80 transition text-white ${STATUS_BG[log.vehicle_status]}`}
                    >
                      {log.resources?.name} · {log.driver_name}
                    </button>
                  ))}
                  {dayLogs.length > 4 && (
                    <div className="text-[9px] text-gray-400 font-bold pl-0.5">
                      +{dayLogs.length - 4}건
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Legend />
    </div>
  );
}
