// src/components/expense/ExpenseDetailModal.tsx
// 결의서 상세 — 줄별 금액·계좌·영수증과 처리 결과
"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
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

  return (
    <Modal
      isOpen={!!request}
      onClose={onClose}
      title={request.title}
      className="sm:max-w-[760px]"
      footer={
        <div className="flex gap-2 w-full sm:w-auto sm:justify-end">
          {canCancel && (
            <button
              onClick={() => onCancel!(request)}
              className={btnStyles.delete}
            >
              청구 취소
            </button>
          )}
          <button onClick={onClose} className={btnStyles.cancel}>
            닫기
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* 상태 · 합계 */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <span
            className={`px-2.5 py-1 text-xs font-bold rounded border ${STATUS_STYLE[request.status]}`}
          >
            {STATUS_LABEL[request.status]}
          </span>
          <span className="text-sm text-gray-600">
            합계{" "}
            <b className="text-lg text-gray-900 tabular-nums">
              {formatWon(total)}
            </b>
            원 · {items.length}건
          </span>
        </div>

        {request.status === "rejected" && request.reject_reason && (
          <div className="border-l-4 border-red-400 bg-red-50 rounded-r-lg px-4 py-3">
            <p className="text-xs font-bold text-red-700">반려 사유</p>
            <p className="mt-1 text-sm text-red-900 whitespace-pre-wrap">
              {request.reject_reason}
            </p>
            <p className="mt-2 pt-2 border-t border-red-200 text-xs text-red-700">
              반려된 청구는 고칠 수 없어요. 사유를 확인해 내용을 바로잡은 뒤{" "}
              <b>경비지급 요청</b>에서 처음부터 다시 신청해주세요.
            </p>
          </div>
        )}

        {/* 기본 정보 */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
          <Row label="청구일자" value={request.request_date} />
          <Row label="예산 연도" value={`${request.fiscal_year}년`} />
          {request.paid_at && <Row label="이체일자" value={request.paid_at} />}
          {request.handler?.full_name && (
            <Row label="처리" value={request.handler.full_name} />
          )}
        </dl>

        {/* 청구 줄 */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-sm font-bold text-gray-700">
            청구 내역
          </div>
          <ul className="divide-y divide-gray-100">
            {items.map((it) => {
              const acc = resolveAccount(it, request);
              const receipts = it.receipt_files ?? [];
              return (
                <li key={it.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        <span className="mr-2 text-xs text-gray-400 tabular-nums">
                          {it.sort_order}
                        </span>
                        {it.item_name}
                      </p>
                      {/* 수량·계좌·용도는 누르는 것이 아니므로 칩이 아니라 글로 적는다 */}
                      <p className="mt-0.5 text-xs text-gray-500">
                        {it.qty > 1 && (
                          <span className="tabular-nums">
                            {it.qty} × {formatWon(it.unit_price)}
                            <span className="mx-1.5 text-gray-300">·</span>
                          </span>
                        )}
                        <span className="text-gray-600">{accountText(acc)}</span>
                      </p>
                      {/* 용도는 길게 적는 칸이라 따로 둔다 */}
                      {it.purpose && (
                        <p className="mt-1.5 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap break-words">
                          <span className="mr-1.5 align-[1px] text-[11px] font-bold text-gray-400">
                            용도
                          </span>
                          {it.purpose}
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">
                      {formatWon(it.amount)}
                    </span>
                  </div>

                  {/* 칩은 누를 수 있는 영수증과, 담당자가 배정한 비목에만 쓴다 */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    {it.budget_item && (
                      <span className="px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-[#2151EC] font-medium">
                        {itemLabel(it.budget_item)}
                      </span>
                    )}

                    <ReceiptThumbs
                      itemId={it.id}
                      files={receipts}
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
                  </div>
                  <AdjustmentHistory item={it} paidAt={request.paid_at} />
                </li>
              );
            })}
          </ul>
        </div>
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

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex gap-3">
    <dt className="w-20 shrink-0 text-xs font-bold text-gray-500 pt-0.5">
      {label}
    </dt>
    <dd className="flex-1 text-sm text-gray-800 break-words">{value}</dd>
  </div>
);
