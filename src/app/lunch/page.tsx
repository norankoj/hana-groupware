// src/app/lunch/page.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import confetti from "canvas-confetti";
import toast from "react-hot-toast";

type Restaurant = {
  id: string;
  name: string;
  category: string;
  phone: string;
  url: string;
  icon: string;
  address: string;
};

export default function LunchPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [displayMenu, setDisplayMenu] = useState<Restaurant | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<Restaurant[]>([]);
  const [currentKeyword, setCurrentKeyword] = useState("");

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchLunch();
  }, []);

  const fetchLunch = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/lunch");
      const data = await res.json();

      if (data.restaurants && data.restaurants.length > 0) {
        setRestaurants(data.restaurants);
        setDisplayMenu(data.restaurants[0]);
        setCurrentKeyword(data.keyword);
      } else {
        toast.error("주변 맛집이 없어요 ㅠㅠ");
      }
    } catch (e) {
      toast.error("맛집 로딩 실패");
    } finally {
      setLoading(false);
    }
  };

  const startSpin = () => {
    if (isSpinning || restaurants.length === 0) return;
    setIsSpinning(true);

    let counter = 0;
    const speed = 50;

    intervalRef.current = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * restaurants.length);
      setDisplayMenu(restaurants[randomIndex]);
      counter++;
    }, speed);

    setTimeout(() => {
      stopSpin();
    }, 2000);
  };

  const stopSpin = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    const finalIndex = Math.floor(Math.random() * restaurants.length);
    const winner = restaurants[finalIndex];

    setDisplayMenu(winner);
    setIsSpinning(false);
    setHistory((prev) => [winner, ...prev].slice(0, 5));

    fireConfetti();
  };

  const fireConfetti = () => {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };
    const randomInRange = (min: number, max: number) =>
      Math.random() * (max - min) + min;

    const interval: any = setInterval(function () {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) return clearInterval(interval);
      const particleCount = 50 * (timeLeft / duration);
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);
  };

  // 리스트 다시 불러오기
  const handleRefresh = () => {
    setHistory([]);
    fetchLunch();
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen flex-col gap-4">
        <span className="text-4xl animate-bounce">🍚</span>
        <span className="text-xl font-bold text-indigo-600">
          11,000원 이하 맛집 탐색 중...
        </span>
      </div>
    );

  return (
    <div className="max-w-xl mx-auto py-12 px-4 flex flex-col items-center min-h-screen pb-32">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">
          🍽️ 오늘 점심 뭐먹지?!🤔
        </h1>
        <p className="text-gray-500 text-sm">
          예산 <span className="text-indigo-600 font-bold">11,000원</span> &{" "}
          <span className="text-indigo-600 font-bold">30분 거리</span> 기준
          <br />
          현재{" "}
          <span className="font-bold text-gray-800">'{currentKeyword}'</span>
          (으)로 로딩됨
        </p>
        <button
          onClick={handleRefresh}
          className="mt-2 text-xs text-gray-400 underline hover:text-gray-600"
        >
          다른 종류 메뉴로 다시 찾기 ↻
        </button>
      </div>

      {/* 메인 슬롯머신 박스 */}
      <div className="w-full bg-white rounded-3xl shadow-xl border-4 border-indigo-500 p-8 text-center relative overflow-hidden group min-h-[320px] flex flex-col justify-center items-center">
        {/* ★ [수정됨] 배경 장식에 pointer-events-none 추가 (클릭 방해 원천 차단) */}
        <div className="absolute top-0 left-0 w-full h-4 bg-indigo-200/50 z-0 pointer-events-none"></div>

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

        {/* ★ [핵심 수정] 버튼을 <a> 태그로 변경하여 클릭 문제 100% 해결 */}
        {!isSpinning && displayMenu && (
          <a
            href={displayMenu.url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative z-50 mt-4 px-6 py-2 bg-indigo-50 text-indigo-700 text-sm font-bold rounded-full hover:bg-indigo-100 transition-colors border border-indigo-200 shadow-sm flex items-center gap-2 mx-auto cursor-pointer no-underline"
            style={{ WebkitTapHighlightColor: "transparent" }} // 모바일 터치 반응 개선
          >
            가게 정보 & 가격 보기 ↗
          </a>
        )}
      </div>

      {/* 레버 버튼 */}
      <button
        onClick={startSpin}
        disabled={isSpinning}
        className={`
            mt-8 w-full py-4 rounded-2xl text-xl font-bold text-white shadow-lg transform transition-all active:scale-95 relative z-20
            ${
              isSpinning
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 hover:shadow-2xl"
            }
        `}
      >
        {isSpinning ? "메뉴 고르는 중..." : "오늘의 점심은?"}
      </button>

      {/* 히스토리 (여기도 a 태그로 변경) */}
      {history.length > 0 && (
        <div className="w-full mt-10 animate-fadeIn relative z-10">
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
  );
}
