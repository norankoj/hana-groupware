// src/components/expense/ExpenseLedger.tsx
// 전체 내역 (담당자) — 청구 줄을 한 줄씩 펴서 보고 엑셀로 내보낸다.
// 요청 리스트가 이미 불러온 데이터를 쓰므로 조회를 새로 하지 않는다.
"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Search, X } from "lucide-react";
import Select from "@/components/Select";
import { StickyTh, NumCell } from "./TableCells";
import {
  STATUS_LABEL,
  STATUS_STYLE,
  accountText,
  flattenBudget,
  formatWon,
  inputClass,
  itemLabel,
  resolveAccount,
  selectClass,
  type BudgetItem,
  type BudgetUsage,
  type ExpenseRequest,
  type ExpenseRequestItem,
} from "./shared";

type Props = {
  fiscalYear: number;
  requests: ExpenseRequest[];
  budgetItems: BudgetItem[];
  usage: BudgetUsage[];
};

type Row = {
  item: ExpenseRequestItem;
  request: ExpenseRequest;
  /** 배정된 비목이 속한 대항목 — 걸러보기용 */
  majorLabel: string;
};

const STATUS_OPTIONS = [
  { value: "all", label: "전체 상태" },
  { value: "pending", label: "처리대기" },
  { value: "approved", label: "승인됨" },
  { value: "paid", label: "지급완료" },
  { value: "rejected", label: "반려됨" },
  { value: "cancelled", label: "취소됨" },
];

const UNASSIGNED = "(비목 미배정)";

export default function ExpenseLedger({
  fiscalYear,
  requests,
  budgetItems,
  usage,
}: Props) {
  const [status, setStatus] = useState("all");
  const [major, setMajor] = useState("all");
  const [query, setQuery] = useState("");

  // 비목 id → 그 비목이 속한 대항목 이름
  const majorOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of flattenBudget(budgetItems, usage)) {
      const root = o.path.split(" › ")[0];
      map.set(o.id, root || itemLabel(o));
    }
    return map;
  }, [budgetItems, usage]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const request of requests) {
      for (const item of request.items ?? []) {
        out.push({
          item,
          request,
          majorLabel: item.budget_item_id
            ? (majorOf.get(item.budget_item_id) ?? UNASSIGNED)
            : UNASSIGNED,
        });
      }
    }
    return out.sort((a, b) => {
      const d = (b.request.request_date ?? "").localeCompare(
        a.request.request_date ?? "",
      );
      return d !== 0 ? d : a.item.sort_order - b.item.sort_order;
    });
  }, [requests, majorOf]);

  const majorOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) seen.add(r.majorLabel);
    return [
      { value: "all", label: "전체 항목" },
      ...[...seen]
        .sort((a, b) => a.localeCompare(b, "ko"))
        .map((m) => ({ value: m, label: m })),
    ];
  }, [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.request.status !== status) return false;
      if (major !== "all" && r.majorLabel !== major) return false;
      if (!q) return true;
      const haystack = [
        r.item.item_name,
        r.item.purpose ?? "",
        r.request.requester?.full_name ?? "",
        r.item.budget_item ? itemLabel(r.item.budget_item) : "",
        r.majorLabel,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, status, major, query]);

  const shownTotal = shown.reduce((sum, r) => sum + r.item.amount, 0);

  const exportExcel = () => {
    const head = [
      "청구일자",
      "신청자",
      "품명/지출대상",
      "수량",
      "단가",
      "금액",
      "용도/비고",
      "대항목",
      "비목코드",
      "비목",
      "은행",
      "계좌번호",
      "예금주",
      "상태",
      "이체일자",
    ];

    const body = shown.map((r) => {
      const acc = resolveAccount(r.item, r.request);
      return [
        r.request.request_date,
        r.request.requester?.full_name ?? "",
        r.item.item_name,
        r.item.qty,
        r.item.unit_price,
        r.item.amount,
        r.item.purpose ?? "",
        r.majorLabel === UNASSIGNED ? "" : r.majorLabel,
        r.item.budget_item?.code ?? "",
        r.item.budget_item?.name ?? "",
        acc.bank_name ?? "",
        acc.account_no ?? "",
        acc.account_holder ?? "",
        STATUS_LABEL[r.request.status],
        r.request.paid_at ?? "",
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([
      head,
      ...body,
      [],
      ["", "", "합계", "", "", shownTotal],
    ]);
    ws["!cols"] = [
      { wch: 11 }, { wch: 9 }, { wch: 18 }, { wch: 6 }, { wch: 11 },
      { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 9 }, { wch: 22 },
      { wch: 10 }, { wch: 18 }, { wch: 9 }, { wch: 9 }, { wch: 11 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "지출결의내역");
    XLSX.writeFile(wb, `지출결의내역_${fiscalYear}.xlsx`);
  };

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden flex flex-col">
      {/* 요약 */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 px-4 py-3 border-b border-gray-200 bg-gray-50/60">
        <span className="text-sm font-bold text-gray-800">
          {fiscalYear}년 전체 내역
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-xs text-gray-500">건수</span>
          <b className="font-mono text-[15px] tabular-nums text-gray-900">
            {shown.length}
          </b>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-xs text-gray-500">합계</span>
          <b className="font-mono text-[15px] tabular-nums text-[#2151EC]">
            {formatWon(shownTotal)}
          </b>
        </span>
      </div>

      {/* 걸러보기 */}
      <div className="flex flex-col sm:flex-row gap-2 px-4 py-3 border-b border-gray-200">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            id="ledger-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="품명 · 신청자 · 용도 · 비목으로 검색"
            className={`${inputClass} py-2 pl-9 pr-9`}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="검색 지우기"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-900 cursor-pointer"
            >
              <X size={15} />
            </button>
          )}
        </div>
        <div className="sm:w-[150px]">
          <Select
            value={status}
            onChange={setStatus}
            options={STATUS_OPTIONS}
            className={`${selectClass} py-2`}
          />
        </div>
        <div className="sm:w-[190px]">
          <Select
            value={major}
            onChange={setMajor}
            options={majorOptions}
            className={`${selectClass} py-2`}
          />
        </div>
        <button
          type="button"
          onClick={exportExcel}
          disabled={shown.length === 0}
          className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Download size={15} /> 엑셀
        </button>
      </div>

      {/* 내역 — 높이를 고정하고 이 안에서만 스크롤한다 */}
      <div className="h-[clamp(320px,58vh,700px)] overflow-auto">
        <table className="w-full min-w-[1040px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] font-semibold text-gray-600">
              <StickyTh align="left">청구일자</StickyTh>
              <StickyTh align="left">신청자</StickyTh>
              <StickyTh align="left">품명 / 지출대상</StickyTh>
              <StickyTh>수량</StickyTh>
              <StickyTh>단가</StickyTh>
              <StickyTh>금액</StickyTh>
              <StickyTh align="left">비목</StickyTh>
              <StickyTh align="left">받을 계좌</StickyTh>
              <StickyTh align="left">상태</StickyTh>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="py-16 text-center text-sm text-gray-400"
                >
                  해당하는 내역이 없습니다.
                </td>
              </tr>
            ) : (
              shown.map((r) => {
                const acc = resolveAccount(r.item, r.request);
                return (
                  <tr
                    key={r.item.id}
                    className="border-b border-gray-100 last:border-0 hover:bg-blue-50/40"
                  >
                    <td className="py-1.5 pl-3 pr-3 font-mono text-[12px] tabular-nums text-gray-500 whitespace-nowrap">
                      {r.request.request_date}
                    </td>
                    <td className="py-1.5 px-3 text-gray-700 whitespace-nowrap">
                      {r.request.requester?.full_name ?? "-"}
                    </td>
                    <td className="py-1.5 px-3 text-gray-900">
                      {r.item.item_name}
                      {r.item.purpose && (
                        <span className="ml-1.5 text-xs text-gray-400">
                          {r.item.purpose}
                        </span>
                      )}
                    </td>
                    <NumCell size="text-[12px]" muted={!r.item.qty || r.item.qty === 1}>
                      {r.item.qty && r.item.qty !== 1 ? r.item.qty : "-"}
                    </NumCell>
                    <NumCell size="text-[12px]" muted={!r.item.unit_price}>
                      {r.item.unit_price ? formatWon(r.item.unit_price) : "-"}
                    </NumCell>
                    <NumCell size="text-[12px]" tone="text-gray-900 font-semibold">
                      {formatWon(r.item.amount)}
                    </NumCell>
                    <td className="py-1.5 px-3 whitespace-nowrap">
                      {r.item.budget_item ? (
                        <span className="text-xs text-gray-700">
                          <span className="mr-1 font-mono text-[11px] text-gray-400 tabular-nums">
                            {r.item.budget_item.code}
                          </span>
                          {r.item.budget_item.name}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600">미배정</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 font-mono text-[11px] text-gray-500 whitespace-nowrap">
                      {accountText(acc)}
                    </td>
                    <td className="py-1.5 px-3 whitespace-nowrap">
                      <span
                        className={`px-1.5 py-0.5 text-[11px] font-bold rounded border ${STATUS_STYLE[r.request.status]}`}
                      >
                        {STATUS_LABEL[r.request.status]}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="px-4 py-2.5 border-t border-gray-200 bg-gray-50/60 text-xs text-gray-500">
        엑셀에는 지금 걸러본 {shown.length}건이 그대로 내려갑니다.
        {/* ponytail: 요청 리스트가 불러온 결의서(기본 1,000건)를 펴서 쓴다.
            연 수천 건으로 늘면 연도 조건을 붙인 별도 조회로 바꿔야 한다. */}
        {requests.length >= 1000 &&
          " 결의서가 1,000건에 도달해 일부가 빠졌을 수 있습니다."}
      </p>
    </div>
  );
}
