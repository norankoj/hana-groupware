// src/components/expense/BudgetTree.tsx
// 예산안 — 담당자가 195행 3단 트리를 스캔하며 소진을 판단하는 화면.
// 높이를 고정하고 안에서만 스크롤한다. 헤더와 총계는 스크롤해도 자리를 지킨다.
"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { StickyTh, NumCell } from "./TableCells";
import {
  WARN_AT,
  buildBudgetTree,
  formatWon,
  inputClass,
  itemLabel,
  spentRatio,
  type BudgetItem,
  type BudgetNode,
  type BudgetUsage,
} from "./shared";

type Props = {
  fiscalYear: number;
  items: BudgetItem[];
  usage: BudgetUsage[];
};

const hit = (n: BudgetNode, q: string) => itemLabel(n).toLowerCase().includes(q);

const subtreeHit = (n: BudgetNode, q: string): boolean =>
  hit(n, q) || n.children.some((c) => subtreeHit(c, q));

const subtreeWarn = (n: BudgetNode): boolean =>
  spentRatio(n) >= WARN_AT || n.children.some(subtreeWarn);

export default function BudgetTree({ fiscalYear, items, usage }: Props) {
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
          <NumCell muted={!n.spent}>{n.spent ? formatWon(n.spent) : "-"}</NumCell>
          <NumCell muted={!n.pending} tone={n.pending ? "text-amber-600" : ""}>
            {n.pending ? formatWon(n.pending) : "-"}
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
        <span className="text-sm font-bold text-gray-800">
          {fiscalYear}년 예산안
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
