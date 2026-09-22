// src/components/expense/ExpenseDetailModal.tsx
// 결의서 상세 (신청자) — 담당자 상세 팝업과 같은 공용 상세 표 모양
"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { DetailRow, DetailTable } from "@/components/ui/DetailTable";
import { alertDanger, alertDangerText } from "@/components/ui/alert";
import ReceiptViewer, { collectReceipts } from "./ReceiptViewer";
import AdjustmentHistory from "./AdjustmentHistory";
import ReceiptThumbs from "./ReceiptThumbs";
import {
  STATUS_LABEL,
  STATUS_STYLE,
  accountText,
  btnStyles,
  formatWon,
  itemLabel,
  requestTotal,
  resolveAccount,
  type ExpenseRequest,
  type ExpenseRequestItem,
} from "./shared";

type Props = {
  request: ExpenseRequest | null;
  onClose: () => void;
  /** 대기중인 내 결의서를 취소할 수 있을 때만 넘긴다 */
  onCancel?: (req: ExpenseRequest) => void;
};

export default function ExpenseDetailModal({
  request,
  onClose,
  onCancel,
}: Props) {
  // 영수증 미리보기에서 지금 보고 있는 위치 (null이면 닫힘)
  const [viewAt, setViewAt] = useState<number | null>(null);

  if (!request) return null;

  const items = request.items ?? [];
  const total = requestTotal(items);
  const canCancel = !!onCancel && request.status === "pending";
  // 이 청구서의 영수증 전체 — 미리보기에서 옆으로 넘길 목록
  const allReceipts = collectReceipts(items);
  // 청구 한 건 = 줄 한 개가 보통이라 한 표에 모은다. 예전 묶음(여러 줄)은 줄마다 표를 나눈다
  const single = items.length === 1;

  const itemRows = (it: ExpenseRequestItem) => (
    <>
      <DetailRow label="품명">
        <span className="font-semibold">{it.item_name}</span>
      </DetailRow>
      {it.qty > 1 && (
        <DetailRow label="수량 · 단가">
          <span className="font-mono tabular-nums">
            {it.qty} × {formatWon(it.unit_price)}
          </span>
        </DetailRow>
      )}
      {!single && (
        <DetailRow label="금액">
          <b className="font-mono tabular-nums">{formatWon(it.amount)}원</b>
        </DetailRow>
      )}
      {it.purpose && (
        <DetailRow label="용도" top>
          <span className="whitespace-pre-wrap break-words">{it.purpose}</span>
        </DetailRow>
      )}
      <DetailRow label="받을 계좌">
        <span className="font-mono text-[13px]">
          {accountText(resolveAccount(it, request))}
        </span>
      </DetailRow>
      {it.budget_item && (
        <DetailRow label="비목">{itemLabel(it.budget_item)}</DetailRow>
      )}
      {(it.receipt_files ?? []).length > 0 && (
        <DetailRow label="영수증" top>
          <ReceiptThumbs
            itemId={it.id}
            files={it.receipt_files ?? []}
            onOpen={(i) =>
              setViewAt(
                Math.max(
                  allReceipts.findIndex(
                    (r) => r.itemId === it.id && r.index === i,
                  ),
                  0,
                ),
              )
            }
          />
        </DetailRow>
      )}
    </>
  );

  return (
    <Modal
      isOpen={!!request}
      onClose={onClose}
      title={request.title}
      className="sm:max-w-[680px]"
      footer={
        // 청구 취소(되돌릴 수 없음)는 옅은 빨강으로 왼쪽, 닫기는 오른쪽
        <div className="flex gap-2 w-full sm:justify-end">
          {canCancel && (
            <button
              onClick={() => onCancel!(request)}
              className={`${btnStyles.dangerSoft} sm:mr-auto`}
            >
              청구 취소
            </button>
          )}
          <button
            onClick={onClose}
            className={btnStyles.cancel}
          >
            닫기
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* 반려 — 무엇을 해야 하는지가 제일 중요해서 표 위에 따로 둔다 */}
        {request.status === "rejected" && request.reject_reason && (
          <div className={alertDanger}>
            <p className={`text-xs font-bold ${alertDangerText}`}>반려 사유</p>
            <p className={`mt-1 text-sm whitespace-pre-wrap ${alertDangerText}`}>
              {request.reject_reason}
            </p>
            <p className={`mt-2 pt-2 border-t border-danger/20 text-xs ${alertDangerText}`}>
              반려된 청구는 수정할 수 없어요. 목록에서 <b>다시 신청</b>을 누르면
              같은 내용이 채워지니, 필요한 부분만 고쳐서 올려주세요.
            </p>
          </div>
        )}

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
              {formatWon(total)}원
            </b>
            {!single && (
              <span className="ml-1.5 text-xs text-muted">{items.length}건</span>
            )}
          </DetailRow>
          <DetailRow label="청구일자">
            <span className="font-mono">{request.request_date}</span>
          </DetailRow>
          <DetailRow label="예산 연도">{request.fiscal_year}년</DetailRow>
          {request.paid_at && (
            <DetailRow label="이체일자">
              <span className="font-mono">{request.paid_at}</span>
            </DetailRow>
          )}
          {request.handler?.full_name && (
            <DetailRow label="처리자">{request.handler.full_name}</DetailRow>
          )}
          {single && itemRows(items[0])}
        </DetailTable>

        {!single &&
          items.map((it) => (
            <div key={it.id}>
              <p className="text-xs font-bold text-muted mb-1.5">
                {it.sort_order}. {it.item_name}
              </p>
              <DetailTable>{itemRows(it)}</DetailTable>
            </div>
          ))}

        {items.map((it) => (
          <AdjustmentHistory
            key={`adj-${it.id}`}
            item={it}
            paidAt={request.paid_at}
          />
        ))}
      </div>

      {viewAt !== null && allReceipts.length > 0 && (
        <ReceiptViewer
          receipts={allReceipts}
          startAt={viewAt}
          onClose={() => setViewAt(null)}
        />
      )}
    </Modal>
  );
}
