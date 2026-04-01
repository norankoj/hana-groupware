"use client";

import { useEffect, useState } from "react";

type WeatherData = {
  temp: number;
  feelsLike: number;
  description: string;
  emoji: string;
  humidity: number;
  pm25: number | null;
  aqiLabel: { label: string; color: string } | null;
};

/* ───── PM2.5 등급별 스타일 ───── */
type AqiStyle = {
  face: string; // 표정 이모지
  label: string; // 텍스트 라벨
  sub: string; // 부연 설명
  bg: string; // 카드 배경
  border: string; // 카드 테두리
  badge: string; // 뱃지 배경
  badgeText: string; // 뱃지 텍스트
  title: string; // 제목 색
};

function getAqiStyle(pm25: number | null): AqiStyle {
  if (pm25 === null) {
    return {
      face: "😶",
      label: "측정 중",
      sub: "미세먼지 정보 없음",
      bg: "bg-gray-50",
      border: "border-gray-200",
      badge: "bg-gray-100",
      badgeText: "text-gray-500",
      title: "text-gray-500",
    };
  }
  if (pm25 <= 15) {
    return {
      face: "😊",
      label: "좋음",
      sub: "쾌청한 공기예요~",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      badge: "bg-emerald-100",
      badgeText: "text-emerald-700",
      title: "text-emerald-600",
    };
  }
  if (pm25 <= 35) {
    return {
      face: "🙂",
      label: "보통",
      sub: "그냥 무난한 날이에요~",
      bg: "bg-yellow-50",
      border: "border-yellow-200",
      badge: "bg-yellow-100",
      badgeText: "text-yellow-700",
      title: "text-yellow-600",
    };
  }
  if (pm25 <= 75) {
    return {
      face: "😟",
      label: "나쁨",
      sub: "공기가 탁해요. 조심하세요~",
      bg: "bg-orange-50",
      border: "border-orange-200",
      badge: "bg-orange-100",
      badgeText: "text-orange-700",
      title: "text-orange-500",
    };
  }
  return {
    face: "😷",
    label: "매우나쁨",
    sub: "탁한 공기, 마스크 챙기세요~",
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "bg-red-100",
    badgeText: "text-red-700",
    title: "text-red-500",
  };
}

/* ───── 날씨 카드 (온도·날씨) ───── */
function WeatherInfoCard({ data }: { data: WeatherData }) {
  return (
    <div className="flex flex-col justify-between bg-sky-50 border border-sky-200 rounded-2xl p-5 min-h-[160px] shadow-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-sky-400 uppercase tracking-wide">
          날씨 · 용인 서천동
        </p>
        <span className="text-2xl leading-none">{data.emoji}</span>
      </div>

      {/* 온도 */}
      <div className="my-3">
        <p className="text-4xl font-extrabold text-sky-700 leading-none">
          {data.temp}°
          <span className="text-xl font-semibold text-sky-400 ml-1">C</span>
        </p>
        <p className="text-sm text-sky-500 mt-1 font-medium">
          {data.description}
        </p>
      </div>

      {/* 하단 정보 */}
      <div className="flex items-center gap-3 text-xs text-sky-400 font-medium">
        <span>체감 {data.feelsLike}°C</span>
        <span className="w-px h-3 bg-sky-200" />
        <span>습도 {data.humidity}%</span>
      </div>
    </div>
  );
}

/* ───── 미세먼지 카드 ───── */
function AirQualityInfoCard({ data }: { data: WeatherData }) {
  const style = getAqiStyle(data.pm25);

  return (
    <div
      className={`flex flex-col justify-between ${style.bg} border ${style.border} rounded-2xl p-5 min-h-[160px] shadow-sm`}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p
          className={`text-xs font-bold ${style.title} uppercase tracking-wide`}
        >
          초미세먼지
        </p>
        {data.pm25 !== null && (
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.badge} ${style.badgeText}`}
          >
            {data.pm25}㎍/m³
          </span>
        )}
      </div>

      {/* 표정 이모지 */}
      <div className="flex flex-col items-center justify-center flex-1 py-1">
        <span className="text-5xl leading-none select-none">{style.face}</span>
        <p className={`text-xl font-extrabold mt-2 ${style.title}`}>
          {style.label}
        </p>
      </div>

      {/* 부연 */}
      {/* <p className={`text-xs font-medium ${style.badgeText} text-center`}>
        {style.sub}
      </p> */}
    </div>
  );
}

/* ───── 로딩 스켈레톤 ───── */
function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-gray-100 border border-gray-200 animate-pulse min-h-[160px]" />
  );
}

/* ───── 메인 export ───── */
export default function WeatherAirCard() {
  const [data, setData] = useState<WeatherData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weather")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(true);
        else setData(json);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <SkeletonCard />
        <SkeletonCard />
      </>
    );
  }

  if (error || !data) return null;

  return (
    <>
      <WeatherInfoCard data={data} />
      <AirQualityInfoCard data={data} />
    </>
  );
}
