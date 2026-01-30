"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { format, isSameDay, startOfMonth } from "date-fns"; // ★ startOfMonth 추가
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

const ALLOWED_ROLES = ["admin", "director", "staff"];

// 팀별 색상 설정
const TEAM_COLORS: Record<number, string> = {
  4: "bg-purple-500",
  5: "bg-emerald-500",
  6: "bg-yellow-400",
};

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

  // 달력 관련 상태
  const [allVacations, setAllVacations] = useState<VacationInfo[]>([]);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [date, setDate] = useState<Date>(new Date());

  // 초기값을 오늘 날짜의 '월 1일'로 설정
  const [activeStartDate, setActiveStartDate] = useState<Date | null>(
    new Date(),
  );

  const [selectedVacations, setSelectedVacations] = useState<VacationInfo[]>(
    [],
  );
  const [parkingText, setParkingText] = useState("");

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
              `
              id, start_date, end_date, type,
              profiles:user_id ( full_name, position, team_id, teams:team_id(name) )
            `,
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
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [router, supabase]);

  const onDateChange = (newDate: any) => {
    setDate(newDate);
    updateSelectedVacations(newDate, allVacations);

    setActiveStartDate(newDate);
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

  const tileContent = ({ date, view }: any) => {
    if (view === "month") {
      const dateStr = format(date, "yyyy-MM-dd");
      const vacationsOnDay = allVacations.filter(
        (v) => dateStr >= v.start_date && dateStr <= v.end_date,
      );
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

  const isTodayActive = isSameDay(date, new Date());

  return (
    <div className="space-y-6">
      <style jsx global>{`
        /* 1. 달력 전체 기본 글자색 검정으로 고정 */
        .react-calendar {
          width: 100%;
          border: none;
          font-family: inherit;
          color: #111827 !important; /* ★ 강제 적용 */
        }

        /* 2. 상단 네비게이션 (년/월, 화살표) 글자색 */
        .react-calendar__navigation button {
          min-width: 44px;
          background: none;
          font-size: 1.1rem;
          font-weight: 600;
          color: #111827 !important; /* ★ 강제 적용 */
        }
        .react-calendar__navigation button:disabled {
          background-color: #f3f4f6;
        }

        /* 3. 요일 표시 (월, 화, 수...) */
        .react-calendar__month-view__weekdays {
          text-align: center;
          text-transform: uppercase;
          font-weight: 500;
          font-size: 0.75em;
          color: #6b7280 !important; /* gray-500 */
          margin-bottom: 0.5rem;
          text-decoration: none; /* 밑줄 제거 */
        }
        /* 요일 밑줄 제거를 위한 추가 설정 */
        abbr[title] {
          text-decoration: none !important;
        }

        /* 4. 날짜 칸 기본 스타일 */
        .react-calendar__tile {
          padding: 1.5em 0.5em;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: start;
          height: 90px;
          color: #111827 !important; /* ★ 날짜 숫자 검정색 강제 */
        }

        /* 5. 주말(토,일)은 빨간색 */
        .react-calendar__month-view__days__day--weekend {
          color: #ef4444 !important;
        }

        /* 6. 이전/다음 달의 날짜는 연한 회색 */
        .react-calendar__month-view__days__day--neighboringMonth {
          color: #d1d5db !important; /* gray-300 */
        }

        /* 7. 마우스 올렸을 때 */
        .react-calendar__tile:enabled:hover,
        .react-calendar__tile:enabled:focus {
          background-color: #eff6ff;
          border-radius: 8px;
          color: #2563eb !important;
        }

        /* 8. 오늘 날짜 */
        .react-calendar__tile--now {
          background: #f3f4f6;
          border-radius: 8px;
          font-weight: 600;
          color: #1f2937 !important;
        }

        /* 9. 선택된 날짜 */
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

      {/* 2. 알림 카드 */}
      <section className="flex flex-wrap gap-6 items-start">
        {profile?.is_approver && (
          <Link
            href="/vacation?tab=approve"
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer relative overflow-hidden group w-full sm:w-80 flex-shrink-0"
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

            <div className="mt-4 text-xs font-medium text-red-500 flex items-center gap-1">
              {pendingCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              )}
              승인이 필요합니다
            </div>
          </Link>
        )}
        {/* 사역자, 디렉터, 관리자만 볼 수 있도록 */}
        {(profile?.role === "staff" ||
          profile?.role === "director" ||
          profile?.role === "admin") && (
          <Link
            href="/vacation"
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer relative overflow-hidden group w-full sm:w-80 flex-shrink-0"
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
        )}
      </section>

      {/* 3. 전체 휴가 달력 */}
      {canViewCalendar && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 bg-gray-50/50 flex flex-wrap justify-between items-center gap-2">
            {/* 왼쪽: 아이콘 + 제목 */}
            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
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

            {/* 오른쪽: [팀 범례] + [오늘 버튼] + [년월] */}
            <div className="flex items-center gap-4">
              {/* ★ [수정] 팀 범례를 여기로 이동 */}
              <div className="hidden sm:flex items-center gap-3 border-r border-gray-200 pr-4">
                {teams.map((team) => (
                  <div key={team.id} className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${TEAM_COLORS[team.id] || "bg-gray-400"}`}
                    ></span>
                    <span className="text-xs text-gray-500 font-medium">
                      {team.name}
                    </span>
                  </div>
                ))}
              </div>

              {/* 오늘 버튼 및 년월 */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onDateChange(new Date())}
                  className={`text-xs px-2 py-1 rounded font-medium transition cursor-pointer border ${
                    isTodayActive
                      ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  오늘
                </button>
                <span className="text-xs text-gray-500 font-medium bg-white px-2 py-1 rounded border border-gray-200">
                  {format(date, "yyyy년 M월")}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row">
            <div className="flex-1 p-4 border-r border-gray-100">
              <Calendar
                onChange={onDateChange}
                value={date}
                activeStartDate={activeStartDate || undefined}
                onActiveStartDateChange={({ activeStartDate }) =>
                  setActiveStartDate(activeStartDate)
                }
                tileContent={tileContent}
                formatDay={(locale, date) => format(date, "d")}
                prevLabel={
                  <span className="text-lg text-gray-400 hover:text-gray-600">
                    ‹
                  </span>
                }
                nextLabel={
                  <span className="text-lg text-gray-400 hover:text-gray-600">
                    ›
                  </span>
                }
              />

              {/* 모바일용 범례 (화면 작을 때만 아래에 표시) */}
              <div className="sm:hidden mt-4 flex flex-wrap gap-3 justify-end border-t border-gray-100 pt-3">
                {teams.map((team) => (
                  <div key={team.id} className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${TEAM_COLORS[team.id] || "bg-gray-400"}`}
                    ></span>
                    <span className="text-xs text-gray-500 font-medium">
                      {team.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full lg:w-80 bg-white border-l border-gray-200 flex flex-col min-h-[400px]">
              {/* 목록 헤더 */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                  {format(date, "M월 d일 (EEE)", { locale: ko })}
                </h4>
                <span className="text-xs font-medium text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200">
                  총 {selectedVacations.length}명
                </span>
              </div>

              {/* 목록 본문 (스크롤) */}
              <div className="flex-1 overflow-y-auto max-h-[450px] custom-scrollbar">
                {selectedVacations.length > 0 ? (
                  <ul className="divide-y divide-gray-100">
                    {selectedVacations.map((v) => (
                      <li
                        key={v.id}
                        className="group flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                      >
                        {/* 왼쪽: 프로필 + 이름 + 팀정보 */}
                        <div className="flex items-center gap-3 overflow-hidden">
                          {/* 아바타 */}
                          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs border border-gray-200">
                            {v.profiles.full_name.slice(0, 1)}
                          </div>

                          {/* 텍스트 정보 */}
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
                                className={`w-1.5 h-1.5 rounded-full ${
                                  TEAM_COLORS[v.profiles.team_id] ||
                                  "bg-gray-300"
                                }`}
                              ></span>
                              <span className="text-xs text-gray-500 truncate">
                                {v.profiles.teams?.name || "미배정"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 오른쪽: 날짜 + 휴가타입 */}
                        <div className="flex flex-col items-end gap-1 flex-shrink-0 pl-2">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
                            {v.type}
                          </span>

                          {/* 날짜 표시 (오늘 하루면 숨김 or 시간표시, 기간이면 기간표시) */}
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
                  // 데이터 없을 때
                  <div className="h-full flex flex-col items-center justify-center text-center py-10 opacity-60">
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
