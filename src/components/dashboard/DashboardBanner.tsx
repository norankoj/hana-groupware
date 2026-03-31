"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Profile = {
  id: string;
  full_name: string;
  position: string;
  team_id: number;
  role: string;
  status: string;
  is_approver?: boolean;
};

interface Props {
  profile: Profile;
  pendingCount: number;
  myPendingCount: number;
  canViewCalendar: boolean;
  parkingText: string;
}

type WeatherData = {
  temp: number;
  feelsLike: number;
  description: string;
  emoji: string;
  humidity: number;
  pm10: number | null;
  pm25: number | null;
  aqius: number | null;
  airGrade: { label: string; face: string; color: string } | null;
};

function useWeather() {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weather")
      .then((r) => r.json())
      .then((json) => {
        if (!json.error) setData(json);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}

export default function DashboardBanner({
  profile,
  pendingCount,
  myPendingCount,
  parkingText,
}: Props) {
  const { data: weather, loading: weatherLoading } = useWeather();

  const canApprove =
    profile.is_approver ||
    profile.role === "admin" ||
    profile.role === "director";

  return (
    <section className="flex flex-col lg:flex-row gap-4 items-stretch">
      {/* ── 인사 카드 (2/5, 작은 화면에서 비율로 줄어듦) ── */}
      <Link
        href="/mypage"
        className="lg:w-2/5 min-w-0 bg-blue-600 rounded-2xl p-6 text-white shadow-sm relative overflow-hidden min-h-[168px] flex flex-col justify-between hover:bg-blue-700 transition-colors"
      >
        <div className="relative z-10 flex flex-col h-full justify-between">
          {/* 상단: 교회명 */}
          <p className="text-[11px] font-semibold text-blue-200 tracking-widest uppercase">
            수원하나교회
          </p>

          {/* 중단: 인사말 */}
          <div>
            <h2 className="text-2xl font-bold mb-1.5">
              안녕하세요, {profile.full_name}님!
            </h2>
            <p className="text-blue-100 opacity-90 flex items-center gap-2 text-sm">
              <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-semibold">
                Today
              </span>
              <span className="truncate">{parkingText} 🚗</span>
            </p>
          </div>

          {/* 하단: 서브텍스트 */}
          <p className="text-blue-200 text-xs opacity-60">
            내 정보를 클릭해 프로필을 확인하세요
          </p>
        </div>

        {/* 배경 SVG 장식 */}
        <div className="absolute right-0 top-0 h-full w-2/5 opacity-10 pointer-events-none">
          <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <path
              fill="#FFFFFF"
              d="M44.7,-76.4C58.9,-69.2,71.8,-59.1,81.6,-46.6C91.4,-34.1,98.1,-19.2,95.8,-4.9C93.5,9.4,82.2,23.1,71.6,35.2C61,47.3,51.1,57.8,39.6,66.1C28.1,74.4,15,80.5,1.5,77.9C-12,75.3,-25.9,64,-38.3,53.8C-50.7,43.6,-61.6,34.5,-69.4,22.7C-77.2,10.9,-81.9,-3.6,-78.3,-17C-74.7,-30.4,-62.8,-42.7,-50.2,-50.7C-37.6,-58.7,-24.3,-62.4,-10.5,-64.1C3.3,-65.8,17.1,-65.5,30.5,-75.2L44.7,-76.4Z"
              transform="translate(100 100)"
            />
          </svg>
        </div>
      </Link>

      {/* ── 우측 카드 영역 (flex-1) ── */}
      <div className="lg:flex-1 min-w-0 flex flex-row gap-4">

        {/* 날씨 + 미세먼지 통합 카드 */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm border border-gray-100 min-h-[168px] flex overflow-hidden">

          {/* 날씨 — 왼쪽 */}
          <div className="flex-1 min-w-0 p-5 flex flex-col justify-between">
            <p className="text-xs font-semibold text-gray-400 tracking-wide truncate">
              날씨 · 용인 서천동
            </p>

            {weatherLoading ? (
              <div className="animate-pulse space-y-2 mt-3">
                <div className="h-8 w-20 bg-gray-100 rounded" />
                <div className="h-3 w-24 bg-gray-100 rounded" />
              </div>
            ) : weather ? (
              <>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-4xl leading-none">{weather.emoji}</span>
                  <div>
                    <p className="text-3xl font-extrabold text-gray-900 leading-tight">
                      {weather.temp}°
                      <span className="text-base font-bold text-gray-400">C</span>
                    </p>
                    <p className="text-[11px] text-gray-400">{weather.description}</p>
                  </div>
                </div>
                <div className="flex gap-2 text-[11px] text-gray-400">
                  <span>체감 {weather.feelsLike}°C</span>
                  <span className="text-gray-200">|</span>
                  <span>습도 {weather.humidity}%</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-4">날씨 정보 없음</p>
            )}
          </div>

          {/* 세로 구분선 */}
          <div className="w-px bg-gray-100 my-4" />

          {/* 미세먼지 — 오른쪽 */}
          <div className="flex-1 min-w-0 p-5 flex flex-col justify-between">
            <p className="text-xs font-semibold text-gray-400 tracking-wide">
              미세먼지
            </p>

            {weatherLoading ? (
              <div className="animate-pulse space-y-2 mt-3">
                <div className="h-6 w-16 bg-gray-100 rounded" />
                <div className="h-3 w-full bg-gray-100 rounded" />
                <div className="h-3 w-full bg-gray-100 rounded" />
              </div>
            ) : weather?.airGrade ? (
              <>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-2xl leading-none">
                    {weather.airGrade.face}
                  </span>
                  <span
                    className={`text-base font-extrabold ${weather.airGrade.color}`}
                  >
                    {weather.airGrade.label}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">미세먼지</span>
                    <span className="font-bold text-gray-700">
                      {weather.pm10 != null ? `${weather.pm10}㎍` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">초미세먼지</span>
                    <span className="font-bold text-gray-700">
                      {weather.pm25 != null ? `${weather.pm25}㎍` : "—"}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-4">정보 없음</p>
            )}
          </div>
        </div>

        {/* 결재 통합 카드 */}
        <Link
          href={canApprove ? "/vacation?tab=approve" : "/vacation"}
          className="w-[200px] shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col justify-between min-h-[168px] hover:border-gray-200 hover:shadow-md transition-all"
        >
          {canApprove ? (
            <>
              {/* 결재 대기 */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-0.5">
                    결재 대기
                  </p>
                  <p className="text-2xl font-extrabold text-gray-900">
                    {pendingCount}
                    <span className="text-sm font-normal text-gray-400 ml-1">건</span>
                  </p>
                </div>
                <div
                  className={`p-2 rounded-lg ${pendingCount > 0 ? "bg-red-50 text-red-500" : "bg-gray-50 text-gray-300"}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-100" />

              {/* 내 결재 진행 */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-0.5">
                    내 결재 진행
                  </p>
                  <p className="text-2xl font-extrabold text-gray-900">
                    {myPendingCount}
                    <span className="text-sm font-normal text-gray-400 ml-1">건</span>
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-blue-50 text-blue-500">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>

              {pendingCount > 0 && (
                <div className="flex items-center gap-1 text-xs text-red-500 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  승인이 필요합니다
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
                    내 결재 진행
                  </p>
                  <p className="text-3xl font-extrabold text-gray-900">
                    {myPendingCount}
                    <span className="text-sm font-normal text-gray-400 ml-1">건</span>
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 text-blue-500">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-blue-500 font-medium mt-auto pt-4">
                처리 결과를 기다리고 있어요
              </p>
            </>
          )}
        </Link>
      </div>
    </section>
  );
}
