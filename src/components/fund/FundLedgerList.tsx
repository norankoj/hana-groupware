// src/components/fund/FundLedgerList.tsx
// 전체 내역 — 연도별 집계표와 상세 목록 두 가지 보기
//
// 원장이 해마다 수백 건씩 늘어나므로 통째로 불러오지 않는다.
// 집계는 DB 뷰(fund_monthly_summary)가, 상세는 페이지 단위 조회가 담당한다.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Select from "@/components/Select";
import FundCorrectModal from "./FundCorrectModal";
import {
  ENTRY_TYPE_LABEL,
  formatWon,
  inputClass,
  selectClass,
  type FundLedger,
  type FundPayee,
} from "./shared";

type Props = {
  payees: FundPayee[];
  onRefresh: () => void;
};

type MonthlyRow = {
  payee_id: string;
  year: number;
  month: number;
  deposit: number;
  withdraw: number;
  entry_count: number;
};

const PAGE_SIZE = 50;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const MONTH_OPTIONS = MONTHS.map((m) => ({
  value: String(m),
  label: `${m}월`,
}));

const TYPE_FILTER = [
  { value: "all", label: "전체 구분" },
  { value: "deposit", label: "적립" },
  { value: "withdraw", label: "사용" },
];

const YEAR_OPTIONS = (() => {
  const now = new Date().getFullYear();
  return Array.from({ length: 8 }, (_, i) => ({
    value: String(now - i),
    label: `${now - i}년`,
  }));
})();

const pagerBtn =
  "px-4 py-2 text-sm font-bold bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

export default function FundLedgerList({ payees, onRefresh }: Props) {
  const supabase = createClient();
  const [view, setView] = useState<"summary" | "detail">("summary");
  const [year, setYear] = useState(String(new Date().getFullYear()));

  // ── 집계 ──
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));

  // ── 상세 ──
  const [typeFilter, setTypeFilter] = useState("all");
  const [payeeFilter, setPayeeFilter] = useState("all");
  const [rows, setRows] = useState<FundLedger[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [correctTarget, setCorrectTarget] = useState<FundLedger | null>(null);
  const [correctedIds, setCorrectedIds] = useState<Set<string>>(new Set());

  const payeeOptions = useMemo(
    () => [
      { value: "all", label: "전체 대상자" },
      ...payees.map((p) => ({ value: p.id, label: p.name })),
    ],
    [payees],
  );

  // ── 집계 불러오기 ──
  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    const { data, error } = await supabase
      .from("fund_monthly_summary")
      .select("*")
      .eq("year", Number(year));
    setLoadingSummary(false);
    if (error)
      return toast.error("집계를 불러오지 못했습니다: " + error.message);
    setMonthly((data as MonthlyRow[]) ?? []);
  }, [supabase, year]);

  // ── 상세 불러오기 (한 페이지씩) ──
  const fetchDetail = useCallback(async () => {
    setLoadingDetail(true);
    let q = supabase
      .from("fund_ledger")
      .select("*, payee:payee_id(name, kind)", { count: "exact" })
      .gte("entry_date", `${year}-01-01`)
      .lte("entry_date", `${year}-12-31`);

    if (typeFilter !== "all") q = q.eq("entry_type", typeFilter);
    if (payeeFilter !== "all") q = q.eq("payee_id", payeeFilter);

    const { data, count, error } = await q
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    setLoadingDetail(false);

    if (error)
      return toast.error("내역을 불러오지 못했습니다: " + error.message);

    const list = (data as FundLedger[]) ?? [];
    setRows(list);
    setTotal(count ?? 0);
    setCorrectedIds(
      new Set(list.map((l) => l.corrects_id).filter(Boolean) as string[]),
    );
  }, [supabase, year, typeFilter, payeeFilter, page]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (view === "detail") fetchDetail();
  }, [view, fetchDetail]);

  // 필터가 바뀌면 첫 페이지로
  useEffect(() => {
    setPage(0);
  }, [year, typeFilter, payeeFilter]);

  const reload = () => {
    fetchSummary();
    if (view === "detail") fetchDetail();
    onRefresh();
  };

  const handleCorrect = async (reason: string, newAmount: number | null) => {
    const row = correctTarget;
    if (!row) return;

    setBusyId(row.id);
    const { error } = await supabase.rpc("fund_correct_entry", {
      p_entry_id: row.id,
      p_reason: reason,
      p_new_amount: newAmount,
    });
    setBusyId(null);
    setCorrectTarget(null);

    if (error) return toast.error("정정 실패: " + error.message);
    toast.success(
      newAmount
        ? `${formatWon(newAmount)}원으로 정정했습니다.`
        : "취소 처리했습니다. 합계에서 빠집니다.",
    );
    reload();
  };

  // ── 집계 데이터 ──
  // 합계는 모두 검색 결과 기준이다 — 화면에 보이는 줄과 숫자가 어긋나면 안 되므로.
  const summary = useMemo(() => {
    const byPayee = new Map<string, Map<number, MonthlyRow>>();
    for (const m of monthly) {
      if (!byPayee.has(m.payee_id)) byPayee.set(m.payee_id, new Map());
      byPayee.get(m.payee_id)!.set(m.month, m);
    }

    const kw = keyword.trim().toLowerCase();
    const matches = (name: string) => !kw || name.toLowerCase().includes(kw);

    // 사람별 연 합계 — 그 해 기록이 있거나 지금 쓰고 있는 대상자
    const yearly = payees
      .filter((p) => byPayee.has(p.id) || p.is_active)
      .filter((p) => matches(p.name))
      .map((p) => {
        const months = byPayee.get(p.id) ?? new Map<number, MonthlyRow>();
        let deposit = 0;
        let withdraw = 0;
        months.forEach((m) => {
          deposit += m.deposit;
          withdraw += m.withdraw;
        });
        return { payee: p, deposit, withdraw };
      })
      .sort((a, b) => {
        if (a.payee.is_active !== b.payee.is_active)
          return a.payee.is_active ? -1 : 1;
        return a.payee.name.localeCompare(b.payee.name, "ko");
      });

    // 그 달 점검 — 매달 적립이 들어와야 하는 '사역자'만 본다
    const mo = Number(month);
    const check = payees
      .filter((p) => p.kind === "person" && p.is_active)
      .filter((p) => matches(p.name))
      .map((p) => ({
        payee: p,
        amount: byPayee.get(p.id)?.get(mo)?.deposit ?? 0,
      }))
      .sort((a, b) => a.payee.name.localeCompare(b.payee.name, "ko"));

    const done = check.filter((c) => c.amount > 0);
    const missing = check.filter((c) => c.amount === 0);

    return {
      yearly,
      done,
      missing,
      monthTotal: done.reduce((s, c) => s + c.amount, 0),
      depositTotal: yearly.reduce((s, r) => s + r.deposit, 0),
      withdrawTotal: yearly.reduce((s, r) => s + r.withdraw, 0),
    };
  }, [monthly, payees, keyword, month]);

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="space-y-4">
      {/* 보기 전환 + 연도 + 필터 */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-stretch">
        <div className="inline-flex bg-white border border-gray-300 rounded-lg overflow-hidden shrink-0">
          {(
            [
              ["summary", "집계"],
              ["detail", "상세"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`px-6 py-2.5 text-sm font-bold transition cursor-pointer ${
                view === key
                  ? "bg-[#2151EC] text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-32">
          <Select
            value={year}
            onChange={setYear}
            options={YEAR_OPTIONS}
            className={selectClass}
          />
        </div>

        {view === "summary" && (
          <>
            <div className="w-full sm:w-28">
              <Select
                value={month}
                onChange={setMonth}
                options={MONTH_OPTIONS}
                className={selectClass}
              />
            </div>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="대상자 이름 검색"
              className={`${inputClass} flex-1`}
            />
          </>
        )}

        {view === "detail" && (
          <>
            <div className="w-full sm:w-40">
              <Select
                value={typeFilter}
                onChange={setTypeFilter}
                options={TYPE_FILTER}
                className={selectClass}
              />
            </div>
            <div className="w-full sm:w-48">
              <Select
                value={payeeFilter}
                onChange={setPayeeFilter}
                options={payeeOptions}
                className={selectClass}
              />
            </div>
            <div className="flex items-center justify-center bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-500 whitespace-nowrap">
              총&nbsp;<b className="text-gray-700">{total}</b>건
            </div>
          </>
        )}
      </div>

      {/* 그 해 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
        <TotalCell label={`${year}년 적립`} value={summary.depositTotal} />
        <TotalCell
          label={`${year}년 사용`}
          value={summary.withdrawTotal}
          muted
        />
        <TotalCell
          label={`${year}년 적립 − 사용`}
          value={summary.depositTotal - summary.withdrawTotal}
        />
        <div className="bg-white px-4 py-4">
          <p className="text-xs font-medium text-gray-500">
            {month}월 적립한 사람
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">
            {summary.done.length}
            <span className="ml-0.5 text-sm font-semibold text-gray-400">
              / {summary.done.length + summary.missing.length}명
            </span>
          </p>
        </div>
      </div>

      {view === "summary" ? (
        /* ── 월별 점검 + 사람별 합계 ── */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 그 달에 적립한 사람 — 적립은 선택이므로 없는 쪽은 문제가 아니다 */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[430px] sm:h-[490px]">
            <div className="px-4 sm:px-5 py-3 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between gap-2 shrink-0">
              <h3 className="text-base font-bold text-gray-800">
                {year}년 {month}월 적립
              </h3>
              <span className="text-sm text-gray-500 tabular-nums">
                {formatWon(summary.monthTotal)}원
              </span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {loadingSummary ? (
                <div className="py-16 text-center text-sm text-gray-400">
                  불러오는 중...
                </div>
              ) : summary.done.length + summary.missing.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-400">
                  해당하는 대상자가 없습니다.
                </div>
              ) : (
                <>
                  {summary.done.length > 0 && (
                    <>
                      <div className="px-4 sm:px-5 py-2 bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-600">
                        적립함 {summary.done.length}명
                      </div>
                      {summary.done.map(({ payee, amount }) => (
                        <div
                          key={payee.id}
                          className="px-4 sm:px-5 py-2.5 flex items-center justify-between border-b border-gray-100"
                        >
                          <span className="text-sm font-medium text-gray-900">
                            {payee.name}
                          </span>
                          <span className="text-sm tabular-nums font-medium text-gray-900">
                            {formatWon(amount)}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                  {summary.missing.length > 0 && (
                    <>
                      <div className="px-4 sm:px-5 py-2 bg-gray-50 border-y border-gray-200 text-xs font-bold text-gray-400">
                        이 달 내역 없음 {summary.missing.length}명
                      </div>
                      {summary.missing.map(({ payee }) => (
                        <div
                          key={payee.id}
                          className="px-4 sm:px-5 py-2.5 flex items-center justify-between border-b border-gray-100 last:border-0"
                        >
                          <span className="text-sm text-gray-400">
                            {payee.name}
                          </span>
                          <span className="text-sm text-gray-300">·</span>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 그 해 사람별 합계 */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[430px] sm:h-[490px]">
            <div className="px-4 sm:px-5 py-3 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between gap-2 shrink-0">
              <h3 className="text-base font-bold text-gray-800">
                {year}년 사람별 합계
              </h3>
              <span className="text-sm text-gray-500">
                {summary.yearly.length}명
              </span>
            </div>
            <div className="flex-1 overflow-auto custom-scrollbar">
              {summary.yearly.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-400">
                  {year}년 내역이 없습니다.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                      <th className="text-left px-4 py-2.5 font-bold">
                        대상자
                      </th>
                      <th className="text-right px-4 py-2.5 font-bold">적립</th>
                      <th className="text-right px-4 py-2.5 font-bold">사용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.yearly.map(({ payee, deposit, withdraw }) => (
                      <tr
                        key={payee.id}
                        className="border-b border-gray-100 last:border-0"
                      >
                        <td
                          className={`px-4 py-2.5 font-medium whitespace-nowrap ${
                            payee.is_active ? "text-gray-900" : "text-gray-400"
                          }`}
                        >
                          {payee.name}
                          {!payee.is_active && (
                            <span className="ml-1.5 text-[11px] text-gray-400">
                              (사용 안 함)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold text-gray-900">
                          {deposit ? formatWon(deposit) : "·"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-orange-700">
                          {withdraw ? formatWon(withdraw) : "·"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ── 상세 목록 ── */
        <>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[430px] sm:h-[490px]">
            <div className="flex-1 overflow-auto custom-scrollbar">
              {loadingDetail ? (
                <div className="py-16 text-center text-sm text-gray-400">
                  불러오는 중...
                </div>
              ) : rows.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-400">
                  해당하는 내역이 없습니다.
                </div>
              ) : (
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                      <th className="text-left px-4 py-3 font-bold">일자</th>
                      <th className="text-left px-4 py-3 font-bold">대상자</th>
                      <th className="text-left px-4 py-3 font-bold">구분</th>
                      <th className="text-left px-4 py-3 font-bold">적요</th>
                      <th className="text-left px-4 py-3 font-bold">내용</th>
                      <th className="text-right px-4 py-3 font-bold">금액</th>
                      <th className="text-right px-4 py-3 font-bold">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const isCorrection = !!row.corrects_id;
                      const alreadyCorrected = correctedIds.has(row.id);
                      const fromRequest = !!row.request_id;
                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-gray-100 last:border-0 ${
                            isCorrection ? "bg-amber-50/50" : ""
                          }`}
                        >
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                            {row.entry_date}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                            {row.payee?.name ?? "-"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 text-[11px] font-bold rounded border ${
                                row.entry_type === "withdraw"
                                  ? "bg-orange-50 text-orange-700 border-orange-200"
                                  : "bg-blue-50 text-blue-700 border-blue-200"
                              }`}
                            >
                              {ENTRY_TYPE_LABEL[row.entry_type]}
                            </span>
                          </td>
                          <td className="px-4 py-3 max-w-[180px]">
                            <span className="block truncate text-gray-700">
                              {row.note || "-"}
                            </span>
                          </td>
                          <td className="px-4 py-3 max-w-[280px]">
                            <span className="block truncate text-gray-800">
                              {row.description || "-"}
                            </span>
                            {isCorrection && (
                              <span className="text-[11px] font-bold text-amber-700">
                                정정 내역
                              </span>
                            )}
                            {alreadyCorrected && (
                              <span className="text-[11px] font-bold text-gray-400">
                                정정됨
                              </span>
                            )}
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums font-bold whitespace-nowrap ${
                              row.amount < 0 ? "text-red-600" : "text-gray-900"
                            }`}
                          >
                            {row.amount < 0 ? "−" : ""}
                            {formatWon(Math.abs(row.amount))}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {isCorrection || alreadyCorrected ? (
                              <span className="text-xs text-gray-400">-</span>
                            ) : fromRequest ? (
                              <span
                                className="text-xs text-gray-400"
                                title="신청을 거쳐 이체된 내역입니다."
                              >
                                신청 건
                              </span>
                            ) : (
                              <button
                                onClick={() => setCorrectTarget(row)}
                                disabled={busyId === row.id}
                                className="px-3 py-1.5 text-xs font-bold text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 disabled:opacity-60 cursor-pointer"
                              >
                                정정
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loadingDetail}
                className={pagerBtn}
              >
                이전
              </button>
              <span className="text-gray-600 tabular-nums">
                {page + 1} / {lastPage + 1} 쪽
              </span>
              <button
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                disabled={page >= lastPage || loadingDetail}
                className={pagerBtn}
              >
                다음
              </button>
            </div>
          )}
        </>
      )}

      <FundCorrectModal
        target={correctTarget}
        busy={!!correctTarget && busyId === correctTarget.id}
        onClose={() => setCorrectTarget(null)}
        onConfirm={handleCorrect}
      />
    </div>
  );
}

const TotalCell = ({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) => (
  <div className="bg-white px-4 py-4">
    <p className="text-xs font-medium text-gray-500">{label}</p>
    <p
      className={`mt-1 text-lg font-bold tabular-nums ${muted ? "text-gray-500" : "text-gray-900"}`}
    >
      {formatWon(value)}
    </p>
  </div>
);
