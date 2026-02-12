"use client";

import { useEffect, useState } from "react";
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
  teams?: { name: string } | { name: string }[] | null;
  is_approver?: boolean;
};

type VacationInfo = {
  id: number;
  start_date: string;
  end_date: string;
  type: string;
  profiles: {
    full_name: string;
    position: string;
    team_id: number;
    is_approver: boolean;
    teams: { name: string };
  };
};

type TeamInfo = {
  id: number;
  name: string;
};

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

export default function Home() {
  const supabase = createClient();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [myPendingCount, setMyPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [allVacations, setAllVacations] = useState<VacationInfo[]>([]);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [date, setDate] = useState<Date>(new Date());
  const [activeStartDate, setActiveStartDate] = useState<Date>(new Date());
  const [calendarViewMode, setCalendarViewMode] = useState<"month" | "list">(
    "month",
  );
  const [selectedVacations, setSelectedVacations] = useState<VacationInfo[]>(
    [],
  );
  const [parkingText, setParkingText] = useState("");

  const [todayFacilities, setTodayFacilities] = useState<TodayReservation[]>(
    [],
  );
  const [todayVehicles, setTodayVehicles] = useState<TodayReservation[]>([]);

  useEffect(() => {
    const today = new Date();
    const dateNum = today.getDate();
    const isEven = dateNum % 2 === 0;
    setParkingText(
      `오늘은 ${dateNum}일, ${isEven ? "짝수" : "홀수"}차량이 주차하는 날입니다.`,
    );
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

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
          const { data: vacData } = await supabase
            .from("vacation_requests")
            .select(
              `id, start_date, end_date, type, profiles:user_id ( full_name, position, team_id, teams:team_id(name) )`,
            )
            .eq("status", "approved")
            .order("start_date");

          const { data: teamData } = await supabase
            .from("teams")
            .select("id, name")
            .order("id");

          if (vacData) {
            setAllVacations(vacData as any);
            updateSelectedVacations(new Date(), vacData as any);
          }
          if (teamData) setTeams(teamData);

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
            const facilities = reservationData.filter(
              (r) => r.resources?.category !== "vehicle" && r.resources,
            );
            const vehicles = reservationData.filter(
              (r) => r.resources?.category === "vehicle" && r.resources,
            );
            setTodayFacilities(facilities as any);
            setTodayVehicles(vehicles as any);
          }
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [router, supabase]);

  const onDateChange = (newDate: any) => {
    setDate(newDate);
    updateSelectedVacations(newDate, allVacations);
  };

  const updateSelectedVacations = (
    targetDate: Date,
    vacations: VacationInfo[],
  ) => {
    const dateStr = format(targetDate, "yyyy-MM-dd");
    if (HOLIDAYS[dateStr]) {
      setSelectedVacations([]);
      return;
    }
    const filtered = vacations.filter(
      (v) => dateStr >= v.start_date && dateStr <= v.end_date,
    );
    setSelectedVacations(filtered);
  };

  if (loading)
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
        {/* 1. 웰컴 배너 */}
        <div className="flex-1 bg-gradient-to-r from-blue-700 to-blue-600 rounded-2xl p-8 text-white shadow-md relative overflow-hidden min-h-[160px] flex flex-col justify-center">
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
        </div>

        {/* 2. 알림 카드 섹션 */}
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
                )}
                승인이 필요합니다
              </div>
            </Link>
          )}

          {/* 내 결재 진행 */}
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

      {/* --- [섹션 2] 오늘의 일정 (시설 & 차량) --- */}
      {canViewCalendar && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 1. 오늘의 시설 예약 위젯 */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col h-full min-h-[220px]">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
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

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 max-h-[140px]">
              {todayFacilities.length > 0 ? (
                <ul className="space-y-2">
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
                <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2 min-h-[100px]">
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

          {/* 2. 오늘의 차량 예약 위젯 (파란색 테마 적용) */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col h-full min-h-[220px]">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
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
                      d="M3 10l2-3h10l2 3h4v6h-2v-1a2 2 0 1 0-4 0v1H9v-1a2 2 0 1 0-4 0v1H3v-6zm4 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm10 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"
                    />
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

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 max-h-[140px]">
              {todayVehicles.length > 0 ? (
                <ul className="space-y-2">
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
                <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2 min-h-[100px]">
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
        </section>
      )}

      {/* --- [하단 섹션] 전체 휴가 달력 --- */}
      {/* ... (기존 달력 코드 유지) ... */}
      {canViewCalendar && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-auto lg:h-[780px]">
          {/* 타이틀 헤더 */}
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
                전체 휴가 일정
              </h3>
            </div>
            <div className="hidden sm:flex items-center gap-4">
              {teams.map((team) => (
                <div key={team.id} className="flex items-center gap-1.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${TEAM_COLORS[team.id] || "bg-gray-400"}`}
                  ></span>
                  <span className="text-sm text-gray-600 font-medium">
                    {team.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col lg:flex-row flex-1 overflow-visible lg:overflow-hidden">
            {/* 달력 영역 */}
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
                      updateSelectedVacations(now, allVacations);
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
                        const vacationsOnDay = holiday
                          ? []
                          : allVacations.filter(
                              (v) =>
                                dateStr >= v.start_date &&
                                dateStr <= v.end_date,
                            );
                        const maxDisplay = 3;
                        const displayVacations = vacationsOnDay.slice(
                          0,
                          maxDisplay,
                        );
                        const overflowCount =
                          vacationsOnDay.length - maxDisplay;
                        return (
                          <div className="flex flex-col items-center w-full h-full pt-1 overflow-hidden">
                            {holiday && (
                              <div className="text-[10px] text-red-500 font-medium truncate px-1 w-full text-center mt-0.5">
                                {holiday}
                              </div>
                            )}
                            <div className="w-full flex flex-col gap-0.5 mt-1 px-0.5">
                              {displayVacations.map((v, i) => {
                                const style =
                                  TEAM_STYLES[v.profiles.team_id] ||
                                  DEFAULT_STYLE;
                                return (
                                  <div
                                    key={v.id + i}
                                    className={`text-[9px] ${style.bg} ${style.text} border ${style.border} rounded px-1 py-0.5 truncate text-center font-medium`}
                                  >
                                    {v.profiles.full_name}
                                  </div>
                                );
                              })}
                              {overflowCount > 0 && (
                                <div className="text-[9px] text-gray-400 text-center font-medium">
                                  +{overflowCount}명
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
                        const vacationsOnDay = allVacations.filter(
                          (v) =>
                            dateStr >= v.start_date && dateStr <= v.end_date,
                        );
                        return (
                          <div
                            key={dateStr}
                            onClick={() => {
                              setDate(day);
                              updateSelectedVacations(day, allVacations);
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
                              {vacationsOnDay.map((v) => {
                                const style =
                                  TEAM_STYLES[v.profiles.team_id] ||
                                  DEFAULT_STYLE;
                                return (
                                  <div
                                    key={v.id}
                                    className={`px-2 py-1 rounded-md inline-flex items-center gap-1 text-xs font-bold border ${style.bg} ${style.text} ${style.border}`}
                                  >
                                    {v.profiles.full_name}{" "}
                                    <span className="text-[10px] opacity-75">
                                      | {v.type}
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

            {/* 사이드 패널 */}
            <div className="w-full lg:w-80 bg-white flex flex-col h-auto lg:h-full lg:border-l border-t lg:border-t-0 border-gray-200">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 h-[72px] shrink-0">
                <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                  {format(date, "M월 d일 (EEE)", { locale: ko })}
                </h4>
                <span className="text-xs font-medium text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200">
                  총 {selectedVacations.length}명
                </span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                {selectedVacations.length > 0 ? (
                  <ul className="divide-y divide-gray-100">
                    {selectedVacations.map((v) => (
                      <li
                        key={v.id}
                        className="group flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs border border-gray-200">
                            {v.profiles.full_name.slice(0, 1)}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold text-gray-900 truncate">
                                {v.profiles.full_name}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {v.profiles.position}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${TEAM_COLORS[v.profiles.team_id] || "bg-gray-400"}`}
                              ></span>
                              <span className="text-xs text-gray-500 truncate">
                                {v.profiles.teams?.name || "미배정"}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0 pl-2">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
                            {v.type}
                          </span>
                          <span className="text-[11px] text-gray-400 font-medium tabular-nums tracking-tight">
                            {v.start_date === v.end_date ? (
                              "하루 종일"
                            ) : (
                              <>
                                {v.start_date.slice(5).replace("-", ".")}~
                                {v.end_date.slice(5).replace("-", ".")}
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
                      휴가자가 없습니다
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
