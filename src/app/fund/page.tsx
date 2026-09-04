// src/app/fund/page.tsx
"use client";

import { useEffect, useState, Suspense } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentMenu } from "@/components/ClientLayout";
import FundMyView from "@/components/fund/FundMyView";
import FundApprove from "@/components/fund/FundApprove";
import FundEntryForm from "@/components/fund/FundEntryForm";
import FundLedgerList from "@/components/fund/FundLedgerList";
import FundPayeeTab from "@/components/fund/FundPayeeTab";
import {
  emptyBalance,
  type FundBalance,
  type FundLedger,
  type FundPayee,
  type FundRequest,
  type FundUser,
} from "@/components/fund/shared";

type Profile = { id: string; full_name: string; position: string | null };
type Tab = "mine" | "approve" | "entry" | "ledger" | "payees";

const Skeleton = ({ className }: { className: string }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`}></div>
);

function FundContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const menu = useCurrentMenu();

  const [user, setUser] = useState<FundUser | null>(null);
  const [balance, setBalance] = useState<FundBalance | null>(null);
  const [myLedger, setMyLedger] = useState<FundLedger[]>([]);
  const [myRequests, setMyRequests] = useState<FundRequest[]>([]);

  // 담당자 전용
  const [allRequests, setAllRequests] = useState<FundRequest[]>([]);
  const [payees, setPayees] = useState<FundPayee[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [balances, setBalances] = useState<Record<string, FundBalance>>({});

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("mine");

  const fetchData = async () => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return router.push("/login");

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, role, position, is_fund_manager")
      .eq("id", authUser.id)
      .single();
    if (!profile) {
      setLoading(false);
      return;
    }
    setUser(profile as FundUser);

    const isManager = !!profile.is_fund_manager;
    if (searchParams.get("tab") === "approve" && isManager) {
      setActiveTab("approve");
    }

    // ── 본인 데이터 ──
    // 명부에 내 계정이 연결돼 있어야 잔액·적립내역이 보인다
    const { data: bal } = await supabase
      .from("fund_balances")
      .select("*")
      .eq("user_id", authUser.id)
      .maybeSingle();

    const myBalance =
      (bal as FundBalance) ?? emptyBalance(profile.full_name ?? "");
    setBalance(myBalance);

    const [{ data: ledger }, { data: reqs }] = await Promise.all([
      myBalance.payee_id
        ? supabase
            .from("fund_ledger")
            .select("*")
            .eq("payee_id", myBalance.payee_id)
            .order("entry_date", { ascending: false })
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as FundLedger[] }),
      supabase
        .from("fund_requests")
        .select("*, handler:handler_id(full_name)")
        .eq("user_id", authUser.id)
        .order("requested_at", { ascending: false }),
    ]);

    setMyLedger((ledger as FundLedger[]) ?? []);
    setMyRequests((reqs as FundRequest[]) ?? []);

    // 처리 결과를 확인했으므로 대시보드 빨간 점을 끈다
    const unseen = (reqs ?? []).filter(
      (r: any) =>
        !r.result_seen && (r.status === "completed" || r.status === "rejected"),
    );
    if (unseen.length > 0) {
      await supabase
        .from("fund_requests")
        .update({ result_seen: true })
        .in(
          "id",
          unseen.map((r: any) => r.id),
        );
    }

    // ── 담당자 데이터 ──
    if (isManager) {
      // 원장은 건수가 계속 늘어나므로 여기서 통째로 받지 않는다.
      // 전체 내역 탭이 연도·페이지 단위로 직접 불러온다.
      const [{ data: aReqs }, { data: pay }, { data: profs }, { data: aBal }] =
        await Promise.all([
          supabase
            .from("fund_requests")
            .select(
              "*, profiles:user_id(full_name, position), handler:handler_id(full_name)",
            )
            .order("requested_at", { ascending: false }),
          supabase.from("fund_payees").select("*").order("name"),
          supabase
            .from("profiles")
            .select("id, full_name, position")
            .neq("role", "pending")
            .order("full_name"),
          supabase.from("fund_balances").select("*"),
        ]);

      const sorted = ((aReqs as FundRequest[]) ?? []).sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;
        return (b.requested_at ?? "").localeCompare(a.requested_at ?? "");
      });
      setAllRequests(sorted);
      setPayees((pay as FundPayee[]) ?? []);
      setProfiles((profs as Profile[]) ?? []);
      setBalances(
        Object.fromEntries(
          ((aBal as FundBalance[]) ?? []).map((b) => [b.payee_id, b]),
        ),
      );
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
        <Skeleton className="h-44" />
        <Skeleton className="h-64" />
      </div>
    );

  if (!user)
    return (
      <div className="p-10 text-center text-gray-500">
        사용자 정보를 불러오지 못했습니다.
      </div>
    );

  const isManager = user.is_fund_manager;
  const pendingCount = allRequests.filter((r) => r.status === "pending").length;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "mine", label: "내 펀드" },
    ...(isManager
      ? ([
          { key: "approve", label: "펀드신청 리스트", badge: pendingCount },
          { key: "entry", label: "적립 등록" },
          { key: "ledger", label: "전체 내역" },
          { key: "payees", label: "대상자 명부" },
        ] as const)
      : []),
  ];

  // 적립 등록·전체 내역에서 고를 수 있는 대상자 (사용 중인 항목만)
  const activePayees = payees.filter((p) => p.is_active);

  return (
    <div className="w-full max-w-7xl mx-auto h-full flex flex-col p-1 pb-20">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          {menu?.name || "선교펀드"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          해외사역매칭펀드의 적립·사용 내역을 관리합니다.
        </p>
      </div>

      <div className="flex border-b border-gray-200 mb-5 w-full flex-shrink-0 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`pb-3 px-6 text-sm font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === t.key
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
        {activeTab === "mine" && balance && (
          <FundMyView
            user={user}
            balance={balance}
            ledger={myLedger}
            requests={myRequests}
            onRefresh={fetchData}
          />
        )}
        {activeTab === "approve" && isManager && (
          <FundApprove requests={allRequests} onRefresh={fetchData} />
        )}
        {activeTab === "entry" && isManager && (
          <FundEntryForm
            manager={user}
            members={activePayees.map((p) => ({
              id: p.id,
              name: p.name,
              hint: p.user_id ? null : "미가입",
            }))}
            onSaved={fetchData}
          />
        )}
        {activeTab === "ledger" && isManager && (
          <FundLedgerList
            payees={payees}
            balances={balances}
            onRefresh={fetchData}
          />
        )}
        {activeTab === "payees" && isManager && (
          <FundPayeeTab
            payees={payees}
            balances={balances}
            profiles={profiles}
            onRefresh={fetchData}
          />
        )}
      </div>
    </div>
  );
}

export default function FundPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">로딩 중...</div>}>
      <FundContent />
    </Suspense>
  );
}
