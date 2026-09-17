// src/components/expense/exportExcel.ts
// 청구 줄을 엑셀로 내려준다. 요청 리스트와 전체 내역이 같은 양식을 쓴다.
//
// 셀 색·테두리는 xlsx(SheetJS 무료판)로 쓸 수 없어 스타일 쓰기를 더한
// 포크인 xlsx-js-style 을 쓴다. API는 같다.

import * as XLSX from "xlsx-js-style";
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

/* ── 스타일 ─────────────────────────────────────────────────────────────
   기존 이체 양식의 색을 눈으로 맞췄다.
   진한 남색 = 머리글·순번, 연두 = 손으로 채우던 칸, 회색 = 코드 칸 */

const COLOR = {
  dark: "1F2A3C",
  green: "E2EFDA",
  gray: "BFBFBF",
  line: "A6A6A6",
  white: "FFFFFF",
};

const FONT = { name: "맑은 고딕", sz: 10 };

const thin = { style: "thin", color: { rgb: COLOR.line } };
const BORDER = { top: thin, bottom: thin, left: thin, right: thin };

type Align = "left" | "center" | "right";

const cellStyle = (opts: {
  fill?: string;
  bold?: boolean;
  color?: string;
  align?: Align;
}) => ({
  font: { ...FONT, bold: !!opts.bold, color: { rgb: opts.color ?? "000000" } },
  alignment: { horizontal: opts.align ?? "center", vertical: "center" },
  border: BORDER,
  ...(opts.fill
    ? { fill: { patternType: "solid", fgColor: { rgb: opts.fill } } }
    : {}),
});

const HEAD_STYLE = cellStyle({ fill: COLOR.dark, bold: true, color: COLOR.white });

/** 시트의 한 칸에 스타일을 붙인다 (값이 없는 칸도 테두리를 그리려고 만든다) */
const paint = (ws: XLSX.WorkSheet, r: number, c: number, style: object) => {
  const ref = XLSX.utils.encode_cell({ r, c });
  if (!ws[ref]) ws[ref] = { t: "s", v: "" };
  ws[ref].s = style;
};

/* ── 일반 내보내기 (요청 리스트 · 전체 내역) ────────────────────────── */

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

  HEAD.forEach((_, c) => paint(ws, 0, c, HEAD_STYLE));
  body.forEach((_, i) =>
    HEAD.forEach((__, c) =>
      paint(
        ws,
        i + 1,
        c,
        cellStyle({ align: c === 5 ? "right" : [6, 9, 12].includes(c) ? "left" : "center" }),
      ),
    ),
  );

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
const compact = (d: string | null | undefined) => (d ?? "").replace(/-/g, "");

/** 계좌번호는 숫자만 남긴다 — 은행 일괄이체 양식이 하이픈을 받지 않는다 */
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** 열마다 이름 · 너비 · 본문 칸 모양 */
const PAYOUT_COLS: {
  head: string;
  width: number;
  fill?: string;
  bold?: boolean;
  align?: Align;
}[] = [
  { head: "순번", width: 5, fill: COLOR.dark, bold: true },
  { head: "처리일자", width: 11 },
  { head: "예산코드", width: 9, fill: COLOR.green, bold: true },
  { head: "출금계좌", width: 9, fill: COLOR.green, bold: true },
  { head: "신청자", width: 9 },
  { head: "청구일자", width: 11 },
  { head: "예금주", width: 20 },
  { head: "은행", width: 10 },
  { head: "은행코드", width: 9, fill: COLOR.gray },
  { head: "계좌번호", width: 18 },
  { head: "금액", width: 11, align: "right" },
  { head: "받는통장표시", width: 13, fill: COLOR.green },
  { head: "내통장표시", width: 14, align: "right" },
  { head: "품명/지출대상", width: 16, align: "left" },
  { head: "용도/비고", width: 36, align: "left" },
];

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

  // 1행 처리요청일자, 2행 비움, 3행 머리글, 4행부터 본문
  const HEAD_ROW = 2;
  const ws = XLSX.utils.aoa_to_sheet([
    ["처리요청일자", compact(payoutDate)],
    [],
    PAYOUT_COLS.map((c) => c.head),
    ...body,
    [],
    // 금액이 열한 번째 열이므로 합계도 그 자리에 맞춘다
    ["", "", "", "", "", "", "", "", "", "합계", total],
  ]);
  ws["!cols"] = PAYOUT_COLS.map((c) => ({ wch: c.width }));

  paint(ws, 0, 0, HEAD_STYLE);
  paint(ws, 0, 1, cellStyle({ fill: COLOR.green, bold: true }));

  PAYOUT_COLS.forEach((_, c) => paint(ws, HEAD_ROW, c, HEAD_STYLE));

  body.forEach((_, i) =>
    PAYOUT_COLS.forEach((col, c) =>
      paint(
        ws,
        HEAD_ROW + 1 + i,
        c,
        cellStyle({
          fill: col.fill,
          bold: col.bold,
          // 순번 칸은 진한 바탕이라 글자를 희게
          color: col.fill === COLOR.dark ? COLOR.white : undefined,
          align: col.align,
        }),
      ),
    ),
  );

  const totalRow = HEAD_ROW + body.length + 2;
  paint(ws, totalRow, 9, cellStyle({ bold: true }));
  paint(ws, totalRow, 10, cellStyle({ bold: true, align: "right" }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "이체목록");
  XLSX.writeFile(wb, fileName);
}
