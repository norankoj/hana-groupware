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
  ExpenseUser,
} from "@/components/expense/shared";

type Tab = "mine" | "approve" | "budget" | "ledger";

/** 청구 + 줄 + 배정된 비목까지 한 번에 */
const REQUEST_SELECT =
  "*, requester:requester_id(full_name, position), handler:handler_id(full_name), items:expense_request_items(*, budget_item:budget_item_id(code, name))";

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

    // 청구에 남길 예산 연도. 예산안을 못 보는 사역자도 알 수 있게 함수로 받는다.
    const [{ data: year }, { data: reqs }] = await Promise.all([
      supabase.rpc("current_fiscal_year"),
      supabase
        .from("expense_requests")
        .select(REQUEST_SELECT)
        .eq("requester_id", authUser.id)
        .order("request_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    const activeYear = typeof year === "number" ? year : new Date().getFullYear();
    setFiscalYear(activeYear);

    const mine = sortItems(reqs as ExpenseRequest[] | null);
    setMyRequests(mine);

    // 처리 결과를 확인했으므로 대시보드 빨간 점을 끈다
    const unseen = mine.filter(
      (r) => !r.result_seen && ["paid", "rejected"].includes(r.status),
    );
    if (unseen.length > 0) {
      await supabase
        .from("expense_requests")
        .update({ result_seen: true })
        .in(
          "id",
          unseen.map((r) => r.id),
        );
    }

    if (canReadBudget) {
      const [{ data: budgetItems }, { data: budgetUsage }] = await Promise.all([
        supabase
          .from("budget_items")
          .select("*")
          .eq("fiscal_year", activeYear)
          .eq("is_active", true)
          .order("sort_order"),
        supabase.from("budget_usage").select("*").eq("fiscal_year", activeYear),
      ]);

      setItems((budgetItems as BudgetItem[]) ?? []);
      setUsage((budgetUsage as BudgetUsage[]) ?? []);
    }

    if (profile.is_expense_manager) {
      const { data: all } = await supabase
        .from("expense_requests")
        .select(REQUEST_SELECT)
        .order("request_date", { ascending: false })
        .order("created_at", { ascending: false });

      setAllRequests(sortItems(all as ExpenseRequest[] | null));
    }

    setLoading(false);
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
      <div className="p-10 text-center text-gray-500">
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
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          {menu?.name || "지출결의서"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          경비지급을 청구하고 예산 집행 현황을 확인합니다.
        </p>
      </div>

      <div className="flex border-b border-gray-200 mb-5 w-full flex-shrink-0 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`pb-3 px-6 text-sm font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
              tab === t.key
                ? "border-blue-600 text-blue-600 font-bold"
                : "border-transparent text-gray-500 hover:text-gray-700"
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
            onRefresh={fetchData}
          />
        )}
        {tab === "approve" && user.is_expense_manager && (
          <ExpenseApprove
            user={user}
            requests={allRequests}
            budgetItems={items}
            usage={usage}
            onRefresh={fetchData}
          />
        )}
        {tab === "budget" && canReadBudget && (
          <BudgetTree fiscalYear={fiscalYear} items={items} usage={usage} />
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
