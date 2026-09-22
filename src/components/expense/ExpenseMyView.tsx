// src/components/expense/ExpenseMyView.tsx
// 내 결의서 — 내가 올린 청구와 처리 결과
"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import { RotateCcw } from "lucide-react";
import ConfirmModal, { ConfirmRow } from "@/components/fund/ConfirmModal";
import ExpenseDetailModal from "./ExpenseDetailModal";
import ExpenseRequestModal from "./ExpenseRequestModal";
import { btnStyles } from "@/components/fund/shared";
import {
  STATUS_LABEL,
  STATUS_STYLE,
  formatWon,
  requestTotal,
  type BudgetYear,
  type ExpenseRequest,
  type ExpenseStatus,
  type ExpenseUser,
} from "./shared";

type Props = {
  user: ExpenseUser;
  requests: ExpenseRequest[];
  fiscalYear: number;
  years: BudgetYear[];
  onRefresh: () => void;
};

/** 상태 탭 — 건수를 함께 보여준다 (0건도 그대로 둔다, 자리가 움직이면 헷갈린다) */
const MY_FILTERS = [
  { key: "all", label: "모두" },
  { key: "pending", label: "처리대기" },
  { key: "approved", label: "승인됨" },
  { key: "paying", label: "이체중" },
  { key: "paid", label: "지급완료" },
  { key: "rejected", label: "반려" },
  { key: "cancelled", label: "취소" },
] as const;

type Filter = (typeof MY_FILTERS)[number]["key"];

/** 지금 어디까지 왔는지 — 승인이 한 단계라 단계는 넷뿐 */
const STEP_TEXT: Record<ExpenseStatus, string> = {
  pending: "담당자 확인",
  approved: "이체 목록 대기",
  paying: "은행 이체중",
  paid: "지급 완료",
  rejected: "반려",
  cancelled: "취소",
};

export default function ExpenseMyView({
  user,
  requests,
  fiscalYear,
  years,
  onRefresh,
}: Props) {
  const supabase = createClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  /** 반려된 건을 그대로 다시 올릴 때 — 청구 폼을 이 내용으로 채운다 */
  const [template, setTemplate] = useState<ExpenseRequest | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<ExpenseRequest | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ExpenseRequest | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    if (!cancelTarget) return;

    setCancelling(true);
    const { data, error } = await supabase
      .from("expense_requests")
      .update({ status: "cancelled" })
      .eq("id", cancelTarget.id)
      .eq("status", "pending")
      .select("id");
    setCancelling(false);
    setCancelTarget(null);

    if (error) return toast.error("취소 실패: " + error.message);
    // 0건이면 그 사이 담당자가 이미 처리했다는 뜻
    if (!data || data.length === 0) {
      toast.error("담당자가 이미 처리한 청구입니다. 목록을 새로 불러옵니다.");
      return onRefresh();
    }
    toast.success("청구가 취소되었습니다.");
    onRefresh();
  };

  const pending = requests.filter((r) => r.status === "pending");
  const pendingTotal = pending.reduce(
    (sum, r) => sum + requestTotal(r.items ?? []),
    0,
  );

  const countOf = (key: Filter) =>
    key === "all"
      ? requests.length
      : requests.filter((r) => r.status === key).length;
  const shown =
    filter === "all" ? requests : requests.filter((r) => r.status === filter);

  const openForm = (from?: ExpenseRequest) => {
    setTemplate(from ?? null);
    setIsFormOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* ── 요약 · 청구 버튼 ── */}
      <div className="bg-white border border-line rounded-xl shadow-sm px-5 py-5 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">처리 대기중</p>
          <p className="mt-1 text-3xl font-bold text-heading tabular-nums tracking-tight">
            {formatWon(pendingTotal)}
            <span className="ml-1.5 text-xl font-semibold text-gray-400">원</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            {pending.length > 0
              ? `${pending.length}건이 담당자 확인을 기다리고 있습니다.`
              : "대기중인 청구가 없습니다."}
          </p>
        </div>
        <button
          onClick={() => openForm()}
          className={`${btnStyles.cta} px-5 py-3 text-sm`}
        >
          경비지급 요청
        </button>
      </div>

      {/* ── 내 청구 목록 ── */}
      <div className="bg-white border border-line rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 pt-3.5 pb-3 border-b border-line bg-table-header">
          <h2 className="text-base font-bold text-gray-800">내 청구</h2>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {MY_FILTERS.map((f) => {
              const n = countOf(f.key);
              const on = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition cursor-pointer ${
                    on
                      ? "border-primary bg-primary-wash text-primary font-bold"
                      : "border-line bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {f.label}
                  <span
                    className={`ml-1 tabular-nums ${
                      on
                        ? "text-primary"
                        : n > 0
                          ? "text-muted"
                          : "text-disabled-text"
                    }`}
                  >
                    ({n})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-muted">
              {requests.length === 0
                ? "아직 올린 청구가 없습니다."
                : "이 상태의 청구가 없습니다."}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              영수증을 모아 한 번에 여러 건을 올릴 수 있습니다.
            </p>
          </div>
        ) : (
          <ul>
            {shown.map((r) => {
              const items = r.items ?? [];
              return (
                <li
                  key={r.id}
                  className="flex items-stretch border-b border-line-soft last:border-0 hover:bg-gray-50 transition"
                >
                  <button
                    onClick={() => setDetail(r)}
                    className="flex-1 min-w-0 px-4 sm:px-5 py-3.5 flex items-start gap-3 sm:gap-4 text-left cursor-pointer"
                  >
                    <span
                      className={`mt-0.5 px-2 py-0.5 text-[11px] font-bold rounded border whitespace-nowrap ${STATUS_STYLE[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-heading truncate">
                        {r.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        청구 {r.request_date}
                        {/* 예전에 한 장으로 올린 묶음은 건수를 함께 보여준다 */}
                        {items.length > 1 && ` · ${items.length}건`}
                        {r.paid_at && ` · 이체 ${r.paid_at}`}
                        <span className="mx-1.5 text-disabled-text">·</span>
                        현재 단계{" "}
                        <b className="font-semibold text-gray-700">
                          {STEP_TEXT[r.status]}
                        </b>
                      </p>
                      {r.status === "rejected" && (
                        <p className="mt-1 text-xs text-danger-active">
                          {r.reject_reason
                            ? `반려 사유: ${r.reject_reason}`
                            : "반려되었어요."}{" "}
                          오른쪽 <b>다시 신청</b>으로 고쳐서 올려주세요.
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-bold font-mono text-heading tabular-nums whitespace-nowrap">
                      {formatWon(requestTotal(items))}
                    </span>
                  </button>
                  {/* 반려·취소된 건은 처음부터 다시 적지 않게 그대로 불러온다 */}
                  {(r.status === "rejected" || r.status === "cancelled") && (
                    <div className="flex items-center pr-4 sm:pr-5">
                      <button
                        onClick={() => openForm(r)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border border-line bg-white text-gray-700 hover:bg-gray-50 transition cursor-pointer whitespace-nowrap"
                      >
                        <RotateCcw size={13} /> 다시 신청
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ExpenseRequestModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setTemplate(null);
        }}
        user={user}
        fiscalYear={fiscalYear}
        years={years}
        template={template}
        onSubmitted={() => {
          setIsFormOpen(false);
          setTemplate(null);
          onRefresh();
        }}
      />

      <ExpenseDetailModal
        request={detail}
        onClose={() => setDetail(null)}
        onCancel={(req) => {
          setDetail(null);
          setCancelTarget(req);
        }}
      />

      <ConfirmModal
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="청구를 취소할까요?"
        confirmText="청구 취소"
        danger
        busy={cancelling}
        onConfirm={handleCancel}
      >
        {cancelTarget && (
          <div className="space-y-2">
            <ConfirmRow label="제목" value={cancelTarget.title} />
            <ConfirmRow
              label="합계"
              value={
                <b className="tabular-nums">
                  {formatWon(requestTotal(cancelTarget.items ?? []))}원
                </b>
              }
            />
            <p className="pt-1 text-xs text-muted">
              취소한 청구는 되돌릴 수 없습니다. 목록의 <b>다시 신청</b>으로 같은
              내용을 다시 올릴 수 있어요.
            </p>
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}
