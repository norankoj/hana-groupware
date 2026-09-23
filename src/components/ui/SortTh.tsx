// src/components/ui/SortTh.tsx
// 눌러서 정렬하는 표 머리칸 — 그룹웨어의 모든 표가 같이 쓴다.
// 화살표는 lucide 아이콘 하나로 통일한다 (예전엔 ▲▼ 글자와 ⇅ 가 화면마다 섞여 있었다).
//   · 정렬 안 된 칸: 위아래 화살표(누를 수 있다는 표시)
//   · 오름차순 ↑ / 내림차순 ↓, 켜진 칸은 주색
// 같은 칸을 다시 누르면 방향이 바뀐다 (방향 관리는 쓰는 쪽에서).
"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { th } from "./table";

export default function SortTh({
  label,
  active,
  dir,
  onClick,
  align = "left",
  className = "",
}: {
  label: React.ReactNode;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`${th} ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""} ${className}`}
    >
      <button
        type="button"
        onClick={onClick}
        // 오른쪽 정렬 칸은 화살표가 글자 왼쪽에 와야 숫자 끝이 가지런하다
        className={`inline-flex items-center gap-1 cursor-pointer transition hover:text-primary ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-primary" : ""}`}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp size={12} />
          ) : (
            <ArrowDown size={12} />
          )
        ) : (
          <ChevronsUpDown size={12} className="text-disabled-text" />
        )}
      </button>
    </th>
  );
}
