// src/components/fund/FundLedgerList.tsx
"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Select from "@/components/Select";
import FundCorrectModal from "./FundCorrectModal";
import {
  ENTRY_TYPE_LABEL,
  formatWon,
  selectClass,
  type FundBalance,
  type FundPayee,
  type FundLedger,
} from "./shared";

type Props = {
  ledger: FundLedger[];
  payees: FundPayee[];
  balances: Record<string, FundBalance>;
  onRefresh: () => void;
};

const TYPE_FILTER = [
  { value: "all", label: "전체 구분" },
  { value: "deposit", label: "적립" },
  { value: "withdraw", label: "사용" },
];

export default function FundLedgerList({
  ledger,
  payees,
  balances,
  onRefresh,
}: Props) {
  const supabase = createClient();
  const [typeFilter, setTypeFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [correctTarget, setCorrectTarget] = useState<FundLedger | null>(null);

  // 이미 정정된 줄은 다시 정정할 수 없다
  const correctedIds = useMemo(
    () => new Set(ledger.map((l) => l.corrects_id).filter(Boolean) as string[]),
    [ledger],
  );

  const payeeOptions = useMemo(
    () => [
      { value: "all", label: "전체 대상자" },
      ...payees.map((p) => ({ value: p.id, label: p.name })),
    ],
    [payees],
  );

  const filtered = useMemo(
    () =>
      ledger.filter((l) => {
        if (typeFilter !== "all" && l.entry_type !== typeFilter) return false;
        if (userFilter !== "all" && l.payee_id !== userFilter) return false;
        return true;
      }),
    [ledger, typeFilter, userFilter],
  );

  const totals = useMemo(() => {
    let deposit = 0;
    let withdraw = 0;
    for (const l of filtered) {
      if (l.entry_type === "withdraw") withdraw += l.amount;
      else deposit += l.amount;
    }
    return { deposit, withdraw };
  }, [filtered]);

  const selectedBalance =
    userFilter !== "all" ? balances[userFilter] : undefined;

  const handleCorrect = async (reason: string, newAmount: number | null) => {
    const row = correctTarget;
    if (!row) return;

    setBusyId(row.id);
    const { error } = await supabase.rpc("fund_correct_entry", {
      p_entry_id: row.id,
      p_reason: reason,
      p_new_amount: newAmount,
    });
    setBusyId(null);
    setCorrectTarget(null);

    if (error) return toast.error("정정 실패: " + error.message);
    toast.success(
      newAmount
        ? `${formatWon(newAmount)}원으로 정정했습니다.`
        : "취소 처리했습니다. 합계에서 빠집니다.",
    );
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="w-full sm:w-44">
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            options={TYPE_FILTER}
            className={selectClass}
          />
        </div>
        <div className="w-full sm:w-52">
          <Select
            value={userFilter}
            onChange={setUserFilter}
            options={payeeOptions}
            className={selectClass}
          />
        </div>
      </div>

      {/* 합계 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
        <TotalCell label="적립 합계" value={totals.deposit} />
        <TotalCell label="사용 합계" value={totals.withdraw} muted />
        <TotalCell
          label="처리대기"
          value={selectedBalance?.pending_total ?? 0}
          muted
          disabled={!selectedBalance}
        />
        <TotalCell
          label={selectedBalance ? "선택 대상자 잔액" : "잔액 (대상자 선택 시)"}
          value={selectedBalance?.balance ?? 0}
          disabled={!selectedBalance}
        />
      </div>

      {/* 목록 — 높이를 고정하고 안쪽만 스크롤 (제목줄은 위에 고정) */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[430px] sm:h-[490px]">
        <div className="flex-1 overflow-auto custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              해당하는 내역이 없습니다.
            </div>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                  <th className="text-left px-4 py-3 font-bold">일자</th>
                  <th className="text-left px-4 py-3 font-bold">대상자</th>
                  <th className="text-left px-4 py-3 font-bold">구분</th>
                  <th className="text-left px-4 py-3 font-bold">적요</th>
                  <th className="text-left px-4 py-3 font-bold">내용</th>
                  <th className="text-right px-4 py-3 font-bold">금액</th>
                  <th className="text-right px-4 py-3 font-bold">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const isCorrection = !!row.corrects_id;
                  const alreadyCorrected = correctedIds.has(row.id);
                  const fromRequest = !!row.request_id;
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-gray-100 last:border-0 ${
                        isCorrection ? "bg-amber-50/50" : ""
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        {row.entry_date}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                        {row.payee?.name ?? "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 text-[11px] font-bold rounded border ${
                            row.entry_type === "withdraw"
                              ? "bg-orange-50 text-orange-700 border-orange-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}
                        >
                          {ENTRY_TYPE_LABEL[row.entry_type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <span className="block truncate text-gray-700">
                          {row.note || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[280px]">
                        <span className="block truncate text-gray-800">
                          {row.description || "-"}
                        </span>
                        {isCorrection && (
                          <span className="text-[11px] font-bold text-amber-700">
                            정정 내역
                          </span>
                        )}
                        {alreadyCorrected && (
                          <span className="text-[11px] font-bold text-gray-400">
                            정정됨
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums font-bold whitespace-nowrap ${
                          row.amount < 0 ? "text-red-600" : "text-gray-900"
                        }`}
                      >
                        {row.amount < 0 ? "−" : ""}
                        {formatWon(Math.abs(row.amount))}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {isCorrection || alreadyCorrected ? (
                          <span className="text-xs text-gray-400">-</span>
                        ) : fromRequest ? (
                          <span
                            className="text-xs text-gray-400"
                            title="신청을 거쳐 이체된 내역입니다."
                          >
                            신청 건
                          </span>
                        ) : (
                          <button
                            onClick={() => setCorrectTarget(row)}
                            disabled={busyId === row.id}
                            className="px-3 py-1.5 text-xs font-bold text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 disabled:opacity-60 cursor-pointer"
                          >
                            정정
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <FundCorrectModal
        target={correctTarget}
        busy={!!correctTarget && busyId === correctTarget.id}
        onClose={() => setCorrectTarget(null)}
        onConfirm={handleCorrect}
      />
    </div>
  );
}

const TotalCell = ({
  label,
  value,
  muted = false,
  disabled = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
  disabled?: boolean;
}) => (
  <div className="bg-white px-4 py-4">
    <p className="text-xs font-medium text-gray-500">{label}</p>
    <p
      className={`mt-1 text-lg font-bold tabular-nums ${
        disabled ? "text-gray-300" : muted ? "text-gray-500" : "text-gray-900"
      }`}
    >
      {disabled ? "-" : formatWon(value)}
    </p>
  </div>
);
