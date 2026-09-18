// src/components/expense/AdjustmentHistory.tsx
// 지급 정정 내역 — 일어난 순서대로 읽히는 타임라인.
//
// 장부처럼 '청구 금액 → 증감 → 합계'로 보여주면 회계 담당자에겐 익숙해도
// 일반 사용자는 무엇이 먼저 일어났는지 읽기 어렵다. 처음 지급부터 날짜순으로
// 한 줄씩 쌓고, 마지막에 최종 지급액을 둔다. 점의 색은 종류를 뜻한다
// (지급 회색 · 추가 지급 파랑 · 반환 빨강).
"use client";

import { ADJ_LABEL, formatWon, netPaid, type ExpenseRequestItem } from "./shared";

type Props = {
  item: ExpenseRequestItem;
  /** 처음 지급한 날 (지급완료 이체일자) */
  paidAt?: string | null;
};

const TONE = {
  paid: { dot: "border-gray-400", text: "text-gray-900", amount: "text-gray-900" },
  extra: { dot: "border-[#2151EC]", text: "text-[#2151EC]", amount: "text-[#2151EC]" },
  refund: { dot: "border-red-500", text: "text-red-600", amount: "text-red-600" },
} as const;

export default function AdjustmentHistory({ item, paidAt }: Props) {
  const adjustments = [...(item.adjustments ?? [])].sort((a, b) =>
    a.occurred_on === b.occurred_on
      ? a.created_at.localeCompare(b.created_at)
      : a.occurred_on.localeCompare(b.occurred_on),
  );
  if (adjustments.length === 0) return null;

  const events = [
    {
      key: "paid",
      tone: "paid" as const,
      title: "지급",
      date: paidAt ?? "",
      note: null as string | null,
      amount: formatWon(item.amount),
    },
    ...adjustments.map((a) => ({
      key: a.id,
      tone: a.kind,
      title: ADJ_LABEL[a.kind],
      date: a.occurred_on,
      note: a.memo,
      amount: `${a.kind === "extra" ? "+" : "−"}${formatWon(a.amount)}`,
    })),
  ];

  return (
    <section className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <h3 className="text-xs font-bold text-gray-500">지급 정정 내역</h3>

      <ol className="mt-3">
        {events.map((e, i) => (
          <li key={e.key} className="relative flex gap-3 pb-3 last:pb-0">
            {/* 다음 기록으로 이어지는 선 */}
            {i < events.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-[5px] top-4 bottom-0 w-px bg-gray-200"
              />
            )}
            <span
              aria-hidden="true"
              className={`relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full border-2 bg-white ${TONE[e.tone].dot}`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm">
                  <span className={`font-bold ${TONE[e.tone].text}`}>{e.title}</span>
                  {e.date && (
                    <span className="ml-2 font-mono text-xs text-gray-400">{e.date}</span>
                  )}
                </p>
                <span
                  className={`shrink-0 font-mono text-sm tabular-nums ${TONE[e.tone].amount}`}
                >
                  {e.amount}
                </span>
              </div>
              {e.note && (
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500 break-words">
                  {e.note}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3 pt-3 border-t border-gray-200 flex items-baseline justify-between">
        <span className="text-sm font-bold text-gray-900">최종 지급액</span>
        <span className="font-mono text-base font-bold tabular-nums text-gray-900">
          {formatWon(netPaid(item))}
          <span className="ml-0.5 text-xs font-medium text-gray-400">원</span>
        </span>
      </div>
    </section>
  );
}
