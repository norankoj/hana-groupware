// src/app/vacation/page.tsx
"use client";

import { useEffect, useState, Suspense } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentMenu } from "@/components/ClientLayout";
import { VacationRequest, UserProfile } from "@/components/vacation/shared";
import VacationApprove from "@/components/vacation/VacationApprove";
import VacationCalendar from "@/components/vacation/VacationCalendar";
import VacationHistory from "@/components/vacation/VacationHistory";

const Skeleton = ({ className }: { className: string }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`}></div>
);

function VacationContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const menu = useCurrentMenu();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [myRequests, setMyRequests] = useState<VacationRequest[]>([]);
  const [approvalList, setApprovalList] = useState<VacationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "calendar" | "approve" | "history"
  >("calendar");

  const fetchData = async () => {
    setLoading(true);
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return router.push("/login");

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authUser.id)
      .single();
    setUser(profile);

    if (searchParams.get("tab") === "approve" && profile.is_approver)
      setActiveTab("approve");

    const { data: myData } = await supabase
      .from("vacation_requests")
      .select(
        "*, profiles:user_id(full_name, position), approver:approver_id(full_name)",
      )
      .eq("user_id", authUser.id)
      .neq("status", "cancelled")
      .order("start_date", { ascending: false });
    if (myData) setMyRequests(myData as any);

    if (profile.is_approver) {
      const { data: allData } = await supabase
        .from("vacation_requests")
        .select(
          "*, profiles:user_id(full_name, team_id, position, used_leave_days), approver:approver_id(full_name)",
        )
        .neq("status", "cancelled")
        .order("created_at", { ascending: false });
      if (allData) {
        const sortedData = (allData as any).sort((a: any, b: any) =>
          a.status === "pending" && b.status !== "pending"
            ? -1
            : a.status !== "pending" && b.status === "pending"
              ? 1
              : 0,
        );
        setApprovalList(sortedData);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading)
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Skeleton className="h-96 md:col-span-2" />
        <Skeleton className="h-96" />
      </div>
    );

  return (
    <div className="w-full h-full flex flex-col p-1">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          {menu?.name || "휴가/연차 관리"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          휴가 신청 및 승인 현황을 관리합니다.
        </p>
      </div>

      <div className="flex border-b border-gray-200 mb-6 w-full flex-shrink-0 overflow-x-auto">
        {user?.is_approver && (
          <button
            onClick={() => setActiveTab("approve")}
            className={`pb-3 px-6 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeTab === "approve" ? "border-blue-600 text-blue-600 font-bold" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            결재함{" "}
            {approvalList.filter((r) => r.status === "pending").length > 0 && (
              <span className="ml-1 bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full text-xs font-bold">
                {approvalList.filter((r) => r.status === "pending").length}
              </span>
            )}
          </button>
        )}
        <button
          onClick={() => setActiveTab("calendar")}
          className={`pb-3 px-6 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeTab === "calendar" ? "border-blue-600 text-blue-600 font-bold" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          내 일정 관리
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`pb-3 px-6 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeTab === "history" ? "border-blue-600 text-blue-600 font-bold" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          내 연차 히스토리
        </button>
      </div>

      <div className="flex-1 relative">
        {activeTab === "approve" && user?.is_approver && (
          <VacationApprove
            user={user}
            approvalList={approvalList}
            onRefresh={fetchData}
          />
        )}
        {activeTab === "calendar" && user && (
          <VacationCalendar
            user={user}
            myRequests={myRequests}
            onRefresh={fetchData}
          />
        )}
        {activeTab === "history" && user && (
          <VacationHistory user={user} myRequests={myRequests} />
        )}
      </div>
    </div>
  );
}

export default function VacationPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">로딩 중...</div>}>
      <VacationContent />
    </Suspense>
  );
}
