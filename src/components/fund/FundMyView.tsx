// src/components/fund/FundMyView.tsx
"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import ConfirmModal, { ConfirmRow } from "./ConfirmModal";
import FundEntryDetailModal from "./FundEntryDetailModal";
import FundMyRequestModal from "./FundMyRequestModal";
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
  const [detailReq, setDetailReq] = useState<FundRequest | null>(null);
  const [detailEntry, setDetailEntry] = useState<FundLedger | null>(null);
  const [cancelTarget, setCancelTarget] = useState<FundRequest | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const deposits = ledger.filter((l) => l.entry_type !== "withdraw");

  // 사용내역 = 내가 낸 신청서 + 담당자가 신청 없이 직접 넣은 사용 줄
  const usages = useMemo(() => {
    const fromRequests = requests.map((r) => ({
      key: `r-${r.id}`,
      req: r,
      entry: null as FundLedger | null,
      amount: r.amount,
      title: r.purpose,
      sub:
        `신청 ${r.requested_at?.substring(0, 10)}` +
        (r.transfer_date ? ` · 이체 ${r.transfer_date}` : ""),
      sortKey: r.transfer_date ?? r.requested_at?.substring(0, 10) ?? "",
    }));

    const direct = ledger
      .filter((l) => l.entry_type === "withdraw" && !l.request_id)
      .map((l) => ({
        key: `l-${l.id}`,
        req: null as FundRequest | null,
        entry: l,
        amount: l.amount,
        title: l.note || l.description || "펀드 사용",
        sub: `이체 ${l.entry_date}`,
        sortKey: l.entry_date,
      }));

    return [...fromRequests, ...direct].sort((a, b) =>
      b.sortKey.localeCompare(a.sortKey),
    );
  }, [requests, ledger]);

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
      {!balance.payee_id && (
        <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-lg px-5 py-4">
          <p className="text-sm leading-relaxed text-amber-900">
            아직 선교펀드 대상자로 등록되지 않았습니다. 펀드 담당자에게
            문의해주세요. 등록되면 잔액과 적립내역이 바로 보입니다.
          </p>
        </div>
      )}

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
            disabled={!balance.payee_id}
            className="px-5 py-3 bg-[#2151EC] text-white font-bold rounded-lg hover:bg-[#1a43c9] transition text-sm shadow-md cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            펀드 신청하기
          </button>
        </div>

        <div className="grid grid-cols-3 border-t border-gray-200 divide-x divide-gray-200">
          <SummaryCell label="적립 합계" value={balance.deposit_total} />
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
        count={usages.length}
        empty="아직 사용한 내역이 없습니다."
      >
        {usages.map((u) => (
          <button
            key={u.key}
            onClick={() =>
              u.req ? setDetailReq(u.req) : setDetailEntry(u.entry!)
            }
            className="w-full px-4 sm:px-5 py-3.5 flex items-start gap-3 sm:gap-4 hover:bg-gray-50 transition text-left cursor-pointer border-b border-gray-100 last:border-0"
          >
            <span
              className={`mt-0.5 px-2 py-0.5 text-[11px] font-bold rounded border whitespace-nowrap ${
                u.req
                  ? STATUS_STYLE[u.req.status]
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}
            >
              {u.req ? STATUS_LABEL[u.req.status] : "이체완료"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {u.title}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">{u.sub}</p>
            </div>
            <span className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">
              −{formatWon(u.amount)}
            </span>
          </button>
        ))}
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
              className="px-4 sm:px-5 py-3.5 flex items-center gap-3 sm:gap-4 border-b border-gray-100 last:border-0"
            >
              <div className="flex-1 min-w-0">
                {/* 적요가 사실상 제목이라 앞으로 올리고, 내용은 날짜 옆에 붙인다 */}
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {row.note || ENTRY_TYPE_LABEL[row.entry_type]}
                  {isCorrection && (
                    <span className="ml-2 text-[11px] font-bold text-amber-700">
                      정정
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 truncate">
                  {row.entry_date}
                  {row.description && ` · ${row.description}`}
                </p>
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

      <FundEntryDetailModal
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
      />

      <FundMyRequestModal
        request={detailReq}
        onClose={() => setDetailReq(null)}
        onCancel={(req) => {
          setDetailReq(null);
          setCancelTarget(req);
        }}
      />

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
  <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col max-h-[340px]">
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
