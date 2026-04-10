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

type Rung = { col: number; y: number };
type PathEntry = { col: number; path: [number, number][]; endCol: number };

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

const PATH_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#0ea5e9", "#f97316"];

export default function LadderGame({ names, onFireConfetti }: Props) {
  const n = names.length;
  const svgWidth = Math.max(260, PAD_X * 2 + (n - 1) * Math.min(70, 260 / Math.max(n - 1, 1)));
  const colW = n > 1 ? (svgWidth - PAD_X * 2) / (n - 1) : 0;
  const cols = Array.from({ length: n }, (_, i) => PAD_X + i * colW);

  const [rungs, setRungs] = useState<Rung[]>([]);
  const [results, setResults] = useState<string[]>([]);
  const [completedPaths, setCompletedPaths] = useState<PathEntry[]>([]);
  const [activePath, setActivePath] = useState<PathEntry | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const animKeyRef = useRef(0);

  const allDone = completedPaths.length === n;

  const reset = () => {
    const newRungs = generateLadder(n);
    const res = Array.from({ length: n }, (_, i) => (i === 0 ? "당첨" : "꽝")).sort(() => Math.random() - 0.5);
    setRungs(newRungs);
    setResults(res);
    setCompletedPaths([]);
    setActivePath(null);
    setIsAnimating(false);
  };

  useEffect(() => {
    if (n >= 2) reset();
  }, [n]);

  const select = (col: number) => {
    if (isAnimating) return;
    if (completedPaths.some((p) => p.col === col)) return;
    if (activePath?.col === col) return;

    const pts = tracePath(col, cols, rungs);
    const ec = Math.round((pts[pts.length - 1][0] - PAD_X) / (colW || 1));
    const entry: PathEntry = { col, path: pts, endCol: ec };

    setActivePath(entry);
    setIsAnimating(true);
    animKeyRef.current += 1;

    setTimeout(() => {
      setIsAnimating(false);
      setActivePath(null);
      setCompletedPaths((prev) => [...prev, entry]);
      if (results[ec] === "당첨") onFireConfetti();
    }, 1600);
  };

  if (n < 2) {
    return <p className="text-center text-gray-400 py-8">참가자를 2명 이상 입력해 주세요</p>;
  }

  const allPaths = [...completedPaths, ...(activePath ? [activePath] : [])];

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-sm text-gray-500">
        {isAnimating
          ? "사다리 타는 중..."
          : allDone
            ? "모두 완료! 결과를 확인하세요 🎉"
            : completedPaths.length === 0
              ? "내 이름을 클릭해 사다리를 타세요!"
              : `${completedPaths.length}명 완료 — 다음 사람이 이름을 클릭하세요`}
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

          {/* Completed paths */}
          {completedPaths.map((entry, pi) => {
            const pathD = entry.path
              .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`)
              .join(" ");
            return (
              <path
                key={`done-${pi}`}
                d={pathD}
                fill="none"
                stroke={PATH_COLORS[entry.col % PATH_COLORS.length]}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.6}
              />
            );
          })}

          {/* Active (animating) path */}
          {activePath && (() => {
            const pathD = activePath.path
              .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`)
              .join(" ");
            return (
              <path
                key={`anim-${animKeyRef.current}`}
                d={pathD}
                fill="none"
                stroke={PATH_COLORS[activePath.col % PATH_COLORS.length]}
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1}
                style={{ animation: "drawPath 1.5s linear forwards" }}
              />
            );
          })()}

          {/* Names at top */}
          {names.map((name, i) => {
            const isDone = completedPaths.some((p) => p.col === i);
            const isActive = activePath?.col === i;
            const isClickable = !isAnimating && !isDone;
            return (
              <g
                key={i}
                onClick={() => select(i)}
                style={{ cursor: isClickable ? "pointer" : "default" }}
              >
                <rect
                  x={cols[i] - 26} y={2}
                  width={52} height={26}
                  rx={7}
                  fill={isActive ? PATH_COLORS[i % PATH_COLORS.length] : isDone ? "#e0e7ff" : "#f3f4f6"}
                  stroke={isActive || isDone ? PATH_COLORS[i % PATH_COLORS.length] : "#e5e7eb"}
                  opacity={isDone ? 0.6 : 1}
                />
                <text
                  x={cols[i]} y={19}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight="bold"
                  fill={isActive ? "white" : isDone ? PATH_COLORS[i % PATH_COLORS.length] : "#374151"}
                >
                  {name.length > 4 ? name.slice(0, 4) + "…" : name}
                </text>
              </g>
            );
          })}

          {/* Results at bottom */}
          {results.map((res, i) => {
            const isWinner = res === "당첨";
            const doneEntry = completedPaths.find((p) => p.endCol === i);
            const isRevealed = !!doneEntry || (activePath?.endCol === i && isAnimating);
            const isFullyRevealed = !!doneEntry;
            return (
              <g key={i}>
                <rect
                  x={cols[i] - 24} y={H - PAD_Y + 6}
                  width={48} height={22}
                  rx={6}
                  fill={isFullyRevealed && isWinner ? "#fef08a" : isFullyRevealed ? "#fee2e2" : "#f9fafb"}
                  stroke={isFullyRevealed && isWinner ? "#ca8a04" : isFullyRevealed ? "#fca5a5" : "#e5e7eb"}
                />
                <text
                  x={cols[i]} y={H - PAD_Y + 21}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight="bold"
                  fill={isFullyRevealed ? (isWinner ? "#92400e" : "#9ca3af") : "#d1d5db"}
                >
                  {isFullyRevealed ? res : "?"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* 개별 결과 카드 */}
      {completedPaths.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center w-full">
          {completedPaths.map((entry, pi) => {
            const res = results[entry.endCol];
            const isWinner = res === "당첨";
            return (
              <div
                key={pi}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-bold
                  ${isWinner ? "bg-yellow-50 border-yellow-300 text-yellow-700" : "bg-gray-50 border-gray-200 text-gray-400"}`}
              >
                <span style={{ color: PATH_COLORS[entry.col % PATH_COLORS.length] }}>●</span>
                <span>{names[entry.col]}</span>
                <span>{isWinner ? "🎉 당첨" : "😢 꽝"}</span>
              </div>
            );
          })}
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
