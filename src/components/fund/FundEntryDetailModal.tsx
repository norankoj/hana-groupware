// src/components/fund/FundEntryDetailModal.tsx
// 원장 한 줄의 상세 — 사용이면 신청 당시 정보까지 함께 보여준다
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import Modal from "@/components/Modal";
import { DetailRow, DetailTable } from "@/components/ui/DetailTable";
import FundProofList from "./FundProofList";
import {
  ENTRY_TYPE_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
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
          {/* 원장 한 줄 — 공용 상세 표 (운행·휴가 상세와 같은 모양) */}
          <DetailTable>
            <DetailRow label="대상자">
              {entry.payee?.name ?? entry.payee_name ?? "-"}
            </DetailRow>
            <DetailRow label="구분">
              {ENTRY_TYPE_LABEL[entry.entry_type]}
            </DetailRow>
            <DetailRow label="금액">
              <b className="font-mono tabular-nums">
                {formatWon(entry.amount)}원
              </b>
            </DetailRow>
            <DetailRow label="적요">{entry.note || "-"}</DetailRow>
            <DetailRow label="내용" top>
              <span className="whitespace-pre-wrap">
                {entry.description || "-"}
              </span>
            </DetailRow>
            <DetailRow
              label={entry.entry_type === "withdraw" ? "이체일자" : "입금일자"}
            >
              <span className="font-mono">{entry.entry_date}</span>
            </DetailRow>
          </DetailTable>

          {entry.entry_type === "withdraw" && (
            <div>
              <p className="text-sm font-bold text-heading mb-2">신청 정보</p>

              {loading ? (
                <p className="text-sm text-muted">불러오는 중...</p>
              ) : request ? (
                <div className="space-y-3">
                  <DetailTable>
                    <DetailRow label="상태">
                      <span
                        className={`px-2 py-0.5 text-xs font-bold rounded border ${STATUS_STYLE[request.status]}`}
                      >
                        {STATUS_LABEL[request.status]}
                      </span>
                    </DetailRow>
                    <DetailRow label="요청내역" top>
                      <span className="whitespace-pre-wrap">
                        {request.purpose}
                      </span>
                    </DetailRow>
                    <DetailRow label="요청일시">
                      <span className="font-mono">
                        {request.requested_at
                          ?.replace("T", " ")
                          .substring(0, 16)}
                      </span>
                    </DetailRow>
                    <DetailRow label="받을 계좌">
                      {joinAccountInfo(request) || "-"}
                    </DetailRow>
                    {request.handler?.full_name && (
                      <DetailRow label="처리자">
                        {request.handler.full_name}
                      </DetailRow>
                    )}
                    {request.reject_reason && (
                      <DetailRow
                        label={
                          <span className="text-danger-active">반려사유</span>
                        }
                        top
                      >
                        <span className="text-danger-active whitespace-pre-wrap">
                          {request.reject_reason}
                        </span>
                      </DetailRow>
                    )}
                  </DetailTable>
                  <FundProofList request={request} />
                </div>
              ) : (
                /* 신청서를 거치지 않고 담당자가 직접 넣은 사용 내역 */
                <div className="space-y-2">
                  <DetailTable>
                    <DetailRow label="요청일자">
                      <span className="font-mono">
                        {entry.request_date || "-"}
                      </span>
                    </DetailRow>
                    <DetailRow label="받을 계좌">
                      {entry.account_info || "-"}
                    </DetailRow>
                  </DetailTable>
                  <p className="text-xs text-muted">
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
