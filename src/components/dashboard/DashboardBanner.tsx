"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** 오늘의 말씀 — API 연동 (fallback: 로컬 구절) */
const FALLBACK_VERSES = [
  { text: "여호와는 나의 목자시니 내게 부족함이 없으리로다", ref: "시편 23:1" },
  { text: "내가 산을 향하여 눈을 들리라 나의 도움이 어디서 올까", ref: "시편 121:1" },
  { text: "네 길을 여호와께 맡기라 그를 의지하면 그가 이루시고", ref: "시편 37:5" },
  { text: "하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니", ref: "요한복음 3:16" },
  { text: "내가 능히 나를 강하게 하시는 자 안에서 모든 것을 할 수 있느니라", ref: "빌립보서 4:13" },
  { text: "여호와는 나의 빛이요 나의 구원이시니 내가 누구를 두려워하리요", ref: "시편 27:1" },
  { text: "주의 말씀은 내 발에 등이요 내 길에 빛이니이다", ref: "시편 119:105" },
  { text: "너는 마음을 다하여 여호와를 신뢰하고 네 명철을 의지하지 말라", ref: "잠언 3:5" },
  { text: "구하라 그리하면 너희에게 주실 것이요 찾으라 그리하면 찾아낼 것이요", ref: "마태복음 7:7" },
  { text: "내 은혜가 네게 족하도다 이는 내 능력이 약한 데서 온전하여짐이라", ref: "고린도후서 12:9" },
  { text: "기도를 계속하고 기도에 감사함으로 깨어 있으라", ref: "골로새서 4:2" },
  { text: "범사에 감사하라 이것이 그리스도 예수 안에서 너희를 향하신 하나님의 뜻이니라", ref: "데살로니가전서 5:18" },
  { text: "평안을 너희에게 끼치노니 곧 나의 평안을 너희에게 주노라", ref: "요한복음 14:27" },
  { text: "하나님은 사랑이심이라", ref: "요한일서 4:8" },
  { text: "너희 염려를 다 주께 맡기라 이는 그가 너희를 돌보심이라", ref: "베드로전서 5:7" },
  { text: "두려워하지 말라 내가 너와 함께 함이라 놀라지 말라 나는 네 하나님이 됨이라", ref: "이사야 41:10" },
  { text: "사람이 마음으로 자기의 길을 계획할지라도 그의 걸음을 인도하시는 이는 여호와시니라", ref: "잠언 16:9" },
  { text: "우리가 선을 행하되 낙심하지 말지니 포기하지 아니하면 때가 이르매 거두리라", ref: "갈라디아서 6:9" },
  { text: "여호와를 기뻐하라 그가 네 마음의 소원을 네게 이루어 주시리로다", ref: "시편 37:4" },
  { text: "오직 여호와를 앙망하는 자는 새 힘을 얻으리니 독수리가 날개치며 올라감 같을 것이요", ref: "이사야 40:31" },
  { text: "나 여호와가 말하노라 너희를 향한 나의 생각을 내가 아나니 평안이요 재앙이 아니니라", ref: "예레미야 29:11" },
  { text: "항상 기뻐하라 쉬지 말고 기도하라 범사에 감사하라", ref: "데살로니가전서 5:16-18" },
  { text: "이 율법책을 네 입에서 떠나지 말게 하며 주야로 그것을 묵상하여", ref: "여호수아 1:8" },
  { text: "하나님이 우리에게 주신 것은 두려워하는 마음이 아니요 오직 능력과 사랑과 절제하는 마음이니", ref: "디모데후서 1:7" },
  { text: "예수는 어제나 오늘이나 영원토록 동일하시니라", ref: "히브리서 13:8" },
  { text: "믿음의 주요 또 온전하게 하시는 이인 예수를 바라보자", ref: "히브리서 12:2" },
  { text: "그러므로 누구든지 그리스도 안에 있으면 새로운 피조물이라", ref: "고린도후서 5:17" },
  { text: "이제 믿음, 소망, 사랑, 이 세 가지는 항상 있을 것인데 그 중의 제일은 사랑이라", ref: "고린도전서 13:13" },
  { text: "여호와는 나의 힘과 나의 방패시니 내 마음이 그를 의지하여 도움을 얻었도다", ref: "시편 28:7" },
  { text: "사랑은 오래 참고 사랑은 온유하며 시기하지 아니하며", ref: "고린도전서 13:4" },
];

function DailyVerseCard() {
  const [verse, setVerse] = useState<{ text: string; ref: string } | null>(null);

  useEffect(() => {
    fetch("/api/bible-verse")
      .then((r) => r.json())
      .then((data) => {
        if (data?.text) setVerse(data);
        else throw new Error();
      })
      .catch(() => {
        const today = new Date();
        const idx = (today.getFullYear() * 366 + today.getMonth() * 31 + today.getDate()) % FALLBACK_VERSES.length;
        setVerse(FALLBACK_VERSES[idx]);
      });
  }, []);

  return (
    <div className="w-full sm:flex-1 min-w-0 flex flex-col justify-center gap-2 px-4 py-4 min-h-[140px] sm:min-h-[168px]">
      <p className="text-[10px] font-semibold text-gray-300 tracking-widest uppercase">
        오늘의 말씀
      </p>
      {verse ? (
        <>
          <p className="text-sm font-bold text-gray-700 leading-relaxed">
            &ldquo;{verse.text}&rdquo;
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
      {/* ── 인사 카드 (2/5) ── */}
      <Link
        href="/mypage"
        className="lg:w-2/5 min-w-0 bg-blue-600 rounded-2xl p-6 text-white relative overflow-hidden min-h-[140px] sm:min-h-[168px] flex flex-col justify-between hover:bg-blue-700 transition-colors"
      >
        <div className="relative z-10 flex flex-col h-full justify-between">
          <p className="text-[11px] font-semibold text-blue-200 tracking-widest uppercase">
            수원하나교회
          </p>
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
          <p className="text-blue-200 text-xs opacity-60">
            내 정보를 클릭해 프로필을 확인하세요
          </p>
        </div>
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

      {/* ── 우측 카드 영역 ── */}
      <div className="lg:flex-1 min-w-0 flex flex-col sm:flex-row gap-4">

        {/* 날씨 + 미세먼지 통합 카드 */}
        <div className="w-full sm:flex-[2] min-w-0 bg-white rounded-2xl border border-gray-200 min-h-[140px] sm:min-h-[168px] flex overflow-hidden">
          {/* 날씨 — 왼쪽 */}
          <div className="flex-1 min-w-0 p-5 flex flex-col justify-between">
            <p className="text-xs font-semibold text-gray-400 tracking-wide truncate">날씨 · 용인 서천동</p>
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
                      {weather.temp}°<span className="text-base font-bold text-gray-400">C</span>
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

          <div className="w-px bg-gray-100 my-4" />

          {/* 미세먼지 — 오른쪽 */}
          <div className="flex-1 min-w-0 p-5 flex flex-col justify-between">
            <p className="text-xs font-semibold text-gray-400 tracking-wide">미세먼지</p>
            {weatherLoading ? (
              <div className="animate-pulse space-y-2 mt-3">
                <div className="h-6 w-16 bg-gray-100 rounded" />
                <div className="h-3 w-full bg-gray-100 rounded" />
                <div className="h-3 w-full bg-gray-100 rounded" />
              </div>
            ) : weather?.airGrade ? (
              <>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-2xl leading-none">{weather.airGrade.face}</span>
                  <span className={`text-base font-extrabold ${weather.airGrade.color}`}>
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

        {/* ── 오늘의 말씀 카드 ── */}
        <DailyVerseCard />

      </div>
    </section>
  );
}
