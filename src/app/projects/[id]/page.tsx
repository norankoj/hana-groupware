"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import MissionaryTab from "@/components/projects/MissionaryTab";
import AccommodationTab from "@/components/projects/AccommodationTab";
import VehicleTab from "@/components/projects/VehicleTab";
import GiftTab from "@/components/projects/GiftTab";
import ScheduleTab from "@/components/projects/ScheduleTab";
import DocumentTab from "@/components/projects/DocumentTab";
import ChecklistTab from "@/components/projects/ChecklistTab";
import OverviewTab from "@/components/projects/OverviewTab";
import MemberModal from "@/components/projects/MemberModal";
import MatchScheduleTab from "@/components/projects/MatchScheduleTab";
import BudgetTab from "@/components/projects/BudgetTab";

type Project = {
  id: string;
  name: string;
  description: string | null;
  project_type: string;
  year: number | null;
  status: string;
  recurrence_years: number | null;
};

type TabDef = { key: string; label: string; marf_only?: boolean };

const TABS: TabDef[] = [
  { key: "overview",        label: "개요" },
  { key: "missionaries",    label: "명단",    marf_only: true },
  { key: "accommodations",  label: "숙소매칭", marf_only: true },
  { key: "vehicles",        label: "차량매칭", marf_only: true },
  { key: "match_schedule",  label: "배정현황", marf_only: true },
  { key: "gifts",           label: "선물",     marf_only: true },
  { key: "schedule",        label: "행사일정" },
  { key: "documents",       label: "문서" },
  { key: "checklist",       label: "체크리스트" },
  { key: "budget",          label: "예산·지출" },
];

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  planning: { label: "기획중", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  active:   { label: "진행중", color: "bg-green-100 text-green-700 border-green-200" },
  completed:{ label: "완료",   color: "bg-gray-100 text-gray-500 border-gray-200" },
};

export default function ProjectDashboard() {
  const supabase = createClient();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myMemberRole, setMyMemberRole] = useState<string | null>(null); // null = 비담당자
  const [loading, setLoading] = useState(true);
  const [showMemberModal, setShowMemberModal] = useState(false);

  const fetchProject = useCallback(async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) { toast.error("프로젝트를 찾을 수 없습니다."); router.push("/projects"); return; }
    setProject(data);
  }, [id]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setMyUserId(data.user.id);

      const { data: mem } = await supabase
        .from("project_members")
        .select("role")
        .eq("project_id", id)
        .eq("user_id", data.user.id)
        .maybeSingle();
      setMyMemberRole(mem?.role ?? null); // null이면 비담당자(조회만 가능)

      await fetchProject();
      setLoading(false);
    });
  }, [id]);

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <svg className="animate-spin w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        불러오는 중...
      </div>
    );
  }

  const isMarf = project.project_type === "marf";
  const visibleTabs = TABS.filter((t) => !t.marf_only || isMarf);
  const status = STATUS_LABEL[project.status] ?? { label: project.status, color: "bg-gray-100 text-gray-500 border-gray-200" };

  const renderTab = () => {
    const isMember = myMemberRole !== null;   // 담당자로 지정된 경우
    const props = { projectId: id, myUserId: myUserId!, isMember, isAdmin: myMemberRole === "admin" };
    switch (activeTab) {
      case "overview":       return <OverviewTab {...props} project={project} isMarf={isMarf} />;
      case "missionaries":   return <MissionaryTab {...props} />;
      case "accommodations": return <AccommodationTab {...props} />;
      case "vehicles":       return <VehicleTab {...props} />;
      case "match_schedule": return <MatchScheduleTab {...props} />;
      case "gifts":          return <GiftTab {...props} />;
      case "schedule":       return <ScheduleTab {...props} isMarf={isMarf} />;
      case "documents":      return <DocumentTab {...props} />;
      case "checklist":      return <ChecklistTab {...props} isMarf={isMarf} />;
      case "budget":         return <BudgetTab    {...props} isMarf={isMarf} />;
      default:               return null;
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* 프로젝트 헤더 */}
      <div className="flex items-start gap-2 mb-6">
        <button
          onClick={() => router.push("/projects")}
          className="shrink-0 text-gray-400 hover:text-gray-600 transition p-1 rounded mt-0.5"
          title="목록으로"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
                <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${status.color}`}>
                  {status.label}
                </span>
                {isMarf && (
                  <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">MARF</span>
                )}
              </div>
              {project.description && (
                <p className="text-sm text-gray-500 mt-0.5">{project.description}</p>
              )}
            </div>
            {myMemberRole === "admin" && (
              <button
                onClick={() => setShowMemberModal(true)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span className="hidden sm:inline">담당자 관리</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-200">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors whitespace-nowrap
              ${activeTab === tab.key
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div>{renderTab()}</div>

      {/* 담당자 관리 모달 */}
      {showMemberModal && (
        <MemberModal
          projectId={id}
          onClose={() => setShowMemberModal(false)}
        />
      )}
    </div>
  );
}
