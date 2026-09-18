// src/components/expense/ExpenseApprove.tsx
// 요청 리스트 (담당자) — 줄마다 비목을 배정하고 승인 · 반려 · 지급 처리
"use client";

import { Fragment, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import { showConfirm } from "@/utils/alert";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import ConfirmModal, { ConfirmRow } from "@/components/fund/ConfirmModal";
import { AmountField, DateField } from "@/components/fund/FundFields";
import AdjustmentHistory from "./AdjustmentHistory";
import ReceiptThumbs from "./ReceiptThumbs";
import Modal from "@/components/Modal";
import BudgetItemPicker from "./BudgetItemPicker";
import ReceiptViewer, {
  collectReceipts,
  type ReceiptRef,
} from "./ReceiptViewer";
import {
  exportExpenseLines,
  exportPayoutList,
  toExportLines,
} from "./exportExcel";
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
  netPaid,
  parseAmount,
  ADJ_LABEL,
  requestTotal,
  resolveAccount,
  todayString,
  type BudgetFlat,
  type BudgetItem,
  type BudgetUsage,
  type ExpenseAdjustment,
  type ExpenseRequest,
  type ExpenseRequestItem,
  type ExpenseUser,
  type WithdrawAccount,
} from "./shared";

type Props = {
  user: ExpenseUser;
  requests: ExpenseRequest[];
  budgetItems: BudgetItem[];
  usage: BudgetUsage[];
  withdrawAccounts: WithdrawAccount[];
  onRefresh: () => void;
};

const STATUS_FILTERS = [
  { key: "pending", label: "처리대기" },
  { key: "approved", label: "승인됨" },
  { key: "paying", label: "이체중" },
  { key: "paid", label: "지급완료" },
] as const;

type Filter = (typeof STATUS_FILTERS)[number]["key"];

export default function ExpenseApprove({
  user,
  requests,
  budgetItems,
  usage,
  withdrawAccounts,
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
  /** 이체 목록 만들기 확인창 — 은행이 처리할 예정일자를 함께 받는다 */
  const [listOpen, setListOpen] = useState(false);
  const [listDate, setListDate] = useState(todayString());
  // 영수증 미리보기 — 한 청구서의 영수증을 모두 모아 옆으로 넘긴다
  const [viewer, setViewer] = useState<{
    receipts: ReceiptRef[];
    at: number;
  } | null>(null);

  const options = useMemo(
    () => flattenBudget(budgetItems, usage),
    [budgetItems, usage],
  );

  /** 연도별 예산안 — 청구는 제 연도(청구일자 기준)의 비목에만 배정한다 */
  const byYear = useMemo(() => {
    const m = new Map<
      number,
      { items: BudgetItem[]; usage: BudgetUsage[]; options: BudgetFlat[] }
    >();
    for (const y of new Set(budgetItems.map((i) => i.fiscal_year))) {
      const it = budgetItems.filter((i) => i.fiscal_year === y);
      const us = usage.filter((u) => u.fiscal_year === y);
      m.set(y, { items: it, usage: us, options: flattenBudget(it, us) });
    }
    return m;
  }, [budgetItems, usage]);
  const EMPTY_YEAR = { items: [], usage: [], options: [] };

  const shown = useMemo(() => {
    const list = requests.filter((r) => r.status === filter);
    // 처리대기가 늘 위로
    return [...list].sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return (b.request_date ?? "").localeCompare(a.request_date ?? "");
    });
  }, [requests, filter]);

/** 정정까지 반영한 청구 한 건의 지급액 — 예산 확정지출과 같은 기준 */
  const requestNet = (r: ExpenseRequest) =>
    (r.items ?? []).reduce((t, i) => t + netPaid(i), 0);
  const adjustCount = (r: ExpenseRequest) =>
    (r.items ?? []).reduce((t, i) => t + (i.adjustments ?? []).length, 0);
  const hasAdjustment = (r: ExpenseRequest) =>
    (r.items ?? []).some((i) => (i.adjustments ?? []).length > 0);
  /** "2026-09-18" → "금" */
  const weekdayOf = (d: string) => {
    const t = new Date(`${d}T00:00:00`);
    return isNaN(t.getTime()) ? "" : "일월화수목금토"[t.getDay()];
  };

  /** 지급완료는 건이 많아 이체일자로 묶어 보여준다 */
  const paidGroups = useMemo(() => {
    const m = new Map<string, ExpenseRequest[]>();
    for (const r of shown) {
      if (r.status !== "paid") continue;
      const key = r.paid_at ?? "이체일자 없음";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [shown]);
  const [openDates, setOpenDates] = useState<Set<string>>(new Set());
  /** 지급완료 표에서 '상세'로 연 한 건 — 비목 수정처럼 가끔 하는 일만 팝업에서 */
  const [detailId, setDetailId] = useState<string | null>(null);
  // 새로 불러온 목록에서 찾아야 정정 뒤에도 최신 내용이 보인다
  const detailReq = detailId ? requests.find((x) => x.id === detailId) ?? null : null;
  const toggleDate = (d: string) =>
    setOpenDates((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });

  /** 지급 정정 — 지급완료 뒤 추가 지급 · 과지급 반환 */
  const [adjTarget, setAdjTarget] = useState<ExpenseRequestItem | null>(null);
  const [adjKind, setAdjKind] = useState<ExpenseAdjustment["kind"]>("refund");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjDate, setAdjDate] = useState(todayString());
  const [adjBusy, setAdjBusy] = useState(false);

  const openAdjust = (item: ExpenseRequestItem) => {
    setAdjKind("refund");
    setAdjAmount("");
    setAdjDate(todayString());
    setAdjTarget(item);
  };

  const addAdjustment = async (memo: string) => {
    if (!adjTarget) return;
    const amount = parseAmount(adjAmount) ?? 0;
    if (amount <= 0) return toast.error("금액을 입력해주세요.");
    if (!memo.trim()) return toast.error("사유를 입력해주세요.");

    setAdjBusy(true);
    const { error } = await supabase.from("expense_adjustments").insert({
      item_id: adjTarget.id,
      kind: adjKind,
      amount,
      occurred_on: adjDate,
      memo: memo.trim(),
    });
    setAdjBusy(false);
    if (error) return toast.error("기록 실패: " + error.message);
    toast.success(`${ADJ_LABEL[adjKind]}을 기록했습니다.`);
    setAdjTarget(null);
    onRefresh();
  };

  /** 승인 취소 — 처리대기로 되돌려 비목을 다시 고치거나 반려할 수 있게 */
  const unapprove = async (req: ExpenseRequest) => {
    const ok = await showConfirm(
      "승인을 취소할까요?",
      "처리대기로 돌아가 비목을 다시 고치거나 반려할 수 있습니다.",
      "승인 취소",
    );
    if (!ok) return;

    setBusyId(req.id);
    const { data, error } = await supabase
      .from("expense_requests")
      .update({ status: "pending", handler_id: null, decided_at: null })
      .eq("id", req.id)
      .eq("status", "approved")
      .select("id");
    setBusyId(null);

    if (error) return toast.error("승인 취소 실패: " + error.message);
    if (!data || data.length === 0) {
      toast.error("이미 처리된 청구입니다. 목록을 새로 불러옵니다.");
      return onRefresh();
    }
    toast.success("처리대기로 되돌렸습니다.");
    onRefresh();
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const payingCount = requests.filter((r) => r.status === "paying").length;
  const shownTotal = shown.reduce((sum, r) => sum + requestNet(r), 0);

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

  /** 줄에 비목·출금계좌 배정 — 둘 다 비목 팝업에서 함께 정한다 */
  const assign = async (
    itemId: string,
    budgetItemId: string | null,
    withdrawCode: string | null,
  ) => {
    const { error } = await supabase
      .from("expense_request_items")
      .update({ budget_item_id: budgetItemId, withdraw_code: withdrawCode })
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
    const ok = await showConfirm(
      over.length > 0 ? "예산을 넘깁니다" : "승인하시겠습니까?",
      over.length > 0
        ? `${over.join(", ")}의 가용 잔액을 넘깁니다. 그대로 승인할까요?`
        : `${req.title} · ${formatWon(requestTotal(items))}원`,
      "승인",
    );
    if (!ok) return;

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
    setListOpen(false);

    if (error) return toast.error("이체 목록 실패: " + error.message);
    if (!data || data.length === 0) {
      toast.error("다른 담당자가 이미 목록을 만들었습니다.");
      return onRefresh();
    }

    // 실제로 넘어간 건만 엑셀에 담는다. 은행에 넘기던 기존 양식을 쓴다.
    const moved = new Set(data.map((d) => d.id));
    exportPayoutList(
      toExportLines(
        approved.filter((r) => moved.has(r.id)),
        majorLabels(options),
      ),
      listDate,
      `이체목록_${listDate.replace(/-/g, "")}.xlsx`,
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

  /** 청구 한 건 카드 — 목록과 지급완료 묶음 안에서 함께 쓴다 */
  const renderCard = (req: ExpenseRequest) => {
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
                                {...(byYear.get(req.fiscal_year) ?? EMPTY_YEAR)}
                                accounts={withdrawAccounts}
                                value={it.budget_item_id}
                                withdrawValue={it.withdraw_code}
                                // 잘못 배정한 비목은 승인·지급 뒤에도 고쳐야 한다
                                // (회계 정정). 반려·취소된 건만 잠근다.
                                disabled={
                                  req.status === "rejected" ||
                                  req.status === "cancelled"
                                }
                                onChange={(id, code) => assign(it.id, id, code)}
                              />
                              <ReceiptThumbs
                                itemId={it.id}
                                files={receipts}
                                onOpen={(i) =>
                                  setViewer({
                                    receipts: allReceipts,
                                    at: allReceipts.findIndex(
                                      (r) => r.itemId === it.id && r.index === i,
                                    ),
                                  })
                                }
                              />
                              {req.status === "paid" && (
                                <button
                                  type="button"
                                  onClick={() => openAdjust(it)}
                                  className="px-2 py-1 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                                >
                                  지급 정정
                                </button>
                              )}
                            </div>
                            <div className="mt-2">
                              <AdjustmentHistory item={it} paidAt={req.paid_at} />
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
                        {req.status === "approved" && (
                          <button
                            onClick={() => unapprove(req)}
                            disabled={busy}
                            className={btnStyles.cancel}
                          >
                            승인 취소
                          </button>
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
            onClick={() => {
              setListDate(todayString());
              setListOpen(true);
            }}
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
          {filter === "paid"
            ? paidGroups.map(([date, list]) => {
                const isOpen = openDates.has(date);
                const sum = list.reduce((t, r) => t + requestNet(r), 0);
                const adjustedCount = list.filter(hasAdjustment).length;
                return (
                  <section
                    key={date}
                    className="border border-gray-200 rounded-xl bg-white overflow-hidden"
                  >
                    {/* 이체일 한 줄 — 날짜 · 건수 · 합계 */}
                    <button
                      type="button"
                      onClick={() => toggleDate(date)}
                      aria-expanded={isOpen}
                      className={`w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-left transition cursor-pointer ${
                        isOpen ? "bg-gray-50 border-b border-gray-200" : "hover:bg-gray-50"
                      }`}
                    >
                      <span className="shrink-0 text-gray-400">
                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </span>
                      <span className="font-mono text-sm font-bold tabular-nums text-gray-900">
                        {date}
                      </span>
                      {weekdayOf(date) && (
                        <span className="text-xs text-gray-400">({weekdayOf(date)})</span>
                      )}
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 text-[11px] font-bold text-gray-600 tabular-nums">
                        {list.length}건
                      </span>
                      {adjustedCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-[11px] font-bold text-amber-700 tabular-nums">
                          정정 {adjustedCount}건
                        </span>
                      )}
                      <span className="ml-auto font-mono text-sm font-bold tabular-nums text-gray-900">
                        {formatWon(sum)}
                      </span>
                    </button>

                    {/* 그날 이체한 건 — 한 줄에 한 건, 누르면 카드(영수증·지급 정정)가 열린다 */}
                    {isOpen && (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] border-collapse text-sm">
                          <thead>
                            <tr className="text-[11px] font-semibold text-gray-500 border-b border-gray-200">
                              <th className="py-2 pl-5 pr-3 text-left">신청자</th>
                              <th className="py-2 px-3 text-left">품명 / 용도</th>
                              <th className="py-2 px-3 text-left">비목</th>
                              <th className="py-2 px-3 text-left">출금</th>
                              <th className="py-2 px-3 text-left">받는 계좌</th>
                              <th className="py-2 px-3 text-left">영수증</th>
                              <th className="py-2 px-3 text-right">지급액</th>
                              <th className="py-2 pl-3 pr-5" aria-label="처리" />
                            </tr>
                          </thead>
                          <tbody>
                            {list.map((req) => {
                              const it = (req.items ?? [])[0];
                              const adjusted = hasAdjustment(req);
                              const reqReceipts = collectReceipts(req.items ?? []);
                              return (
                                <Fragment key={req.id}>
                                  <tr className="border-b border-gray-100 align-top hover:bg-gray-50">
                                    <td className="py-2.5 pl-5 pr-3 whitespace-nowrap text-gray-800">
                                      {req.requester?.full_name ?? "-"}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <p className="font-medium text-gray-900">{req.title}</p>
                                      {it?.purpose && (
                                        <p className="mt-0.5 text-xs text-gray-400">{it.purpose}</p>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 whitespace-nowrap text-xs text-gray-600">
                                      {it?.budget_item ? (
                                        <>
                                          <span className="mr-1 font-mono text-gray-400">
                                            {it.budget_item.code}
                                          </span>
                                          {it.budget_item.name}
                                        </>
                                      ) : (
                                        "-"
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      {it?.withdraw_code ? (
                                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded border border-gray-300 font-mono text-[11px] font-bold text-gray-600">
                                          {it.withdraw_code}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-gray-300">-</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px] text-gray-500">
                                      {it ? accountText(resolveAccount(it, req)) : "-"}
                                    </td>
                                    <td className="py-2 px-3">
                                      {reqReceipts.length > 0 ? (
                                        <div className="flex gap-1">
                                          {(req.items ?? []).map((line) => (
                                            <ReceiptThumbs
                                              key={line.id}
                                              itemId={line.id}
                                              files={line.receipt_files ?? []}
                                              onOpen={(i) =>
                                                setViewer({
                                                  receipts: reqReceipts,
                                                  at: reqReceipts.findIndex(
                                                    (x) => x.itemId === line.id && x.index === i,
                                                  ),
                                                })
                                              }
                                            />
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-xs text-gray-300">없음</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                      <span className="font-mono font-semibold tabular-nums text-gray-900">
                                        {formatWon(requestNet(req))}
                                      </span>
                                      {adjusted && (
                                        <button
                                          type="button"
                                          onClick={() => setDetailId(req.id)}
                                          title="정정 내역 보기"
                                          className="mt-1 ml-auto block px-1.5 py-0.5 rounded bg-amber-100 text-[11px] font-bold text-amber-700 hover:bg-amber-200 tabular-nums cursor-pointer"
                                        >
                                          정정 {adjustCount(req)}건
                                        </button>
                                      )}
                                    </td>
                                    <td className="py-2 pl-3 pr-5 whitespace-nowrap text-right">
                                      <div className="inline-flex gap-1.5">
                                        {it && (
                                          <button
                                            type="button"
                                            onClick={() => openAdjust(it)}
                                            className="px-2 py-1 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                                          >
                                            지급 정정
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => setDetailId(req.id)}
                                          className="px-2 py-1 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                                        >
                                          상세
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                );
              })
            : shown.map(renderCard)}
        </div>
      )}

      {viewer && viewer.receipts.length > 0 && (
        <ReceiptViewer
          receipts={viewer.receipts}
          startAt={Math.max(viewer.at, 0)}
          onClose={() => setViewer(null)}
        />
      )}

      {/* 이체 목록 만들기 — 처리예정일자가 엑셀 맨 위 '처리요청일자'로 들어간다 */}
      <ConfirmModal
        isOpen={listOpen}
        onClose={() => setListOpen(false)}
        title="이체 목록을 만들까요?"
        confirmText="만들기"
        busy={listing}
        onConfirm={makePayoutList}
      >
        <div className="space-y-3">
          <ConfirmRow label="대상" value={`승인된 ${approvedCount}건`} />
          <ConfirmRow
            label="합계"
            value={
              <b className="tabular-nums">
                {formatWon(
                  requests
                    .filter((r) => r.status === "approved")
                    .reduce((sum, r) => sum + requestTotal(r.items ?? []), 0),
                )}
                원
              </b>
            }
          />
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              처리예정일자
            </label>
            <DateField value={listDate} onChange={setListDate} />
          </div>
          <p className="pt-1 text-xs text-gray-500">
            이 건들은 <b>이체중</b>으로 넘어가고 엑셀이 내려갑니다. 이후 승인되는
            건은 여기 섞이지 않습니다.
          </p>
        </div>
      </ConfirmModal>

      {detailReq && (
        <Modal
          isOpen
          onClose={() => setDetailId(null)}
          title={detailReq.title}
          className="sm:max-w-[680px]"
          footer={
            <div className="flex gap-2 w-full sm:w-auto sm:justify-end">
              <button onClick={() => setDetailId(null)} className={btnStyles.cancel}>
                닫기
              </button>
              {detailReq.status === "paid" && (detailReq.items ?? [])[0] && (
                <button
                  onClick={() => openAdjust((detailReq.items ?? [])[0])}
                  className={`${btnStyles.save} sm:min-w-[80px]`}
                >
                  지급 정정
                </button>
              )}
            </div>
          }
        >
          <div className="space-y-5">
            {/* 상태 · 금액 */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              <span
                className={`px-2.5 py-1 text-xs font-bold rounded border ${STATUS_STYLE[detailReq.status]}`}
              >
                {STATUS_LABEL[detailReq.status]}
              </span>
              <span className="text-sm text-gray-600">
                {hasAdjustment(detailReq) ? "최종 지급액" : "금액"}{" "}
                <b className="text-lg text-gray-900 tabular-nums">
                  {formatWon(requestNet(detailReq))}
                </b>
                원
              </span>
            </div>

            {/* 기본 정보 */}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
              <InfoRow label="신청자" value={detailReq.requester?.full_name ?? "-"} />
              <InfoRow label="청구일자" value={detailReq.request_date} />
              {detailReq.paid_at && <InfoRow label="이체일자" value={detailReq.paid_at} />}
              {detailReq.handler?.full_name && (
                <InfoRow label="처리" value={detailReq.handler.full_name} />
              )}
            </dl>

            {(detailReq.items ?? []).map((it) => {
              const all = collectReceipts(detailReq.items ?? []);
              return (
                <div key={it.id} className="space-y-4 border-t border-gray-200 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900">{it.item_name}</p>
                      {it.purpose && (
                        <p className="mt-0.5 text-xs text-gray-500">{it.purpose}</p>
                      )}
                      <p className="mt-1 font-mono text-xs text-gray-500">
                        {accountText(resolveAccount(it, detailReq))}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-gray-900">
                      {formatWon(it.amount)}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1.5">비목 · 출금계좌</p>
                    <BudgetItemPicker
                      {...(byYear.get(detailReq.fiscal_year) ?? EMPTY_YEAR)}
                      accounts={withdrawAccounts}
                      value={it.budget_item_id}
                      withdrawValue={it.withdraw_code}
                      disabled={
                        detailReq.status === "rejected" ||
                        detailReq.status === "cancelled"
                      }
                      onChange={(id, code) => assign(it.id, id, code)}
                    />
                  </div>

                  {(it.receipt_files ?? []).length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-1.5">영수증</p>
                      <ReceiptThumbs
                        itemId={it.id}
                        files={it.receipt_files ?? []}
                        onOpen={(i) =>
                          setViewer({
                            receipts: all,
                            at: all.findIndex((x) => x.itemId === it.id && x.index === i),
                          })
                        }
                      />
                    </div>
                  )}

                  <AdjustmentHistory item={it} paidAt={detailReq.paid_at} />
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {/* 지급 정정 — 사유는 필수, 기록은 지우지 않는다 */}
      <ConfirmModal
        isOpen={!!adjTarget}
        onClose={() => setAdjTarget(null)}
        title="지급 정정 기록"
        inputLabel="사유"
        inputPlaceholder="예) 영수증 금액보다 1,000원 더 이체해 돌려받음"
        multiline
        confirmText="기록"
        busy={adjBusy}
        onConfirm={addAdjustment}
      >
        {adjTarget && (
          <div className="space-y-3">
            <ConfirmRow label="품명" value={adjTarget.item_name} />
            <ConfirmRow
              label="청구 금액"
              value={<b className="tabular-nums">{formatWon(adjTarget.amount)}원</b>}
            />
            <div className="grid grid-cols-2 gap-2">
              {(["refund", "extra"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAdjKind(k)}
                  className={`py-2 rounded-lg border text-sm font-bold transition cursor-pointer ${
                    adjKind === k
                      ? k === "extra"
                        ? "border-[#2151EC] bg-blue-50 text-[#2151EC]"
                        : "border-red-400 bg-red-50 text-red-600"
                      : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {ADJ_LABEL[k]}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  금액
                </label>
                <AmountField value={adjAmount} onChange={setAdjAmount} placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  {adjKind === "extra" ? "이체일자" : "반환받은 날"}
                </label>
                <DateField value={adjDate} onChange={setAdjDate} />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              기록은 고치거나 지울 수 없습니다. 잘못 넣었으면 반대 기록을 하나 더 넣어주세요.
            </p>
          </div>
        )}
      </ConfirmModal>

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

/** 상세 팝업의 이름 · 값 한 줄 (결의서 상세 팝업과 같은 모양) */
const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex gap-3">
    <dt className="w-20 shrink-0 text-xs font-bold text-gray-500 pt-0.5">{label}</dt>
    <dd className="flex-1 text-sm text-gray-800 break-words">{value}</dd>
  </div>
);
