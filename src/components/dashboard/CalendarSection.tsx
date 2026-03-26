"use client";

import { useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "@/styles/calendar.css";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
} from "date-fns";
import { ko } from "date-fns/locale";
import { HOLIDAYS } from "@/constants/holidays";
import ScheduleAddModal from "@/components/ScheduleAddModal";
import ScheduleDetailModal from "@/components/ScheduleDetailModal";

const calendarCustomStyles = `
  .react-calendar { width: 100%; height: 100%; border: none; font-family: inherit; display: flex; flex-direction: column; }
  .react-calendar__viewContainer { flex: 1; display: flex; flex-direction: column; }
  .react-calendar__month-view { flex: 1; display: flex; flex-direction: column; }
  .react-calendar__month-view__days { flex: 1 !important; height: 100%; }
  .react-calendar__tile { flex: 1 0 auto !important; height: auto !important; display: flex; flex-direction: column; justify-content: flex-start; padding: 0.5rem 0.25rem !important; }
  @media (max-width: 640px) { .react-calendar__tile { min-height: 80px; } }
`;

type Profile = {
  id: string;
  full_name: string;
  position: string;
  team_id: number;
  role: string;
  status: string;
  is_approver?: boolean;
};

type Attendee = { id: string; name: string };

export type CalendarEvent = {
  id: string;
  original_id: number;
  type: "vacation" | "schedule";
  start_date: string;
  end_date: string;
  title: string;
  time_label: string;
  location?: string;
  display_name: string;
  attendees?: Attendee[];
  profiles: {
    full_name: string;
    position: string;
    team_id: number;
    teams?: { name: string };
  };
};

type TeamInfo = { id: number; name: string };

const TEAM_STYLES: Record<number, { bg: string; text: string; border: string }> =
  {
    4: {
      bg: "bg-purple-100",
      text: "text-purple-700",
      border: "border-purple-200",
    },
    5: {
      bg: "bg-emerald-100",
      text: "text-emerald-700",
      border: "border-emerald-200",
    },
    6: {
      bg: "bg-yellow-100",
      text: "text-yellow-700",
      border: "border-yellow-200",
    },
  };

const TEAM_COLORS: Record<number, string> = {
  4: "bg-purple-500",
  5: "bg-emerald-500",
  6: "bg-yellow-400",
};

const DEFAULT_STYLE = {
  bg: "bg-gray-100",
  text: "text-gray-700",
  border: "border-gray-200",
};

const SCHEDULE_STYLE = {
  bg: "bg-teal-50",
  text: "text-teal-700",
  border: "border-teal-200",
};

interface Props {
  allEvents: CalendarEvent[];
  teams: TeamInfo[];
  profile: Profile;
  users: Profile[];
  onRefresh: () => void;
}

export default function CalendarSection({
  allEvents,
  teams,
  profile,
  users,
  onRefresh,
}: Props) {
  const [date, setDate] = useState<Date>(new Date());
  const [activeStartDate, setActiveStartDate] = useState<Date>(new Date());
  const [calendarViewMode, setCalendarViewMode] = useState<"month" | "list">(
    "month",
  );
  const [selectedEvents, setSelectedEvents] = useState<CalendarEvent[]>(() => {
    const dateStr = format(new Date(), "yyyy-MM-dd");
    return allEvents.filter(
      (e) => dateStr >= e.start_date && dateStr <= e.end_date,
    );
  });
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDetailEvent, setSelectedDetailEvent] =
    useState<CalendarEvent | null>(null);

  const updateSelectedEvents = (targetDate: Date, events: CalendarEvent[]) => {
    const dateStr = format(targetDate, "yyyy-MM-dd");
    if (HOLIDAYS[dateStr]) return setSelectedEvents([]);
    const filtered = events.filter(
      (e) => dateStr >= e.start_date && dateStr <= e.end_date,
    );
    filtered.sort((a, b) => {
      if (a.type === "vacation" && b.type === "schedule") return -1;
      if (a.type === "schedule" && b.type === "vacation") return 1;
      return a.time_label.localeCompare(b.time_label);
    });
    setSelectedEvents(filtered);
  };

  const onDateChange = (newDate: any) => {
    setDate(newDate);
    updateSelectedEvents(newDate, allEvents);
  };

  const openEventDetail = (event: CalendarEvent) => {
    setSelectedDetailEvent(event);
    setDetailModalOpen(true);
  };

  return (
    <>
      <style>{calendarCustomStyles}</style>

      <section className="flex-1 order-2 2xl:order-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-auto lg:h-[780px]">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/30 shrink-0 gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-hidden">
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 shrink-0"
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
              <h3 className="text-base sm:text-lg font-bold text-gray-800 tracking-tight truncate">
                통합 일정{" "}
                <span className="hidden sm:inline">(휴가 &amp; 사역)</span>
              </h3>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              <div className="hidden md:flex items-center gap-4 mr-2">
                {teams.map((team) => (
                  <div key={team.id} className="flex items-center gap-1.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${TEAM_COLORS[team.id] || "bg-gray-400"}`}
                    ></span>
                    <span className="text-xs text-gray-600 font-medium">
                      {team.name}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5 ml-2 border-l border-gray-300 pl-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
                  <span className="text-xs text-teal-700 font-bold">
                    사역/외근
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(true)}
                className="bg-blue-600 text-white px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-bold shadow-sm hover:bg-blue-700 transition flex items-center gap-1 whitespace-nowrap"
              >
                <svg
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                일정 추가
              </button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row flex-1 overflow-visible lg:overflow-hidden">
            <div className="flex-[2] flex flex-col border-r border-gray-200 p-6 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-y-4 mb-4 w-full">
                <div className="order-1 w-auto sm:w-1/3 flex justify-start">
                  <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button
                      onClick={() => setCalendarViewMode("month")}
                      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${calendarViewMode === "month" ? "bg-white text-blue-600 shadow-sm font-bold" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      달력
                    </button>
                    <button
                      onClick={() => setCalendarViewMode("list")}
                      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${calendarViewMode === "list" ? "bg-white text-blue-600 shadow-sm font-bold" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      리스트
                    </button>
                  </div>
                </div>
                <div className="order-2 sm:order-3 w-auto sm:w-1/3 flex justify-end">
                  <button
                    onClick={() => {
                      const now = new Date();
                      setDate(now);
                      setActiveStartDate(now);
                      updateSelectedEvents(now, allEvents);
                    }}
                    className="px-3 py-1.5 text-sm font-bold bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition border border-blue-100"
                  >
                    오늘
                  </button>
                </div>
                <div className="order-3 sm:order-2 w-full sm:w-1/3 flex items-center justify-center gap-4 mt-2 sm:mt-0">
                  <button
                    onClick={() =>
                      setActiveStartDate(subMonths(activeStartDate, 1))
                    }
                    className="p-2 hover:bg-gray-100 rounded-full transition text-gray-500 hover:text-gray-900"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                  <h2 className="text-xl font-bold text-gray-800 tracking-tight min-w-[110px] text-center">
                    {format(activeStartDate, "yyyy년 M월")}
                  </h2>
                  <button
                    onClick={() =>
                      setActiveStartDate(addMonths(activeStartDate, 1))
                    }
                    className="p-2 hover:bg-gray-100 rounded-full transition text-gray-500 hover:text-gray-900"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden relative h-full min-h-[500px] flex flex-col">
                {calendarViewMode === "month" ? (
                  <Calendar
                    onChange={onDateChange}
                    value={date}
                    activeStartDate={activeStartDate}
                    onActiveStartDateChange={({ activeStartDate: d }) =>
                      d && setActiveStartDate(d)
                    }
                    calendarType="gregory"
                    formatDay={(locale, d) => format(d, "d")}
                    prevLabel={null}
                    nextLabel={null}
                    prev2Label={null}
                    next2Label={null}
                    tileClassName={({ date: d, view }) => {
                      if (view === "month" && HOLIDAYS[format(d, "yyyy-MM-dd")])
                        return "holiday-day";
                    }}
                    tileContent={({ date: d, view }) => {
                      if (view !== "month") return null;
                      const dateStr = format(d, "yyyy-MM-dd");
                      const holiday = HOLIDAYS[dateStr];
                      const eventsOnDay = holiday
                        ? []
                        : allEvents.filter(
                            (e) =>
                              dateStr >= e.start_date &&
                              dateStr <= e.end_date,
                          );
                      const maxDisplay = 3;
                      const displayEvents = eventsOnDay.slice(0, maxDisplay);
                      const overflowCount =
                        eventsOnDay.length - maxDisplay;

                      return (
                        <div className="flex flex-col items-center w-full h-full pt-1 overflow-hidden">
                          {holiday && (
                            <div className="text-[10px] text-red-500 font-medium truncate px-1 w-full text-center mt-0.5">
                              {holiday}
                            </div>
                          )}
                          <div className="w-full flex flex-col gap-0.5 mt-1 px-0.5">
                            {displayEvents.map((e, i) => {
                              const style =
                                e.type === "schedule"
                                  ? SCHEDULE_STYLE
                                  : TEAM_STYLES[e.profiles.team_id] ||
                                    DEFAULT_STYLE;
                              const displayText =
                                e.type === "schedule"
                                  ? e.title
                                  : `${e.display_name} ${e.title}`;
                              return (
                                <div
                                  key={e.id + i}
                                  className={`text-[9px] ${style.bg} ${style.text} border ${style.border} rounded px-1 py-0.5 truncate text-center font-bold cursor-pointer hover:opacity-80 transition-opacity`}
                                >
                                  {displayText}
                                </div>
                              );
                            })}
                            {overflowCount > 0 && (
                              <div className="text-[9px] text-gray-400 text-center font-medium">
                                +{overflowCount}건
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  />
                ) : (
                  <div className="h-full overflow-y-auto divide-y divide-gray-100 custom-scrollbar pr-2">
                    {eachDayOfInterval({
                      start: startOfMonth(activeStartDate),
                      end: endOfMonth(activeStartDate),
                    }).map((day) => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const dayNum = format(day, "d");
                      const dayLabel = format(day, "EEE", { locale: ko });
                      const isWeekend =
                        day.getDay() === 0 || day.getDay() === 6;
                      const holiday = HOLIDAYS[dateStr];
                      const eventsOnDay = allEvents.filter(
                        (e) =>
                          dateStr >= e.start_date && dateStr <= e.end_date,
                      );
                      return (
                        <div
                          key={dateStr}
                          onClick={() => {
                            setDate(day);
                            updateSelectedEvents(day, allEvents);
                          }}
                          className={`py-3 px-3 flex items-start justify-between transition-colors cursor-pointer ${format(date, "yyyy-MM-dd") === dateStr ? "bg-blue-50" : "hover:bg-gray-50"} ${holiday ? "bg-red-50/30" : ""}`}
                        >
                          <div className="flex items-center gap-4 w-20 flex-shrink-0">
                            <span
                              className={`text-lg font-bold ${isWeekend || holiday ? "text-red-500" : "text-gray-800"}`}
                            >
                              {dayNum}
                            </span>
                            <span
                              className={`text-xs uppercase font-medium ${isWeekend || holiday ? "text-red-400" : "text-gray-400"}`}
                            >
                              {dayLabel}
                            </span>
                          </div>
                          <div className="flex-1 flex flex-wrap gap-2">
                            {holiday && (
                              <div className="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-md inline-block">
                                🎉 {holiday}
                              </div>
                            )}
                            {eventsOnDay.map((e) => {
                              const style =
                                e.type === "schedule"
                                  ? SCHEDULE_STYLE
                                  : TEAM_STYLES[e.profiles.team_id] ||
                                    DEFAULT_STYLE;
                              const displayText =
                                e.type === "schedule"
                                  ? e.title
                                  : `${e.display_name} ${e.title}`;
                              return (
                                <div
                                  key={e.id}
                                  className={`px-2 py-1 rounded-md inline-flex items-center gap-1 text-xs font-bold border hover:opacity-80 transition-opacity ${style.bg} ${style.text} ${style.border}`}
                                >
                                  {displayText}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 사이드 패널 (상세 목록) */}
            <div className="w-full lg:w-80 bg-white flex flex-col h-auto lg:h-full lg:border-l border-t lg:border-t-0 border-gray-200">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 h-[72px] shrink-0">
                <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                  {format(date, "M월 d일 (EEE)", { locale: ko })}
                </h4>
                <span className="text-xs font-medium text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200">
                  총 {selectedEvents.length}건
                </span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                {selectedEvents.length > 0 ? (
                  <ul className="divide-y divide-gray-100">
                    {selectedEvents.map((e) => (
                      <li
                        key={e.id}
                        onClick={() => openEventDetail(e)}
                        className="group flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div
                            className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs border ${e.type === "schedule" ? "bg-teal-50 border-teal-200 text-teal-600" : "bg-gray-100 border-gray-200 text-gray-500"}`}
                          >
                            {e.profiles.full_name.slice(0, 1)}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold text-gray-900 truncate">
                                {e.display_name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span
                                className={`text-xs text-gray-500 truncate ${e.type === "schedule" && "font-semibold text-teal-600"}`}
                              >
                                {e.title} {e.location && `(${e.location})`}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0 pl-2">
                          <span
                            className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold border ${e.type === "schedule" ? "bg-teal-50 text-teal-600 border-teal-100" : "bg-blue-50 text-blue-600 border-blue-100"}`}
                          >
                            {e.type === "schedule" ? "일정" : "휴가"}
                          </span>
                          <span className="text-[11px] text-gray-400 font-medium tabular-nums tracking-tight">
                            {e.start_date === e.end_date ? (
                              e.time_label
                            ) : (
                              <>
                                {e.start_date.slice(5).replace("-", ".")}~
                                {e.end_date.slice(5).replace("-", ".")}
                              </>
                            )}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="h-32 lg:h-full flex flex-col items-center justify-center text-center opacity-60">
                    <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mb-3 border border-gray-100">
                      <svg
                        className="w-6 h-6 text-gray-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-400">
                      등록된 일정이 없습니다
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

      <ScheduleAddModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        profile={profile}
        users={users}
        onSuccess={onRefresh}
      />
      <ScheduleDetailModal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        event={selectedDetailEvent}
      />
    </>
  );
}
