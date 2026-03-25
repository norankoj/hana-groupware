"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import DashboardBanner from "@/components/dashboard/DashboardBanner";
import CalendarSection from "@/components/dashboard/CalendarSection";
import TodayReservationWidget from "@/components/dashboard/TodayReservationWidget";
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

const ALLOWED_ROLES = ["admin", "director", "staff"];

export default function Home() {
  const supabase = createClient();
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

  useEffect(() => {
    const today = new Date();
    setParkingText(
      `오늘은 ${today.getDate()}일, ${today.getDate() % 2 === 0 ? "짝수" : "홀수"}차량이 주차하는 날입니다.`,
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
          `id, start_date, end_date, type, profiles:user_id ( full_name, position, team_id, teams:team_id(name) )`,
        )
        .eq("status", "approved"),
      supabase
        .from("user_schedules")
        .select(
          `id, title, start_at, end_at, location, attendees, profiles:user_id ( full_name, position, team_id, teams:team_id(name) )`,
        ),
      supabase.from("teams").select("id, name").order("id"),
      supabase
        .from("reservations")
        .select(
          `id, start_at, end_at, purpose, resources(name, category), profiles:user_id(full_name)`,
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
          (r: any) => r.resources?.category === "vehicle" && r.resources,
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

  return (
    <div className="space-y-8">
      <DashboardBanner
        profile={profile}
        pendingCount={pendingCount}
        myPendingCount={myPendingCount}
        canViewCalendar={canViewCalendar}
        parkingText={parkingText}
      />

      {canViewCalendar && (
        <div className="flex flex-col 2xl:flex-row gap-6">
          <CalendarSection
            allEvents={allEvents}
            teams={teams}
            profile={profile}
            users={users}
            onRefresh={fetchData}
          />

          {/* 위젯 섹션 */}
          <div className="order-1 2xl:order-2 w-full 2xl:w-[420px] shrink-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-1 gap-6 h-auto">
              <TodayReservationWidget
                title="오늘의 시설 예약"
                href="/reservation"
                reservations={todayFacilities}
                emptyMessage="오늘 예약된 일정이 없습니다."
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
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
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
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                }
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
        </div>
      )}
    </div>
  );
}
