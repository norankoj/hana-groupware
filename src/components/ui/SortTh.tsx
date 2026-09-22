// src/components/ui/SortTh.tsx
// 눌러서 정렬하는 표 머리칸 — 선교펀드 원장 · 내 펀드가 같이 쓴다.
// 같은 칸을 다시 누르면 방향이 바뀐다 (방향 관리는 쓰는 쪽에서).
import { th } from "./table";

export default function SortTh({
  label,
  active,
  dir,
  onClick,
  align = "left",
  className = "",
}: {
  label: string;
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
        className={`inline-flex items-center gap-1 cursor-pointer transition hover:text-primary ${
          active ? "text-primary" : ""
        }`}
      >
        {label}
        <span
          aria-hidden="true"
          className={`text-[10px] leading-none ${active ? "text-primary" : "text-disabled-text"}`}
        >
          {active ? (dir === "asc" ? "▲" : "▼") : "▲"}
        </span>
      </button>
    </th>
  );
}
