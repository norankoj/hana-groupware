"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import { HOLIDAYS } from "@/constants/holidays";

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

type Attendee = {
  id: string;
  name: string;
};

type CalendarEvent = {
  id: string;
  original_id: number;
  type: "vacation" | "schedule";
  start_date: string;
  end_date: string;
  title: string;
  time_label: string;
  location?: string;
  display_name: string;
  attendees?: Attendee[]; // 동행자 명단
  profiles: {
    full_name: string;
    position: string;
    team_id: number;
    teams?: { name: string };
  };
};

type TeamInfo = { id: number; name: string };
type TodayReservation = {
  id: number;
  start_at: string;
  end_at: string;
  purpose: string;
  resources: { name: string; category: string };
  profiles: { full_name: string };
};

const ALLOWED_ROLES = ["admin", "director", "staff"];

const TEAM_STYLES: Record<
  number,
  { bg: string; text: string; border: string }
> = {
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

export default function Home() {
  const supabase = createClient();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [users, setUsers] = useState<Profile[]>([]); // 참석자 선택을 위한 유저 목록
  const [pendingCount, setPendingCount] = useState(0);
  const [myPendingCount, setMyPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<CalendarEvent[]>([]);

  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [date, setDate] = useState<Date>(new Date());
  const [activeStartDate, setActiveStartDate] = useState<Date>(new Date());
  const [calendarViewMode, setCalendarViewMode] = useState<"month" | "list">(
    "month",
  );
  const [parkingText, setParkingText] = useState("");

  const [todayFacilities, setTodayFacilities] = useState<TodayReservation[]>(
    [],
  );
  const [todayVehicles, setTodayVehicles] = useState<TodayReservation[]>([]);

  // 모달 상태들
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDetailEvent, setSelectedDetailEvent] =
    useState<CalendarEvent | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  const [scheduleForm, setScheduleForm] = useState({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    isAllDay: false,
    startTime: "14:00",
    endTime: "16:00",
    location: "",
    attendees: [] as Attendee[], // 선택된 동행자들
  });

  useEffect(() => {
    const today = new Date();
    const dateNum = today.getDate();
    const isEven = dateNum % 2 === 0;
    setParkingText(
      `오늘은 ${dateNum}일, ${isEven ? "짝수" : "홀수"}차량이 주차하는 날입니다.`,
    );
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return router.replace("/login");

    const { data: profileData } = await supabase
      .from("profiles")
      .select(`*, teams!profiles_team_id_fkey(name)`)
      .eq("id", user.id)
      .single();

    if (profileData) {
      setProfile(profileData as any);
      const myRole = profileData.role;

      if (
        myRole === "admin" ||
        myRole === "director" ||
        profileData.is_approver
      ) {
        const { count } = await supabase
          .from("vacation_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending");
        setPendingCount(count || 0);
      }
      const { count: myCount } = await supabase
        .from("vacation_requests")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "pending");
      setMyPendingCount(myCount || 0);

      if (ALLOWED_ROLES.includes(myRole)) {
        // 유저 목록 가져오기 (참석자 선택용)
        const { data: usersData } = await supabase
          .from("profiles")
          .select("id, full_name, position, team_id, role, status")
          .eq("status", "active")
          .in("role", ALLOWED_ROLES)
          .order("full_name");
        if (usersData) setUsers(usersData as any);

        const { data: vacData } = await supabase
          .from("vacation_requests")
          .select(
            `id, start_date, end_date, type, profiles:user_id ( full_name, position, team_id, teams:team_id(name) )`,
          )
          .eq("status", "approved");
        const { data: schData } = await supabase
          .from("user_schedules")
          .select(
            `id, title, start_at, end_at, location, attendees, profiles:user_id ( full_name, position, team_id, teams:team_id(name) )`,
          );
        const { data: teamData } = await supabase
          .from("teams")
          .select("id, name")
          .order("id");
        if (teamData) setTeams(teamData);

        const mergedEvents: CalendarEvent[] = [];

        if (vacData) {
          vacData.forEach((v: any) => {
            mergedEvents.push({
              id: `vac_${v.id}`,
              original_id: v.id,
              type: "vacation",
              start_date: v.start_date,
              end_date: v.end_date,
              title: v.type,
              time_label: "하루 종일",
              display_name: v.profiles.full_name,
              profiles: v.profiles,
            });
          });
        }

        if (schData) {
          schData.forEach((s: any) => {
            const startDate = new Date(s.start_at);
            const endDate = new Date(s.end_at);
            const attendeesArr: Attendee[] = s.attendees || [];

            // "외 N명" 표시 로직
            const displayName =
              attendeesArr.length > 0
                ? `${s.profiles.full_name} 외 ${attendeesArr.length}명`
                : s.profiles.full_name;

            mergedEvents.push({
              id: `sch_${s.id}`,
              original_id: s.id,
              type: "schedule",
              start_date: format(startDate, "yyyy-MM-dd"),
              end_date: format(endDate, "yyyy-MM-dd"),
              title: s.title,
              time_label: `${format(startDate, "HH:mm")}~${format(endDate, "HH:mm")}`,
              location: s.location,
              attendees: attendeesArr,
              display_name: displayName,
              profiles: s.profiles,
            });
          });
        }

        setAllEvents(mergedEvents);
        updateSelectedEvents(new Date(), mergedEvents);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const { data: reservationData } = await supabase
          .from("reservations")
          .select(
            `id, start_at, end_at, purpose, resources(name, category), profiles:user_id(full_name)`,
          )
          .neq("status", "cancelled")
          .gte("start_at", todayStart.toISOString())
          .lte("start_at", todayEnd.toISOString())
          .order("start_at");

        if (reservationData) {
          setTodayFacilities(
            reservationData.filter(
              (r: any) => r.resources?.category !== "vehicle" && r.resources,
            ) as any,
          );
          setTodayVehicles(
            reservationData.filter(
              (r: any) => r.resources?.category === "vehicle" && r.resources,
            ) as any,
          );
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [router, supabase]);

  const onDateChange = (newDate: any) => {
    setDate(newDate);
    updateSelectedEvents(newDate, allEvents);
  };

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

  // 동행자 선택 토글 핸들러
  const toggleAttendee = (user: Profile) => {
    setScheduleForm((prev) => {
      const isSelected = prev.attendees.some((a) => a.id === user.id);
      if (isSelected)
        return {
          ...prev,
          attendees: prev.attendees.filter((a) => a.id !== user.id),
        };
      return {
        ...prev,
        attendees: [...prev.attendees, { id: user.id, name: user.full_name }],
      };
    });
  };

  const toggleAllAttendees = () => {
    const allOtherUsers = users.filter((u) => u.id !== profile?.id);
    if (scheduleForm.attendees.length === allOtherUsers.length) {
      setScheduleForm({ ...scheduleForm, attendees: [] }); // 모두 선택되어 있으면 해제
    } else {
      setScheduleForm({
        ...scheduleForm,
        attendees: allOtherUsers.map((u) => ({ id: u.id, name: u.full_name })),
      }); // 아니면 전체 선택
    }
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm.title || !scheduleForm.date)
      return toast.error("내용을 입력해주세요.");
    if (!profile) return;

    let startDateTime, endDateTime;

    // 하루 종일 체크 여부에 따라 시간 세팅 다르게 처리
    if (scheduleForm.isAllDay) {
      startDateTime = new Date(`${scheduleForm.date}T00:00:00`);
      endDateTime = new Date(`${scheduleForm.date}T23:59:59`);
    } else {
      startDateTime = new Date(
        `${scheduleForm.date}T${scheduleForm.startTime}:00`,
      );
      endDateTime = new Date(`${scheduleForm.date}T${scheduleForm.endTime}:00`);
      if (startDateTime >= endDateTime)
        return toast.error("종료 시간이 시작 시간보다 빠릅니다.");
    }

    setLoading(true);
    const { error } = await supabase.from("user_schedules").insert({
      user_id: profile.id,
      title: scheduleForm.title,
      start_at: startDateTime.toISOString(),
      end_at: endDateTime.toISOString(),
      location: scheduleForm.location,
      attendees: scheduleForm.attendees,
    });

    if (error) {
      toast.error("일정 등록 실패: " + error.message);
    } else {
      toast.success("사역 일정이 등록되었습니다.");
      setIsScheduleModalOpen(false);
      setScheduleForm({
        ...scheduleForm,
        title: "",
        location: "",
        attendees: [],
        isAllDay: false,
      });
      fetchData();
    }
    setLoading(false);
  };

  const openEventDetail = (event: CalendarEvent) => {
    setSelectedDetailEvent(event);
    setDetailModalOpen(true);
  };

  if (loading && !profile)
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-600"></div>
      </div>
    );
  const canViewCalendar = profile && ALLOWED_ROLES.includes(profile.role);

  return (
    <div className="space-y-8">
      <style>{calendarCustomStyles}</style>

      {/* --- [섹션 1] 배너 + 알림 --- */}
      <section className="flex flex-col xl:flex-row gap-6">
        <Link
          href="/mypage"
          className="flex-1 bg-gradient-to-r from-blue-700 to-blue-600 rounded-2xl p-8 text-white shadow-md relative overflow-hidden min-h-[160px] flex flex-col justify-center"
        >
          <div className="relative z-10">
            <h2 className="text-3xl font-bold mb-2">
              안녕하세요, {profile?.full_name}님!
            </h2>
            <p className="text-blue-100 font-medium opacity-90 flex items-center gap-2">
              <span className="bg-white/20 px-2 py-0.5 rounded text-sm">
                Today
              </span>
              {parkingText} 🚗
            </p>
          </div>
          <div className="absolute right-0 top-0 h-full w-1/3 opacity-10 pointer-events-none">
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
              <path
                fill="#FFFFFF"
                d="M44.7,-76.4C58.9,-69.2,71.8,-59.1,81.6,-46.6C91.4,-34.1,98.1,-19.2,95.8,-4.9C93.5,9.4,82.2,23.1,71.6,35.2C61,47.3,51.1,57.8,39.6,66.1C28.1,74.4,15,80.5,1.5,77.9C-12,75.3,-25.9,64,-38.3,53.8C-50.7,43.6,-61.6,34.5,-69.4,22.7C-77.2,10.9,-81.9,-3.6,-78.3,-17C-74.7,-30.4,-62.8,-42.7,-50.2,-50.7C-37.6,-58.7,-24.3,-62.4,-10.5,-64.1C3.3,-65.8,17.1,-65.5,30.5,-75.2L44.7,-76.4Z"
                transform="translate(100 100)"
              />
            </svg>
          </div>
        </Link>
        <div className="flex flex-col sm:flex-row gap-6 w-full xl:w-auto">
          {profile?.is_approver && (
            <Link
              href="/vacation?tab=approve"
              className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer relative overflow-hidden group w-full sm:w-64 flex flex-col justify-between min-h-[160px]"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-1">
                    결재 대기
                  </p>
                  <h3 className="text-3xl font-extrabold text-gray-900">
                    {pendingCount}{" "}
                    <span className="text-sm font-normal text-gray-400">
                      건
                    </span>
                  </h3>
                </div>
                <div
                  className={`p-3 rounded-lg ${pendingCount > 0 ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-300"}`}
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
              </div>
              <div className="mt-4 text-xs font-medium text-red-500 flex items-center gap-1">
                {pendingCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                )}{" "}
                승인이 필요합니다
              </div>
            </Link>
          )}
          {canViewCalendar && (
            <Link
              href="/vacation"
              className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer relative overflow-hidden group w-full sm:w-64 flex flex-col justify-between min-h-[160px]"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-1">
                    내 결재 진행
                  </p>
                  <h3 className="text-3xl font-extrabold text-gray-900">
                    {myPendingCount}{" "}
                    <span className="text-sm font-normal text-gray-400">
                      건
                    </span>
                  </h3>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
              <div className="mt-4 text-xs font-medium text-blue-600">
                처리 결과를 기다리고 있어요
              </div>
            </Link>
          )}
        </div>
      </section>

      {/* --- [섹션 2 & 3] 메인 레이아웃 --- */}
      {canViewCalendar && (
        <div className="flex flex-col 2xl:flex-row gap-6">
          <section className="flex-1 order-2 2xl:order-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-auto lg:h-[780px]">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/30 shrink-0">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-blue-600"
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
                <h3 className="text-lg font-bold text-gray-800 tracking-tight">
                  통합 일정 (휴가 & 사역)
                </h3>
              </div>

              <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-4 mr-2">
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
                  className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm font-bold shadow-sm hover:bg-blue-700 transition flex items-center gap-1"
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
                      onActiveStartDateChange={({ activeStartDate }) =>
                        activeStartDate && setActiveStartDate(activeStartDate)
                      }
                      calendarType="gregory"
                      formatDay={(locale, date) => format(date, "d")}
                      prevLabel={null}
                      nextLabel={null}
                      prev2Label={null}
                      next2Label={null}
                      tileClassName={({ date, view }) => {
                        if (
                          view === "month" &&
                          HOLIDAYS[format(date, "yyyy-MM-dd")]
                        )
                          return "holiday-day";
                      }}
                      tileContent={({ date, view }) => {
                        if (view === "month") {
                          const dateStr = format(date, "yyyy-MM-dd");
                          const holiday = HOLIDAYS[dateStr];
                          const eventsOnDay = holiday
                            ? []
                            : allEvents.filter(
                                (e) =>
                                  dateStr >= e.start_date &&
                                  dateStr <= e.end_date,
                              );
                          const maxDisplay = 3;
                          const displayEvents = eventsOnDay.slice(
                            0,
                            maxDisplay,
                          );
                          const overflowCount = eventsOnDay.length - maxDisplay;

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
                                  return (
                                    <div
                                      key={e.id + i}
                                      // onClick={(ev) => {
                                      //   ev.stopPropagation();
                                      //   openEventDetail(e);
                                      // }}
                                      className={`text-[9px] ${style.bg} ${style.text} border ${style.border} rounded px-1 py-0.5 truncate text-center font-bold cursor-pointer hover:opacity-80 transition-opacity`}
                                    >
                                      {e.display_name}{" "}
                                      {e.type === "schedule" && "📍"}
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
                        }
                      }}
                    />
                  ) : (
                    <div className="h-full overflow-y-auto divide-y divide-gray-100 custom-scrollbar pr-2">
                      {(() => {
                        const daysInMonth = eachDayOfInterval({
                          start: startOfMonth(activeStartDate),
                          end: endOfMonth(activeStartDate),
                        });
                        return daysInMonth.map((day) => {
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
                                  return (
                                    <div
                                      key={e.id}
                                      // onClick={(ev) => {
                                      //   ev.stopPropagation();
                                      //   openEventDetail(e);
                                      // }}
                                      className={`px-2 py-1 rounded-md inline-flex items-center gap-1 text-xs font-bold border hover:opacity-80 transition-opacity ${style.bg} ${style.text} ${style.border}`}
                                    >
                                      {e.display_name}{" "}
                                      <span className="text-[10px] opacity-75">
                                        | {e.title}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        });
                      })()}
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

          {/* B. 위젯 섹션 (기존 코드와 동일) */}
          <div className="order-1 2xl:order-2 w-full 2xl:w-[420px] shrink-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-1 gap-6 h-auto">
              {/* 시설 위젯 */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col max-h-[300px] min-h-[250px]">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <span className="p-2 bg-blue-50 rounded-lg text-blue-600">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        />
                      </svg>
                    </span>
                    오늘의 시설 예약
                  </h3>
                  <Link
                    href="/reservation"
                    className="text-sm text-gray-400 hover:text-blue-600 font-medium flex items-center gap-1 transition-colors"
                  >
                    전체보기
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
                  </Link>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 max-h-[300px] 2xl:max-h-[320px] min-h-[200px]">
                  {todayFacilities.length > 0 ? (
                    <ul className="space-y-3">
                      {todayFacilities.map((res) => (
                        <li
                          key={res.id}
                          className="group p-3 rounded-xl border border-gray-100 bg-gray-50 hover:bg-blue-50 hover:border-blue-100 transition-all cursor-default"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0 mr-3">
                              <div className="font-bold text-gray-800 text-sm mb-0.5 truncate">
                                {res.resources.name}
                              </div>
                              <div className="text-xs text-gray-500 truncate">
                                {res.profiles?.full_name} · {res.purpose}
                              </div>
                            </div>
                            <div className="text-right whitespace-nowrap">
                              <span className="block font-bold text-blue-600 text-sm">
                                {format(new Date(res.start_at), "HH:mm")}
                              </span>
                              <span className="text-xs text-gray-400">
                                ~{format(new Date(res.end_at), "HH:mm")}
                              </span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2 min-h-[150px]">
                      <svg
                        className="w-10 h-10 opacity-20"
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
                      <p className="text-sm">오늘 예약된 일정이 없습니다.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. 오늘의 차량 예약 위젯 */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col max-h-[300px] 2xl:max-h-[320px] min-h-[200px]">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <span className="p-2 bg-blue-50 rounded-lg text-blue-600">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
                        />
                        <circle cx="9" cy="17" r="2" />
                        <circle cx="19" cy="17" r="2" />
                      </svg>
                    </span>
                    오늘의 차량 예약
                  </h3>
                  <Link
                    href="/vehicle"
                    className="text-sm text-gray-400 hover:text-blue-600 font-medium flex items-center gap-1 transition-colors"
                  >
                    전체보기
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
                  </Link>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 max-h-[300px] 2xl:max-h-[320px] min-h-[200px]">
                  {todayVehicles.length > 0 ? (
                    <ul className="space-y-3">
                      {todayVehicles.map((res) => (
                        <li
                          key={res.id}
                          className="group p-3 rounded-xl border border-gray-100 bg-gray-50 hover:bg-blue-50 hover:border-blue-100 transition-all cursor-default"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0 mr-3">
                              <div className="font-bold text-gray-800 text-sm mb-0.5 truncate">
                                {res.resources.name}
                              </div>
                              <div className="text-xs text-gray-500 truncate">
                                {res.profiles?.full_name} · {res.purpose}
                              </div>
                            </div>
                            <div className="text-right whitespace-nowrap">
                              <span className="block font-bold text-blue-600 text-sm">
                                {format(new Date(res.start_at), "HH:mm")}
                              </span>
                              <span className="text-xs text-gray-400">
                                ~{format(new Date(res.end_at), "HH:mm")}
                              </span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2 min-h-[150px]">
                      <svg
                        className="w-10 h-10 opacity-20"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                        />
                      </svg>
                      <p className="text-sm">오늘 예약된 차량이 없습니다.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 일정 추가 모달 */}
      <Modal
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setShowDatePicker(false);
        }}
        title="새로운 사역 일정 추가"
        footer={
          <div className="flex gap-2 w-full">
            <button
              onClick={handleAddSchedule}
              disabled={loading}
              className="flex-1 bg-teal-600 text-white py-3 rounded-lg font-bold hover:bg-teal-700 transition shadow-sm disabled:opacity-50"
            >
              {loading ? "등록 중..." : "일정 등록"}
            </button>
            <button
              onClick={() => {
                setIsScheduleModalOpen(false);
                setShowDatePicker(false);
              }}
              className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-200 transition"
            >
              취소
            </button>
          </div>
        }
      >
        <form onSubmit={handleAddSchedule} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              일정 내용 (필수)
            </label>
            <input
              type="text"
              placeholder="예: 용인 심방, 수련회 답사"
              value={scheduleForm.title}
              onChange={(e) =>
                setScheduleForm({ ...scheduleForm, title: e.target.value })
              }
              className="w-full border p-3 rounded-lg border-gray-300 focus:border-teal-500 outline-none text-gray-900 bg-white font-medium"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              장소 (선택)
            </label>
            <input
              type="text"
              placeholder="예: 용인 수지구"
              value={scheduleForm.location}
              onChange={(e) =>
                setScheduleForm({ ...scheduleForm, location: e.target.value })
              }
              className="w-full border p-3 rounded-lg border-gray-300 focus:border-teal-500 outline-none text-gray-900 bg-white"
            />
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-gray-700">
                날짜 및 시간
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scheduleForm.isAllDay}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      isAllDay: e.target.checked,
                    })
                  }
                  className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500 cursor-pointer"
                />
                <span className="text-sm font-bold text-teal-700">
                  하루 종일
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-3">
              {/* 커스텀 달력 선택기 */}
              <div className="relative" ref={datePickerRef}>
                <div
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="w-full border p-3 rounded-lg border-gray-300 bg-white cursor-pointer flex justify-between items-center hover:border-teal-500 transition-colors"
                >
                  <span className="font-bold text-gray-900">
                    {scheduleForm.date}
                  </span>
                  <svg
                    className="w-5 h-5 text-gray-400"
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
                </div>
                {showDatePicker && (
                  <div className="absolute z-[60] mt-2 left-0 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 w-full sm:w-[320px] animate-fadeIn">
                    <Calendar
                      onChange={(val) => {
                        setScheduleForm({
                          ...scheduleForm,
                          date: format(val as Date, "yyyy-MM-dd"),
                        });
                        setShowDatePicker(false);
                      }}
                      value={new Date(scheduleForm.date)}
                      formatDay={(_, date) => format(date, "d")}
                      calendarType="gregory"
                      locale="ko-KR"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDatePicker(false)}
                      className="w-full mt-2 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 text-gray-600 font-bold"
                    >
                      닫기
                    </button>
                  </div>
                )}
              </div>

              {/* 시간 선택 (하루 종일이 아닐 때만 노출) */}
              {!scheduleForm.isAllDay && (
                <div className="flex items-center gap-2 animate-fadeIn">
                  <input
                    type="time"
                    value={scheduleForm.startTime}
                    onChange={(e) =>
                      setScheduleForm({
                        ...scheduleForm,
                        startTime: e.target.value,
                      })
                    }
                    className="flex-1 border p-3 rounded-lg border-gray-300 focus:border-teal-500 outline-none text-gray-900 bg-white font-bold"
                    required
                  />
                  <span className="text-gray-400 font-bold">~</span>
                  <input
                    type="time"
                    value={scheduleForm.endTime}
                    onChange={(e) =>
                      setScheduleForm({
                        ...scheduleForm,
                        endTime: e.target.value,
                      })
                    }
                    className="flex-1 border p-3 rounded-lg border-gray-300 focus:border-teal-500 outline-none text-gray-900 bg-white font-bold"
                    required
                  />
                </div>
              )}
            </div>
          </div>

          {/* 동행자 선택 영역 (전체 선택 추가) */}
          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-bold text-gray-700">
                동행자 선택 (선택사항)
              </label>
              <button
                type="button"
                onClick={toggleAllAttendees}
                className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-1.5 rounded-md hover:bg-teal-100 transition-colors"
              >
                {scheduleForm.attendees.length ===
                users.filter((u) => u.id !== profile?.id).length
                  ? "전체 해제"
                  : "전체 선택"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar p-1">
              {users
                .filter((u) => u.id !== profile?.id)
                .map((u) => {
                  const isSelected = scheduleForm.attendees.some(
                    (a) => a.id === u.id,
                  );
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleAttendee(u)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${isSelected ? "bg-teal-500 text-white shadow-sm ring-2 ring-teal-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    >
                      {u.full_name}
                    </button>
                  );
                })}
            </div>
          </div>
        </form>
      </Modal>

      {/* 일정 상세 보기 모달 */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={
          selectedDetailEvent?.type === "schedule"
            ? "사역 일정 상세"
            : "휴가 상세"
        }
        footer={
          <button
            onClick={() => setDetailModalOpen(false)}
            className="w-full bg-gray-100 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-200 transition"
          >
            닫기
          </button>
        }
      >
        {selectedDetailEvent && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl ${selectedDetailEvent.type === "schedule" ? "bg-teal-50 text-teal-600" : "bg-blue-50 text-blue-600"}`}
              >
                {selectedDetailEvent.type === "schedule" ? "📍" : "🌴"}
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {selectedDetailEvent.title}
                </h3>
                <p className="text-sm text-gray-500">
                  {selectedDetailEvent.time_label}{" "}
                  {selectedDetailEvent.location &&
                    `· ${selectedDetailEvent.location}`}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-4 bg-gray-50 p-4 rounded-xl">
                <span className="text-sm font-bold text-gray-500 w-12 shrink-0">
                  등록자
                </span>
                <span className="text-sm font-bold text-gray-900">
                  {selectedDetailEvent.profiles.full_name}{" "}
                  <span className="text-xs font-normal text-gray-500">
                    ({selectedDetailEvent.profiles.position})
                  </span>
                </span>
              </div>

              {selectedDetailEvent.type === "schedule" &&
                selectedDetailEvent.attendees &&
                selectedDetailEvent.attendees.length > 0 && (
                  <div className="flex items-start gap-4 bg-teal-50/50 border border-teal-100 p-4 rounded-xl">
                    <span className="text-sm font-bold text-teal-700 w-12 shrink-0">
                      동행자
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedDetailEvent.attendees.map((a) => (
                        <span
                          key={a.id}
                          className="px-2 py-1 bg-white border border-teal-200 text-teal-700 text-xs font-bold rounded-md shadow-sm"
                        >
                          {a.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
