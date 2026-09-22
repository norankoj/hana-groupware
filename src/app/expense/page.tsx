// src/app/expense/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useCurrentMenu } from "@/components/ClientLayout";
import BudgetTree from "@/components/expense/BudgetTree";
import ExpenseApprove from "@/components/expense/ExpenseApprove";
import ExpenseLedger from "@/components/expense/ExpenseLedger";
import ExpenseMyView from "@/components/expense/ExpenseMyView";
import type {
  BudgetItem,
  BudgetUsage,
  ExpenseRequest,
  BudgetChange,
  BudgetYear,
  ExpenseUser,
  WithdrawAccount,
} from "@/components/expense/shared";
import { applyBudgetChanges } from "@/components/expense/shared";

type Tab = "mine" | "approve" | "budget" | "ledger";

/** 청구 + 줄 + 배정된 비목까지 한 번에 */
const REQUEST_SELECT =
  "*, requester:requester_id(full_name, position), handler:handler_id(full_name), items:expense_request_items(*, budget_item:budget_item_id(code, name), adjustments:expense_adjustments(*))";

/**
 * Supabase 는 한 번에 최대 1,000건만 돌려준다. 넘으면 오류 없이 잘려서
 * 오래된 청구가 목록에서 조용히 사라진다(주 30건이면 8개월 만에 넘는다).
 * 1,000건씩 끝까지 나눠 받는다.
 * ponytail: 전부 받아 화면에서 거른다. 수천 건이 쌓여 느려지면
 * 연도·상태 조건을 서버로 보내는 방식으로 바꾼다.
 */
const PAGE = 1000;
async function fetchAll(
  build: () => {
    range: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
  },
): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** 줄 순서는 중첩 조회로 보장되지 않으므로 여기서 맞춘다 */
const sortItems = (rows: ExpenseRequest[] | null) =>
  (rows ?? []).map((r) => ({
    ...r,
    items: [...(r.items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }));

const Skeleton = ({ className }: { className: string }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

function ExpenseContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const menu = useCurrentMenu();

  const [user, setUser] = useState<ExpenseUser | null>(null);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [myRequests, setMyRequests] = useState<ExpenseRequest[]>([]);

  // 담당자·관리자 전용
  const [allRequests, setAllRequests] = useState<ExpenseRequest[]>([]);
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [usage, setUsage] = useState<BudgetUsage[]>([]);
  /** 예산 연도 목록 — 가예산(draft) / 확정(final) */
  const [years, setYears] = useState<BudgetYear[]>([]);
  /** 추경·전용 기록 */
  const [changes, setChanges] = useState<BudgetChange[]>([]);
  const [withdrawAccounts, setWithdrawAccounts] = useState<WithdrawAccount[]>(
    [],
  );

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("mine");

  const fetchData = async () => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return router.push("/login");

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_expense_manager")
      .eq("id", authUser.id)
      .single();

    if (!profile) {
      setLoading(false);
      return;
    }
    setUser(profile as ExpenseUser);

    // 예산안은 담당자·관리자만 본다 (DB에서도 RLS로 한 번 더 막는다)
    const canReadBudget = profile.is_expense_manager || profile.role === "admin";

    // 알림에서 온 링크로 첫 탭을 정한다 (그 뒤로는 클릭이 이긴다)
    const wanted = searchParams.get("tab");
    if (wanted === "approve" && profile.is_expense_manager) {
      setActiveTab("approve");
    } else if (wanted === "budget" && canReadBudget) {
      setActiveTab("budget");
    }

    // 서로 기다릴 필요 없는 조회는 한꺼번에 보낸다.
    // 예전엔 7번을 차례로 다녀와서(하나 끝나야 다음) 담당자 화면이 1.5~3초 걸렸다.
    // 이제 로그인 → 프로필 → [나머지 전부] 세 번이면 끝난다.
    const isManager = profile.is_expense_manager;
    const [
      { data: year },
      reqs,
      { data: yearRows },
      budget,
      all,
    ] = await Promise.all([
      // 청구에 남길 예산 연도. 예산안을 못 보는 사역자도 알 수 있게 함수로 받는다.
      supabase.rpc("current_fiscal_year"),
      // 나눠 받으려면 순서가 흔들리지 않아야 한다 — 마지막에 id 로 못 박는다
      fetchAll(() =>
        supabase
          .from("expense_requests")
          .select(REQUEST_SELECT)
          .eq("requester_id", authUser.id)
          .order("request_date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id"),
      ),
      supabase.from("budget_years").select("*").order("fiscal_year"),
      // 예산안 — 담당자·관리자만
      canReadBudget
        ? Promise.all([
            // 연도를 가리지 않고 받는다 — 청구마다 제 연도 비목에 배정하고,
            // 예산안 탭에서 연도를 바꿔 본다. 한 해 195행이라 해가 쌓이면 1,000건을 넘는다.
            fetchAll(() =>
              supabase
                .from("budget_items")
                .select("*")
                .eq("is_active", true)
                .order("fiscal_year")
                .order("sort_order")
                .order("id"),
            ),
            fetchAll(() =>
              supabase.from("budget_usage").select("*").order("budget_item_id"),
            ),
            supabase
              .from("withdraw_accounts")
              .select("*")
              .eq("is_active", true)
              .order("sort_order"),
            fetchAll(() =>
              supabase
                .from("budget_changes")
                .select("*")
                .order("changed_on")
                .order("created_at")
                .order("id"),
            ),
          ])
        : null,
      // 전체 청구 — 담당자만
      isManager
        ? fetchAll(() =>
            supabase
              .from("expense_requests")
              .select(REQUEST_SELECT)
              .order("request_date", { ascending: false })
              .order("created_at", { ascending: false })
              .order("id"),
          )
        : null,
    ]);

    const activeYear = typeof year === "number" ? year : new Date().getFullYear();
    setFiscalYear(activeYear);
    setYears((yearRows as BudgetYear[]) ?? []);

    const mine = sortItems(reqs as ExpenseRequest[] | null);
    setMyRequests(mine);

    if (budget) {
      const [budgetItems, budgetUsage, { data: accounts }, budgetChanges] = budget;
      // 화면 어디서나 같은 금액을 보도록, 예산안은 변경을 반영한 채로 넘긴다
      const changeRows = budgetChanges as BudgetChange[];
      setChanges(changeRows);
      setItems(applyBudgetChanges(budgetItems as BudgetItem[], changeRows));
      setUsage((budgetUsage as BudgetUsage[]) ?? []);
      setWithdrawAccounts((accounts as WithdrawAccount[]) ?? []);
    }
    if (all) setAllRequests(sortItems(all as ExpenseRequest[]));

    setLoading(false);

    // 처리 결과를 확인했으므로 대시보드 빨간 점을 끈다.
    // 화면과 상관없는 저장이라 기다리지 않는다 — 실패해도 다음에 들어오면 다시 끈다.
    const unseen = mine.filter(
      (r) => !r.result_seen && ["paid", "rejected"].includes(r.status),
    );
    if (unseen.length > 0) {
      // .then() 이 있어야 실제로 보낸다 — Supabase 쿼리는 기다리기 전까지 출발하지 않는다
      supabase
        .from("expense_requests")
        .update({ result_seen: true })
        .in(
          "id",
          unseen.map((r) => r.id),
        )
        .then(() => {});
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading)
    return (
      <div className="w-full max-w-7xl mx-auto space-y-6 p-1">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );

  if (!user)
    return (
      <div className="p-10 text-center text-muted">
        사용자 정보를 불러오지 못했습니다.
      </div>
    );

  const canReadBudget = user.is_expense_manager || user.role === "admin";
  const pendingCount = allRequests.filter((r) => r.status === "pending").length;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "mine", label: "내 결의서" },
    ...(user.is_expense_manager
      ? ([{ key: "approve", label: "요청 리스트", badge: pendingCount }] as const)
      : []),
    ...(canReadBudget ? ([{ key: "budget", label: "예산안" }] as const) : []),
    ...(user.is_expense_manager
      ? ([{ key: "ledger", label: "전체 내역" }] as const)
      : []),
  ];

  // 권한이 없어진 탭에 머무르지 않게
  const tab = tabs.some((t) => t.key === activeTab) ? activeTab : "mine";

  return (
    <div className="w-full max-w-7xl mx-auto h-full flex flex-col p-1 pb-20">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-heading tracking-tight">
          {menu?.name || "지출결의서"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          경비지급을 청구하고 예산 집행 현황을 확인합니다.
        </p>
      </div>

      <div className="flex border-b border-line mb-5 w-full flex-shrink-0 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`pb-3 px-6 text-sm font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
              tab === t.key
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted hover:text-gray-700"
            }`}
          >
            {t.label}
            {!!t.badge && t.badge > 0 && (
              <span className="ml-1 bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full text-xs font-bold">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1">
        {tab === "mine" && (
          <ExpenseMyView
            user={user}
            requests={myRequests}
            fiscalYear={fiscalYear}
            years={years}
            onRefresh={fetchData}
          />
        )}
        {tab === "approve" && user.is_expense_manager && (
          <ExpenseApprove
            user={user}
            requests={allRequests}
            budgetItems={items}
            usage={usage}
            withdrawAccounts={withdrawAccounts}
            onRefresh={fetchData}
          />
        )}
        {tab === "budget" && canReadBudget && (
          <BudgetTree
            defaultYear={fiscalYear}
            years={years}
            items={items}
            usage={usage}
            requests={allRequests}
            changes={changes}
            canFinalize={user.is_expense_manager}
            onRefresh={fetchData}
          />
        )}
        {tab === "ledger" && user.is_expense_manager && (
          <ExpenseLedger
            fiscalYear={fiscalYear}
            requests={allRequests}
            budgetItems={items}
            usage={usage}
          />
        )}
      </div>
    </div>
  );
}

export default function ExpensePage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">로딩 중...</div>}>
      <ExpenseContent />
    </Suspense>
  );
}
