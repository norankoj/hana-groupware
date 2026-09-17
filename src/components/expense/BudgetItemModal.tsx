// src/components/expense/BudgetItemModal.tsx
// 비목 배정 팝업 — 대항목 → 소항목 → 비목을 옆으로 파고들며 고른다.
// 검색하면 세 단계를 한 목록으로 펴서 보여준다.
//
// 키보드: ↑↓ 목록 이동 · → 하위로 · ← 상위로 · Enter 배정 · Esc 닫기
"use client";

import { useMemo, useState } from "react";
import { ChevronRight, CornerDownLeft, Search, X } from "lucide-react";
import Modal from "@/components/Modal";
import {
  WARN_AT,
  availableAmount,
  btnStyles,
  buildBudgetTree,
  flattenBudget,
  formatWon,
  inputClass,
  itemLabel,
  spentRatio,
  withdrawLabel,
  type BudgetItem,
  type BudgetNode,
  type BudgetUsage,
  type WithdrawAccount,
} from "./shared";

// 부모는 열릴 때만 이 컴포넌트를 마운트한다 — 그래야 열 때마다
// 상태가 새로 시작되고, 초기화 effect를 둘 필요가 없다.
type Props = {
  onClose: () => void;
  items: BudgetItem[];
  usage: BudgetUsage[];
  /** 지금 배정된 비목 — 열 때 그 자리로 이동한다 */
  value: string | null;
  /** 지금 정해진 출금계좌 — 비워두면 고른 비목의 기본값을 쓴다 */
  withdrawValue?: string | null;
  accounts: WithdrawAccount[];
  onPick: (budgetItemId: string, withdrawCode: string | null) => void;
};

const LEVEL_TITLE = ["대항목", "소항목", "비목"];

export default function BudgetItemModal({
  onClose,
  items,
  usage,
  value,
  withdrawValue = null,
  accounts,
  onPick,
}: Props) {
  const roots = useMemo(() => buildBudgetTree(items, usage), [items, usage]);
  const flat = useMemo(() => flattenBudget(items, usage), [items, usage]);

  const byId = useMemo(() => {
    const map = new Map<string, BudgetNode>();
    const walk = (n: BudgetNode) => {
      map.set(n.id, n);
      n.children.forEach(walk);
    };
    roots.forEach(walk);
    return map;
  }, [roots]);

  /** 이미 배정된 비목이 있으면 그 자리에서 시작한다 */
  const start = useMemo(() => {
    if (!value || !byId.has(value))
      return { trail: [roots[0]?.id ?? null, null, null], col: 0 };

    // 배정된 항목에서 위로 올라가며 경로를 만든다
    const path: string[] = [];
    let cursor: BudgetItem | undefined = byId.get(value);
    while (cursor) {
      path.unshift(cursor.id);
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
    }
    return {
      trail: [path[0] ?? null, path[1] ?? null, path[2] ?? null],
      col: Math.max(0, path.length - 1),
    };
    // 마운트할 때 한 번만 계산한다 (열려 있는 동안 value 는 바뀌지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 각 단계에서 고른 항목 id. [대항목, 소항목, 비목] */
  const [trail, setTrail] = useState<(string | null)[]>(start.trail);
  /** 방향키가 움직이는 열 */
  const [focusCol, setFocusCol] = useState(start.col);
  const [query, setQuery] = useState("");
  /** 작은 화면에서 지금 보이는 열 */
  const [mobileCol, setMobileCol] = useState(start.col);
  const [searchAt, setSearchAt] = useState(0);
  /**
   * 출금계좌. null 이면 '고른 비목의 기본값을 따른다'는 뜻이고,
   * 손으로 바꾸면 그 값이 비목을 바꿔도 유지된다.
   */
  const [withdraw, setWithdraw] = useState<string | null>(withdrawValue);
  const [withdrawTouched, setWithdrawTouched] = useState(false);

  const searching = query.trim().length > 0;

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return flat
      .filter(
        (o) =>
          itemLabel(o).toLowerCase().includes(q) ||
          o.path.toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [flat, query]);

  /** 각 열에 보여줄 목록 */
  const columns: BudgetNode[][] = useMemo(() => {
    const col0 = roots;
    const col1 = trail[0] ? (byId.get(trail[0])?.children ?? []) : [];
    const col2 = trail[1] ? (byId.get(trail[1])?.children ?? []) : [];
    return [col0, col1, col2];
  }, [roots, trail, byId]);

  /** 지금 배정하려는 항목 = 마지막으로 고른 것 */
  const selectedId = trail[2] ?? trail[1] ?? trail[0] ?? null;
  const selected = selectedId ? byId.get(selectedId) : null;

  const pickInColumn = (col: number, node: BudgetNode) => {
    const next: (string | null)[] = [...trail];
    next[col] = node.id;
    for (let i = col + 1; i < 3; i++) next[i] = null;
    setTrail(next);
    setFocusCol(col);
    // 하위가 있으면 작은 화면에서는 그 열로 넘어간다
    if (node.children.length > 0) setMobileCol(Math.min(col + 1, 2));
  };

  /** 손으로 고치지 않았으면 고른 비목의 기본 계좌를 따라간다 */
  const effectiveWithdraw = (id: string | null) =>
    withdrawTouched
      ? withdraw
      : ((id ? byId.get(id)?.withdraw_code : null) ?? withdraw);

  const confirm = (id?: string) => {
    const target = id ?? selectedId;
    if (!target) return;
    onPick(target, effectiveWithdraw(target));
    onClose();
  };

  // 방향키 — 옆으로 이동해 비목까지 파고든다
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;

    if (searching) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSearchAt((i) => Math.min(i + 1, searchResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSearchAt((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && searchResults[searchAt]) {
        e.preventDefault();
        confirm(searchResults[searchAt].id);
      }
      return;
    }

    const list = columns[focusCol];
    const currentId = trail[focusCol];
    const at = list.findIndex((n) => n.id === currentId);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = list[Math.min(at + 1, list.length - 1)] ?? list[0];
      if (next) pickInColumn(focusCol, next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = list[Math.max(at - 1, 0)];
      if (next) pickInColumn(focusCol, next);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const node = currentId ? byId.get(currentId) : null;
      if (node?.children.length) {
        const first = node.children[0];
        const target = Math.min(focusCol + 1, 2);
        const next: (string | null)[] = [...trail];
        next[target] = first.id;
        for (let i = target + 1; i < 3; i++) next[i] = null;
        setTrail(next);
        setFocusCol(target);
        setMobileCol(target);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const target = Math.max(focusCol - 1, 0);
      setFocusCol(target);
      setMobileCol(target);
    } else if (e.key === "Enter") {
      e.preventDefault();
      confirm();
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="비목 배정"
      className="sm:max-w-[900px]"
      bodyClassName="p-0 flex flex-col min-h-0"
      footer={
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 w-full">
          {/* 출금계좌 — 비목을 고르면 그 비목의 계좌가 따라오고, 여기서 바꿀 수 있다 */}
          <div className="w-full sm:w-[190px] shrink-0 order-2 sm:order-1">
            <label
              htmlFor="withdraw-select"
              className="block text-[11px] font-bold text-gray-500 mb-1"
            >
              출금계좌
              {!withdrawTouched && selected?.withdraw_code && (
                <span className="ml-1.5 font-normal text-[#2151EC]">
                  비목 기본값
                </span>
              )}
            </label>
            <select
              id="withdraw-select"
              value={effectiveWithdraw(selectedId) ?? ""}
              onChange={(e) => {
                setWithdraw(e.target.value || null);
                setWithdrawTouched(true);
              }}
              className={`w-full bg-white border rounded-lg px-3 py-2 text-sm outline-none cursor-pointer ${
                effectiveWithdraw(selectedId)
                  ? "border-gray-300"
                  : "border-amber-300 bg-amber-50 text-amber-800"
              }`}
            >
              <option value="">미지정</option>
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {withdrawLabel(a)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-0 order-1 sm:order-2">
            {selected ? (
              <>
                <p className="text-[11px] text-gray-400 truncate">
                  {flat.find((o) => o.id === selected.id)?.path || "대항목"}
                </p>
                <p className="text-sm font-bold text-gray-900 truncate">
                  {itemLabel(selected)}
                  <LevelTag level={selected.level} />
                </p>
                <p className="text-[11px] text-gray-500">
                  가용{" "}
                  <b
                    className={`font-mono tabular-nums ${
                      availableAmount(selected) < 0
                        ? "text-red-600"
                        : "text-gray-700"
                    }`}
                  >
                    {formatWon(availableAmount(selected))}
                  </b>
                  <span className="mx-1.5 text-gray-300">·</span>
                  확정{" "}
                  <b className="font-mono tabular-nums text-gray-700">
                    {formatWon(selected.spent)}
                  </b>
                  {selected.pending > 0 && (
                    <>
                      <span className="mx-1.5 text-gray-300">·</span>
                      <span className="text-amber-600">
                        대기{" "}
                        <b className="font-mono tabular-nums">
                          {formatWon(selected.pending)}
                        </b>
                      </span>
                    </>
                  )}
                  <span className="mx-1.5 text-gray-300">·</span>
                  계획{" "}
                  <b className="font-mono tabular-nums text-gray-700">
                    {formatWon(selected.planned_amount)}
                  </b>
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400">배정할 항목을 골라주세요</p>
            )}
          </div>
          <div className="flex gap-2 order-3 shrink-0">
            <button onClick={onClose} className={btnStyles.cancel}>
              닫기
            </button>
            {/* btnStyles.cancel 에만 최소 너비가 있어 그대로 두면 두 버튼 크기가 어긋난다 */}
            <button
              onClick={() => confirm()}
              disabled={!selectedId}
              className={`${btnStyles.save} sm:min-w-[80px]`}
            >
              배정
            </button>
          </div>
        </div>
      }
    >
      {/* 검색 */}
      <div className="px-4 py-3 border-b border-gray-200 shrink-0">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            id="budget-modal-search"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchAt(0); // 검색어가 바뀌면 첫 항목부터
            }}
            onKeyDown={onKeyDown}
            placeholder="코드나 이름으로 바로 찾기 (예: 4930, 소모품)"
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
        <p className="mt-1.5 text-xs text-gray-400">
          방향키 ↑↓ 이동 · → 하위로 · ← 상위로 · Enter 배정
        </p>
      </div>

      {searching ? (
        /* ── 검색 결과 — 세 단계를 한 목록으로 ── */
        <ul className="h-[clamp(300px,50vh,460px)] overflow-y-auto">
          {searchResults.length === 0 && (
            <li className="py-16 text-center text-sm text-gray-400">
              맞는 항목이 없습니다.
            </li>
          )}
          {searchResults.map((o, i) => (
            <li key={o.id}>
              <button
                type="button"
                onMouseEnter={() => setSearchAt(i)}
                onClick={() => confirm(o.id)}
                className={`w-full pl-3 pr-4 py-2.5 text-left border-b border-gray-100 border-l-2 cursor-pointer ${
                  i === searchAt
                    ? "border-l-[#2151EC] bg-blue-50"
                    : "border-l-transparent hover:bg-gray-50"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className={`min-w-0 text-sm break-keep ${
                      i === searchAt
                        ? "font-bold text-[#1a43c9]"
                        : "font-medium text-gray-900"
                    }`}
                  >
                    {o.code && (
                      <span className="mr-1.5 font-mono text-xs font-normal text-gray-400 tabular-nums">
                        {o.code}
                      </span>
                    )}
                    {o.name}
                    <LevelTag level={o.level} />
                  </span>
                  <span className="shrink-0 flex items-baseline gap-2.5">
                    <Available node={o} />
                    <SpentPct pct={spentRatio(o)} />
                  </span>
                </div>
                {o.path && (
                  <p className="mt-0.5 text-[11px] text-gray-400 truncate">
                    {o.path}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          {/* ── 작은 화면: 한 열씩 + 되돌아가기 ── */}
          <div className="sm:hidden flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50">
            {mobileCol > 0 && (
              <button
                type="button"
                onClick={() => setMobileCol((c) => Math.max(c - 1, 0))}
                className="flex items-center gap-1 text-xs font-medium text-[#2151EC] cursor-pointer"
              >
                <CornerDownLeft size={13} /> 상위로
              </button>
            )}
            <span className="text-xs font-bold text-gray-600">
              {LEVEL_TITLE[mobileCol]}
            </span>
          </div>

          {/* ── 3단 열 ── */}
          <div className="flex-1 min-h-0 grid sm:grid-cols-3 divide-x divide-gray-200">
            {columns.map((list, col) => (
              <div
                key={col}
                className={`${col === mobileCol ? "flex" : "hidden"} sm:flex flex-col min-h-0`}
              >
                {/* 방향키가 지금 어느 열에 있는지 머리글로 알려준다 */}
                <div
                  className={`hidden sm:flex items-center justify-between px-3 py-2 border-b shrink-0 text-[11px] font-bold ${
                    focusCol === col
                      ? "border-blue-200 bg-blue-50 text-[#2151EC]"
                      : "border-gray-200 bg-gray-50 text-gray-500"
                  }`}
                >
                  <span>{LEVEL_TITLE[col]}</span>
                  {list.length > 0 && (
                    <span className="font-mono tabular-nums opacity-60">
                      {list.length}
                    </span>
                  )}
                </div>
                <ul className="h-[clamp(300px,50vh,460px)] overflow-y-auto">
                  {list.length === 0 ? (
                    <li className="px-3 py-8 text-center text-xs text-gray-300">
                      {col === 0 ? "예산안이 없습니다" : "하위 항목이 없습니다"}
                    </li>
                  ) : (
                    list.map((n) => {
                      const picked = trail[col] === n.id;
                      const pct = spentRatio(n);
                      return (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => pickInColumn(col, n)}
                            onDoubleClick={() => confirm(n.id)}
                            aria-current={picked}
                            className={`w-full pl-2.5 pr-3 py-2.5 text-left border-b border-gray-100 border-l-2 cursor-pointer transition ${
                              picked
                                ? "border-l-[#2151EC] bg-blue-50"
                                : "border-l-transparent hover:bg-gray-50"
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`min-w-0 flex-1 text-[13px] leading-snug break-keep ${
                                  picked
                                    ? "font-bold text-[#1a43c9]"
                                    : "font-medium text-gray-900"
                                }`}
                              >
                                {n.code && (
                                  <span className="mr-1.5 font-mono text-[11px] font-normal text-gray-400 tabular-nums">
                                    {n.code}
                                  </span>
                                )}
                                {n.name}
                              </span>
                              {n.children.length > 0 && (
                                <ChevronRight
                                  size={14}
                                  className={`shrink-0 ${picked ? "text-[#2151EC]" : "text-gray-300"}`}
                                />
                              )}
                            </div>
                            {/* 0.5px 바는 이 크기에서 읽히지 않아 숫자로만 보여준다 */}
                            <div className="mt-1 flex items-baseline justify-between gap-2">
                              <Available node={n} />
                              <SpentPct pct={pct} />
                            </div>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

const LevelTag = ({ level }: { level: number }) => (
  <span className="ml-1.5 text-[10px] text-gray-400 border border-gray-200 rounded px-1">
    {LEVEL_TITLE[level - 1]}
  </span>
);

/**
 * 가용 잔액 — 처리대기 금액까지 뺀 값.
 * 대기중인 청구가 있으면 얼마가 잡혀 있는지 함께 보여준다.
 */
const Available = ({
  node,
}: {
  node: { planned_amount: number; spent: number; pending: number };
}) => {
  const left = availableAmount(node);
  return (
    <span className="min-w-0 truncate text-[11px] text-gray-400">
      가용{" "}
      <b
        className={`font-mono tabular-nums font-semibold ${
          left < 0 ? "text-red-600" : "text-gray-600"
        }`}
      >
        {formatWon(left)}
      </b>
      {node.pending > 0 && (
        <span className="ml-1 text-amber-600">
          (대기 <span className="font-mono tabular-nums">{formatWon(node.pending)}</span>)
        </span>
      )}
    </span>
  );
};

/** 소진율 — 80% 넘으면 주의, 100% 넘으면 초과 */
const SpentPct = ({ pct }: { pct: number }) => (
  <span
    className={`shrink-0 font-mono text-[11px] tabular-nums ${
      pct >= 100
        ? "text-red-600 font-bold"
        : pct >= WARN_AT
          ? "text-amber-700 font-semibold"
          : "text-gray-300"
    }`}
  >
    {Math.round(pct)}%
  </span>
);
