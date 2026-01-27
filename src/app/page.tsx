"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

// 타입 정의
type Profile = {
  id: string;
  full_name: string;
  position: string;
  team_id: number;
  role: string;
  status: string;
  teams?: { name: string } | { name: string }[] | null;
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
    teams: { name: string };
  }; // 팀 이름 추가
};

type TeamInfo = {
  id: number;
  name: string;
};

const ALLOWED_ROLES = ["admin", "director", "staff"];

// ★ 팀별 색상 설정 (ID 기준)
const TEAM_COLORS: Record<number, string> = {
  4: "bg-purple-500",
  5: "bg-emerald-500",
  6: "bg-yellow-400",
};

// 뱃지용 배경/텍스트 색상
const TEAM_BADGE_STYLES: Record<number, string> = {
  4: "bg-purple-50 text-purple-700 border-purple-200",
  5: "bg-emerald-50 text-emerald-700 border-emerald-200",
  6: "bg-yellow-50 text-yellow-700 border-yellow-200",
};

export default function Home() {
  const supabase = createClient();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [myPendingCount, setMyPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // 달력 관련
  const [allVacations, setAllVacations] = useState<VacationInfo[]>([]);
  const [teams, setTeams] = useState<TeamInfo[]>([]); // 팀 목록
  const [date, setDate] = useState<Date>(new Date());
  const [selectedVacations, setSelectedVacations] = useState<VacationInfo[]>(
    [],
  );

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      // 1. 내 정보
      const { data: profileData } = await supabase
        .from("profiles")
        .select(`*, teams!profiles_team_id_fkey(name)`)
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData as any);
        const myRole = profileData.role;

        // 2. 카운트
        if (myRole === "admin" || myRole === "director") {
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

        // 3. (권한자용) 전체 휴가 & 팀 목록 가져오기
        if (ALLOWED_ROLES.includes(myRole)) {
          // 휴가 데이터
          const { data: vacData } = await supabase
            .from("vacation_requests")
            .select(
              `
              id, start_date, end_date, type,
              profiles:user_id ( full_name, position, team_id, teams:team_id(name) )
            `,
            )
            .eq("status", "approved")
            .order("start_date");

          // 팀 목록 (범례 표시용)
          const { data: teamData } = await supabase
            .from("teams")
            .select("id, name")
            .order("id");

          if (vacData) {
            setAllVacations(vacData as any);
            updateSelectedVacations(new Date(), vacData as any);
          }
          if (teamData) setTeams(teamData);
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
    const filtered = vacations.filter(
      (v) => dateStr >= v.start_date && dateStr <= v.end_date,
    );
    setSelectedVacations(filtered);
  };

  // ★ 핵심: 날짜별 타일 내용 (팀별 색상 점 찍기)
  const tileContent = ({ date, view }: any) => {
    if (view === "month") {
      const dateStr = format(date, "yyyy-MM-dd");

      // 1. 이 날짜에 휴가인 사람들을 찾음
      const vacationsOnDay = allVacations.filter(
        (v) => dateStr >= v.start_date && dateStr <= v.end_date,
      );

      // 2. 휴가자들의 '팀 ID'만 뽑아서 중복 제거 (팀별로 점 하나씩만 찍기 위해)
      const teamsOnDay = Array.from(
        new Set(vacationsOnDay.map((v) => v.profiles.team_id)),
      );

      if (teamsOnDay.length > 0) {
        return (
          <div className="flex justify-center items-center gap-1 mt-1 flex-wrap px-1">
            {teamsOnDay.map((teamId) => (
              <div
                key={teamId}
                className={`w-1.5 h-1.5 rounded-full ${TEAM_COLORS[teamId] || "bg-gray-400"}`}
                title={`${teams.find((t) => t.id === teamId)?.name || "기타"} 휴가자 있음`}
              />
            ))}
          </div>
        );
      }
    }
  };

  if (loading)
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-600"></div>
      </div>
    );

  const teamName = profile?.teams
    ? Array.isArray(profile.teams)
      ? profile.teams[0]?.name
      : profile.teams.name
    : "소속없음";
  const canViewCalendar = profile && ALLOWED_ROLES.includes(profile.role);

  console.log("팀 목록:", teams);

  return (
    <div className="space-y-6">
      <style jsx global>{`
        .react-calendar {
          width: 100%;
          border: none;
          font-family: inherit;
        }
        .react-calendar__navigation {
          margin-bottom: 1rem;
        }
        .react-calendar__navigation button {
          min-width: 44px;
          background: none;
          font-size: 1.1rem;
          font-weight: bold;
        }
        .react-calendar__month-view__weekdays {
          text-align: center;
          text-transform: uppercase;
          font-weight: bold;
          font-size: 0.75em;
          color: #9ca3af;
          margin-bottom: 0.5rem;
        }
        .react-calendar__month-view__days__day--weekend {
          color: #ef4444;
        }
        .react-calendar__tile {
          padding: 0.5em;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: start;
          height: 85px;
        }
        .react-calendar__tile:enabled:hover,
        .react-calendar__tile:enabled:focus {
          background-color: #eff6ff;
          border-radius: 8px;
          color: #2563eb;
        }
        .react-calendar__tile--now {
          background: #f3f4f6;
          border-radius: 8px;
          font-weight: bold;
          color: #1f2937;
        }
        .react-calendar__tile--active {
          background: #dbeafe !important;
          border-radius: 8px;
          color: #1e40af !important;
        }
      `}</style>

      {/* 1. 웰컴 메시지 */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-600 rounded-2xl p-8 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-3xl font-bold mb-2">
            안녕하세요, {profile?.full_name}님!
          </h2>
          <p className="text-blue-100 font-medium opacity-90">
            {teamName} · {profile?.position} | 오늘도 힘찬 하루 되세요.
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

      {/* 2. 알림 카드 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(profile?.role === "admin" || profile?.role === "director") && (
          <Link
            href="/vacation"
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer relative overflow-hidden group"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-1">
                  결재 대기 문서
                </p>
                <h3 className="text-3xl font-extrabold text-gray-900">
                  {pendingCount}{" "}
                  <span className="text-sm font-normal text-gray-400">건</span>
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
            {pendingCount > 0 && (
              <div className="mt-4 text-xs font-bold text-red-500 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>{" "}
                승인이 필요합니다
              </div>
            )}
          </Link>
        )}
        <Link
          href="/vacation"
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer relative overflow-hidden group"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-1">
                내 진행중인 결재
              </p>
              <h3 className="text-3xl font-extrabold text-gray-900">
                {myPendingCount}{" "}
                <span className="text-sm font-normal text-gray-400">건</span>
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
      </section>

      {/* 3. 전체 휴가 달력 (팀별 색상 적용) */}
      {canViewCalendar && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
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
              전체 휴가 현황
            </h3>
            <span className="text-xs text-gray-500 font-medium bg-white px-2 py-1 rounded border border-gray-200">
              {format(date, "yyyy년 M월")}
            </span>
          </div>

          <div className="flex flex-col lg:flex-row">
            {/* 달력 영역 */}
            <div className="flex-1 p-6 border-r border-gray-100">
              <Calendar
                onChange={onDateChange}
                value={date}
                tileContent={tileContent}
                formatDay={(locale, date) => format(date, "d")}
                prevLabel={<span className="text-lg">‹</span>}
                nextLabel={<span className="text-lg">›</span>}
              />

              <div className="mt-6 flex flex-wrap gap-4 justify-end border-t border-gray-100 pt-4">
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
                {/* <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-400"></span>
                  <span className="text-xs text-gray-600 font-medium">
                    기타/미배정
                  </span>
                </div> */}
              </div>
            </div>

            {/* 오른쪽 목록 */}
            <div className="w-full lg:w-80 bg-gray-50/30 p-6 flex flex-col">
              <h4 className="text-sm font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200">
                {format(date, "M월 d일 (EEE) 휴가자", { locale: ko })}
              </h4>

              <div className="flex-1 overflow-y-auto max-h-[400px] space-y-3">
                {selectedVacations.length > 0 ? (
                  selectedVacations.map((v) => (
                    <div
                      key={v.id}
                      className="bg-white p-3.5 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {/* 팀 뱃지 (색상 적용) */}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${TEAM_BADGE_STYLES[v.profiles.team_id] || "bg-gray-100 text-gray-600 border-gray-200"}`}
                          >
                            {v.profiles.teams?.name || "미배정"}
                          </span>
                          <span className="font-bold text-gray-800 text-sm">
                            {v.profiles.full_name} ·{" "}
                            <span className="text-gray-400 text-xs font-medium">
                              {v.type}
                            </span>
                          </span>
                        </div>
                      </div>
                      <div className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {v.start_date === v.end_date
                          ? "당일"
                          : `${v.start_date.slice(5)}~`}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-gray-400 text-xs">
                    휴가자가 없습니다. <br />
                    오늘도 모두 힘내세요! 💪
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
