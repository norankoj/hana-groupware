"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export type WeatherData = {
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

type AlarmItem = {
  id: string;
  badge: string;
  badgeColor: string;
  title: string;
  subtitle?: string;
  date: string;
  href: string;
};

const ALARM_BADGE_STYLE: Record<string, string> = {
  중요: "bg-red-50 text-red-600",
  공지: "bg-blue-50 text-blue-600",
  일반: "bg-gray-100 text-gray-500",
  차량: "bg-green-50 text-green-700",
  시설: "bg-purple-50 text-purple-600",
};

function AlarmCard() {
  const [items, setItems] = useState<AlarmItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase
        .from("notices")
        .select("id, title, category, created_at")
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("reservations")
        .select(
          "id, created_at, start_at, end_at, profiles:user_id(full_name), resources:resource_id(name, category)",
        )
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(6),
    ]).then(([{ data: notices }, { data: reservations }]) => {
      const noticeItems: AlarmItem[] = (notices ?? []).map((n) => ({
        id: `n-${n.id}`,
        badge: n.category,
        badgeColor: ALARM_BADGE_STYLE[n.category] ?? ALARM_BADGE_STYLE["일반"],
        title: n.title,
        subtitle: format(new Date(n.created_at), "M.d(EEE) 공지", { locale: ko }),
        date: n.created_at,
        href: "/notice",
      }));

      const reservationItems: AlarmItem[] = (reservations ?? []).map((r) => {
        const resource = (
          Array.isArray(r.resources) ? r.resources[0] : r.resources
        ) as { name?: string; category?: string } | null;
        const profile = (
          Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
        ) as { full_name?: string } | null;
        const isVehicle = resource?.category === "vehicle";
        const badge = isVehicle ? "차량" : "시설";

        let subtitle: string | undefined;
        if (r.start_at && r.end_at) {
          const start = new Date(r.start_at);
          const end = new Date(r.end_at);
          const startStr = format(start, "M.d(EEE) HH:mm", { locale: ko });
          const endSameDay = format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");
          subtitle = endSameDay
            ? `${startStr}~${format(end, "HH:mm")}`
            : `${format(start, "M.d(EEE)", { locale: ko })} ~ ${format(end, "M.d(EEE)", { locale: ko })}`;
        }

        return {
          id: `r-${r.id}`,
          badge,
          badgeColor: ALARM_BADGE_STYLE[badge],
          title: `${resource?.name ?? ""}${profile?.full_name ? ` · ${profile.full_name}님` : ""} 예약`,
          subtitle,
          date: r.created_at,
          href: isVehicle ? "/vehicle" : "/reservation",
        };
      });

      const merged = [...noticeItems, ...reservationItems]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 8);

      setItems(merged);
      setLoading(false);
    });
  }, []);

  return (
    <div className="lg:w-2/5 min-w-0 bg-white rounded-2xl border border-gray-200 p-5 flex flex-col h-[260px] sm:h-[168px] overflow-hidden">
      <p className="text-xs font-semibold text-gray-400 tracking-wide mb-2 shrink-0">
        🔔 최근 알림
      </p>

      {loading ? (
        <div className="animate-pulse space-y-3 flex-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-2 items-center">
              <div className="h-3 bg-gray-100 rounded w-8 shrink-0" />
              <div className="h-3 bg-gray-100 rounded flex-1" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-300 flex-1 flex items-center">
          최근 활동이 없습니다.
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex items-start gap-2 min-w-0 hover:bg-gray-50 rounded-lg px-1 py-0.5 transition-colors"
              >
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${item.badgeColor}`}
                >
                  {item.badge}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-700 font-medium truncate block">
                    {item.title}
                  </span>
                  {item.subtitle && (
                    <span className="text-[11px] text-gray-400 truncate block">
                      {item.subtitle}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap mt-0.5">
                  {format(new Date(item.date), "M.d", { locale: ko })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  weather: WeatherData | null;
  weatherLoading: boolean;
}

function pm10BadgeColor(v: number): string {
  if (v <= 30) return "#1bc47d";
  if (v <= 80) return "#00b0f0";
  if (v <= 150) return "#ff6600";
  return "#d63030";
}
function pm25BadgeColor(v: number): string {
  if (v <= 15) return "#1bc47d";
  if (v <= 35) return "#00b0f0";
  if (v <= 75) return "#ff6600";
  return "#d63030";
}

export default function DashboardBanner({
  profile,
  pendingCount,
  myPendingCount,
  parkingText,
  weather,
  weatherLoading,
}: Props) {
  const canApprove =
    profile.is_approver ||
    profile.role === "admin" ||
    profile.role === "director";

  const [verse, setVerse] = useState<{ text: string; ref: string } | null>(
    null,
  );
  const [verseLoading, setVerseLoading] = useState(true);

  useEffect(() => {
    fetch("/api/bible-verse")
      .then((r) => r.json())
      .then((data) => {
        if (data?.text) setVerse(data);
      })
      .catch(() => {})
      .finally(() => setVerseLoading(false));
  }, []);

  return (
    <section className="flex flex-col lg:flex-row gap-4 items-stretch">
      {/* ── 알림 카드 (왼쪽 2/5) ── */}
      <AlarmCard />

      {/* ── 우측 카드 영역 ── */}
      <div className="lg:flex-1 min-w-0 flex flex-col sm:flex-row gap-4">
        {/* 날씨 + 미세먼지 통합 카드 */}
        <div className="w-full sm:flex-[2] min-w-0 bg-white rounded-2xl border border-gray-200 min-h-[140px] sm:min-h-[168px] flex overflow-hidden">
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
                      <span className="text-base font-bold text-gray-400">
                        C
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {weather.description}
                    </p>
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

          <div className="w-px bg-gray-100 my-4" />

          {/* 미세먼지 — 오른쪽 */}
          <div className="flex-1 min-w-0 p-5 flex flex-col justify-between">
            <p className="text-xs font-semibold text-gray-400 tracking-wide">
              미세먼지
            </p>
            {weatherLoading ? (
              <div className="animate-pulse space-y-3 mt-3">
                <div className="h-5 w-full bg-gray-100 rounded" />
                <div className="h-5 w-full bg-gray-100 rounded" />
              </div>
            ) : weather?.airGrade ? (
              <>
                {/* 이모지 + 등급 (중앙 배치) */}
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-3xl leading-none">
                    {weather.airGrade.face}
                  </span>
                  <span
                    className={`text-base font-extrabold ${weather.airGrade.color}`}
                  >
                    {weather.airGrade.label}
                  </span>
                </div>

                {/* PM10 / PM2.5 수치 + 색상 뱃지 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-medium">미세먼지</span>
                    <div className="flex items-center gap-1.5">
                      {weather.pm10 != null && (
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: pm10BadgeColor(weather.pm10),
                          }}
                        />
                      )}
                      <span className="font-bold text-gray-700">
                        {weather.pm10 != null ? `${weather.pm10} ㎍` : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-medium">
                      초미세먼지
                    </span>
                    <div className="flex items-center gap-1.5">
                      {weather.pm25 != null && (
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: pm25BadgeColor(weather.pm25),
                          }}
                        />
                      )}
                      <span className="font-bold text-gray-700">
                        {weather.pm25 != null ? `${weather.pm25} ㎍` : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-4">정보 없음</p>
            )}
          </div>
        </div>

        {/* 오늘의 말씀 */}
        <div className="w-full sm:flex-1 min-w-0 flex flex-col justify-center gap-2 px-4 py-4 min-h-[140px] sm:min-h-[168px]">
          <p className="text-[12px] font-semibold text-gray-700 tracking-widest uppercase">
            오늘의 말씀
          </p>
          {verse ? (
            <>
              <p className="text-md font-bold text-gray-700 leading-relaxed">
                {verse.text}
              </p>
              <p className="text-xs font-semibold text-gray-400">{verse.ref}</p>
            </>
          ) : (
            <div className="animate-pulse space-y-2 mt-1">
              <div className="h-3.5 bg-gray-100 rounded w-full" />
              <div className="h-3.5 bg-gray-100 rounded w-4/5" />
              <div className="h-3 bg-gray-100 rounded w-16 mt-1" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
