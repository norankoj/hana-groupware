// src/components/expense/BudgetTree.tsx
// 예산안 — 담당자가 195행 3단 트리를 스캔하며 소진을 판단하는 화면.
// 높이를 고정하고 안에서만 스크롤한다. 헤더와 총계는 스크롤해도 자리를 지킨다.
"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import { createClient } from "@/utils/supabase/client";
import { showConfirm } from "@/utils/alert";
import { StickyTh, NumCell } from "./TableCells";
import {
  STATUS_LABEL,
  STATUS_STYLE,
  WARN_AT,
  btnStyles,
  buildBudgetTree,
  formatWon,
  inputClass,
  itemLabel,
  netPaid,
  spentRatio,
  type BudgetItem,
  type BudgetNode,
  type BudgetUsage,
  type BudgetYear,
  type ExpenseRequest,
} from "./shared";

type Props = {
  /** 처음 보여줄 연도 (확정된 최근 연도) */
  defaultYear: number;
  years: BudgetYear[];
  /** 전 연도 예산안 — 여기서 고른 연도만 걸러 쓴다 */
  items: BudgetItem[];
  usage: BudgetUsage[];
  /** 확정지출·처리대기 세부내역용 (담당자만 받는다) */
  requests: ExpenseRequest[];
  /** 가예산을 확정할 수 있는지 (지출결의 담당자) */
  canFinalize: boolean;
  onRefresh: () => void;
};

/** 확정지출로 셈하는 상태 — budget_usage 뷰와 같은 기준 */
const SPENT = ["approved", "paying", "paid"];

const hit = (n: BudgetNode, q: string) => itemLabel(n).toLowerCase().includes(q);

const subtreeHit = (n: BudgetNode, q: string): boolean =>
  hit(n, q) || n.children.some((c) => subtreeHit(c, q));

const subtreeWarn = (n: BudgetNode): boolean =>
  spentRatio(n) >= WARN_AT || n.children.some(subtreeWarn);

export default function BudgetTree({
  defaultYear,
  years,
  items: allItems,
  usage: allUsage,
  requests,
  canFinalize,
  onRefresh,
}: Props) {
  const [fiscalYear, setFiscalYear] = useState(defaultYear);
  const yearInfo = years.find((y) => y.fiscal_year === fiscalYear);
  const yearList = years.length ? years.map((y) => y.fiscal_year) : [defaultYear];
  const items = useMemo(
    () => allItems.filter((i) => i.fiscal_year === fiscalYear),
    [allItems, fiscalYear],
  );
  const usage = useMemo(
    () => allUsage.filter((u) => u.fiscal_year === fiscalYear),
    [allUsage, fiscalYear],
  );

  /** 확정지출·처리대기 숫자를 눌렀을 때 — 그 항목(하위 포함)에 걸린 청구 */
  const [detail, setDetail] = useState<{
    node: BudgetNode;
    kind: "spent" | "pending";
  } | null>(null);
  const detailLines = useMemo(() => {
    if (!detail) return [];
    const ids = new Set<string>();
    const walk = (n: BudgetNode) => {
      ids.add(n.id);
      n.children.forEach(walk);
    };
    walk(detail.node);
    const want = detail.kind === "spent" ? SPENT : ["pending"];
    return requests
      .filter((r) => want.includes(r.status))
      .flatMap((r) =>
        (r.items ?? [])
          .filter((i) => i.budget_item_id && ids.has(i.budget_item_id))
          .map((i) => ({ r, i })),
      )
      .sort((a, b) => b.r.request_date.localeCompare(a.r.request_date));
  }, [detail, requests]);

  const detailSum = detailLines.reduce(
    (sum, { i }) => sum + (detail?.kind === "spent" ? netPaid(i) : i.amount),
    0,
  );
  /** 확정지출을 상태별로 — 승인됨 · 이체중 · 지급완료 */
  const detailBreakdown = SPENT.map((st) => {
    const rows = detailLines.filter(({ r }) => r.status === st);
    return [
      st as ExpenseRequest["status"],
      rows.length,
      rows.reduce((sum, { i }) => sum + netPaid(i), 0),
    ] as const;
  }).filter(([, n]) => n > 0);

  const finalize = async () => {
    const ok = await showConfirm(
      `${fiscalYear}년 예산안을 확정할까요?`,
      "확정하면 청구일자가 이 해인 청구부터 이 예산으로 들어갑니다.",
      "확정",
    );
    if (!ok) return;
    const { error } = await createClient()
      .from("budget_years")
      .update({ status: "final", finalized_at: new Date().toISOString() })
      .eq("fiscal_year", fiscalYear);
    if (error) return toast.error("확정 실패: " + error.message);
    toast.success(`${fiscalYear}년 예산안을 확정했습니다.`);
    onRefresh();
  };

  const roots = useMemo(() => buildBudgetTree(items, usage), [items, usage]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [warnOnly, setWarnOnly] = useState(false);

  const q = query.trim().toLowerCase();

  const total = useMemo(
    () =>
      roots.reduce(
        (acc, n) => ({
          planned: acc.planned + n.planned_amount,
          spent: acc.spent + n.spent,
          pending: acc.pending + n.pending,
        }),
        { planned: 0, spent: 0, pending: 0 },
      ),
    [roots],
  );

  const allIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (n: BudgetNode) => {
      if (n.children.length) ids.push(n.id);
      n.children.forEach(walk);
    };
    roots.forEach(walk);
    return ids;
  }, [roots]);

  const warnCount = useMemo(() => {
    let count = 0;
    const walk = (n: BudgetNode) => {
      if (spentRatio(n) >= WARN_AT) count++;
      n.children.forEach(walk);
    };
    roots.forEach(walk);
    return count;
  }, [roots]);

  const allOpen = allIds.length > 0 && expanded.size >= allIds.length;
  const filtering = !!q || warnOnly;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (items.length === 0)
    return (
      <div className="border border-gray-200 rounded-xl bg-white p-10 text-center">
        <p className="text-gray-700 font-medium">
          {fiscalYear}년 예산안이 등록되지 않았습니다.
        </p>
        <p className="mt-1.5 text-sm text-gray-500">
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
            supabase/migrations/seed_budget_{fiscalYear}.sql
          </code>{" "}
          을 실행해주세요.
        </p>
      </div>
    );

  const keep = (n: BudgetNode) =>
    (!q || subtreeHit(n, q)) && (!warnOnly || subtreeWarn(n));

  const renderRows = (nodes: BudgetNode[]): React.ReactNode[] =>
    nodes.flatMap((n) => {
      if (!keep(n)) return [];

      const pct = spentRatio(n);
      const remaining = n.planned_amount - n.spent;
      // 걸러보는 중에는 맞는 줄로 가는 길을 모두 펴둔다
      const open = filtering || expanded.has(n.id);
      const hasKids = n.children.length > 0;
      const matched = !!q && hit(n, q);

      const row = (
        <tr
          key={n.id}
          className={`border-b border-gray-100 last:border-0 hover:bg-blue-50/40 ${
            n.level === 1
              ? "bg-gray-50/80 text-gray-900"
              : n.level === 2
                ? "text-gray-800"
                : "text-gray-600"
          } ${matched ? "bg-blue-50" : ""}`}
        >
          {/* th 의 기본 굵기(UA 스타일)가 상속을 이기므로 단계별로 직접 지정한다 */}
          <th
            scope="row"
            className={`py-1.5 pr-3 text-left ${
              n.level === 1
                ? "pl-3 font-bold"
                : n.level === 2
                  ? "pl-8 font-medium"
                  : "pl-14 font-normal"
            }`}
          >
            <div className="flex items-start gap-1.5">
              {hasKids ? (
                <button
                  type="button"
                  onClick={() => toggle(n.id)}
                  aria-expanded={open}
                  aria-label={`${n.name} ${open ? "접기" : "펴기"}`}
                  className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-900 cursor-pointer"
                >
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="min-w-0">
                {n.code && (
                  <span
                    className={`mr-2 font-mono text-[11px] tabular-nums ${
                      n.level === 1 ? "text-[#2151EC]" : "text-gray-400"
                    }`}
                  >
                    {n.code}
                  </span>
                )}
                <span className="break-keep">{n.name}</span>
                {n.note && (
                  <span
                    title={n.note}
                    className="ml-1.5 align-middle text-[10px] font-normal text-gray-400 border border-gray-200 rounded px-1 cursor-help"
                  >
                    비고
                  </span>
                )}
              </span>
            </div>
          </th>
          <NumCell>{formatWon(n.planned_amount)}</NumCell>
          <NumCell muted={!n.spent}>
            {n.spent ? (
              <DetailLink onClick={() => setDetail({ node: n, kind: "spent" })}>
                {formatWon(n.spent)}
              </DetailLink>
            ) : (
              "-"
            )}
          </NumCell>
          <NumCell muted={!n.pending} tone={n.pending ? "text-amber-600" : ""}>
            {n.pending ? (
              <DetailLink onClick={() => setDetail({ node: n, kind: "pending" })}>
                {formatWon(n.pending)}
              </DetailLink>
            ) : (
              "-"
            )}
          </NumCell>
          <NumCell tone={remaining < 0 ? "text-red-600 font-bold" : ""}>
            {formatWon(remaining)}
          </NumCell>
          <td className="py-1.5 pl-3 pr-3 whitespace-nowrap">
            <div className="flex items-center justify-end gap-2">
              <span
                aria-hidden="true"
                className="relative block h-1 w-14 rounded-full bg-gray-200"
              >
                <span
                  className={`absolute inset-y-0 left-0 rounded-full ${
                    pct >= 100
                      ? "bg-red-500"
                      : pct >= WARN_AT
                        ? "bg-amber-500"
                        : "bg-[#2151EC]"
                  }`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </span>
              <span
                className={`w-8 text-right font-mono text-[11px] tabular-nums ${
                  pct >= 100
                    ? "text-red-600 font-bold"
                    : pct >= WARN_AT
                      ? "text-amber-700"
                      : "text-gray-400"
                }`}
              >
                {Math.round(pct)}%
              </span>
            </div>
          </td>
        </tr>
      );

      return open && hasKids ? [row, ...renderRows(n.children)] : [row];
    });

  const rows = renderRows(roots);

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden flex flex-col">
      {/* 총계 — 한 줄로 붙여 표가 차지할 높이를 남긴다 */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 px-4 py-3 border-b border-gray-200 bg-gray-50/60">
        <span className="flex items-center gap-2">
          <div className="w-[150px]">
            <Select
              value={String(fiscalYear)}
              onChange={(v) => {
                setFiscalYear(Number(v));
                setExpanded(new Set());
              }}
              options={yearList.map((y) => ({
                value: String(y),
                label: `${y}년 예산안`,
              }))}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          {yearInfo?.status === "draft" && (
            <>
              <span className="px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-[11px] font-bold text-amber-700">
                가예산
              </span>
              {canFinalize && (
                <button
                  type="button"
                  onClick={finalize}
                  className="px-2 py-0.5 rounded-md border border-[#2151EC] bg-white text-xs font-bold text-[#2151EC] hover:bg-blue-50 cursor-pointer"
                >
                  확정
                </button>
              )}
            </>
          )}
        </span>
        <Stat label="계획" value={total.planned} />
        <Stat label="확정지출" value={total.spent} />
        <Stat label="처리대기" value={total.pending} tone="text-amber-600" />
        <Stat
          label="잔액"
          value={total.planned - total.spent}
          tone="text-[#2151EC]"
        />
      </div>

      {/* 검색 · 걸러보기 */}
      <div className="flex flex-col sm:flex-row gap-2 px-4 py-3 border-b border-gray-200">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            id="budget-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="코드나 이름으로 검색 (예: 4930, 소모품)"
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
        <button
          type="button"
          onClick={() => setWarnOnly((v) => !v)}
          aria-pressed={warnOnly}
          className={`px-3.5 py-2 text-sm rounded-lg border transition cursor-pointer whitespace-nowrap ${
            warnOnly
              ? "border-amber-400 bg-amber-50 text-amber-800 font-bold"
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {WARN_AT}% 이상만
          {warnCount > 0 && (
            <span className="ml-1.5 font-mono text-xs tabular-nums">
              {warnCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(allOpen ? new Set() : new Set(allIds))}
          disabled={filtering}
          className="px-3.5 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {allOpen ? "전체 접기" : "전체 펴기"}
        </button>
      </div>

      {/* 트리 — 높이를 고정하고 이 안에서만 스크롤한다 */}
      <div className="h-[clamp(320px,58vh,700px)] overflow-auto">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] font-semibold text-gray-600">
              <th
                scope="col"
                className="sticky top-0 z-10 bg-gray-100 py-2 pl-3 pr-3 text-left shadow-[inset_0_-1px_0_#e5e7eb]"
              >
                항목
              </th>
              <StickyTh>계획</StickyTh>
              <StickyTh>확정지출</StickyTh>
              <StickyTh>처리대기</StickyTh>
              <StickyTh>잔액</StickyTh>
              <StickyTh>소진</StickyTh>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-gray-400">
                  {warnOnly && !q
                    ? `소진 ${WARN_AT}% 이상인 항목이 없습니다.`
                    : "맞는 항목이 없습니다."}
                </td>
              </tr>
            ) : (
              rows
            )}
          </tbody>
        </table>
      </div>

      <p className="px-4 py-2.5 border-t border-gray-200 bg-gray-50/60 text-xs text-gray-500">
        확정지출은 승인·지급완료 건의 합입니다. 처리대기는 잔액에서 빼지 않고 따로
        보여줍니다. 상위 항목의 숫자는 하위 항목을 모두 더한 값입니다.
      </p>

      {detail && (
        <Modal
          isOpen
          onClose={() => setDetail(null)}
          title={detail.kind === "spent" ? "확정지출 내역" : "처리대기 내역"}
          className="sm:max-w-[860px]"
          footer={
            <button onClick={() => setDetail(null)} className={btnStyles.cancel}>
              닫기
            </button>
          }
        >
          <div className="space-y-4">
            {/* 요약 — 다른 상세 팝업과 같은 회색 띠 */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="min-w-0 text-sm font-bold text-gray-900">
                  <span className="mr-1.5 text-xs font-medium text-gray-500">
                    {fiscalYear}년
                  </span>
                  {detail.node.code && (
                    <span className="mr-1.5 font-mono text-[#2151EC]">
                      {detail.node.code}
                    </span>
                  )}
                  {detail.node.name}
                </p>
                <p className="text-sm text-gray-600">
                  {detailLines.length}건 ·{" "}
                  <b
                    className={`text-lg tabular-nums ${
                      detail.kind === "spent" ? "text-[#2151EC]" : "text-amber-600"
                    }`}
                  >
                    {formatWon(detailSum)}
                  </b>
                  원
                </p>
              </div>
              {detail.kind === "spent" && detailBreakdown.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {detailBreakdown.map(([st, n, sum]) => (
                    <span
                      key={st}
                      className={`px-2 py-0.5 rounded border text-[11px] font-medium ${STATUS_STYLE[st]}`}
                    >
                      {STATUS_LABEL[st]} {n}건 ·{" "}
                      <span className="font-mono tabular-nums">{formatWon(sum)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 표 — 건이 수백 건이 되어도 팝업은 그대로, 표 안에서만 스크롤 */}
            {detailLines.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">
                {requests.length === 0
                  ? "청구 내역은 지출결의 담당자만 볼 수 있습니다."
                  : "해당하는 청구가 없습니다."}
              </p>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="max-h-[clamp(220px,48vh,480px)] overflow-auto">
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <thead>
                      <tr className="text-[11px] font-semibold text-gray-600">
                        <StickyTh align="left" className="pl-4">청구일자</StickyTh>
                        <StickyTh align="left">신청자</StickyTh>
                        <StickyTh align="left">품명 / 용도</StickyTh>
                        <StickyTh align="left">비목</StickyTh>
                        <StickyTh>금액</StickyTh>
                        <StickyTh align="left" className="pr-4">상태</StickyTh>
                      </tr>
                    </thead>
                    <tbody>
                      {detailLines.map(({ r, i }) => {
                        const adjusted = (i.adjustments ?? []).length > 0;
                        const amt = detail.kind === "spent" ? netPaid(i) : i.amount;
                        return (
                          <tr
                            key={i.id}
                            className="border-b border-gray-100 last:border-0 hover:bg-blue-50/40 align-top"
                          >
                            <td className="py-2.5 pl-4 pr-3 font-mono text-[12px] tabular-nums text-gray-500 whitespace-nowrap">
                              {r.request_date}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap text-gray-800">
                              {r.requester?.full_name ?? "-"}
                            </td>
                            <td className="py-2.5 px-3">
                              <p className="text-gray-900">{i.item_name}</p>
                              {i.purpose && (
                                <p className="mt-0.5 text-xs text-gray-400">{i.purpose}</p>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-gray-500 whitespace-nowrap">
                              {i.budget_item ? (
                                <>
                                  <span className="mr-1 font-mono text-gray-400">
                                    {i.budget_item.code}
                                  </span>
                                  {i.budget_item.name}
                                </>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <span className="font-mono tabular-nums font-semibold text-gray-900">
                                {formatWon(amt)}
                              </span>
                              {adjusted && detail.kind === "spent" && (
                                <p className="mt-0.5 text-[10px] text-amber-700">정정 반영</p>
                              )}
                            </td>
                            <td className="py-2.5 pl-3 pr-4 whitespace-nowrap">
                              <span
                                className={`px-1.5 py-0.5 text-[11px] font-bold rounded border ${STATUS_STYLE[r.status]}`}
                              >
                                {STATUS_LABEL[r.status]}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}


const Stat = ({
  label,
  value,
  tone = "text-gray-900",
}: {
  label: string;
  value: number;
  tone?: string;
}) => (
  <span className="flex items-baseline gap-1.5">
    <span className="text-xs text-gray-500">{label}</span>
    <b className={`font-mono text-[15px] tabular-nums ${tone}`}>
      {formatWon(value)}
    </b>
  </span>
);

/** 숫자를 눌러 세부내역을 여는 링크 */
const DetailLink = ({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    title="세부내역 보기"
    className="underline decoration-dotted underline-offset-2 hover:text-[#2151EC] hover:decoration-solid cursor-pointer"
  >
    {children}
  </button>
);
