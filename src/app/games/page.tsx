// src/app/games/page.tsx
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import confetti from "canvas-confetti";

const RouletteGame = dynamic(() => import("@/components/lunch/RouletteGame"), {
  ssr: false,
});
const LotteryGame = dynamic(() => import("@/components/lunch/LotteryGame"), {
  ssr: false,
});
const LadderGame = dynamic(() => import("@/components/lunch/LadderGame"), {
  ssr: false,
});

type Tab = "roulette" | "lottery" | "ladder";

const TABS: { key: Tab; label: string; icon: string; desc: string }[] = [
  {
    key: "roulette",
    label: "룰렛",
    icon: "🎰",
    desc: "원판을 돌려 당첨자를 뽑아요",
  },
  {
    key: "lottery",
    label: "제비뽑기",
    icon: "🎫",
    desc: "카드를 뒤집어 당첨을 확인해요",
  },
  {
    key: "ladder",
    label: "사다리타기",
    icon: "🪜",
    desc: "사다리를 타고 결과를 확인해요",
  },
];

export default function GamesPage() {
  const [tab, setTab] = useState<Tab>("roulette");
  const [names, setNames] = useState<string[]>([]);
  const [nameInput, setNameInput] = useState("");

  const validNames = names.filter((n) => n.trim() !== "");

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

  const addName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setNames((prev) => [...prev, trimmed]);
    setNameInput("");
  };

  const removeName = (i: number) =>
    setNames((prev) => prev.filter((_, idx) => idx !== i));

  const updateName = (i: number, value: string) =>
    setNames((prev) => prev.map((n, idx) => (idx === i ? value : n)));

  return (
    <div className="max-w-xl mx-auto py-8 px-4 pb-32">
      {/* 헤더 */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">
          🎲 랜덤 게임
        </h1>
        <p className="text-gray-500 text-sm">룰렛, 제비뽑기, 사다리타기</p>
      </div>

      {/* 탭 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex flex-col items-center gap-1.5 py-4 px-2 rounded-2xl border-2 transition-all
              ${
                tab === t.key
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
              }`}
          >
            {/* <span className="text-2xl">{t.icon}</span> */}
            <span className="text-lg font-bold">{t.label}</span>
            {/* <span className="text-[10px] text-gray-400 leading-tight text-center hidden sm:block">
              {t.desc}
            </span> */}
          </button>
        ))}
      </div>

      {/* 이름 입력 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
          참가자 이름{" "}
          <span className="text-indigo-500">({validNames.length}명)</span>
        </p>
        <div className="flex flex-wrap gap-2 mb-3 min-h-[36px]">
          {names.map((name, i) => (
            <div
              key={i}
              className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1"
            >
              <input
                type="text"
                value={name}
                onChange={(e) => updateName(i, e.target.value)}
                placeholder={`참가자 ${i + 1}`}
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
        <div className="flex gap-2">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addName()}
            placeholder="이름 입력 후 Enter 또는 추가 버튼"
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
      </div>

      {/* 게임 영역 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
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
  );
}
