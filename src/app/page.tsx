"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import NoticePopup from "@/components/notice/NoticePopup";
import PushSubscriber from "@/components/PushSubscriber";
import PushPromptBanner from "@/components/PushPromptBanner";
import DashboardBanner from "@/components/dashboard/DashboardBanner";
import type { WeatherData } from "@/components/dashboard/DashboardBanner";
import CalendarSection from "@/components/dashboard/CalendarSection";
import TodayReservationWidget from "@/components/dashboard/TodayReservationWidget";
import GoogleCalendarWidget from "@/components/dashboard/GoogleCalendarWidget";
import type { CalendarEvent } from "@/components/dashboard/CalendarSection";

type Profile = {
  id: string;
  full_name: string;
  position: string;
  team_id: number;
  role: string;
  status: string;
  is_approver?: boolean;
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

const ALLOWED_ROLES = ["admin", "pastor", "director", "staff"];

export default function Home() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [myPendingCount, setMyPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [parkingText, setParkingText] = useState("");

  const [todayFacilities, setTodayFacilities] = useState<TodayReservation[]>(
    [],
  );
  const [todayVehicles, setTodayVehicles] = useState<TodayReservation[]>([]);

  // Google Calendar 데이터 — 두 위젯이 동시에 렌더링되므로 여기서 한 번만 fetch
  const [gcalEvents, setGcalEvents] = useState<any[]>([]);
  const [gcalLoading, setGcalLoading] = useState(true);
  const [gcalError, setGcalError] = useState(false);
  const [gcalUpdatedAt, setGcalUpdatedAt] = useState<string | null>(null);

  // 날씨 데이터 — HeaderWeatherBadge(ClientLayout)와 DashboardBanner 중복 fetch 방지
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    setParkingText(
      `오늘은 ${today.getDate()}일, 앞자리가 ${today.getDate() % 2 === 0 ? "짝수" : "홀수"}차량이 주차하는 날입니다.`,
    );
  }, []);

  useEffect(() => {
    fetch("/api/weather")
      .then((r) => r.json())
      .then((json) => { if (!json.error) setWeather(json); })
      .catch(() => {})
      .finally(() => setWeatherLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/calendar")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setGcalError(true);
          return;
        }
        setGcalEvents(json.events ?? []);
        setGcalUpdatedAt(json.updatedAt ?? null);
      })
      .catch(() => setGcalError(true))
      .finally(() => setGcalLoading(false));
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return router.replace("/login");

    const { data: profileData } = await supabase
      .from("profiles")
      .select(`*, teams!profiles_team_id_fkey(name)`)
      .eq("id", user.id)
      .single();

    if (!profileData) {
      setLoading(false);
      return;
    }

    setProfile(profileData as any);
    const myRole = profileData.role;

    // 결재 대기 카운트 (병렬)
    const [{ count: approvalCount }, { count: myCount }] = await Promise.all([
      myRole === "admin" || myRole === "director" || profileData.is_approver
        ? supabase
            .from("vacation_requests")
            .select("*", { count: "exact", head: true })
            .eq("status", "pending")
        : Promise.resolve({ count: 0 }),
      supabase
        .from("vacation_requests")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "pending"),
    ]);

    setPendingCount(approvalCount || 0);
    setMyPendingCount(myCount || 0);

    if (!ALLOWED_ROLES.includes(myRole)) {
      setLoading(false);
      return;
    }

    // 캘린더 + 예약 데이터 병렬 조회
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [
      { data: usersData },
      { data: vacData },
      { data: schData },
      { data: teamData },
      { data: reservationData },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, position, team_id, role, status")
        .eq("status", "active")
        .in("role", ALLOWED_ROLES)
        .order("full_name"),
      supabase
        .from("vacation_requests")
        .select(
          `id, start_date, end_date, type, reason, profiles:user_id ( full_name, position, team_id, teams:team_id(name) )`,
        )
        .eq("status", "approved"),
      supabase
        .from("user_schedules")
        .select(
          `id, user_id, title, start_at, end_at, location, attendees, profiles:user_id ( full_name, position, team_id, teams:team_id(name) )`,
        ),
      supabase.from("teams").select("id, name").order("id"),
      supabase
        .from("reservations")
        .select(
          `id, start_at, end_at, purpose, vehicle_status, resources(name, category), profiles:user_id(full_name)`,
        )
        .neq("status", "cancelled")
        .gte("start_at", todayStart.toISOString())
        .lte("start_at", todayEnd.toISOString())
        .order("start_at"),
    ]);

    if (usersData) setUsers(usersData as any);
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
          time_label: v.type?.includes("오전") ? "오전 반차" : v.type?.includes("오후") ? "오후 반차" : "하루 종일",
          display_name: v.profiles.full_name,
          reason: v.reason,
          profiles: v.profiles,
        });
      });
    }

    if (schData) {
      schData.forEach((s: any) => {
        const startDate = new Date(s.start_at);
        const endDate = new Date(s.end_at);
        const attendeesArr: { id: string; name: string }[] = s.attendees || [];
        const displayName =
          attendeesArr.length > 0
            ? `${s.profiles.full_name} 외 ${attendeesArr.length}명`
            : s.profiles.full_name;

        const isAllDaySpan =
          format(startDate, "HH:mm") === "00:00" &&
          format(endDate, "HH:mm") === "23:59";
        const timeLabel = isAllDaySpan
          ? "일정 전체"
          : `${format(startDate, "HH:mm")}~${format(endDate, "HH:mm")}`;

        mergedEvents.push({
          id: `sch_${s.id}`,
          original_id: s.id,
          type: "schedule",
          user_id: s.user_id,
          start_date: format(startDate, "yyyy-MM-dd"),
          end_date: format(endDate, "yyyy-MM-dd"),
          title: s.title,
          time_label: timeLabel,
          location: s.location,
          attendees: attendeesArr,
          display_name: displayName,
          profiles: s.profiles,
        });
      });
    }

    setAllEvents(mergedEvents);

    if (reservationData) {
      setTodayFacilities(
        reservationData.filter(
          (r: any) => r.resources?.category !== "vehicle" && r.resources,
        ) as any,
      );
      setTodayVehicles(
        reservationData.filter(
          (r: any) =>
            r.resources?.category === "vehicle" &&
            r.resources &&
            r.vehicle_status !== "cancelled",
        ) as any,
      );
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading && !profile)
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-600"></div>
      </div>
    );

  if (!profile) return null;

  const canViewCalendar = ALLOWED_ROLES.includes(profile.role);
  const canApprove =
    profile.is_approver ||
    profile.role === "admin" ||
    profile.role === "director";
  // 바로가기 버튼 표시 전용 — is_approver 토글만으로 제어
  const showApproveShortcut = !!profile.is_approver;

  return (
    <div className="space-y-6">
      {/* 공지 팝업 */}
      <NoticePopup />
      {/* 푸시 알림 구독 */}
      <PushSubscriber />
      {/* iOS/Android 알림 안내 배너 */}
      <PushPromptBanner />

      {/* ── Row 1: 배너 카드 (고정) ── */}
      <DashboardBanner
        profile={profile}
        pendingCount={pendingCount}
        myPendingCount={myPendingCount}
        canViewCalendar={canViewCalendar}
        parkingText={parkingText}
        weather={weather}
        weatherLoading={weatherLoading}
      />

      {canViewCalendar && (
        <>
          {/* ── Row 2: 바로가기 (카드 없이 버튼만) ── */}
          <div className="grid gap-3 grid-cols-3 sm:grid-cols-6">
            {[
              {
                href: "/vacation",
                label: "휴가 신청",
                icon: (
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                ),
              },
              {
                href: "/reservation",
                label: "시설 예약",
                icon: (
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                ),
              },
              {
                href: "/vehicle",
                label: "차량 예약",
                icon: (
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M3 10l2-3h10l2 3h4v6h-2v-1a2 2 0 1 0-4 0v1H9v-1a2 2 0 1 0-4 0v1H3v-6zm4 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm10 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"
                    />
                  </svg>
                ),
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex flex-col items-center gap-2.5 py-5 px-3 bg-white rounded-2xl border border-gray-200 hover:border-blue-400 transition-all"
              >
                <div className="w-11 h-11 rounded-xl bg-gray-50 group-hover:bg-gray-100 flex items-center justify-center transition-colors text-gray-400 group-hover:text-gray-600">
                  {item.icon}
                </div>
                <span className="text-xs font-semibold text-gray-500 group-hover:text-gray-800 transition-colors text-center">
                  {item.label}
                </span>
              </Link>
            ))}

            {/* 결재 대기: 내 결재 진행 / 일반: 공지사항 */}
            {showApproveShortcut ? (
              <Link
                href="/vacation?tab=approve"
                className="group relative flex flex-col items-center gap-2.5 py-5 px-3 bg-white rounded-2xl border border-gray-200 hover:border-blue-400 transition-all"
              >
                {pendingCount > 0 && (
                  <span className="absolute top-3 right-3 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
                <div className="w-11 h-11 rounded-xl bg-gray-50 group-hover:bg-gray-100 flex items-center justify-center transition-colors text-gray-400 group-hover:text-gray-600">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-gray-500 group-hover:text-gray-800 transition-colors text-center">
                  결재 대기
                </span>
              </Link>
            ) : (
              <Link
                href="/notice"
                className="group flex flex-col items-center gap-2.5 py-5 px-3 bg-white rounded-2xl border border-gray-200 hover:border-blue-400 transition-all"
              >
                <div className="w-11 h-11 rounded-xl bg-gray-50 group-hover:bg-gray-100 flex items-center justify-center transition-colors text-gray-400 group-hover:text-gray-600">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                    />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-gray-500 group-hover:text-gray-800 transition-colors text-center">
                  공지사항
                </span>
              </Link>
            )}

            {/* 오늘 뭐먹지? */}
            <Link
              href="/lunch"
              className="group flex flex-col items-center gap-2.5 py-5 px-3 bg-white rounded-2xl border border-gray-200 hover:border-blue-400 transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-gray-50 group-hover:bg-gray-100 flex items-center justify-center transition-colors text-gray-400 group-hover:text-gray-600">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M3 13h18M5 13c0 3.866 3.134 7 7 7s7-3.134 7-7"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8.5 6c0 1.2.8 1.8.8 3M12 5c0 1.2.8 1.8.8 3M15.5 6c0 1.2.8 1.8.8 3"
                  />
                </svg>
              </div>
              <span className="text-xs font-semibold text-gray-500 group-hover:text-gray-800 transition-colors text-center">
                오늘 뭐먹지?
              </span>
            </Link>

            {/* 랜덤 게임 */}
            <Link
              href="/games"
              className="group flex flex-col items-center gap-2.5 py-5 px-3 bg-white rounded-2xl border border-gray-200 hover:border-blue-400 transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-gray-50 group-hover:bg-gray-100 flex items-center justify-center transition-colors text-gray-400 group-hover:text-gray-600">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
              </div>
              <span className="text-xs font-semibold text-gray-500 group-hover:text-gray-800 transition-colors text-center">
                랜덤 게임
              </span>
            </Link>
          </div>

          {/* ── Row 3 ── */}

          {/* 2xl+: 캘린더(2/3) | 사역일정+차량예약(1/3) 사이드 컬럼 */}
          <div className="hidden 2xl:flex gap-6 items-start">
            <div className="flex-[2] min-w-0">
              <CalendarSection
                allEvents={allEvents}
                teams={teams}
                profile={profile}
                users={users}
                onRefresh={fetchData}
              />
            </div>
            <div className="flex-1 max-w-[400px] min-w-0 flex flex-col gap-4">
              <GoogleCalendarWidget
                initialEvents={gcalEvents}
                initialLoading={gcalLoading}
                initialError={gcalError}
                initialUpdatedAt={gcalUpdatedAt}
              />
              <TodayReservationWidget
                title="오늘의 차량 예약"
                href="/vehicle"
                reservations={todayVehicles}
                emptyMessage="오늘 예약된 차량이 없습니다."
                icon={
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
                  </svg>
                }
                emptyIcon={
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
                }
              />
            </div>
          </div>

          {/* < 2xl: 사역일정+차량예약(위, 나란히 동일 높이) → 통합일정(아래) */}
          <div className="2xl:hidden flex flex-col gap-6">
            {/* 사역일정 | 오늘의 차량예약 — sm+: 나란히 380px 고정 높이, mobile: 세로 */}
            <div className="flex flex-col sm:flex-row gap-4 sm:h-[380px]">
              <div className="sm:flex-1 min-w-0 sm:h-full">
                <GoogleCalendarWidget
                  className="sm:h-full"
                  initialEvents={gcalEvents}
                  initialLoading={gcalLoading}
                  initialError={gcalError}
                  initialUpdatedAt={gcalUpdatedAt}
                />
              </div>
              <div className="sm:flex-1 min-w-0 sm:h-full">
                <TodayReservationWidget
                  className="sm:h-full sm:max-h-none min-h-[200px]"
                  title="오늘의 차량 예약"
                  href="/vehicle"
                  reservations={todayVehicles}
                  emptyMessage="오늘 예약된 차량이 없습니다."
                  icon={
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
                    </svg>
                  }
                  emptyIcon={
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
                  }
                />
              </div>
            </div>

            {/* 통합 일정 캘린더 */}
            <CalendarSection
              allEvents={allEvents}
              teams={teams}
              profile={profile}
              users={users}
              onRefresh={fetchData}
            />
          </div>
        </>
      )}
    </div>
  );
}
