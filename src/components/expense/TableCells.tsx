// src/components/expense/TableCells.tsx
// 예산안·전체 내역 표가 함께 쓰는 셀.
// 두 표 모두 높이를 고정하고 안에서 스크롤하므로 머리글이 붙어 있어야 한다.
"use client";

/**
 * 스크롤해도 붙어 있는 머리글 칸.
 * border-collapse 에서는 sticky 셀의 보더가 사라지므로 inset 그림자로 밑줄을 그린다.
 */
export const StickyTh = ({
  children,
  align = "right",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) => (
  <th
    scope="col"
    className={`sticky top-0 z-10 bg-table-header py-2.5 px-3 text-[13px] font-bold text-heading tracking-[0.2px] whitespace-nowrap shadow-[inset_0_-1px_0_var(--color-table-line)] ${
      align === "left" ? "text-left" : "text-right"
    } ${className}`}
  >
    {children}
  </th>
);

/** 숫자 칸 — 표의 모든 숫자는 mono + 자릿수 고정 */
export const NumCell = ({
  children,
  muted = false,
  tone = "",
  size = "text-[13px]",
}: {
  children: React.ReactNode;
  /** 값이 없어 흐리게 보일 때 */
  muted?: boolean;
  /** 색을 직접 지정할 때 (muted 보다 우선) */
  tone?: string;
  size?: string;
}) => (
  <td
    className={`py-1.5 px-3 text-right font-mono tabular-nums whitespace-nowrap ${size} ${
      tone || (muted ? "text-disabled-text" : "")
    }`}
  >
    {children}
  </td>
);
