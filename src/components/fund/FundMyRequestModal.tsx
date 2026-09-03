// src/components/fund/FundMyRequestModal.tsx
// 내 펀드 — 사용내역 한 건의 상세 팝업
"use client";

import Modal from "@/components/Modal";
import { ConfirmRow } from "./ConfirmModal";
import FundProofList from "./FundProofList";
import {
  STATUS_LABEL,
  STATUS_STYLE,
  btnStyles,
  formatWon,
  joinAccountInfo,
  type FundRequest,
} from "./shared";

export default function FundMyRequestModal({
  request,
  onClose,
  onCancel,
}: {
  request: FundRequest | null;
  onClose: () => void;
  onCancel: (req: FundRequest) => void;
}) {

  return (
    <Modal
      isOpen={!!request}
      onClose={onClose}
      title="펀드 사용 내역"
      footer={
        <>
          <button onClick={onClose} className={btnStyles.cancel}>
            닫기
          </button>
          {request?.status === "pending" && (
            <button
              onClick={() => onCancel(request)}
              className={btnStyles.delete}
            >
              신청 취소
            </button>
          )}
        </>
      }
    >
      {request && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span
              className={`px-2.5 py-1 text-xs font-bold rounded border ${STATUS_STYLE[request.status]}`}
            >
              {STATUS_LABEL[request.status]}
            </span>
            <span className="text-2xl font-bold text-gray-900 tabular-nums">
              {formatWon(request.amount)}
              <span className="ml-1 text-base font-semibold text-gray-400">
                원
              </span>
            </span>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 space-y-2 bg-gray-50/60">
            <ConfirmRow label="요청내역" value={request.purpose} />
            <ConfirmRow
              label="요청일시"
              value={request.requested_at?.replace("T", " ").substring(0, 16)}
            />
            <ConfirmRow
              label="받을 계좌"
              value={joinAccountInfo(request) || "-"}
            />
            {request.transfer_date && (
              <ConfirmRow label="이체일자" value={request.transfer_date} />
            )}
            {request.handler?.full_name && (
              <ConfirmRow label="처리자" value={request.handler.full_name} />
            )}
          </div>

          {request.reject_reason && (
            <div className="border-l-4 border-red-400 bg-red-50 rounded-r-lg px-4 py-3">
              <p className="text-sm font-bold text-red-700 mb-1">반려 사유</p>
              <p className="text-sm leading-relaxed text-red-900">
                {request.reject_reason}
              </p>
            </div>
          )}

          <div>
            <p className="text-base font-bold text-gray-800 mb-2.5">증빙자료</p>
            <FundProofList request={request} empty="첨부한 자료가 없습니다." />
          </div>
        </div>
      )}
    </Modal>
  );
}
