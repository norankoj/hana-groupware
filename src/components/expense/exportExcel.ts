// src/components/expense/exportExcel.ts
// 청구 줄을 엑셀로 내려준다. 요청 리스트와 전체 내역이 같은 양식을 쓴다.
//
// 승인된 목록이 곧 은행에 이체할 목록이므로 계좌 칸을 앞쪽에 둔다.

import * as XLSX from "xlsx";
import {
  BANK_INFO,
  STATUS_LABEL,
  resolveAccount,
  type ExpenseRequest,
  type ExpenseRequestItem,
} from "./shared";

export const UNASSIGNED = "(비목 미배정)";

/** 내보낼 한 줄 */
export type ExportLine = {
  item: ExpenseRequestItem;
  request: ExpenseRequest;
  /** 비목이 속한 대항목 — 배정 전이면 UNASSIGNED */
  major: string;
};

const HEAD = [
  "청구일자",
  "신청자",
  "은행",
  "계좌번호",
  "예금주",
  "금액",
  "품명/지출대상",
  "수량",
  "단가",
  "용도/비고",
  "대항목",
  "비목코드",
  "비목",
  "상태",
  "이체일자",
];

// 위 열 순서에 맞춘 너비
const WIDTHS = [11, 9, 10, 18, 9, 12, 18, 6, 11, 22, 16, 9, 22, 9, 11];

export function exportExpenseLines(lines: ExportLine[], fileName: string) {
  const body = lines.map(({ item, request, major }) => {
    const acc = resolveAccount(item, request);
    return [
      request.request_date,
      request.requester?.full_name ?? "",
      acc.bank_name ?? "",
      acc.account_no ?? "",
      acc.account_holder ?? "",
      item.amount,
      item.item_name,
      item.qty,
      item.unit_price,
      item.purpose ?? "",
      major === UNASSIGNED ? "" : major,
      item.budget_item?.code ?? "",
      item.budget_item?.name ?? "",
      STATUS_LABEL[request.status],
      request.paid_at ?? "",
    ];
  });

  const total = lines.reduce((sum, l) => sum + l.item.amount, 0);

  const ws = XLSX.utils.aoa_to_sheet([
    HEAD,
    ...body,
    [],
    // 금액이 여섯 번째 열이므로 합계도 그 자리에 맞춘다
    ["", "", "", "", "합계", total],
  ]);
  ws["!cols"] = WIDTHS.map((wch) => ({ wch }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "지출결의내역");
  XLSX.writeFile(wb, fileName);
}

/** 결의서 목록을 줄 단위로 펴서 내보낼 모양으로 만든다 */
export const toExportLines = (
  requests: ExpenseRequest[],
  majorOf: Map<string, string>,
): ExportLine[] =>
  requests.flatMap((request) =>
    (request.items ?? []).map((item) => ({
      item,
      request,
      major: item.budget_item_id
        ? (majorOf.get(item.budget_item_id) ?? UNASSIGNED)
        : UNASSIGNED,
    })),
  );

/* ── 이체 목록 — 은행에 넘기던 기존 양식 ──────────────────────────────── */

/** yyyy-MM-dd → 20260913 (기존 양식은 하이픈 없는 숫자) */
const compact = (d: string | null | undefined) =>
  (d ?? "").replace(/-/g, "");

/** 계좌번호는 숫자만 남긴다 — 은행 일괄이체 양식이 하이픈을 받지 않는다 */
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

const PAYOUT_HEAD = [
  "순번",
  "처리예정일자",
  "예산코드",
  "출금계좌",
  "신청자",
  "청구일자",
  "예금주",
  "은행",
  "은행코드",
  "계좌번호",
  "금액",
  "받는통장표시",
  "내통장표시",
  "품명/지출대상",
  "용도/비고",
];

const PAYOUT_WIDTHS = [5, 13, 9, 9, 9, 11, 20, 10, 8, 18, 11, 12, 14, 18, 30];

/**
 * 은행에 들고 갈 이체 목록.
 *
 * 기존에 쓰던 양식을 그대로 맞춘다 — 맨 위에 처리요청일자, 그 아래 표.
 * '내통장표시'는 통장 적요에 찍히는 글자라서 품명을 그대로 쓴다
 * (그래서 품명을 7자 이내로 받는다).
 */
export function exportPayoutList(
  lines: ExportLine[],
  payoutDate: string,
  fileName: string,
) {
  const body = lines.map(({ item, request }, i) => {
    const acc = resolveAccount(item, request);
    const bank = BANK_INFO[acc.bank_name ?? ""];
    return [
      i + 1,
      compact(payoutDate),
      item.budget_item?.code ?? "",
      item.withdraw_code ?? "",
      request.requester?.full_name ?? "",
      compact(request.request_date),
      acc.account_holder ?? "",
      bank?.short ?? acc.bank_name ?? "",
      bank?.code ?? "",
      digits(acc.account_no),
      item.amount,
      "", // 받는통장표시 — 기존 양식에서도 비워 보냈다
      item.item_name,
      item.item_name,
      item.purpose ?? "",
    ];
  });

  const total = lines.reduce((sum, l) => sum + l.item.amount, 0);

  const ws = XLSX.utils.aoa_to_sheet([
    ["처리요청일자", compact(payoutDate)],
    PAYOUT_HEAD,
    ...body,
    [],
    // 금액이 열한 번째 열이므로 합계도 그 자리에 맞춘다
    ["", "", "", "", "", "", "", "", "", "합계", total],
  ]);
  ws["!cols"] = PAYOUT_WIDTHS.map((wch) => ({ wch }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "이체목록");
  XLSX.writeFile(wb, fileName);
}
