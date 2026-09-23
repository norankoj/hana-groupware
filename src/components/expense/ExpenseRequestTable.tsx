// src/components/expense/ExpenseRequestTable.tsx
// 요청 리스트 표 보기 — 건이 많을 때 한 화면에서 훑고, 골라서 한꺼번에 처리한다.
// 카드 보기와 같은 목록(상태·기간·검색으로 이미 걸러진 것)을 받고,
// 줄마다 하는 일(비목 배정·영수증 확인)은 상세 팝업에서 한다.
//
// 정렬·페이지는 이 표가 들고, 고른 건(picked)은 부모가 들고 있다 —
// 일괄 승인 바가 같은 값을 읽어야 해서.
"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Paperclip } from "lucide-react";
import Select from "@/components/Select";
import SortTh from "@/components/ui/SortTh";
import { collectReceipts } from "./ReceiptViewer";
import {
  STATUS_LABEL,
  STATUS_STYLE,
  formatWon,
  itemLabel,
  requestTotal,
  selectClass,
  type ExpenseRequest,
} from "./shared";

type Props = {
  /** 상태·기간·검색으로 이미 걸러진 목록 */
  requests: ExpenseRequest[];
  /** 고른 건 — 처리대기에서만 고를 수 있다 */
  picked: Set<string>;
  onTogglePick: (id: string) => void;
  /** 이 페이지의 고를 수 있는 건 전체 (해제는 빈 배열) */
  onPickMany: (ids: string[], on: boolean) => void;
  onOpenDetail: (req: ExpenseRequest) => void;
  onViewReceipts: (req: ExpenseRequest) => void;
  /** 걸러진 건이 없을 때 표 안에 보일 문구 */
  emptyText?: string;
  /**
   * 표 윗줄에 붙는 이 탭의 동작 (선택 승인 · 이체 목록 만들기 · 지급완료 기록).
   * 표 위에 따로 줄을 두면 탭마다 표 시작 위치가 달라져 아래가 빈다.
   */
  actions?: React.ReactNode;
};

type SortKey = "date" | "requester" | "amount";

const PAGE_SIZES = [10, 30, 50, 100];

// 머리칸에 테두리를 직접 준다 — border-collapse 로는 스크롤 중에 사라진다
const TH =
  "px-2.5 py-2.5 text-[13px] font-bold text-heading tracking-[0.2px] whitespace-nowrap bg-table-header border-b border-table-line";

/** 한 청구의 품명 — 여러 줄이면 첫 줄 + 외 n건 */
const itemNameOf = (req: ExpenseRequest) => {
  const items = req.items ?? [];
  if (items.length === 0) return "내역 없음";
  const first = items[0].item_name || "(품명 없음)";
  return items.length > 1 ? `${first} 외 ${items.length - 1}건` : first;
};

/** 배정된 비목 — 여러 개면 첫 비목 + 외 n */
const budgetTextOf = (req: ExpenseRequest) => {
  const labels = [
    ...new Set(
      (req.items ?? [])
        .filter((i) => i.budget_item)
        .map((i) => itemLabel(i.budget_item!)),
    ),
  ];
  if (labels.length === 0) return null;
  return labels.length > 1 ? `${labels[0]} 외 ${labels.length - 1}` : labels[0];
};

/** 출금계좌 코드 — 한 청구에 섞여 있으면 모두 */
const withdrawTextOf = (req: ExpenseRequest) =>
  [...new Set((req.items ?? []).map((i) => i.withdraw_code).filter(Boolean))].join(
    " ",
  );

export default function ExpenseRequestTable({
  requests,
  picked,
  onTogglePick,
  onPickMany,
  onOpenDetail,
  onViewReceipts,
  emptyText = "해당하는 청구가 없습니다.",
  actions,
}: Props) {
  const [sort, setSort] = useState<SortKey>("date");
  const [asc, setAsc] = useState(false);
  const [pageSize, setPageSize] = useState(30);
  const [page, setPage] = useState(0);
  /** 빽빽하게 — 한 화면에 더 많이 본다 */
  const [dense, setDense] = useState(false);

  const rows = useMemo(() => {
    const dir = asc ? 1 : -1;
    return [...requests].sort((a, b) => {
      if (sort === "amount")
        return (requestTotal(a.items ?? []) - requestTotal(b.items ?? [])) * dir;
      if (sort === "requester")
        return (
          (a.requester?.full_name ?? "").localeCompare(
            b.requester?.full_name ?? "",
            "ko",
          ) * dir
        );
      return (a.request_date ?? "").localeCompare(b.request_date ?? "") * dir;
    });
  }, [requests, sort, asc]);

  // 페이지는 렌더할 때 범위 안으로 좁힌다 — 목록이 줄어도 빈 화면이 안 나오게
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const slice = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);

  /** 이 페이지에서 고를 수 있는 건 (처리대기만) */
  const selectable = slice.filter((r) => r.status === "pending").map((r) => r.id);
  const allPicked =
    selectable.length > 0 && selectable.every((id) => picked.has(id));

  const sortBy = (key: SortKey) => {
    if (key === sort) return setAsc((v) => !v);
    setSort(key);
    setAsc(key === "requester"); // 이름은 가나다순, 날짜·금액은 큰 것부터
  };

  // 키보드로 줄을 오르내린다.
  // ponytail: 줄 단위까지만 — 칸 단위 이동이 필요해지면 role="grid" 로 올린다
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const onRowKey = (e: React.KeyboardEvent, i: number, req: ExpenseRequest) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      rowRefs.current[i + (e.key === "ArrowDown" ? 1 : -1)]?.focus();
    } else if (e.key === " " && req.status === "pending") {
      e.preventDefault();
      onTogglePick(req.id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onOpenDetail(req);
    }
  };

  // 기본은 넉넉하게 — 한 줄을 눌러 여는 표라 누를 자리가 커야 한다
  const pad = dense ? "py-2" : "py-3.5";
  // 머리칸 하나에 넘길 것 — 켜졌는지 · 방향 · 누르면 무엇
  const sortProps = (key: SortKey) => ({
    active: sort === key,
    dir: (asc ? "asc" : "desc") as "asc" | "desc",
    onClick: () => sortBy(key),
  });

  return (
    <div className="border border-table-line bg-white rounded-xl overflow-hidden">
      {/* 표 머리 위 한 줄 — 건수 · 이 탭의 동작 · 밀도 · 한 페이지 줄 수 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 border-b border-line min-h-[52px]">
        <span className="text-xs text-muted">
          {rows.length}건 중{" "}
          <b className="tabular-nums text-heading">
            {rows.length === 0 ? 0 : safePage * pageSize + 1}-
            {safePage * pageSize + slice.length}
          </b>
        </span>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 min-w-0 pl-3 border-l border-line">
            {actions}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDense((v) => !v)}
            aria-pressed={dense}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition cursor-pointer ${
              dense
                ? "border-primary bg-primary-wash text-primary font-bold"
                : "border-line bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            빽빽하게
          </button>
          <div className="w-[104px]">
            <Select
              value={String(pageSize)}
              onChange={(v) => {
                setPageSize(Number(v));
                setPage(0);
              }}
              options={PAGE_SIZES.map((n) => ({
                value: String(n),
                label: `${n}줄`,
              }))}
              className={`${selectClass} py-1 text-xs`}
            />
          </div>
        </div>
      </div>

      {/* 표 — 머리는 붙어 있고, 맨 왼쪽(고르기)과 맨 오른쪽(처리)은 옆으로 밀려도 남는다 */}
      {/* 높이 고정 — 탭·검색으로 건수가 바뀌어도 화면이 출렁이지 않게.
          화면 높이에서 위쪽(머리·탭·툴바·쪽 번호)을 뺀 만큼이라 바깥 스크롤이 생기지 않는다.
          작은 화면은 240px, 큰 화면은 520px 에서 멈춘다. */}
      <div className="overflow-auto h-[clamp(240px,calc(100dvh-490px),520px)]">
        <table className="w-full min-w-[1020px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20">
            <tr>
              <th
                scope="col"
                className={`${TH} sticky left-0 z-30 w-10 text-center`}
              >
                <input
                  type="checkbox"
                  checked={allPicked}
                  disabled={selectable.length === 0}
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        !allPicked && selectable.some((id) => picked.has(id));
                  }}
                  onChange={(e) => onPickMany(selectable, e.target.checked)}
                  aria-label="이 페이지 전체 고르기"
                  className="w-4 h-4 accent-primary cursor-pointer disabled:cursor-not-allowed"
                />
              </th>
              <th scope="col" className={`${TH} text-center`}>
                상태
              </th>
              <SortTh label="청구일" align="center" {...sortProps("date")} />
              <th scope="col" className={`${TH} text-center`}>
                예산
              </th>
              <SortTh label="신청자" {...sortProps("requester")} />
              <th scope="col" className={`${TH} text-left`}>
                품명
              </th>
              <th scope="col" className={`${TH} text-left`}>
                비목
              </th>
              <th scope="col" className={`${TH} text-center`}>
                출금
              </th>
              <th scope="col" className={`${TH} text-center`}>
                영수증
              </th>
              <SortTh label="금액" align="right" {...sortProps("amount")} />
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && (
              <tr>
                <td colSpan={10} className="py-28 text-center text-sm text-muted">
                  {emptyText}
                </td>
              </tr>
            )}
            {slice.map((req, i) => {
              const items = req.items ?? [];
              const on = picked.has(req.id);
              const budget = budgetTextOf(req);
              const receipts = collectReceipts(items).length;
              const yearOff =
                Number(req.request_date.slice(0, 4)) !== req.fiscal_year;
              // 고른 줄은 칸마다 색을 줘야 한다 — 고정된 칸이 위에 겹쳐 그려진다
              const bg = on ? "bg-primary-wash" : "bg-white group-hover:bg-gray-50";
              const cell = `px-2.5 ${pad} border-b border-table-line ${bg}`;

              return (
                <tr
                  key={req.id}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  tabIndex={0}
                  aria-selected={on}
                  onKeyDown={(e) => onRowKey(e, i, req)}
                  // 줄 어디를 눌러도 상세가 열린다 — 승인·반려는 상세 안에서 한다
                  onClick={() => onOpenDetail(req)}
                  className="group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <td
                    className={`${cell} sticky left-0 z-10 text-center`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {req.status === "pending" ? (
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => onTogglePick(req.id)}
                        aria-label={`${itemNameOf(req)} 고르기`}
                        className="w-4 h-4 accent-primary cursor-pointer"
                      />
                    ) : null}
                  </td>
                  <td className={`${cell} text-center`}>
                    <span
                      className={`inline-block px-1.5 py-0.5 text-[10px] font-bold rounded border whitespace-nowrap ${STATUS_STYLE[req.status]}`}
                    >
                      {STATUS_LABEL[req.status]}
                    </span>
                  </td>
                  <td
                    className={`${cell} text-center font-mono text-xs tabular-nums text-gray-600 whitespace-nowrap`}
                  >
                    {req.request_date}
                  </td>
                  <td
                    className={`${cell} text-center font-mono text-xs tabular-nums whitespace-nowrap ${
                      yearOff ? "font-bold text-amber-700" : "text-muted"
                    }`}
                  >
                    {req.fiscal_year}
                  </td>
                  <td className={`${cell} whitespace-nowrap text-gray-800`}>
                    {req.requester?.full_name ?? "-"}
                  </td>
                  <td className={`${cell} max-w-[240px]`}>
                    <span
                      className="block w-full truncate font-medium text-heading group-hover:text-primary"
                      title={itemNameOf(req)}
                    >
                      {itemNameOf(req)}
                    </span>
                  </td>
                  <td className={`${cell} max-w-[200px]`}>
                    {budget ? (
                      <span
                        className="block truncate text-xs text-gray-600"
                        title={budget}
                      >
                        {budget}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-amber-600">
                        미배정
                      </span>
                    )}
                  </td>
                  <td
                    className={`${cell} text-center font-mono text-xs text-muted`}
                  >
                    {withdrawTextOf(req) || "-"}
                  </td>
                  <td className={`${cell} text-center`}>
                    {receipts > 0 ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewReceipts(req);
                        }}
                        className="inline-flex items-center gap-0.5 text-xs text-gray-600 hover:text-primary cursor-pointer"
                        aria-label={`영수증 ${receipts}장 보기`}
                      >
                        <Paperclip size={12} />
                        <span className="tabular-nums">{receipts}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-disabled-text">-</span>
                    )}
                  </td>
                  <td
                    className={`${cell} text-right font-mono font-bold tabular-nums text-heading whitespace-nowrap`}
                  >
                    {formatWon(requestTotal(items))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

      </div>

      {/* 페이지 */}
      {/* 한 쪽뿐이어도 늘 보인다 — 쪽 수에 따라 아래가 출렁이지 않게 */}
        <div className="flex items-center justify-center gap-1 px-3 py-2 border-t border-line">
          <button
            type="button"
            onClick={() => setPage(safePage - 1)}
            disabled={safePage === 0}
            aria-label="이전 페이지"
            className="p-1.5 rounded-lg text-muted hover:bg-gray-100 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>
          {/* 앞뒤 2칸만 — 페이지가 많아도 줄이 안 넘친다 */}
          {Array.from({ length: pageCount }, (_, p) => p)
            .filter(
              (p) =>
                Math.abs(p - safePage) <= 2 || p === 0 || p === pageCount - 1,
            )
            .map((p, idx, arr) => (
              <span key={p} className="flex items-center">
                {idx > 0 && arr[idx - 1] !== p - 1 && (
                  <span className="px-1 text-xs text-gray-400">…</span>
                )}
                <button
                  type="button"
                  onClick={() => setPage(p)}
                  aria-current={p === safePage ? "page" : undefined}
                  className={`min-w-[28px] px-1.5 py-1 text-xs font-bold rounded-lg tabular-nums transition cursor-pointer ${
                    p === safePage
                      ? "bg-primary text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {p + 1}
                </button>
              </span>
            ))}
          <button
            type="button"
            onClick={() => setPage(safePage + 1)}
            disabled={safePage >= pageCount - 1}
            aria-label="다음 페이지"
            className="p-1.5 rounded-lg text-muted hover:bg-gray-100 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
    </div>
  );
}
