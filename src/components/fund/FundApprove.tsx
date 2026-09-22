// src/components/fund/FundApprove.tsx
// 펀드 신청 리스트 (담당자) — 지출결의서 요청 리스트와 같은 모양:
// 상태 칩(건수) · 검색 · 기간 → 표 → 줄을 누르면 상세 팝업에서 이체 완료 / 반려
"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import { Paperclip, Search, X } from "lucide-react";
import Modal from "@/components/Modal";
import { DetailRow, DetailTable } from "@/components/ui/DetailTable";
import { center, empty, num, sub, table, td, th, thead, trHover } from "@/components/ui/table";
import ConfirmModal, { ConfirmRow } from "./ConfirmModal";
import { DateField } from "./FundFields";
import FundProofList from "./FundProofList";
import {
  STATUS_LABEL,
  STATUS_STYLE,
  btnStyles,
  formatWon,
  inputClass,
  joinAccountInfo,
  todayString,
  type FundRequest,
  type FundStatus,
} from "./shared";

type Props = {
  requests: FundRequest[];
  onRefresh: () => void;
};

type Filter = FundStatus | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "처리대기" },
  { key: "completed", label: "이체완료" },
  { key: "rejected", label: "반려" },
  { key: "cancelled", label: "취소" },
  { key: "all", label: "전체" },
];

/** 증빙 개수 — 예전 한 개짜리(proof_url)도 센다 */
const proofCount = (r: FundRequest) =>
  (r.proof_files?.length ?? 0) || (r.proof_url ? 1 : 0);

/** 기간 검색 기준일 — 이체완료는 이체일, 나머지는 신청일 */
const dayOf = (r: FundRequest) =>
  (r.status === "completed" ? r.transfer_date : null) ??
  r.requested_at?.substring(0, 10) ??
  "";

export default function FundApprove({ requests, onRefresh }: Props) {
  const supabase = createClient();
  const [filter, setFilter] = useState<Filter>("pending");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [transferDate, setTransferDate] = useState(todayString());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [completeTarget, setCompleteTarget] = useState<FundRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<FundRequest | null>(null);

  // 새로 불러온 목록에서 찾아야 처리 뒤에도 최신 상태가 보인다
  const detail = detailId ? requests.find((r) => r.id === detailId) ?? null : null;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return requests
      .filter((r) => {
        if (filter !== "all" && r.status !== filter) return false;
        const day = dayOf(r);
        if (from && (!day || day < from)) return false;
        if (to && (!day || day > to)) return false;
        if (!q) return true;
        const hay = [
          r.profiles?.full_name ?? "",
          r.purpose,
          r.account_holder ?? "",
          r.account_no ?? "",
        ]
          .join(" ")
          .toLowerCase();
        // 계좌번호는 하이픈을 넣든 빼든 찾히게 숫자만으로도 비교한다
        return (
          hay.includes(q) ||
          (qDigits.length >= 4 &&
            (r.account_no ?? "").replace(/\D/g, "").includes(qDigits))
        );
      })
      .sort((a, b) => {
        // 처리대기는 오래된 것부터(먼저 온 것부터 처리), 나머지는 최근 것부터
        if (filter === "pending")
          return (a.requested_at ?? "").localeCompare(b.requested_at ?? "");
        return dayOf(b).localeCompare(dayOf(a));
      });
  }, [requests, filter, query, from, to]);

  const countOf = (k: Filter) =>
    k === "all" ? requests.length : requests.filter((r) => r.status === k).length;
  const shownTotal = shown.reduce((sum, r) => sum + r.amount, 0);

  const openDetail = (r: FundRequest) => {
    setTransferDate(todayString());
    setDetailId(r.id);
  };

  const handleComplete = async () => {
    const req = completeTarget;
    if (!req) return;

    setBusyId(req.id);
    const { error } = await supabase.rpc("fund_complete_request", {
      p_request_id: req.id,
      p_transfer_date: transferDate,
    });
    setBusyId(null);
    setCompleteTarget(null);

    if (error) return toast.error("처리 실패: " + error.message);
    toast.success("이체 완료로 처리했습니다.");
    setDetailId(null);
    onRefresh();
  };

  const handleReject = async (reason: string) => {
    const req = rejectTarget;
    if (!req) return;

    setBusyId(req.id);
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("fund_requests")
      .update({
        status: "rejected",
        reject_reason: reason,
        handler_id: authUser?.id ?? null,
        completed_at: new Date().toISOString(),
        result_seen: false,
      })
      .eq("id", req.id)
      .eq("status", "pending")
      .select("id");
    setBusyId(null);
    setRejectTarget(null);

    if (error) return toast.error("반려 실패: " + error.message);
    // 0건이면 그 사이 다른 담당자가 이미 처리했다는 뜻
    if (!data || data.length === 0) {
      toast.error("이미 처리된 신청입니다. 목록을 새로 불러옵니다.");
      return onRefresh();
    }
    toast.success("반려 처리했습니다. 금액은 잔액으로 돌아갔습니다.");
    setDetailId(null);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* 상태 · 합계 · 검색 · 기간 — 한 툴바 (지출결의서 요청 리스트와 같은 구조) */}
      <div className="border border-line bg-white rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          {FILTERS.map((f) => {
            const n = countOf(f.key);
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3.5 py-1.5 text-sm rounded-lg border transition cursor-pointer ${
                  on
                    ? "border-primary bg-primary-wash text-primary font-bold"
                    : "border-line-strong bg-white text-dark hover:bg-secondary-soft"
                }`}
              >
                {f.label}
                {f.key === "pending" && n > 0 ? (
                  <span className="ml-1.5 bg-danger-soft text-danger-active px-1.5 rounded-full text-xs font-bold">
                    {n}
                  </span>
                ) : (
                  <span className="ml-1 tabular-nums opacity-60">{n}</span>
                )}
              </button>
            );
          })}
          {shown.length > 0 && (
            <span className="ml-auto text-sm text-muted">
              {shown.length}건{" "}
              <b className="font-mono tabular-nums text-heading">
                {formatWon(shownTotal)}
              </b>
              원
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5 border-t border-line bg-table-header/60">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="사역자 · 요청내역 · 예금주 · 계좌번호로 검색"
              className={`${inputClass} py-2 pl-9 pr-9`}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="검색 지우기"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-heading cursor-pointer"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-bold text-muted">
              {filter === "completed" ? "이체일" : "신청일"}
            </span>
            <div className="w-[140px]">
              <DateField value={from} onChange={setFrom} />
            </div>
            <span className="text-muted">~</span>
            <div className="w-[140px]">
              <DateField value={to} onChange={setTo} />
            </div>
            {(from || to) && (
              <button
                type="button"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
                className="px-2 py-1.5 text-xs font-medium text-muted hover:text-heading cursor-pointer whitespace-nowrap"
              >
                기간 해제
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 표 — 줄을 누르면 상세 팝업에서 처리한다 */}
      <div className="border border-table-line bg-white rounded-xl overflow-hidden">
        {/* 높이 고정 — 상태를 바꿔도 화면이 출렁이지 않게. 화면 높이에서 위쪽을 뺀 만큼이라 바깥 스크롤이 안 생긴다 */}
        <div className="overflow-auto h-[clamp(240px,calc(100dvh-380px),560px)]">
            <table className={`${table} min-w-[820px]`}>
              <thead className={thead}>
                <tr>
                  <th scope="col" className={`${th} ${center}`}>상태</th>
                  <th scope="col" className={`${th} ${center}`}>
                    {filter === "completed" ? "이체일" : "신청일"}
                  </th>
                  <th scope="col" className={th}>사역자</th>
                  <th scope="col" className={th}>요청내역</th>
                  <th scope="col" className={th}>받을 계좌</th>
                  <th scope="col" className={`${th} ${center}`}>증빙</th>
                  <th scope="col" className={`${th} text-right`}>금액</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={7} className={`${empty} py-28`}>
                      {filter === "pending" ? "처리할 신청이 없습니다." : "해당하는 신청이 없습니다."}
                    </td>
                  </tr>
                )}
                {shown.map((r) => {
                  const proofs = proofCount(r);
                  return (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      onClick={() => openDetail(r)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") openDetail(r);
                      }}
                      className={`${trHover} group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary`}
                    >
                      <td className={`${td} ${center} py-3.5`}>
                        <span
                          className={`inline-block px-1.5 py-0.5 text-[11px] font-bold rounded border whitespace-nowrap ${STATUS_STYLE[r.status]}`}
                        >
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td className={`${td} ${center} py-3.5 font-mono text-[13px] tabular-nums text-muted whitespace-nowrap`}>
                        {dayOf(r)}
                      </td>
                      <td className={`${td} py-3.5 whitespace-nowrap`}>
                        <span className="font-medium">{r.profiles?.full_name ?? "-"}</span>
                        {r.profiles?.position && (
                          <span className={`${sub} ml-1.5`}>{r.profiles.position}</span>
                        )}
                      </td>
                      <td className={`${td} py-3.5 max-w-[260px]`}>
                        <span className="block truncate font-medium group-hover:text-primary" title={r.purpose}>
                          {r.purpose}
                        </span>
                      </td>
                      <td className={`${td} py-3.5 max-w-[220px]`}>
                        <span className="block truncate font-mono text-[13px] text-muted">
                          {joinAccountInfo(r) || "-"}
                        </span>
                      </td>
                      <td className={`${td} ${center} py-3.5`}>
                        {proofs > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-xs text-dark">
                            <Paperclip size={12} />
                            <span className="tabular-nums">{proofs}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-disabled-text">-</span>
                        )}
                      </td>
                      <td className={`${td} ${num} py-3.5 font-bold whitespace-nowrap`}>
                        {formatWon(r.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      </div>

      {/* 상세 — 여기서 이체 완료 / 반려 */}
      {detail && (
        <Modal
          isOpen
          onClose={() => setDetailId(null)}
          title="펀드 사용 신청"
          className="sm:max-w-[640px]"
          footer={
            // 반려(되돌리기 어려움)는 옅은 빨강으로 왼쪽, 닫기 · 주 동작은 오른쪽
            <div className="flex gap-2 w-full">
              {detail.status === "pending" && (
                <button
                  onClick={() => setRejectTarget(detail)}
                  disabled={busyId === detail.id}
                  className={`${btnStyles.dangerSoft} sm:mr-auto`}
                >
                  반려
                </button>
              )}
              <button
                onClick={() => setDetailId(null)}
                className={`${btnStyles.cancel} ${detail.status === "pending" ? "" : "sm:ml-auto"}`}
              >
                닫기
              </button>
              {detail.status === "pending" && (
                <button
                  onClick={() => setCompleteTarget(detail)}
                  disabled={busyId === detail.id}
                  className={btnStyles.save}
                >
                  이체 완료
                </button>
              )}
            </div>
          }
        >
          <div className="space-y-4">
            <DetailTable>
              <DetailRow label="상태">
                <span
                  className={`px-2 py-0.5 text-xs font-bold rounded border ${STATUS_STYLE[detail.status]}`}
                >
                  {STATUS_LABEL[detail.status]}
                </span>
              </DetailRow>
              <DetailRow label="금액">
                <b className="font-mono text-base tabular-nums">
                  {formatWon(detail.amount)}원
                </b>
              </DetailRow>
              <DetailRow label="사역자">
                {detail.profiles?.full_name ?? "-"}
                {detail.profiles?.position && (
                  <span className={`${sub} ml-1.5`}>{detail.profiles.position}</span>
                )}
              </DetailRow>
              <DetailRow label="요청내역" top>
                <span className="whitespace-pre-wrap">{detail.purpose}</span>
              </DetailRow>
              <DetailRow label="요청일시">
                <span className="font-mono">
                  {detail.requested_at?.replace("T", " ").substring(0, 16)}
                </span>
              </DetailRow>
              <DetailRow label="받을 계좌">
                <span className="font-mono text-[13px]">
                  {joinAccountInfo(detail) || "-"}
                </span>
              </DetailRow>
              {detail.transfer_date && (
                <DetailRow label="이체일자">
                  <span className="font-mono">{detail.transfer_date}</span>
                </DetailRow>
              )}
              {detail.handler?.full_name && (
                <DetailRow label="처리자">{detail.handler.full_name}</DetailRow>
              )}
              {detail.reject_reason && (
                <DetailRow label={<span className="text-danger-active">반려 사유</span>} top>
                  <span className="text-danger-active whitespace-pre-wrap">
                    {detail.reject_reason}
                  </span>
                </DetailRow>
              )}
              {/* 처리대기 — 이체일자를 여기서 정하고 '이체 완료'를 누른다 */}
              {detail.status === "pending" && (
                <DetailRow label="이체일자">
                  <div className="w-[160px]">
                    <DateField value={transferDate} onChange={setTransferDate} />
                  </div>
                </DetailRow>
              )}
            </DetailTable>

            <div>
              <p className="text-sm font-bold text-heading mb-2">증빙자료</p>
              <FundProofList request={detail} empty="첨부한 자료가 없습니다." />
            </div>
          </div>
        </Modal>
      )}

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
            <ConfirmRow label="이체일자" value={transferDate} />
            <p className="pt-2 text-xs text-warning-active bg-warning-soft border border-warning/30 rounded px-3 py-2">
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
