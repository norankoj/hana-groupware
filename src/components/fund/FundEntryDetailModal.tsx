// src/components/fund/FundEntryDetailModal.tsx
// 원장 한 줄의 상세 — 사용이면 신청 당시 정보까지 함께 보여준다
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import Modal from "@/components/Modal";
import { ConfirmRow } from "./ConfirmModal";
import FundProofList from "./FundProofList";
import {
  ENTRY_TYPE_LABEL,
  STATUS_LABEL,
  btnStyles,
  formatWon,
  joinAccountInfo,
  type FundLedger,
  type FundRequest,
} from "./shared";

export default function FundEntryDetailModal({
  entry,
  onClose,
}: {
  entry: FundLedger | null;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [request, setRequest] = useState<FundRequest | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setRequest(null);
    if (!entry?.request_id) return;

    setLoading(true);
    supabase
      .from("fund_requests")
      .select("*, handler:handler_id(full_name)")
      .eq("id", entry.request_id)
      .maybeSingle()
      .then(({ data }) => {
        setRequest((data as FundRequest) ?? null);
        setLoading(false);
      });
  }, [entry, supabase]);


  return (
    <Modal
      isOpen={!!entry}
      onClose={onClose}
      title="내역 상세"
      footer={
        <button onClick={onClose} className={btnStyles.cancel}>
          닫기
        </button>
      }
    >
      {entry && (
        <div className="space-y-5">
          <div className="border border-gray-200 rounded-lg p-4 space-y-2 bg-gray-50/60">
            <ConfirmRow label="대상자" value={entry.payee?.name ?? "-"} />
            <ConfirmRow
              label="구분"
              value={ENTRY_TYPE_LABEL[entry.entry_type]}
            />
            <ConfirmRow
              label="금액"
              value={
                <b className="tabular-nums">{formatWon(entry.amount)}원</b>
              }
            />
            <ConfirmRow label="적요" value={entry.note || "-"} />
            <ConfirmRow label="내용" value={entry.description || "-"} />
            <ConfirmRow
              label={entry.entry_type === "withdraw" ? "이체일자" : "입금일자"}
              value={entry.entry_date}
            />
          </div>

          {entry.entry_type === "withdraw" && (
            <div>
              <p className="text-base font-bold text-gray-800 mb-2.5">신청 정보</p>

              {loading ? (
                <p className="text-sm text-gray-400">불러오는 중...</p>
              ) : request ? (
                <div className="space-y-2">
                  <ConfirmRow
                    label="상태"
                    value={STATUS_LABEL[request.status]}
                  />
                  <ConfirmRow label="요청내역" value={request.purpose} />
                  <ConfirmRow
                    label="요청일시"
                    value={request.requested_at
                      ?.replace("T", " ")
                      .substring(0, 16)}
                  />
                  <ConfirmRow
                    label="받을 계좌"
                    value={joinAccountInfo(request) || "-"}
                  />
                  {request.handler?.full_name && (
                    <ConfirmRow
                      label="처리자"
                      value={request.handler.full_name}
                    />
                  )}
                  {request.reject_reason && (
                    <ConfirmRow
                      label="반려사유"
                      value={request.reject_reason}
                    />
                  )}

                  <div className="pt-2">
                    <FundProofList request={request} />
                  </div>
                </div>
              ) : (
                /* 신청서를 거치지 않고 담당자가 직접 넣은 사용 내역 */
                <div className="space-y-2">
                  <ConfirmRow
                    label="요청일자"
                    value={entry.request_date || "-"}
                  />
                  <ConfirmRow
                    label="받을 계좌"
                    value={entry.account_info || "-"}
                  />
                  <p className="pt-1 text-sm text-gray-500">
                    담당자가 직접 등록한 내역이라 신청서가 없습니다.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
