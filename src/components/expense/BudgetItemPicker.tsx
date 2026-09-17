// src/components/expense/BudgetItemPicker.tsx
// 청구 줄에 붙는 비목·출금계좌 단추 — 고치는 일은 모두 BudgetItemModal 이 맡는다.
"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import BudgetItemModal from "./BudgetItemModal";
import {
  availableAmount,
  formatWon,
  itemLabel,
  withdrawLabel,
  type BudgetFlat,
  type BudgetItem,
  type BudgetUsage,
  type WithdrawAccount,
} from "./shared";

type Props = {
  items: BudgetItem[];
  usage: BudgetUsage[];
  /** 납작하게 편 예산안 — 배정된 항목의 잔액·경로를 보여줄 때 쓴다 */
  options: BudgetFlat[];
  accounts: WithdrawAccount[];
  value: string | null;
  withdrawValue: string | null;
  onChange: (budgetItemId: string | null, withdrawCode: string | null) => void;
  /** 최근에 배정한 비목 — 한 번에 고를 수 있게 */
  recent?: BudgetFlat[];
  disabled?: boolean;
};

export default function BudgetItemPicker({
  items,
  usage,
  options,
  accounts,
  value,
  withdrawValue,
  onChange,
  recent = [],
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  );
  const account = useMemo(
    () => accounts.find((a) => a.code === withdrawValue) ?? null,
    [accounts, withdrawValue],
  );

  const modal = open ? (
    <BudgetItemModal
      onClose={() => setOpen(false)}
      items={items}
      usage={usage}
      accounts={accounts}
      value={value}
      withdrawValue={withdrawValue}
      onPick={onChange}
    />
  ) : null;

  if (selected)
    return (
      <>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            title={
              selected.path ? `${selected.path} › ${itemLabel(selected)}` : undefined
            }
            className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded-md border border-blue-200 bg-blue-50 text-xs font-medium text-[#2151EC] hover:bg-blue-100 transition cursor-pointer disabled:cursor-default disabled:opacity-70"
          >
            <Check size={12} className="shrink-0" />
            <span className="truncate">{itemLabel(selected)}</span>
          </button>

          {/* 출금계좌 — 누르면 같은 팝업이 열려 비목과 함께 고친다 */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            title="출금계좌 바꾸기"
            className={`px-2 py-1 rounded-md border text-xs transition cursor-pointer disabled:cursor-default disabled:opacity-70 ${
              account
                ? "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                : "border-amber-300 bg-amber-50 text-amber-700 font-medium"
            }`}
          >
            출금 {account ? withdrawLabel(account) : "미지정"}
          </button>

          {/* 처리대기까지 뺀 가용 잔액 — 담당자가 판단에 쓰는 숫자 */}
          <span
            className={`text-xs ${
              availableAmount(selected) < 0 ? "text-red-600" : "text-gray-400"
            }`}
          >
            가용{" "}
            <span className="font-mono tabular-nums font-semibold">
              {formatWon(availableAmount(selected))}
            </span>
          </span>

          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null, null)}
              aria-label="비목 배정 해제"
              className="text-gray-300 hover:text-red-500 cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
        </div>
        {modal}
      </>
    );

  if (disabled) return <span className="text-xs text-gray-400">비목 미배정</span>;

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#2151EC] bg-white text-xs font-bold text-[#2151EC] hover:bg-blue-50 transition cursor-pointer"
        >
          비목 배정
        </button>
        {recent.slice(0, 3).map((o) => (
          <button
            key={o.id}
            type="button"
            // 최근 비목으로 바로 배정 — 출금계좌는 그 비목의 기본값을 따른다
            onClick={() => onChange(o.id, o.withdraw_code)}
            title={`${o.path} › ${itemLabel(o)}`}
            className="px-2 py-1 rounded-md border border-gray-200 bg-white text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition cursor-pointer max-w-[150px] truncate"
          >
            {itemLabel(o)}
          </button>
        ))}
      </div>
      {modal}
    </>
  );
}
