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

/** PM2.5 수치 → 직관적 라벨 (에어코리아 기준) */
function getPm25Level(pm25: number): {
  label: string;
  color: string;
  bg: string;
} {
  if (pm25 <= 15)
    return { label: "좋음", color: "text-blue-600", bg: "bg-blue-50" };
  if (pm25 <= 35)
    return { label: "보통", color: "text-green-600", bg: "bg-green-50" };
  if (pm25 <= 75)
    return { label: "나쁨", color: "text-orange-500", bg: "bg-orange-50" };
  return { label: "매우나쁨", color: "text-red-600", bg: "bg-red-50" };
}

export default function WeatherWidget() {
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
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/60 rounded-xl border border-gray-100 animate-pulse">
        <div className="w-6 h-6 bg-gray-200 rounded-full" />
        <div className="w-16 h-4 bg-gray-200 rounded" />
      </div>
    );
  }

  if (error || !data) return null;

  const pm25Level = data.pm25 != null ? getPm25Level(data.pm25) : null;

  return (
    <div className="flex items-center gap-2 sm:gap-3 px-3 py-1.5 bg-white/80 backdrop-blur rounded-xl border border-gray-100 shadow-sm text-sm shrink-0">
      {/* 날씨 */}
      <div className="flex items-center gap-1.5">
        <span className="text-xl leading-none">{data.emoji}</span>
        <div className="flex flex-col leading-tight">
          <span className="font-extrabold text-gray-800">{data.temp}°C</span>
          <span className="text-[10px] text-gray-400 hidden sm:block">
            체감 {data.feelsLike}°C
          </span>
        </div>
      </div>

      {/* 구분선 */}
      {pm25Level && <div className="h-7 w-px bg-gray-200 hidden sm:block" />}

      {/* 미세먼지 */}
      {pm25Level && data.pm25 != null && (
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${pm25Level.bg}`}
        >
          <span className="text-[10px] font-bold text-gray-500">PM2.5</span>
          <span className={`text-xs font-extrabold ${pm25Level.color}`}>
            {pm25Level.label}
          </span>
          <span className="text-[10px] text-gray-400 hidden sm:inline">
            {data.pm25}㎍
          </span>
        </div>
      )}
    </div>
  );
}
