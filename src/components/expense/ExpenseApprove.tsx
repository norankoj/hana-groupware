// src/components/expense/ExpenseApprove.tsx
// 요청 리스트 (담당자) — 줄마다 비목을 배정하고 승인 · 반려 · 지급 처리
"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import { showConfirm } from "@/utils/alert";
import { ChevronDown, ChevronRight, Download, Paperclip } from "lucide-react";
import ConfirmModal, { ConfirmRow } from "@/components/fund/ConfirmModal";
import { DateField } from "@/components/fund/FundFields";
import BudgetItemPicker from "./BudgetItemPicker";
import ReceiptViewer, {
  collectReceipts,
  type ReceiptRef,
} from "./ReceiptViewer";
import { exportExpenseLines, toExportLines } from "./exportExcel";
import {
  STATUS_LABEL,
  STATUS_STYLE,
  accountText,
  availableAmount,
  btnStyles,
  flattenBudget,
  formatWon,
  itemLabel,
  majorLabels,
  requestTotal,
  resolveAccount,
  todayString,
  type BudgetItem,
  type BudgetUsage,
  type ExpenseRequest,
  type ExpenseUser,
} from "./shared";

type Props = {
  user: ExpenseUser;
  requests: ExpenseRequest[];
  budgetItems: BudgetItem[];
  usage: BudgetUsage[];
  onRefresh: () => void;
};

const STATUS_FILTERS = [
  { key: "pending", label: "처리대기" },
  { key: "approved", label: "승인됨" },
  { key: "paying", label: "이체중" },
  { key: "paid", label: "지급완료" },
  { key: "all", label: "전체" },
] as const;

type Filter = (typeof STATUS_FILTERS)[number]["key"];

export default function ExpenseApprove({
  user,
  requests,
  budgetItems,
  usage,
  onRefresh,
}: Props) {
  const supabase = createClient();

  const [filter, setFilter] = useState<Filter>("pending");
  // 청구는 한 건씩 오므로 기본으로 펴둔다 — 담은 것을 보려고 매번 누르지 않게
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ExpenseRequest | null>(null);
  const [payTarget, setPayTarget] = useState<ExpenseRequest | null>(null);
  /** 이체중 전체를 한꺼번에 지급완료 처리하는 중 */
  const [payAll, setPayAll] = useState(false);
  const [payDate, setPayDate] = useState(todayString());
  const [listing, setListing] = useState(false);
  // 영수증 미리보기 — 한 청구서의 영수증을 모두 모아 옆으로 넘긴다
  const [viewer, setViewer] = useState<{
    receipts: ReceiptRef[];
    at: number;
  } | null>(null);

  const options = useMemo(
    () => flattenBudget(budgetItems, usage),
    [budgetItems, usage],
  );

  // 최근에 배정한 비목 — 버튼으로 바로 고를 수 있게
  const recent = useMemo(() => {
    const byId = new Map(options.map((o) => [o.id, o]));
    const seen = new Set<string>();
    const list: typeof options = [];
    for (const r of requests) {
      for (const it of r.items ?? []) {
        if (!it.budget_item_id || seen.has(it.budget_item_id)) continue;
        const found = byId.get(it.budget_item_id);
        if (!found) continue;
        seen.add(it.budget_item_id);
        list.push(found);
        if (list.length >= 5) return list;
      }
    }
    return list;
  }, [requests, options]);

  const shown = useMemo(() => {
    const list =
      filter === "all" ? requests : requests.filter((r) => r.status === filter);
    // 처리대기가 늘 위로
    return [...list].sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return (b.request_date ?? "").localeCompare(a.request_date ?? "");
    });
  }, [requests, filter]);

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const payingCount = requests.filter((r) => r.status === "paying").length;
  const shownTotal = shown.reduce((sum, r) => sum + requestTotal(r.items ?? []), 0);

  /** 지금 걸러본 목록을 엑셀로 — 승인된 목록이 곧 이체할 목록이다 */
  const exportExcel = () => {
    const label =
      STATUS_FILTERS.find((f) => f.key === filter)?.label ?? "전체";
    exportExpenseLines(
      toExportLines(shown, majorLabels(options)),
      `지출결의_${label}_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const toggle = (id: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** 줄에 비목 배정 — 화면은 새로 불러와 잔액까지 함께 갱신한다 */
  const assign = async (itemId: string, budgetItemId: string | null) => {
    const { error } = await supabase
      .from("expense_request_items")
      .update({ budget_item_id: budgetItemId })
      .eq("id", itemId);

    if (error) return toast.error("비목 배정 실패: " + error.message);
    onRefresh();
  };

  /** 배정된 비목별로 이 청구가 가용 잔액을 넘기는지 — 넘겨도 막지 않고 알린다 */
  const overBudgetOf = (req: ExpenseRequest) => {
    const byBudget = new Map<string, number>();
    for (const it of req.items ?? []) {
      if (!it.budget_item_id) continue;
      byBudget.set(
        it.budget_item_id,
        (byBudget.get(it.budget_item_id) ?? 0) + it.amount,
      );
    }

    const over: string[] = [];
    for (const [id] of byBudget) {
      const node = options.find((o) => o.id === id);
      // 가용 잔액에는 이 청구(처리대기)가 이미 들어 있으므로 음수면 초과다
      if (node && availableAmount(node) < 0) over.push(itemLabel(node));
    }
    return over;
  };

  const approve = async (req: ExpenseRequest) => {
    const items = req.items ?? [];
    if (items.length === 0)
      return toast.error("청구 내역이 없는 결의서는 승인할 수 없습니다.");

    const unassigned = items.filter((i) => !i.budget_item_id);
    if (unassigned.length > 0)
      return toast.error(
        `비목이 배정되지 않은 줄이 ${unassigned.length}건 있습니다.`,
      );

    const over = overBudgetOf(req);
    if (over.length > 0) {
      const ok = await showConfirm(
        "예산을 넘깁니다",
        `${over.join(", ")}의 가용 잔액을 넘깁니다. 그대로 승인할까요?`,
      );
      if (!ok) return;
    }

    setBusyId(req.id);
    const { data, error } = await supabase
      .from("expense_requests")
      .update({
        status: "approved",
        handler_id: user.id,
        decided_at: new Date().toISOString(),
        result_seen: false,
      })
      .eq("id", req.id)
      .eq("status", "pending")
      .select("id");
    setBusyId(null);

    if (error) return toast.error("승인 실패: " + error.message);
    // 0건이면 그 사이 다른 담당자가 이미 처리했다는 뜻
    if (!data || data.length === 0) {
      toast.error("이미 처리된 청구입니다. 목록을 새로 불러옵니다.");
      return onRefresh();
    }
    toast.success("승인했습니다.");
    onRefresh();
  };

  const reject = async (reason: string) => {
    if (!rejectTarget) return;

    setBusyId(rejectTarget.id);
    const { data, error } = await supabase
      .from("expense_requests")
      .update({
        status: "rejected",
        reject_reason: reason,
        handler_id: user.id,
        decided_at: new Date().toISOString(),
        result_seen: false,
      })
      .eq("id", rejectTarget.id)
      .eq("status", "pending")
      .select("id");
    setBusyId(null);
    setRejectTarget(null);

    if (error) return toast.error("반려 실패: " + error.message);
    if (!data || data.length === 0) {
      toast.error("이미 처리된 청구입니다. 목록을 새로 불러옵니다.");
      return onRefresh();
    }
    toast.success("반려했습니다.");
    onRefresh();
  };

  /**
   * 이체 목록 만들기 — 지금 승인된 건들을 한꺼번에 '이체중'으로 넘기고
   * 엑셀을 내려준다. 은행에 들고 갈 목록을 여기서 확정하므로,
   * 그 뒤에 승인되는 건은 '승인됨'에 남아 섞이지 않는다.
   */
  const makePayoutList = async () => {
    const approved = requests.filter((r) => r.status === "approved");
    if (approved.length === 0) return;

    const total = approved.reduce(
      (sum, r) => sum + requestTotal(r.items ?? []),
      0,
    );
    const ok = await showConfirm(
      "이체 목록을 만들까요?",
      `승인된 ${approved.length}건 ${formatWon(total)}원이 '이체중'으로 넘어가고 엑셀이 내려갑니다. 이 목록을 은행에 들고 가세요.`,
      "만들기",
    );
    if (!ok) return;

    setListing(true);
    const { data, error } = await supabase
      .from("expense_requests")
      .update({
        status: "paying",
        payout_listed_at: new Date().toISOString(),
        handler_id: user.id,
      })
      .in(
        "id",
        approved.map((r) => r.id),
      )
      .eq("status", "approved")
      .select("id");
    setListing(false);

    if (error) return toast.error("이체 목록 실패: " + error.message);
    if (!data || data.length === 0) {
      toast.error("다른 담당자가 이미 목록을 만들었습니다.");
      return onRefresh();
    }

    // 실제로 넘어간 건만 엑셀에 담는다
    const moved = new Set(data.map((d) => d.id));
    exportExpenseLines(
      toExportLines(
        approved.filter((r) => moved.has(r.id)),
        majorLabels(options),
      ),
      `이체목록_${todayString()}.xlsx`,
    );

    toast.success(`${data.length}건을 이체 목록으로 넘겼습니다.`);
    setFilter("paying");
    onRefresh();
  };

  /** 이체중 → 지급완료. payTarget 이 없으면 이체중 전체를 한꺼번에 처리한다 */
  const pay = async () => {
    const targets = payTarget
      ? [payTarget]
      : requests.filter((r) => r.status === "paying");
    if (targets.length === 0) return;

    setBusyId(payTarget?.id ?? "bulk");
    const { data, error } = await supabase
      .from("expense_requests")
      .update({
        status: "paid",
        paid_at: payDate,
        handler_id: user.id,
        result_seen: false,
      })
      .in(
        "id",
        targets.map((r) => r.id),
      )
      .eq("status", "paying")
      .select("id");
    setBusyId(null);
    setPayTarget(null);
    setPayAll(false);

    if (error) return toast.error("지급 처리 실패: " + error.message);
    if (!data || data.length === 0) {
      toast.error("이미 처리된 청구입니다. 목록을 새로 불러옵니다.");
      return onRefresh();
    }
    toast.success(`${data.length}건을 지급완료로 기록했습니다.`);
    onRefresh();
  };

  /** 계좌가 틀려 못 보낸 건은 승인됨으로 돌려놓는다 */
  const undoPaying = async (req: ExpenseRequest) => {
    setBusyId(req.id);
    const { data, error } = await supabase
      .from("expense_requests")
      .update({ status: "approved", payout_listed_at: null })
      .eq("id", req.id)
      .eq("status", "paying")
      .select("id");
    setBusyId(null);

    if (error) return toast.error("되돌리기 실패: " + error.message);
    if (!data || data.length === 0) {
      toast.error("이미 처리된 청구입니다. 목록을 새로 불러옵니다.");
      return onRefresh();
    }
    toast.success("승인됨으로 되돌렸습니다.");
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* 상태 필터 · 엑셀 */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3.5 py-1.5 text-sm rounded-lg border transition cursor-pointer ${
              filter === f.key
                ? "border-blue-500 bg-blue-50 text-blue-700 font-bold"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {f.label}
            {f.key === "pending" && pendingCount > 0 && (
              <span className="ml-1.5 bg-red-100 text-red-600 px-1.5 rounded-full text-xs font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-3">
          {shown.length > 0 && (
            <span className="text-sm text-gray-500">
              {shown.length}건{" "}
              <b className="font-mono tabular-nums text-gray-900">
                {formatWon(shownTotal)}
              </b>
              원
            </span>
          )}
          <button
            type="button"
            onClick={exportExcel}
            disabled={shown.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Download size={15} /> 엑셀
          </button>
        </div>
      </div>

      {/* 이체 흐름 — 승인됨에서 목록을 확정하고, 이체중에서 일괄 지급 처리한다 */}
      {filter === "approved" && approvedCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 border border-blue-200 bg-blue-50/60 rounded-xl px-4 py-3">
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-900">
              승인된 {approvedCount}건을 은행에 들고 갈 목록으로 확정
            </p>
            <p className="mt-0.5 text-xs text-gray-600">
              엑셀이 함께 내려가고 이 건들은 <b>이체중</b>으로 넘어갑니다.
              이후 승인되는 건은 여기 섞이지 않습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={makePayoutList}
            disabled={listing}
            className="px-5 py-2.5 bg-[#2151EC] text-white font-bold rounded-lg hover:bg-[#1a43c9] transition text-sm shadow-md cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {listing ? "만드는 중..." : "이체 목록 만들기"}
          </button>
        </div>
      )}

      {filter === "paying" && payingCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 border border-indigo-200 bg-indigo-50/60 rounded-xl px-4 py-3">
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-900">
              은행 이체를 마치셨나요? {payingCount}건을 한 번에 기록
            </p>
            <p className="mt-0.5 text-xs text-gray-600">
              못 보낸 건은 그 건만 아래에서 <b>승인됨으로 되돌리기</b> 하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPayDate(todayString());
              setPayAll(true);
            }}
            className="px-5 py-2.5 bg-[#2151EC] text-white font-bold rounded-lg hover:bg-[#1a43c9] transition text-sm shadow-md cursor-pointer whitespace-nowrap"
          >
            전체 지급완료 기록
          </button>
        </div>
      )}

      {budgetItems.length === 0 && (
        <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-lg px-5 py-4">
          <p className="text-sm leading-relaxed text-amber-900">
            예산안이 등록되지 않아 비목을 배정할 수 없습니다. 예산안 시딩 SQL을
            먼저 실행해주세요.
          </p>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="border border-gray-200 rounded-xl bg-white py-14 text-center">
          <p className="text-sm text-gray-500">
            {filter === "pending"
              ? "처리할 청구가 없습니다."
              : "해당하는 청구가 없습니다."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((req) => {
            const items = req.items ?? [];
            const total = requestTotal(items);
            const assigned = items.filter((i) => !!i.budget_item_id).length;
            const isOpen = !collapsedIds.has(req.id);
            const busy = busyId === req.id;
            // 이 청구서의 영수증 전체 — 미리보기에서 옆으로 넘길 목록
            const allReceipts = collectReceipts(items);

            return (
              <div
                key={req.id}
                className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden"
              >
                {/* 헤더 */}
                <button
                  onClick={() => toggle(req.id)}
                  aria-expanded={isOpen}
                  className="w-full px-4 sm:px-5 py-3.5 flex items-center gap-3 text-left hover:bg-gray-50 transition cursor-pointer"
                >
                  <span className="shrink-0 text-gray-400">
                    {isOpen ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </span>
                  <span
                    className={`shrink-0 px-2 py-0.5 text-[11px] font-bold rounded border ${STATUS_STYLE[req.status]}`}
                  >
                    {STATUS_LABEL[req.status]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {req.title}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {req.requester?.full_name ?? "-"} · 청구{" "}
                      {req.request_date}
                      {/* 예전에 한 장으로 올린 묶음은 건수를 함께 보여준다 */}
                      {items.length > 1 && ` · ${items.length}건`}
                      {req.paid_at && ` · 이체 ${req.paid_at}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-gray-900 tabular-nums">
                      {formatWon(total)}
                    </p>
                    {req.status === "pending" && assigned < items.length && (
                      <p className="mt-0.5 text-[11px] font-medium text-amber-600">
                        비목 미배정
                        {items.length > 1 && ` ${items.length - assigned}건`}
                      </p>
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-200">
                    {/* 청구 줄 */}
                    <ul className="divide-y divide-gray-100">
                      {items.map((it) => {
                        const acc = resolveAccount(it, req);
                        const receipts = it.receipt_files ?? [];
                        return (
                          <li
                            key={it.id}
                            className="px-4 sm:px-5 py-3 bg-gray-50/40"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900">
                                  <span className="mr-2 text-xs text-gray-400 tabular-nums">
                                    {it.sort_order}
                                  </span>
                                  {it.item_name}
                                </p>
                                <p className="mt-0.5 text-xs text-gray-500">
                                  {it.qty > 1 &&
                                    `${it.qty} × ${formatWon(it.unit_price)} · `}
                                  {accountText(acc)}
                                  {it.purpose && ` · ${it.purpose}`}
                                </p>
                              </div>
                              <span className="shrink-0 text-sm font-bold text-gray-900 tabular-nums">
                                {formatWon(it.amount)}
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <BudgetItemPicker
                                items={budgetItems}
                                usage={usage}
                                options={options}
                                value={it.budget_item_id}
                                recent={recent}
                                // 잘못 배정한 비목은 승인·지급 뒤에도 고쳐야 한다
                                // (회계 정정). 반려·취소된 건만 잠근다.
                                disabled={
                                  req.status === "rejected" ||
                                  req.status === "cancelled"
                                }
                                onChange={(id) => assign(it.id, id)}
                              />
                              {receipts.map((f, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() =>
                                    setViewer({
                                      receipts: allReceipts,
                                      at: allReceipts.findIndex(
                                        (r) =>
                                          r.itemId === it.id && r.index === i,
                                      ),
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 bg-white text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-300 cursor-pointer max-w-[180px]"
                                >
                                  <Paperclip size={11} className="shrink-0" />
                                  <span className="truncate">{f.name}</span>
                                </button>
                              ))}
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {/* 처리 */}
                    <div className="px-4 sm:px-5 py-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-gray-500">
                        {req.status === "pending" &&
                          "모든 줄에 비목을 배정하면 승인할 수 있습니다."}
                        {req.status === "approved" &&
                          "승인됨 탭에서 이체 목록을 만들면 은행에 들고 갈 목록에 들어갑니다."}
                        {req.status === "paying" &&
                          `이체 목록 ${req.payout_listed_at?.slice(0, 10) ?? ""} · 은행 이체 후 지급완료를 기록해주세요.`}
                        {req.status === "rejected" &&
                          `반려 — ${req.reject_reason ?? ""}`}
                        {req.status === "paid" &&
                          `${req.handler?.full_name ?? ""} 처리 · 이체 ${req.paid_at}`}
                        {req.status === "cancelled" && "신청자가 취소했습니다."}
                      </p>
                      <div className="flex gap-2">
                        {req.status === "pending" && (
                          <>
                            <button
                              onClick={() => setRejectTarget(req)}
                              disabled={busy}
                              className={btnStyles.delete}
                            >
                              반려
                            </button>
                            <button
                              onClick={() => approve(req)}
                              disabled={busy || assigned !== items.length}
                              className={btnStyles.save}
                            >
                              {busy ? "처리 중..." : "승인"}
                            </button>
                          </>
                        )}
                        {req.status === "paying" && (
                          <>
                            <button
                              onClick={() => undoPaying(req)}
                              disabled={busy}
                              className={btnStyles.cancel}
                            >
                              승인됨으로 되돌리기
                            </button>
                            <button
                              onClick={() => {
                                setPayDate(todayString());
                                setPayTarget(req);
                              }}
                              disabled={busy}
                              className={btnStyles.save}
                            >
                              지급완료 기록
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewer && viewer.receipts.length > 0 && (
        <ReceiptViewer
          receipts={viewer.receipts}
          startAt={Math.max(viewer.at, 0)}
          onClose={() => setViewer(null)}
        />
      )}

      {/* 반려 사유 */}
      <ConfirmModal
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="청구를 반려할까요?"
        inputLabel="반려 사유"
        inputPlaceholder="예) 영수증이 첨부되지 않았습니다."
        multiline
        confirmText="반려"
        danger
        busy={busyId === rejectTarget?.id}
        onConfirm={reject}
      >
        {rejectTarget && (
          <div className="space-y-2">
            <ConfirmRow label="제목" value={rejectTarget.title} />
            <ConfirmRow
              label="신청자"
              value={rejectTarget.requester?.full_name ?? "-"}
            />
            <ConfirmRow
              label="합계"
              value={
                <b className="tabular-nums">
                  {formatWon(requestTotal(rejectTarget.items ?? []))}원
                </b>
              }
            />
            <p className="pt-1 text-xs text-gray-500">
              사유는 신청자에게 그대로 보입니다.
            </p>
          </div>
        )}
      </ConfirmModal>

      {/* 이체일자 — 단건과 전체를 같은 창에서 받는다 */}
      <ConfirmModal
        isOpen={!!payTarget || payAll}
        onClose={() => {
          setPayTarget(null);
          setPayAll(false);
        }}
        title="지급완료로 기록할까요?"
        confirmText="지급완료"
        busy={busyId === (payTarget?.id ?? "bulk")}
        onConfirm={pay}
      >
        <div className="space-y-3">
          {payTarget ? (
            <>
              <ConfirmRow label="제목" value={payTarget.title} />
              <ConfirmRow
                label="금액"
                value={
                  <b className="tabular-nums">
                    {formatWon(requestTotal(payTarget.items ?? []))}원
                  </b>
                }
              />
            </>
          ) : (
            <>
              <ConfirmRow label="대상" value={`이체중 ${payingCount}건 전체`} />
              <ConfirmRow
                label="합계"
                value={
                  <b className="tabular-nums">
                    {formatWon(
                      requests
                        .filter((r) => r.status === "paying")
                        .reduce(
                          (sum, r) => sum + requestTotal(r.items ?? []),
                          0,
                        ),
                    )}
                    원
                  </b>
                }
              />
            </>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              이체일자
            </label>
            <DateField value={payDate} onChange={setPayDate} />
          </div>
        </div>
      </ConfirmModal>
    </div>
  );
}
