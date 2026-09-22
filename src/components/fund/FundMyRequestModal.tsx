// src/components/fund/FundMyRequestModal.tsx
// 내 펀드 — 사용내역 한 건의 상세 팝업 (공용 상세 표 모양 — 처리대기·완료·반려 모두 같다)
"use client";

import Modal from "@/components/Modal";
import { DetailRow, DetailTable } from "@/components/ui/DetailTable";
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
  const canCancel = request?.status === "pending";

  return (
    <Modal
      isOpen={!!request}
      onClose={onClose}
      title="펀드 사용 내역"
      footer={
        // 신청 취소(되돌릴 수 없음)는 옅은 빨강으로 왼쪽, 닫기는 오른쪽
        <div className="flex gap-2 w-full">
          {canCancel && request && (
            <button
              onClick={() => onCancel(request)}
              className={`${btnStyles.dangerSoft} sm:mr-auto`}
            >
              신청 취소
            </button>
          )}
          <button
            onClick={onClose}
            className={`${btnStyles.cancel} ${canCancel ? "" : "sm:ml-auto"}`}
          >
            닫기
          </button>
        </div>
      }
    >
      {request && (
        <div className="space-y-4">
          <DetailTable>
            <DetailRow label="상태">
              <span
                className={`px-2 py-0.5 text-xs font-bold rounded border ${STATUS_STYLE[request.status]}`}
              >
                {STATUS_LABEL[request.status]}
              </span>
            </DetailRow>
            <DetailRow label="금액">
              <b className="font-mono text-base tabular-nums">
                {formatWon(request.amount)}원
              </b>
            </DetailRow>
            <DetailRow label="요청내역" top>
              <span className="whitespace-pre-wrap">{request.purpose}</span>
            </DetailRow>
            <DetailRow label="요청일시">
              <span className="font-mono">
                {request.requested_at?.replace("T", " ").substring(0, 16)}
              </span>
            </DetailRow>
            <DetailRow label="받을 계좌">
              {joinAccountInfo(request) || "-"}
            </DetailRow>
            {request.transfer_date && (
              <DetailRow label="이체일자">
                <span className="font-mono">{request.transfer_date}</span>
              </DetailRow>
            )}
            {request.handler?.full_name && (
              <DetailRow label="처리자">{request.handler.full_name}</DetailRow>
            )}
            {request.reject_reason && (
              <DetailRow
                label={<span className="text-danger-active">반려 사유</span>}
                top
              >
                <span className="text-danger-active whitespace-pre-wrap">
                  {request.reject_reason}
                </span>
              </DetailRow>
            )}
          </DetailTable>

          <div>
            <p className="text-sm font-bold text-heading mb-2">증빙자료</p>
            <FundProofList request={request} empty="첨부한 자료가 없습니다." />
          </div>
        </div>
      )}
    </Modal>
  );
}
