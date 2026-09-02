// src/components/fund/FundMyView.tsx
"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import ConfirmModal, { ConfirmRow } from "./ConfirmModal";
import FundRequestModal from "./FundRequestModal";
import {
  ENTRY_TYPE_LABEL,
  FUND_ACCOUNT,
  STATUS_LABEL,
  STATUS_STYLE,
  formatWon,
  joinAccountInfo,
  openProof,
  type FundBalance,
  type FundLedger,
  type FundRequest,
  type FundUser,
} from "./shared";

type Props = {
  user: FundUser;
  balance: FundBalance;
  ledger: FundLedger[];
  requests: FundRequest[];
  onRefresh: () => void;
};

export default function FundMyView({
  user,
  balance,
  ledger,
  requests,
  onRefresh,
}: Props) {
  const supabase = createClient();
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<FundRequest | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const deposits = ledger.filter((l) => l.entry_type !== "withdraw");

  const handleCancel = async () => {
    if (!cancelTarget) return;

    setCancelling(true);
    const { error } = await supabase
      .from("fund_requests")
      .update({ status: "cancelled" })
      .eq("id", cancelTarget.id)
      .eq("status", "pending");
    setCancelling(false);
    setCancelTarget(null);

    if (error) return toast.error("취소 실패: " + error.message);
    toast.success("신청이 취소되었습니다.");
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* ── 잔액 요약 ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-5 sm:px-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div>
            <p className="text-sm font-medium text-gray-500">현재 잔액</p>
            <p className="mt-1.5 text-4xl sm:text-5xl font-bold text-gray-900 tabular-nums tracking-tight">
              {formatWon(balance.balance)}
              <span className="ml-1.5 text-2xl font-semibold text-gray-400">
                원
              </span>
            </p>
            {balance.pending_total > 0 && (
              <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 inline-block">
                처리대기 {formatWon(balance.pending_total)}원이 이미 차감된
                금액입니다
              </p>
            )}
          </div>
          <button
            onClick={() => setIsRequestOpen(true)}
            className="px-5 py-3 bg-[#2151EC] text-white font-bold rounded-lg hover:bg-[#1a43c9] transition text-sm shadow-md cursor-pointer whitespace-nowrap"
          >
            펀드 신청하기
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-gray-200 divide-x divide-gray-200">
          <SummaryCell label="본인적립금" value={balance.self_total} />
          <SummaryCell label="교회지원금" value={balance.match_total} />
          <SummaryCell label="사용 완료" value={balance.withdraw_total} muted />
          <SummaryCell label="처리대기" value={balance.pending_total} muted />
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
          납입 계좌 · {FUND_ACCOUNT} — 매월 1일~말일 입금분이 그 달 납입으로
          인정됩니다.
        </div>
      </div>

      {/* ── 사용내역 ── */}
      <Section
        title="사용내역"
        count={requests.length}
        empty="아직 신청한 내역이 없습니다."
      >
        {requests.map((req) => {
          const open = detailId === req.id;
          return (
            <div key={req.id} className="border-b border-gray-100 last:border-0">
              <button
                onClick={() => setDetailId(open ? null : req.id)}
                className="w-full px-4 sm:px-5 py-3.5 flex items-start gap-3 sm:gap-4 hover:bg-gray-50 transition text-left cursor-pointer"
              >
                <span
                  className={`mt-0.5 px-2 py-0.5 text-[11px] font-bold rounded border whitespace-nowrap ${STATUS_STYLE[req.status]}`}
                >
                  {STATUS_LABEL[req.status]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {req.purpose}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    신청 {req.requested_at?.substring(0, 10)}
                    {req.transfer_date && ` · 이체 ${req.transfer_date}`}
                  </p>
                </div>
                <span className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">
                  −{formatWon(req.amount)}
                </span>
              </button>

              {open && (
                <div className="px-4 sm:px-5 pb-4 pt-1 bg-gray-50/60 space-y-2.5 text-sm">
                  <DetailRow label="요청내역" value={req.purpose} />
                  <DetailRow
                    label="금액"
                    value={`${formatWon(req.amount)}원`}
                  />
                  <DetailRow
                    label="받을 계좌"
                    value={joinAccountInfo(req) || "-"}
                  />
                  <DetailRow
                    label="요청일시"
                    value={req.requested_at?.replace("T", " ").substring(0, 16)}
                  />
                  {req.transfer_date && (
                    <DetailRow label="이체일자" value={req.transfer_date} />
                  )}
                  {req.handler?.full_name && (
                    <DetailRow label="처리자" value={req.handler.full_name} />
                  )}
                  {req.reject_reason && (
                    <DetailRow
                      label="반려사유"
                      value={req.reject_reason}
                      highlight
                    />
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {req.proof_url && (
                      <button
                        onClick={() => openProof(req.id)}
                        className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 cursor-pointer"
                      >
                        증빙자료 보기
                        {req.proof_name && (
                          <span className="ml-1.5 font-normal text-gray-500">
                            {req.proof_name}
                          </span>
                        )}
                      </button>
                    )}
                    {req.status === "pending" && (
                      <button
                        onClick={() => setCancelTarget(req)}
                        className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 cursor-pointer"
                      >
                        신청 취소
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Section>

      {/* ── 적립내역 ── */}
      <Section
        title="적립내역"
        count={deposits.length}
        empty="아직 적립된 내역이 없습니다."
      >
        {deposits.map((row) => {
          const isCorrection = !!row.corrects_id;
          return (
            <div
              key={row.id}
              className="px-4 sm:px-5 py-3 flex items-center gap-3 sm:gap-4 border-b border-gray-100 last:border-0"
            >
              <span
                className={`px-2 py-0.5 text-[11px] font-bold rounded border whitespace-nowrap ${
                  row.entry_type === "self_deposit"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}
              >
                {ENTRY_TYPE_LABEL[row.entry_type]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">
                  {row.description || "-"}
                  {isCorrection && (
                    <span className="ml-2 text-[11px] font-bold text-amber-700">
                      정정
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">{row.entry_date}</p>
              </div>
              <span
                className={`text-sm font-bold tabular-nums whitespace-nowrap ${
                  row.amount < 0 ? "text-red-600" : "text-gray-900"
                }`}
              >
                {row.amount < 0 ? "−" : "+"}
                {formatWon(Math.abs(row.amount))}
              </span>
            </div>
          );
        })}
      </Section>

      <FundRequestModal
        isOpen={isRequestOpen}
        onClose={() => setIsRequestOpen(false)}
        user={user}
        balance={balance.balance}
        onSubmitted={() => {
          setIsRequestOpen(false);
          onRefresh();
        }}
      />

      <ConfirmModal
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="신청을 취소할까요?"
        confirmText="신청 취소"
        danger
        busy={cancelling}
        onConfirm={handleCancel}
      >
        {cancelTarget && (
          <div className="space-y-2">
            <ConfirmRow label="요청내역" value={cancelTarget.purpose} />
            <ConfirmRow
              label="금액"
              value={
                <b className="tabular-nums">
                  {formatWon(cancelTarget.amount)}원
                </b>
              }
            />
            <p className="pt-1 text-xs text-gray-500">
              취소하면 차감됐던 금액이 잔액으로 돌아옵니다.
            </p>
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}

const SummaryCell = ({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) => (
  <div className="px-4 py-3 sm:px-5">
    <p className="text-xs font-medium text-gray-500">{label}</p>
    <p
      className={`mt-1 text-lg font-bold tabular-nums ${muted ? "text-gray-500" : "text-gray-900"}`}
    >
      {formatWon(value)}
    </p>
  </div>
);

const Section = ({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) => (
  <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col max-h-[420px]">
    <div className="px-4 sm:px-5 py-3 border-b border-gray-200 bg-gray-50/50 flex items-center gap-2 shrink-0">
      <h2 className="text-base font-bold text-gray-800">{title}</h2>
      <span className="text-xs font-medium text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
        {count}
      </span>
    </div>
    {count === 0 ? (
      <div className="py-10 text-center text-sm text-gray-400">{empty}</div>
    ) : (
      <div className="flex-1 overflow-y-auto custom-scrollbar">{children}</div>
    )}
  </div>
);

const DetailRow = ({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) => (
  <div className="flex flex-col sm:flex-row sm:gap-4">
    <span className="w-full sm:w-24 shrink-0 text-xs font-bold text-gray-500 pt-0.5">
      {label}
    </span>
    <span
      className={`flex-1 text-sm break-words ${highlight ? "text-red-600 font-medium" : "text-gray-800"}`}
    >
      {value}
    </span>
  </div>
);
