// src/components/fund/FundApprove.tsx
"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Select from "@/components/Select";
import ConfirmModal, { ConfirmRow } from "./ConfirmModal";
import { DateField } from "./FundFields";
import {
  STATUS_LABEL,
  STATUS_OPTIONS,
  STATUS_STYLE,
  formatWon,
  inputClass,
  joinAccountInfo,
  openProof,
  selectClass,
  todayString,
  type FundRequest,
} from "./shared";

type Props = {
  requests: FundRequest[];
  onRefresh: () => void;
};

export default function FundApprove({ requests, onRefresh }: Props) {
  const supabase = createClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [keyword, setKeyword] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [transferDates, setTransferDates] = useState<Record<string, string>>(
    {},
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [completeTarget, setCompleteTarget] = useState<FundRequest | null>(
    null,
  );
  const [rejectTarget, setRejectTarget] = useState<FundRequest | null>(null);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!kw) return true;
      return (
        (r.profiles?.full_name ?? "").toLowerCase().includes(kw) ||
        r.purpose.toLowerCase().includes(kw)
      );
    });
  }, [requests, statusFilter, keyword]);

  const handleComplete = async () => {
    const req = completeTarget;
    if (!req) return;
    const transferDate = transferDates[req.id] || todayString();

    setBusyId(req.id);
    const { error } = await supabase.rpc("fund_complete_request", {
      p_request_id: req.id,
      p_transfer_date: transferDate,
    });
    setBusyId(null);
    setCompleteTarget(null);

    if (error) return toast.error("처리 실패: " + error.message);
    toast.success("이체 완료로 처리했습니다.");
    onRefresh();
  };

  const handleReject = async (reason: string) => {
    const req = rejectTarget;
    if (!req) return;

    setBusyId(req.id);
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("fund_requests")
      .update({
        status: "rejected",
        reject_reason: reason,
        handler_id: authUser?.id ?? null,
        completed_at: new Date().toISOString(),
        result_seen: false,
      })
      .eq("id", req.id)
      .eq("status", "pending");
    setBusyId(null);
    setRejectTarget(null);

    if (error) return toast.error("반려 실패: " + error.message);
    toast.success("반려 처리했습니다. 금액은 잔액으로 돌아갔습니다.");
    onRefresh();
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-stretch">
        <div className="w-full sm:w-44">
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
            className={selectClass}
          />
        </div>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="사역자명 또는 요청내역 검색"
          className={`${inputClass} flex-1`}
        />
        <div className="flex items-center justify-center bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-500 whitespace-nowrap">
          처리대기&nbsp;
          <b className={pendingCount > 0 ? "text-red-600" : "text-gray-700"}>
            {pendingCount}
          </b>
          건
        </div>
      </div>

      {/* 목록 — 연차 결재함처럼 높이를 고정하고 안쪽만 스크롤 */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[520px] sm:h-[640px]">
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              해당하는 신청이 없습니다.
            </div>
          ) : (
            filtered.map((req) => {
              const open = openId === req.id;
              const busy = busyId === req.id;
              return (
                <div
                  key={req.id}
                  className="border-b border-gray-100 last:border-0"
                >
                  <button
                    onClick={() => setOpenId(open ? null : req.id)}
                    className="w-full px-4 sm:px-5 py-3.5 flex items-start gap-3 sm:gap-4 hover:bg-gray-50 transition text-left cursor-pointer"
                  >
                    <span
                      className={`mt-0.5 px-2 py-0.5 text-[11px] font-bold rounded border whitespace-nowrap ${STATUS_STYLE[req.status]}`}
                    >
                      {STATUS_LABEL[req.status]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {req.profiles?.full_name ?? "-"}
                        <span className="ml-1.5 font-normal text-gray-500">
                          {req.profiles?.position ?? ""}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-gray-600 truncate">
                        {req.purpose}
                      </p>
                      <p className="text-xs text-gray-400">
                        신청 {req.requested_at?.substring(0, 10)}
                        {req.transfer_date && ` · 이체 ${req.transfer_date}`}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">
                      {formatWon(req.amount)}
                    </span>
                  </button>

                  {open && (
                    <div className="px-4 sm:px-5 pb-4 pt-1 bg-gray-50/60 space-y-2.5">
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
                        value={req.requested_at
                          ?.replace("T", " ")
                          .substring(0, 16)}
                      />
                      {req.handler?.full_name && (
                        <DetailRow
                          label="처리자"
                          value={req.handler.full_name}
                        />
                      )}
                      {req.reject_reason && (
                        <DetailRow
                          label="반려사유"
                          value={req.reject_reason}
                          highlight
                        />
                      )}

                      {req.proof_url ? (
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
                      ) : (
                        <p className="text-xs text-gray-400">
                          첨부된 증빙자료가 없습니다.
                        </p>
                      )}

                      {req.status === "pending" && (
                        <div className="pt-3 mt-1 border-t border-gray-200 flex flex-col sm:flex-row sm:items-end gap-3">
                          <div className="w-full sm:w-44">
                            <label className="block text-xs font-bold text-gray-600 mb-1">
                              이체일자
                            </label>
                            <DateField
                              value={transferDates[req.id] ?? todayString()}
                              onChange={(v) =>
                                setTransferDates({
                                  ...transferDates,
                                  [req.id]: v,
                                })
                              }
                            />
                          </div>
                          <div className="flex gap-2 sm:ml-auto">
                            <button
                              onClick={() => setRejectTarget(req)}
                              disabled={busy}
                              className="px-4 py-2 text-sm font-bold text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-60 cursor-pointer"
                            >
                              반려
                            </button>
                            <button
                              onClick={() => setCompleteTarget(req)}
                              disabled={busy}
                              className="px-4 py-2 text-sm font-bold text-white bg-[#2151EC] rounded-lg hover:bg-[#1a43c9] disabled:opacity-60 cursor-pointer"
                            >
                              {busy ? "처리 중..." : "이체 완료"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 이체 완료 확인 */}
      <ConfirmModal
        isOpen={!!completeTarget}
        onClose={() => setCompleteTarget(null)}
        title="이체 완료로 처리할까요?"
        confirmText="완료 처리"
        busy={!!completeTarget && busyId === completeTarget.id}
        onConfirm={handleComplete}
      >
        {completeTarget && (
          <div className="space-y-2">
            <ConfirmRow
              label="사역자"
              value={completeTarget.profiles?.full_name ?? "-"}
            />
            <ConfirmRow
              label="금액"
              value={
                <b className="tabular-nums">
                  {formatWon(completeTarget.amount)}원
                </b>
              }
            />
            <ConfirmRow label="요청내역" value={completeTarget.purpose} />
            <ConfirmRow
              label="받을 계좌"
              value={joinAccountInfo(completeTarget) || "-"}
            />
            <ConfirmRow
              label="이체일자"
              value={transferDates[completeTarget.id] || todayString()}
            />
            <p className="pt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              은행에서 실제 이체를 마친 뒤 눌러주세요.
            </p>
          </div>
        )}
      </ConfirmModal>

      {/* 반려 */}
      <ConfirmModal
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="신청을 반려할까요?"
        confirmText="반려"
        danger
        busy={!!rejectTarget && busyId === rejectTarget.id}
        inputLabel="반려 사유"
        inputPlaceholder="예) 관광 목적 비용은 펀드 사용 대상이 아닙니다."
        multiline
        onConfirm={handleReject}
      >
        {rejectTarget && (
          <div className="space-y-2">
            <ConfirmRow
              label="사역자"
              value={rejectTarget.profiles?.full_name ?? "-"}
            />
            <ConfirmRow
              label="금액"
              value={
                <b className="tabular-nums">
                  {formatWon(rejectTarget.amount)}원
                </b>
              }
            />
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}

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
