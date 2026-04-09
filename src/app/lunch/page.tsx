// src/app/lunch/page.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import confetti from "canvas-confetti";
import toast from "react-hot-toast";

const RouletteGame = dynamic(() => import("@/components/lunch/RouletteGame"), {
  ssr: false,
});
const LotteryGame = dynamic(() => import("@/components/lunch/LotteryGame"), {
  ssr: false,
});
const LadderGame = dynamic(() => import("@/components/lunch/LadderGame"), {
  ssr: false,
});

type Restaurant = {
  id: string;
  name: string;
  category: string;
  phone: string;
  url: string;
  icon: string;
  address: string;
};

type Tab = "restaurant" | "roulette" | "lottery" | "ladder";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "restaurant", label: "식당 랜덤", icon: "🍽️" },
  { key: "roulette", label: "룰렛", icon: "🎰" },
  { key: "lottery", label: "제비뽑기", icon: "🎫" },
  { key: "ladder", label: "사다리타기", icon: "🪜" },
];

export default function LunchPage() {
  const [tab, setTab] = useState<Tab>("restaurant");

  // ─── 식당 랜덤 상태 ───
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [displayMenu, setDisplayMenu] = useState<Restaurant | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<Restaurant[]>([]);
  const [currentKeyword, setCurrentKeyword] = useState("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // ─── 게임 공통 상태 (이름 목록) ───
  const [names, setNames] = useState<string[]>(["", "", ""]);
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    fetchLunch();
  }, []);

  const fetchLunch = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/lunch");
      const data = await res.json();
      if (data.restaurants?.length > 0) {
        setRestaurants(data.restaurants);
        setDisplayMenu(data.restaurants[0]);
        setCurrentKeyword(data.keyword);
      } else {
        toast.error("주변 맛집이 없어요 ㅠㅠ");
      }
    } catch {
      toast.error("맛집 로딩 실패");
    } finally {
      setLoading(false);
    }
  };

  const startSpin = () => {
    if (isSpinning || restaurants.length === 0) return;
    setIsSpinning(true);
    intervalRef.current = setInterval(() => {
      setDisplayMenu(
        restaurants[Math.floor(Math.random() * restaurants.length)],
      );
    }, 50);
    setTimeout(() => stopSpin(), 2000);
  };

  const stopSpin = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const winner = restaurants[Math.floor(Math.random() * restaurants.length)];
    setDisplayMenu(winner);
    setIsSpinning(false);
    setHistory((prev) => [winner, ...prev].slice(0, 5));
    fireConfetti();
  };

  const fireConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;
    const rand = (min: number, max: number) =>
      Math.random() * (max - min) + min;
    const iv: any = setInterval(() => {
      if (Date.now() > end) return clearInterval(iv);
      const cnt = 50 * ((end - Date.now()) / duration);
      confetti({
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        zIndex: 0,
        particleCount: cnt,
        origin: { x: rand(0.1, 0.3), y: Math.random() - 0.2 },
      });
      confetti({
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        zIndex: 0,
        particleCount: cnt,
        origin: { x: rand(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);
  };

  // ─── 이름 관리 ───
  const validNames = names.filter((n) => n.trim() !== "");

  const addName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setNames((prev) => [...prev, trimmed]);
    setNameInput("");
  };

  const removeName = (i: number) => {
    setNames((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateName = (i: number, value: string) => {
    setNames((prev) => prev.map((n, idx) => (idx === i ? value : n)));
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen flex-col gap-4">
        <span className="text-4xl animate-bounce">🍚</span>
        <span className="text-xl font-bold text-indigo-600">
          재미로만 봐주세요...
        </span>
      </div>
    );

  return (
    <div className="max-w-xl mx-auto py-8 px-4 flex flex-col items-center min-h-screen pb-32">
      {/* 헤더 */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-1">
          🍽️ 오늘 점심 뭐먹지?!🤔
        </h1>
        <p className="text-gray-500 text-sm">랜덤 선택 도우미</p>
      </div>

      {/* 탭 */}
      <div className="flex w-full border-b border-gray-200 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 pb-3 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1
              ${tab === t.key ? "border-indigo-600 text-indigo-600 font-bold" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ─── 식당 랜덤 탭 ─── */}
      {tab === "restaurant" && (
        <div className="w-full flex flex-col items-center gap-0">
          <p className="text-gray-500 text-sm mb-6 text-center">
            예산 <span className="text-indigo-600 font-bold">30분 거리</span>{" "}
            기준&nbsp; 현재{" "}
            <span className="font-bold text-gray-800">'{currentKeyword}'</span>
            (으)로 로딩됨
            <br />
            <button
              onClick={() => {
                setHistory([]);
                fetchLunch();
              }}
              className="mt-1 text-xs text-gray-400 underline hover:text-gray-600"
            >
              다른 종류 메뉴로 다시 찾기 ↻
            </button>
          </p>

          {/* 슬롯머신 박스 */}
          <div className="w-full bg-white rounded-3xl shadow-xl border-4 border-indigo-500 p-8 text-center relative overflow-hidden min-h-[320px] flex flex-col justify-center items-center">
            <div className="absolute top-0 left-0 w-full h-4 bg-indigo-200/50 z-0 pointer-events-none" />
            {displayMenu && (
              <div className="mb-4 animate-fadeIn relative z-10">
                <div className="text-6xl mb-4 animate-bounce">
                  {displayMenu.icon}
                </div>
                <div
                  className={`text-3xl font-black text-gray-800 break-keep leading-tight transition-all ${isSpinning ? "blur-sm scale-95 opacity-70" : "scale-100"}`}
                >
                  {displayMenu.name}
                </div>
                <div className="mt-3 flex gap-2 justify-center">
                  <span className="text-indigo-500 font-bold text-xs bg-indigo-50 px-2 py-1 rounded-full">
                    #{displayMenu.category}
                  </span>
                  <span className="text-gray-500 font-bold text-xs bg-gray-100 px-2 py-1 rounded-full">
                    {displayMenu.address}
                  </span>
                </div>
                <div className="mt-1 text-gray-400 text-xs">
                  {displayMenu.phone || "번호 정보 없음"}
                </div>
              </div>
            )}
            {!isSpinning && displayMenu && (
              <a
                href={displayMenu.url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative z-50 mt-4 px-6 py-2 bg-indigo-50 text-indigo-700 text-sm font-bold rounded-full hover:bg-indigo-100 transition-colors border border-indigo-200 shadow-sm flex items-center gap-2 mx-auto cursor-pointer no-underline"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                가게 정보 & 가격 보기 ↗
              </a>
            )}
          </div>

          <button
            onClick={startSpin}
            disabled={isSpinning}
            className={`mt-6 w-full py-4 rounded-2xl text-xl font-bold text-white shadow-lg transform transition-all active:scale-95
              ${isSpinning ? "bg-gray-400 cursor-not-allowed" : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 hover:shadow-2xl"}`}
          >
            {isSpinning ? "메뉴 고르는 중..." : "오늘의 점심은?"}
          </button>

          {history.length > 0 && (
            <div className="w-full mt-10">
              <h3 className="text-sm font-bold text-gray-500 mb-3 ml-1">
                오늘의 당첨 기록
              </h3>
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <ul className="space-y-2">
                  {history.map((menu, idx) => (
                    <li key={idx}>
                      <a
                        href={menu.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between text-sm p-2 hover:bg-gray-50 rounded cursor-pointer group no-underline"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-lg">{menu.icon}</span>
                          <div className="flex flex-col text-left">
                            <span className="font-medium text-gray-700 group-hover:text-indigo-600">
                              {menu.name}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {menu.category} · {menu.address}
                            </span>
                          </div>
                        </span>
                        <span className="text-xs text-indigo-400 font-bold">
                          이동 ↗
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 게임 탭 공통: 이름 입력 ─── */}
      {tab !== "restaurant" && (
        <div className="w-full flex flex-col gap-6">
          {/* 이름 입력 섹션 */}
          <div className="w-full bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
              참가자 이름
            </p>

            {/* 기존 이름 목록 */}
            <div className="flex flex-wrap gap-2 mb-3">
              {names.map((name, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1"
                >
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => updateName(i, e.target.value)}
                    // placeholder={`참가자 ${i + 1}`}
                    className="text-sm font-medium text-indigo-700 bg-transparent outline-none w-20"
                    maxLength={8}
                  />
                  <button
                    onClick={() => removeName(i)}
                    className="text-indigo-300 hover:text-indigo-600 text-xs font-bold leading-none"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* 이름 추가 */}
            <div className="flex gap-2">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addName()}
                placeholder="이름 입력 후 Enter"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400"
                maxLength={8}
              />
              <button
                onClick={addName}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-500 transition"
              >
                추가 +
              </button>
            </div>

            {validNames.length > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                총{" "}
                <span className="font-bold text-indigo-600">
                  {validNames.length}명
                </span>{" "}
                참가
              </p>
            )}
          </div>

          {/* 게임 영역 */}
          <div className="w-full bg-white rounded-2xl border border-gray-200 p-5">
            {tab === "roulette" && (
              <RouletteGame names={validNames} onFireConfetti={fireConfetti} />
            )}
            {tab === "lottery" && (
              <LotteryGame names={validNames} onFireConfetti={fireConfetti} />
            )}
            {tab === "ladder" && (
              <LadderGame names={validNames} onFireConfetti={fireConfetti} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
