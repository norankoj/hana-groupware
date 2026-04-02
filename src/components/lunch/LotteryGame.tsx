"use client";

import { useState } from "react";

interface Props {
  names: string[];
  onFireConfetti: () => void;
}

export default function LotteryGame({ names, onFireConfetti }: Props) {
  const [winnerIdx, setWinnerIdx] = useState(-1);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [started, setStarted] = useState(false);

  const n = names.length;

  const start = () => {
    setWinnerIdx(Math.floor(Math.random() * n));
    setRevealed(new Array(n).fill(false));
    setStarted(true);
  };

  const reveal = (i: number) => {
    if (!started || revealed[i]) return;
    const next = [...revealed];
    next[i] = true;
    setRevealed(next);
    if (i === winnerIdx) onFireConfetti();
  };

  if (n === 0) {
    return (
      <p className="text-center text-gray-400 py-8">참가자를 입력해 주세요</p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {!started ? (
        <button
          onClick={start}
          className="w-full py-4 rounded-2xl text-lg font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-95 shadow-lg transition-all"
        >
          제비뽑기 시작
        </button>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            카드를 클릭해 뽑아보세요!{" "}
            <span className="text-indigo-500 font-bold">
              ({revealed.filter(Boolean).length}/{n})
            </span>
          </p>

          <div
            className={`grid gap-3 w-full ${n <= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3 sm:grid-cols-4"}`}
          >
            {names.map((name, i) => {
              const isWinner = i === winnerIdx;
              const isRevealed = revealed[i];

              return (
                <button
                  key={i}
                  onClick={() => reveal(i)}
                  disabled={isRevealed}
                  className="relative w-full"
                  style={{ perspective: 600 }}
                >
                  {/* Card flip container */}
                  <div
                    className="w-full transition-transform duration-500"
                    style={{
                      transformStyle: "preserve-3d",
                      transform: isRevealed
                        ? "rotateY(180deg)"
                        : "rotateY(0deg)",
                      aspectRatio: "2/3",
                    }}
                  >
                    {/* Front (face down) */}
                    <div
                      className="absolute inset-0 rounded-xl flex flex-col items-center justify-center bg-indigo-600 text-white shadow-md border-2 border-indigo-700 cursor-pointer hover:bg-indigo-500 active:scale-95 transition-all"
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      <span className="text-2xl mb-1">🎫</span>
                      <span className="text-xs font-bold opacity-90">
                        {name.length > 5 ? name.slice(0, 5) + "…" : name}
                      </span>
                    </div>

                    {/* Back (revealed) */}
                    <div
                      className={`absolute inset-0 rounded-xl flex flex-col items-center justify-center shadow-md border-2 transition-all
                        ${
                          isWinner
                            ? "bg-yellow-400 border-yellow-500 scale-105"
                            : "bg-gray-100 border-gray-200"
                        }`}
                      style={{
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                      }}
                    >
                      <span className="text-2xl mb-1">
                        {isWinner ? "🎉" : "😢"}
                      </span>
                      <span
                        className={`text-sm font-extrabold ${isWinner ? "text-yellow-800" : "text-gray-400"}`}
                      >
                        {isWinner ? "당첨!" : "꽝"}
                      </span>
                      <span className="text-xs mt-0.5 text-gray-500">
                        {name}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={start}
            className="text-sm text-gray-400 underline hover:text-gray-600"
          >
            다시 하기 ↻
          </button>
        </>
      )}
    </div>
  );
}
