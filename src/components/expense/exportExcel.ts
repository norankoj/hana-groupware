// src/components/expense/exportExcel.ts
// 청구 줄을 엑셀로 내려준다. 요청 리스트와 전체 내역이 같은 양식을 쓴다.
//
// 승인된 목록이 곧 은행에 이체할 목록이므로 계좌 칸을 앞쪽에 둔다.

import * as XLSX from "xlsx";
import {
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
