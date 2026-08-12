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
import RideListTab from "@/components/projects/RideListTab";
import AttendanceTab from "@/components/projects/AttendanceTab";

type Project = {
  id: string;
  name: string;
  description: string | null;
  project_type: string;
  year: number | null;
  status: string;
  recurrence_years: number | null;
};

type TabDef = {
  key: string;
  label: string;
  allowed_types: string[];   // ["*"] = 모든 프로젝트 타입, ["marf"] = MARF 전용
  min_role?: "admin" | "member";  // undefined = 비담당자도 볼 수 있음 (로그인만 하면)
};

type TabSetting = {
  is_visible: boolean;
  min_role: string;
};

// "*" = 모든 프로젝트 타입에 표시
const TABS: TabDef[] = [
  { key: "overview",       label: "개요",       allowed_types: ["*"] },
  { key: "missionaries",   label: "명단",       allowed_types: ["marf"] },
  { key: "attendance",     label: "참여현황",   allowed_types: ["marf"] },
  { key: "accommodations", label: "숙소매칭",   allowed_types: ["marf"] },
  { key: "vehicles",       label: "차량매칭",   allowed_types: ["marf"] },
  { key: "match_schedule", label: "배정현황",   allowed_types: ["marf"] },
  { key: "gifts",          label: "선물",       allowed_types: ["marf"] },
  { key: "rides",          label: "라이드 목록", allowed_types: ["ride_schedule"] },
  { key: "schedule",       label: "행사일정",   allowed_types: ["*"] },
  { key: "documents",      label: "문서",       allowed_types: ["*"] },
  { key: "checklist",      label: "체크리스트", allowed_types: ["*"] },
  { key: "budget",         label: "예산·지출",  allowed_types: ["*"] },
];

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  planning: { label: "기획중", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  active:   { label: "진행중", color: "bg-green-100 text-green-700 border-green-200" },
  completed:{ label: "완료",   color: "bg-gray-100 text-gray-500 border-gray-200" },
};

const PROJECT_TYPE_LABEL: Record<string, { label: string; color: string }> = {
  marf:          { label: "MARF",    color: "bg-blue-100 text-blue-700" },
  ride_schedule: { label: "라이드",  color: "bg-purple-100 text-purple-700" },
  general:       { label: "일반",    color: "bg-gray-100 text-gray-600" },
};

export default function ProjectDashboard() {
  const supabase = createClient();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myMemberRole, setMyMemberRole] = useState<string | null>(null);
  const [tabSettings, setTabSettings] = useState<Record<string, TabSetting>>({});
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

  const fetchTabSettings = useCallback(async () => {
    const { data } = await supabase
      .from("project_tab_settings")
      .select("tab_key, is_visible, min_role")
      .eq("project_id", id);
    if (data) {
      const map: Record<string, TabSetting> = {};
      data.forEach((s) => { map[s.tab_key] = { is_visible: s.is_visible, min_role: s.min_role }; });
      setTabSettings(map);
    }
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
      setMyMemberRole(mem?.role ?? null);

      await Promise.all([fetchProject(), fetchTabSettings()]);
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
  const isAdmin = myMemberRole === "admin";
  const isMember = myMemberRole !== null;

  const visibleTabs = TABS.filter((t) => {
    // 프로젝트 타입 확인
    const typeOk = t.allowed_types.includes("*") || t.allowed_types.includes(project.project_type);
    if (!typeOk) return false;

    // DB 오버라이드 확인
    const dbSetting = tabSettings[t.key];
    if (dbSetting && !dbSetting.is_visible) return false;

    // 역할 확인 (DB 설정 우선, 없으면 코드 기본값)
    const effectiveMinRole = dbSetting?.min_role ?? t.min_role;
    if (effectiveMinRole === "admin" && !isAdmin) return false;
    if (effectiveMinRole === "member" && !isMember) return false;

    return true;
  });

  // 현재 activeTab이 visibleTabs에 없으면 첫 번째로
  const activeTabKey = visibleTabs.find((t) => t.key === activeTab)
    ? activeTab
    : visibleTabs[0]?.key ?? "overview";

  const status = STATUS_LABEL[project.status] ?? { label: project.status, color: "bg-gray-100 text-gray-500 border-gray-200" };
  const typeTag = PROJECT_TYPE_LABEL[project.project_type];

  const props = { projectId: id, myUserId: myUserId!, isMember, isAdmin };

  const renderTab = () => {
    switch (activeTabKey) {
      case "overview":       return <OverviewTab {...props} project={project} isMarf={isMarf} isRide={project.project_type === "ride_schedule"} />;
      case "missionaries":   return <MissionaryTab {...props} />;
      case "attendance":     return <AttendanceTab {...props} />;
      case "accommodations": return <AccommodationTab {...props} />;
      case "vehicles":       return <VehicleTab {...props} />;
      case "match_schedule": return <MatchScheduleTab {...props} />;
      case "gifts":          return <GiftTab {...props} />;
      case "rides":          return <RideListTab {...props} />;
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
                {typeTag && project.project_type !== "general" && (
                  <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${typeTag.color}`}>
                    {typeTag.label}
                  </span>
                )}
              </div>
              {project.description && (
                <p className="text-sm text-gray-500 mt-0.5">{project.description}</p>
              )}
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => router.push(`/projects/${id}/settings`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition whitespace-nowrap"
                  title="프로젝트 설정"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="hidden sm:inline">설정</span>
                </button>
                <button
                  onClick={() => setShowMemberModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span className="hidden sm:inline">담당자 관리</span>
                </button>
              </div>
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
              ${activeTabKey === tab.key
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
