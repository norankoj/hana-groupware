"use client";

import { useEffect, useState } from "react";

type WeatherData = {
  temp: number;
  emoji: string;
  pm25: number | null;
};

function getPm25Badge(pm25: number | null): {
  label: string;
  cls: string;
} {
  if (pm25 === null) return { label: "-", cls: "bg-gray-100 text-gray-400" };
  if (pm25 <= 15) return { label: "좋음", cls: "bg-emerald-100 text-emerald-700" };
  if (pm25 <= 35) return { label: "보통", cls: "bg-yellow-100 text-yellow-700" };
  if (pm25 <= 75) return { label: "나쁨", cls: "bg-orange-100 text-orange-700" };
  return { label: "매우나쁨", cls: "bg-red-100 text-red-700" };
}

export default function HeaderWeatherBadge() {
  const [data, setData] = useState<WeatherData | null>(null);

  useEffect(() => {
    fetch("/api/weather")
      .then((r) => r.json())
      .then((json) => {
        if (!json.error) {
          setData({ temp: json.temp, emoji: json.emoji, pm25: json.pm25 });
        }
      })
      .catch(() => {});
  }, []);

  if (!data) return null;

  const pm25 = getPm25Badge(data.pm25);

  return (
    <div className="hidden sm:flex items-center gap-1.5 text-sm text-gray-500 select-none">
      <span className="text-base leading-none">{data.emoji}</span>
      <span className="font-semibold text-gray-700">{data.temp}°C</span>
      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${pm25.cls}`}>
        {pm25.label}
      </span>
    </div>
  );
}
