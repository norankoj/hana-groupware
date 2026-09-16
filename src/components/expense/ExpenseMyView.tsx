// src/components/expense/ExpenseMyView.tsx
// 내 결의서 — 내가 올린 청구와 처리 결과
"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import ConfirmModal, { ConfirmRow } from "@/components/fund/ConfirmModal";
import ExpenseDetailModal from "./ExpenseDetailModal";
import ExpenseRequestModal from "./ExpenseRequestModal";
import {
  STATUS_LABEL,
  STATUS_STYLE,
  formatWon,
  requestTotal,
  type ExpenseRequest,
  type ExpenseUser,
} from "./shared";

type Props = {
  user: ExpenseUser;
  requests: ExpenseRequest[];
  fiscalYear: number;
  onRefresh: () => void;
};

export default function ExpenseMyView({
  user,
  requests,
  fiscalYear,
  onRefresh,
}: Props) {
  const supabase = createClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
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

  return (
    <div className="space-y-4">
      {/* ── 요약 · 청구 버튼 ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-5 py-5 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500">처리 대기중</p>
          <p className="mt-1 text-3xl font-bold text-gray-900 tabular-nums tracking-tight">
            {formatWon(pendingTotal)}
            <span className="ml-1.5 text-xl font-semibold text-gray-400">원</span>
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {pending.length > 0
              ? `${pending.length}건이 담당자 확인을 기다리고 있습니다.`
              : "대기중인 청구가 없습니다."}
          </p>
        </div>
        <button
          onClick={() => setIsFormOpen(true)}
          className="px-5 py-3 bg-[#2151EC] text-white font-bold rounded-lg hover:bg-[#1a43c9] transition text-sm shadow-md cursor-pointer whitespace-nowrap"
        >
          경비지급 요청
        </button>
      </div>

      {/* ── 내 청구 목록 ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-gray-200 bg-gray-50/50 flex items-center gap-2">
          <h2 className="text-base font-bold text-gray-800">내 청구</h2>
          <span className="text-xs font-medium text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
            {requests.length}
          </span>
        </div>

        {requests.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-gray-500">아직 올린 청구가 없습니다.</p>
            <p className="mt-1 text-xs text-gray-400">
              영수증을 모아 한 번에 여러 건을 올릴 수 있습니다.
            </p>
          </div>
        ) : (
          <ul>
            {requests.map((r) => {
              const items = r.items ?? [];
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setDetail(r)}
                    className="w-full px-4 sm:px-5 py-3.5 flex items-start gap-3 sm:gap-4 hover:bg-gray-50 transition text-left cursor-pointer border-b border-gray-100 last:border-0"
                  >
                    <span
                      className={`mt-0.5 px-2 py-0.5 text-[11px] font-bold rounded border whitespace-nowrap ${STATUS_STYLE[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {r.title}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        청구 {r.request_date} · {items.length}건
                        {r.paid_at && ` · 이체 ${r.paid_at}`}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">
                      {formatWon(requestTotal(items))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ExpenseRequestModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        user={user}
        fiscalYear={fiscalYear}
        onSubmitted={() => {
          setIsFormOpen(false);
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
            <p className="pt-1 text-xs text-gray-500">
              취소한 청구는 되돌릴 수 없습니다. 다시 올려주세요.
            </p>
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}
