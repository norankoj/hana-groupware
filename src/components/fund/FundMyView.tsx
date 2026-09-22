// src/components/fund/FundMyView.tsx
"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import ConfirmModal, { ConfirmRow } from "./ConfirmModal";
import FundEntryDetailModal from "./FundEntryDetailModal";
import FundMyRequestModal from "./FundMyRequestModal";
import FundRequestModal from "./FundRequestModal";
import { btnStyles } from "@/components/fund/shared";
import { center, empty, num, table, td, thead, trHover } from "@/components/ui/table";
import SortTh from "@/components/ui/SortTh";
import {
  ENTRY_TYPE_LABEL,
  FUND_ACCOUNT,
  STATUS_LABEL,
  STATUS_STYLE,
  formatWon,
  type FundBalance,
  type FundLedger,
  type FundRequest,
  type FundUser,
} from "./shared";

/** 표 한 줄 — 적립(원장) · 사용(신청서 또는 원장) */
type Row = {
  key: string;
  kind: "deposit" | "withdraw";
  date: string;
  note: string;
  desc: string;
  amount: number;
  correction: boolean;
  req: FundRequest | null;
  entry: FundLedger | null;
};

type SortKey = "date" | "kind" | "note" | "desc" | "status" | "amount";
const SORT_COLUMNS: { key: SortKey; label: string; align?: "center" | "right" }[] = [
  { key: "date", label: "일자" },
  { key: "kind", label: "구분", align: "center" },
  { key: "note", label: "적요" },
  { key: "desc", label: "내용" },
  { key: "status", label: "상태", align: "center" },
  { key: "amount", label: "금액", align: "right" },
];

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

  // 원장 한 줄 모양으로 모은다 — 적립(원장) · 사용(내 신청서 + 담당자가 직접 넣은 사용)
  // 신청을 거쳐 이체된 사용은 원장에도 있지만(request_id), 상태·반려 사유가 있는
  // 신청서 쪽을 보여주려고 원장 줄은 빼고 신청서로 넣는다.
  const rows = useMemo<Row[]>(() => {
    const deposits: Row[] = ledger
      .filter((l) => l.entry_type !== "withdraw")
      .map((l) => ({
        key: `l-${l.id}`,
        kind: "deposit",
        date: l.entry_date,
        note: l.note || ENTRY_TYPE_LABEL[l.entry_type],
        desc: l.description ?? "",
        amount: l.amount,
        correction: !!l.corrects_id,
        req: null,
        entry: l,
      }));

    const fromRequests: Row[] = requests.map((r) => ({
      key: `r-${r.id}`,
      kind: "withdraw",
      // 이체됐으면 이체일, 아니면 신청일
      date: r.transfer_date ?? r.requested_at?.substring(0, 10) ?? "",
      note: "펀드 사용",
      desc: r.purpose,
      amount: r.amount,
      correction: false,
      req: r,
      entry: null,
    }));

    const direct: Row[] = ledger
      .filter((l) => l.entry_type === "withdraw" && !l.request_id)
      .map((l) => ({
        key: `l-${l.id}`,
        kind: "withdraw",
        date: l.entry_date,
        note: l.note || "펀드 사용",
        desc: l.description ?? "",
        amount: l.amount,
        correction: !!l.corrects_id,
        req: null,
        entry: l,
      }));

    return [...deposits, ...fromRequests, ...direct].sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  }, [requests, ledger]);

  const [kind, setKind] = useState<"all" | Row["kind"]>("all");
  // 정렬 — 기본은 최근 일자부터. 같은 칸을 다시 누르면 방향이 바뀐다
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) return setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    setSortKey(k);
    // 글자는 가나다순, 날짜·금액은 큰 것부터
    setSortDir(k === "note" || k === "desc" || k === "kind" || k === "status" ? "asc" : "desc");
  };
  const shown = useMemo(() => {
    const list = kind === "all" ? rows : rows.filter((r) => r.kind === kind);
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: Row): string | number =>
      sortKey === "amount"
        ? r.amount
        : sortKey === "status"
          ? (r.req ? STATUS_LABEL[r.req.status] : "")
          : sortKey === "kind"
            ? ENTRY_TYPE_LABEL[r.kind]
            : r[sortKey];
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "ko");
      // 같으면 최근 일자부터
      return c !== 0 ? c * dir : b.date.localeCompare(a.date);
    });
  }, [rows, kind, sortKey, sortDir]);
  const countOf = (k: "all" | Row["kind"]) =>
    k === "all" ? rows.length : rows.filter((r) => r.kind === k).length;

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
      <div className="bg-white border border-line rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-5 sm:px-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div>
            <p className="text-sm font-medium text-muted">현재 잔액</p>
            <p className="mt-1.5 text-4xl sm:text-5xl font-bold text-heading tabular-nums tracking-tight">
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
            className={`${btnStyles.cta} px-5 py-3 text-sm`}
          >
            펀드 신청하기
          </button>
        </div>

        <div className="grid grid-cols-3 border-t border-line divide-x divide-line-soft">
          <SummaryCell label="적립 합계" value={balance.deposit_total} />
          <SummaryCell label="사용 완료" value={balance.withdraw_total} muted />
          <SummaryCell label="처리대기" value={balance.pending_total} muted />
        </div>

        <div className="px-5 py-3 bg-table-header border-t border-line text-sm text-gray-600">
          납입 계좌 · {FUND_ACCOUNT} — 매월 1일~말일 입금분이 그 달 납입으로
          인정됩니다.
        </div>
      </div>

      {/* ── 내역 — 적립·사용을 한 표로 (원장과 같은 모양) ── */}
      <div className="bg-white border border-line rounded-xl shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-b border-line bg-white">
          <h2 className="text-base font-bold text-heading mr-1">내역</h2>
          {(
            [
              ["all", "전체"],
              ["deposit", "적립"],
              ["withdraw", "사용"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-3 py-1 text-sm rounded-lg border transition cursor-pointer ${
                kind === k
                  ? "border-primary bg-primary-wash text-primary font-bold"
                  : "border-line-strong bg-white text-dark hover:bg-secondary-soft"
              }`}
            >
              {label}
              <span className="ml-1 tabular-nums opacity-70">{countOf(k)}</span>
            </button>
          ))}
        </div>

        {/* 높이 고정 — 전체·적립·사용을 바꿔도 화면이 출렁이지 않게 */}
        <div className="h-[440px] overflow-auto custom-scrollbar">
            <table className={`${table} min-w-[640px]`}>
              <thead className={thead}>
                <tr>
                  {SORT_COLUMNS.map((c) => (
                    <SortTh
                      key={c.key}
                      label={c.label}
                      align={c.align}
                      className={c.key === "date" || c.key === "amount" ? "px-4" : ""}
                      active={sortKey === c.key}
                      dir={sortDir}
                      onClick={() => toggleSort(c.key)}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={SORT_COLUMNS.length} className={`${empty} py-24`}>
                      {kind === "deposit"
                        ? "아직 적립된 내역이 없습니다."
                        : kind === "withdraw"
                          ? "아직 사용한 내역이 없습니다."
                          : "아직 내역이 없습니다."}
                    </td>
                  </tr>
                )}
                {shown.map((r) => {
                  // 반려·취소된 신청은 돈이 나가지 않았다 — 금액을 흐리게 긋는다
                  const void_ =
                    r.req?.status === "rejected" || r.req?.status === "cancelled";
                  return (
                    <tr
                      key={r.key}
                      onClick={() =>
                        r.req ? setDetailReq(r.req) : setDetailEntry(r.entry!)
                      }
                      className={`${trHover} cursor-pointer`}
                    >
                      <td className={`${td} px-4 font-mono text-[13px] text-muted whitespace-nowrap`}>
                        {r.date}
                      </td>
                      <td className={`${td} ${center}`}>
                        <span
                          className={`px-2 py-0.5 text-[11px] font-bold rounded border ${
                            r.kind === "withdraw"
                              ? "bg-warning-soft text-warning-active border-warning/30"
                              : "bg-primary-soft text-primary-active border-primary/30"
                          }`}
                        >
                          {ENTRY_TYPE_LABEL[r.kind]}
                        </span>
                      </td>
                      <td className={`${td} max-w-[180px]`}>
                        <span className="block truncate">
                          {r.note}
                          {r.correction && (
                            <span className="ml-1.5 text-[11px] font-bold text-warning-active">
                              정정
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={`${td} max-w-[280px]`}>
                        <span className="block truncate">{r.desc || "-"}</span>
                      </td>
                      <td className={`${td} ${center} whitespace-nowrap`}>
                        {r.req ? (
                          <span
                            className={`px-2 py-0.5 text-[11px] font-bold rounded border ${STATUS_STYLE[r.req.status]}`}
                          >
                            {STATUS_LABEL[r.req.status]}
                          </span>
                        ) : (
                          <span className="text-xs text-disabled-text">-</span>
                        )}
                      </td>
                      <td
                        className={`${td} ${num} px-4 font-bold whitespace-nowrap ${
                          void_ ? "text-disabled-text! line-through" : r.amount < 0 ? "text-danger!" : ""
                        }`}
                      >
                        {r.amount < 0 ? "−" : ""}
                        {formatWon(Math.abs(r.amount))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      </div>

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
            <p className="pt-1 text-xs text-muted">
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
    <p className="text-xs font-medium text-muted">{label}</p>
    <p
      className={`mt-1 text-lg font-bold tabular-nums ${muted ? "text-muted" : "text-heading"}`}
    >
      {formatWon(value)}
    </p>
  </div>
);
