"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  names: string[];
  onFireConfetti: () => void;
}

const ROWS = 7;
const PAD_X = 32;
const PAD_Y = 36;
const H = 320;

type Rung = { col: number; y: number }; // horizontal bar between col and col+1

function generateLadder(n: number): Rung[] {
  const innerH = H - PAD_Y * 2;
  const rowH = innerH / (ROWS + 1);
  const rungs: Rung[] = [];

  for (let row = 1; row <= ROWS; row++) {
    const y = PAD_Y + row * rowH;
    let lastCol = -2;
    for (let col = 0; col < n - 1; col++) {
      if (col > lastCol + 1 && Math.random() > 0.45) {
        rungs.push({ col, y });
        lastCol = col;
      }
    }
  }
  return rungs;
}

function tracePath(startCol: number, cols: number[], rungs: Rung[]): [number, number][] {
  const sorted = [...rungs].sort((a, b) => a.y - b.y);
  let cur = startCol;
  const pts: [number, number][] = [[cols[cur], PAD_Y]];

  for (const rung of sorted) {
    if (rung.col === cur || rung.col + 1 === cur) {
      pts.push([cols[cur], rung.y]);
      cur = rung.col === cur ? rung.col + 1 : rung.col;
      pts.push([cols[cur], rung.y]);
    }
  }
  pts.push([cols[cur], H - PAD_Y]);
  return pts;
}

export default function LadderGame({ names, onFireConfetti }: Props) {
  const n = names.length;
  const svgWidth = Math.max(260, PAD_X * 2 + (n - 1) * Math.min(70, 260 / Math.max(n - 1, 1)));
  const colW = n > 1 ? (svgWidth - PAD_X * 2) / (n - 1) : 0;
  const cols = Array.from({ length: n }, (_, i) => PAD_X + i * colW);

  const [rungs, setRungs] = useState<Rung[]>([]);
  const [results, setResults] = useState<string[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [path, setPath] = useState<[number, number][]>([]);
  const [animDone, setAnimDone] = useState(false);
  const [endCol, setEndCol] = useState<number>(-1);
  const pathRef = useRef<SVGPathElement>(null);
  const animKeyRef = useRef(0);

  const reset = () => {
    const newRungs = generateLadder(n);
    const res = Array.from({ length: n }, (_, i) => (i === 0 ? "당첨" : "꽝")).sort(() => Math.random() - 0.5);
    setRungs(newRungs);
    setResults(res);
    setSelected(null);
    setPath([]);
    setAnimDone(false);
    setEndCol(-1);
  };

  useEffect(() => {
    if (n >= 2) reset();
  }, [n]);

  const select = (col: number) => {
    if (selected !== null || animDone) return;
    const pts = tracePath(col, cols, rungs);
    const finalCol = tracePath(col, cols, rungs);
    const ec = (finalCol[finalCol.length - 1][0] - PAD_X) / (colW || 1);
    setEndCol(Math.round(ec));
    setPath(pts);
    setSelected(col);
    animKeyRef.current += 1;

    setTimeout(() => {
      setAnimDone(true);
      if (results[Math.round(ec)] === "당첨") onFireConfetti();
    }, 1600);
  };

  if (n < 2) {
    return <p className="text-center text-gray-400 py-8">참가자를 2명 이상 입력해 주세요</p>;
  }

  const pathD = path.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join(" ");

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-sm text-gray-500">
        {selected === null ? "내 이름을 클릭해 사다리를 타세요!" : animDone ? "결과 확인!" : "사다리 타는 중..."}
      </p>

      <div className="w-full overflow-x-auto">
        <svg
          width={svgWidth}
          height={H}
          className="mx-auto block"
          style={{ minWidth: 220 }}
        >
          <style>{`
            @keyframes drawPath {
              from { stroke-dashoffset: 1; }
              to   { stroke-dashoffset: 0; }
            }
          `}</style>

          {/* Vertical lines */}
          {cols.map((x, i) => (
            <line key={i} x1={x} y1={PAD_Y} x2={x} y2={H - PAD_Y} stroke="#d1d5db" strokeWidth={2} />
          ))}

          {/* Horizontal rungs */}
          {rungs.map((rung, i) => (
            <line
              key={i}
              x1={cols[rung.col]} y1={rung.y}
              x2={cols[rung.col + 1]} y2={rung.y}
              stroke="#9ca3af" strokeWidth={2}
            />
          ))}

          {/* Animated path */}
          {pathD && (
            <path
              key={animKeyRef.current}
              ref={pathRef}
              d={pathD}
              fill="none"
              stroke="#6366f1"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1}
              style={{ animation: "drawPath 1.5s linear forwards" }}
            />
          )}

          {/* Names at top */}
          {names.map((name, i) => {
            const isSelected = selected === i;
            return (
              <g
                key={i}
                onClick={() => select(i)}
                style={{ cursor: selected === null ? "pointer" : "default" }}
              >
                <rect
                  x={cols[i] - 26} y={2}
                  width={52} height={26}
                  rx={7}
                  fill={isSelected ? "#6366f1" : "#f3f4f6"}
                  stroke={isSelected ? "#4f46e5" : "#e5e7eb"}
                />
                <text
                  x={cols[i]} y={19}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight="bold"
                  fill={isSelected ? "white" : "#374151"}
                >
                  {name.length > 4 ? name.slice(0, 4) + "…" : name}
                </text>
              </g>
            );
          })}

          {/* Results at bottom */}
          {results.map((res, i) => {
            const isWinner = res === "당첨";
            const isEnd = animDone && endCol === i;
            return (
              <g key={i}>
                <rect
                  x={cols[i] - 24} y={H - PAD_Y + 6}
                  width={48} height={22}
                  rx={6}
                  fill={isEnd && isWinner ? "#fef08a" : isEnd ? "#fee2e2" : "#f9fafb"}
                  stroke={isEnd && isWinner ? "#ca8a04" : isEnd ? "#fca5a5" : "#e5e7eb"}
                />
                <text
                  x={cols[i]} y={H - PAD_Y + 21}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight="bold"
                  fill={animDone ? (isWinner ? "#92400e" : "#9ca3af") : "#d1d5db"}
                >
                  {animDone ? res : "?"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {animDone && endCol >= 0 && (
        <div className={`text-center rounded-2xl px-8 py-4 border-2
          ${results[endCol] === "당첨" ? "bg-yellow-50 border-yellow-300" : "bg-gray-50 border-gray-200"}`}
        >
          <p className="text-xs text-gray-400 mb-1">결과</p>
          <p className={`text-2xl font-extrabold ${results[endCol] === "당첨" ? "text-yellow-600" : "text-gray-400"}`}>
            {results[endCol] === "당첨" ? "🎉 당첨!" : "😢 꽝"}
          </p>
          <p className="text-sm text-gray-500 mt-1">{names[selected!]}</p>
        </div>
      )}

      <button
        onClick={reset}
        className="text-sm text-gray-400 underline hover:text-gray-600"
      >
        사다리 다시 만들기 ↻
      </button>
    </div>
  );
}
