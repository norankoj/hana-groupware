"use client";

import { useState } from "react";

const COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
  "#06b6d4", "#a855f7",
];

interface Props {
  names: string[];
  onFireConfetti: () => void;
}

export default function RouletteGame({ names, onFireConfetti }: Props) {
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);

  const n = names.length;
  const SIZE = 280;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = cx - 12;

  function segmentPath(i: number) {
    const ang = (2 * Math.PI) / n;
    const start = i * ang - Math.PI / 2;
    const end = (i + 1) * ang - Math.PI / 2;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${ang > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
  }

  function labelPos(i: number) {
    const ang = (2 * Math.PI) / n;
    const mid = i * ang + ang / 2 - Math.PI / 2;
    const tr = r * 0.62;
    return { x: cx + tr * Math.cos(mid), y: cy + tr * Math.sin(mid), deg: (mid * 180) / Math.PI + 90 };
  }

  const spin = () => {
    if (spinning || n < 2) return;
    setSpinning(true);
    setWinner(null);

    const winnerIdx = Math.floor(Math.random() * n);
    const degPerSeg = 360 / n;
    const winnerCenter = (winnerIdx + 0.5) * degPerSeg;
    const targetOffset = (360 - winnerCenter % 360 + 360) % 360;
    const currentMod = rotation % 360;
    const newRotation = rotation + 5 * 360 + (targetOffset - currentMod + 360) % 360;

    setRotation(newRotation);

    setTimeout(() => {
      setSpinning(false);
      setWinner(names[winnerIdx]);
      onFireConfetti();
    }, 4100);
  };

  if (n === 0) {
    return <p className="text-center text-gray-400 py-8">참가자를 입력해 주세요</p>;
  }

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Pointer */}
      <div className="relative">
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10"
          style={{ top: -6, width: 0, height: 0, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderTop: "22px solid #ef4444" }}
        />
        <svg width={SIZE} height={SIZE} style={{ filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.12))" }}>
          <g
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: `${cx}px ${cy}px`,
              transition: spinning ? "transform 4s cubic-bezier(0.2, 0.8, 0.2, 1)" : "none",
            }}
          >
            {names.map((name, i) => {
              const lp = labelPos(i);
              const fontSize = n > 8 ? 9 : n > 5 ? 11 : 13;
              return (
                <g key={i}>
                  <path d={segmentPath(i)} fill={COLORS[i % COLORS.length]} stroke="white" strokeWidth={2} />
                  <text
                    x={lp.x} y={lp.y}
                    textAnchor="middle" dominantBaseline="middle"
                    fill="white" fontSize={fontSize} fontWeight="bold"
                    transform={`rotate(${lp.deg}, ${lp.x}, ${lp.y})`}
                  >
                    {name.length > 5 ? name.slice(0, 5) + "…" : name}
                  </text>
                </g>
              );
            })}
            <circle cx={cx} cy={cy} r={22} fill="white" stroke="#e5e7eb" strokeWidth={3} />
          </g>
        </svg>
      </div>

      {winner && (
        <div className="text-center bg-yellow-50 border-2 border-yellow-300 rounded-2xl px-8 py-4 animate-bounce-once">
          <p className="text-xs text-gray-400 mb-1">🎉 당첨</p>
          <p className="text-2xl font-extrabold text-yellow-600">{winner}</p>
        </div>
      )}

      <button
        onClick={spin}
        disabled={spinning || n < 2}
        className={`w-full py-4 rounded-2xl text-lg font-bold text-white shadow-lg transition-all active:scale-95
          ${spinning || n < 2
            ? "bg-gray-300 cursor-not-allowed"
            : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500"
          }`}
      >
        {spinning ? "돌리는 중... 🎰" : n < 2 ? "참가자 2명 이상 필요" : "룰렛 돌리기 🎰"}
      </button>
    </div>
  );
}
