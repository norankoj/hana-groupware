"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
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
import ScheduleAddModal, {
  type EditableSchedule,
} from "@/components/ScheduleAddModal";
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
  user_id?: string;
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

const TEAM_STYLES: Record<
  number,
  { bg: string; text: string; border: string }
> = {
  1: {
    bg: "bg-yellow-100",
    text: "text-yellow-700",
    border: "border-yellow-200",
  },
  2: {
    bg: "bg-purple-100",
    text: "text-purple-700",
    border: "border-purple-200",
  },
  3: {
    bg: "bg-teal-100",
    text: "text-teal-700",
    border: "border-teal-200",
  },
};

const TEAM_COLORS: Record<number, string> = {
  1: "bg-yellow-400",
  2: "bg-purple-500",
  3: "bg-teal-500",
};

const DEFAULT_STYLE = {
  bg: "bg-gray-100",
  text: "text-gray-700",
  border: "border-gray-200",
};

const SCHEDULE_STYLE = {
  bg: "bg-indigo-50",
  text: "text-indigo-700",
  border: "border-indigo-200",
};

const BIRTHDAY_STYLE = {
  bg: "bg-pink-50",
  text: "text-pink-600",
  border: "border-pink-200",
};

// 생일 데이터 (MM-DD → 이름 배열)
const BIRTHDAYS: Record<string, string[]> = {
  "01-04": ["최성우 간사님"],
  "01-12": ["박현배 간사님"],
  "01-31": ["고성호 실장님"],
  // "02-19": ["허도영 목사님"],
  "02-20": ["박희주 목사님", "장혜영 간사님"],
  "02-22": ["안진환 간사님"],
  "03-21": ["최은빈 간사님"],
  "03-25": ["신상철 목사님"],
  "04-02": ["김건웅 간사님"],
  "04-08": ["최해람 간사님"],
  "04-24": ["고성준 목사님"],
  "04-25": ["김세빛 전도사님"],
  "06-03": ["이지형 간사님"],
  "06-05": ["이요한 전도사님"],
  "07-05": ["차주은 간사님"],
  "07-12": ["이성진 목사님", "김태환 전도사님"],
  "08-03": ["김동희 전도사님"],
  "08-29": ["이민형 간사님"],
  "09-02": ["이원근 전도사님"],
  "09-07": ["한엘리야 목사님"],
  "09-11": ["윤성철 목사님"],
  "09-29": ["이정민 간사님"],
  "11-06": ["박수경 사모님"],
  "11-10": ["노나연 간사님"],
  "12-02": ["김완호 간사님"],
  "12-10": ["국승혜 사모님", "정경아 간사님"],
  "12-17": ["김세록 간사님"],
};

// 특정 날짜의 생일자 조회 (MM-DD 기준)
const getBirthdaysOnDate = (dateStr: string): string[] => {
  const mmdd = dateStr.slice(5); // "yyyy-MM-dd" → "MM-dd"
  return BIRTHDAYS[mmdd] || [];
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
  const [editEvent, setEditEvent] = useState<EditableSchedule | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDetailEvent, setSelectedDetailEvent] =
    useState<CalendarEvent | null>(null);

  useEffect(() => {
    updateSelectedEvents(date, allEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents]);

  const updateSelectedEvents = (targetDate: Date, events: CalendarEvent[]) => {
    const dateStr = format(targetDate, "yyyy-MM-dd");
    const holiday = HOLIDAYS[dateStr];
    const filtered = events.filter(
      (e) =>
        dateStr >= e.start_date &&
        dateStr <= e.end_date &&
        // 비전트립은 공휴일이어도 표시
        (!holiday || e.title === "비전트립"),
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

  const handleEditSchedule = (event: CalendarEvent) => {
    setEditEvent({
      original_id: event.original_id,
      title: event.title,
      start_date: event.start_date,
      end_date: event.end_date,
      time_label: event.time_label,
      location: event.location,
      attendees: event.attendees,
    });
    setDetailModalOpen(false);
    setIsScheduleModalOpen(true);
  };

  const handleDeleteSchedule = async (event: CalendarEvent) => {
    if (event.type !== "schedule") return;
    const supabase = createClient();
    const { error } = await supabase
      .from("user_schedules")
      .delete()
      .eq("id", event.original_id);
    if (error) {
      toast.error("삭제 실패: " + error.message);
    } else {
      toast.success("일정이 삭제되었습니다.");
      setDetailModalOpen(false);
      onRefresh();
    }
  };

  return (
    <>
      <style>{calendarCustomStyles}</style>

      <section className="flex-1 order-2 2xl:order-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col h-auto lg:h-[820px]">
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
              통합 일정
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
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                <span className="text-xs text-indigo-700 font-bold">
                  사역/외근
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setEditEvent(null);
                setIsScheduleModalOpen(true);
              }}
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
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-y-4 mb-4 w-full">
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
                    const birthdays = getBirthdaysOnDate(dateStr);
                    const eventsOnDay = allEvents.filter(
                      (e) =>
                        dateStr >= e.start_date &&
                        dateStr <= e.end_date &&
                        // 비전트립은 공휴일이어도 표시, 그 외 vacation은 공휴일 제외
                        (!holiday || e.title === "비전트립"),
                    );
                    const allItems = [
                      ...birthdays.map((name) => ({
                        type: "birthday" as const,
                        text: `🎂${name}`,
                      })),
                      ...eventsOnDay.map((e) => ({
                        type: e.type,
                        text:
                          e.type === "schedule"
                            ? e.title
                            : `${e.display_name} ${e.title}`,
                        style:
                          e.type === "schedule"
                            ? SCHEDULE_STYLE
                            : TEAM_STYLES[e.profiles.team_id] || DEFAULT_STYLE,
                      })),
                    ];
                    const maxDisplay = 2;
                    const displayItems = allItems.slice(0, maxDisplay);
                    const overflowCount = allItems.length - maxDisplay;

                    return (
                      <div className="flex flex-col items-center w-full h-full pt-1 overflow-hidden">
                        {holiday && (
                          <div className="text-[10px] text-red-500 font-medium truncate px-1 w-full text-center mt-0.5">
                            {holiday}
                          </div>
                        )}
                        <div className="w-full flex flex-col gap-0.5 mt-1 px-0.5">
                          {displayItems.map((item, i) => {
                            const style =
                              item.type === "birthday"
                                ? BIRTHDAY_STYLE
                                : (item as any).style || DEFAULT_STYLE;
                            return (
                              <div
                                key={`${dateStr}_${i}`}
                                className={`text-[9px] ${style.bg} ${style.text} border ${style.border} rounded px-1 py-0.5 truncate text-center font-bold cursor-pointer hover:opacity-80 transition-opacity`}
                              >
                                {item.text}
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
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    const holiday = HOLIDAYS[dateStr];
                    const eventsOnDay = allEvents.filter(
                      (e) => dateStr >= e.start_date && dateStr <= e.end_date,
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
                          {getBirthdaysOnDate(dateStr).map((name, bi) => (
                            <div
                              key={`bday_${dateStr}_${bi}`}
                              className={`px-2 py-1 rounded-md inline-flex items-center gap-1 text-xs font-bold border hover:opacity-80 transition-opacity ${BIRTHDAY_STYLE.bg} ${BIRTHDAY_STYLE.text} ${BIRTHDAY_STYLE.border}`}
                            >
                              🎂{name}
                            </div>
                          ))}
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
                총{" "}
                {selectedEvents.length +
                  getBirthdaysOnDate(format(date, "yyyy-MM-dd")).length}
                건
              </span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
              {selectedEvents.length > 0 ||
              getBirthdaysOnDate(format(date, "yyyy-MM-dd")).length > 0 ? (
                <ul className="divide-y divide-gray-100">
                  {getBirthdaysOnDate(format(date, "yyyy-MM-dd")).map(
                    (name, bi) => (
                      <li
                        key={`bday_side_${bi}`}
                        className="flex items-center justify-between px-5 py-3.5 hover:bg-pink-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-lg bg-pink-50 border border-pink-200">
                            🎂
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-gray-900">
                              {name}
                            </span>
                            <span className="text-xs text-pink-500 font-medium">
                              생일 축하합니다!
                            </span>
                          </div>
                        </div>
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold border bg-pink-50 text-pink-600 border-pink-100">
                          생일
                        </span>
                      </li>
                    ),
                  )}
                  {selectedEvents.map((e) => (
                    <li
                      key={e.id}
                      onClick={() => openEventDetail(e)}
                      className="group flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div
                          className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs border ${e.type === "schedule" ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "bg-gray-100 border-gray-200 text-gray-500"}`}
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
                              className={`text-xs text-gray-500 truncate ${e.type === "schedule" && "font-semibold text-indigo-600"}`}
                            >
                              {e.title}
                              {e.type === "vacation" &&
                                e.start_date !== e.end_date && (
                                  <span className="text-gray-400 font-normal">
                                    ({e.start_date.slice(5).replace("-", ".")}
                                    &nbsp;~&nbsp;
                                    {e.end_date.slice(5).replace("-", ".")})
                                  </span>
                                )}
                              {e.location && ` (${e.location})`}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0 pl-2">
                        <span
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold border ${e.type === "schedule" ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-blue-50 text-blue-600 border-blue-100"}`}
                        >
                          {e.type === "schedule" ? "일정" : "휴가"}
                        </span>
                        {e.type === "schedule" && (
                          <span className="text-[11px] text-gray-400 font-medium tabular-nums tracking-tight">
                            {e.time_label}
                          </span>
                        )}
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
        editEvent={editEvent}
      />
      <ScheduleDetailModal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        event={selectedDetailEvent}
        profile={profile}
        onDelete={handleDeleteSchedule}
        onEdit={handleEditSchedule}
      />
    </>
  );
}
