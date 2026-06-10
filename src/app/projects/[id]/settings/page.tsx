"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";

type Project = {
  id: string;
  name: string;
  project_type: string;
};

type TabDef = {
  key: string;
  label: string;
  allowed_types: string[];
  defaultMinRole: "admin" | "member" | "none";
  description: string;
};

type TabSetting = {
  is_visible: boolean;
  min_role: string;
};

// 전체 탭 정의 (page.tsx의 TABS와 동기화 필요)
const ALL_TABS: TabDef[] = [
  { key: "overview",       label: "개요",       allowed_types: ["*"],             defaultMinRole: "none",   description: "프로젝트 개요, 진행 현황 요약" },
  { key: "missionaries",   label: "명단",       allowed_types: ["marf"],          defaultMinRole: "member", description: "선교사 명단 및 항공 정보" },
  { key: "accommodations", label: "숙소매칭",   allowed_types: ["marf"],          defaultMinRole: "member", description: "숙소 자원 및 배정 현황" },
  { key: "vehicles",       label: "차량매칭",   allowed_types: ["marf"],          defaultMinRole: "member", description: "차량 자원 및 배정 현황" },
  { key: "match_schedule", label: "배정현황",   allowed_types: ["marf"],          defaultMinRole: "member", description: "숙소·차량 배정 타임라인" },
  { key: "gifts",          label: "선물",       allowed_types: ["marf"],          defaultMinRole: "member", description: "선물 준비 및 배포 관리" },
  { key: "rides",          label: "라이드 목록", allowed_types: ["ride_schedule"], defaultMinRole: "member", description: "라이드 일정 전체 목록 및 관리" },
  { key: "schedule",       label: "행사일정",   allowed_types: ["*"],             defaultMinRole: "none",   description: "프로젝트 행사 일정" },
  { key: "documents",      label: "문서",       allowed_types: ["*"],             defaultMinRole: "none",   description: "관련 문서 및 안내문" },
  { key: "checklist",      label: "체크리스트", allowed_types: ["*"],             defaultMinRole: "none",   description: "진행 체크리스트" },
  { key: "budget",         label: "예산·지출",  allowed_types: ["*"],             defaultMinRole: "member", description: "예산 및 지출 내역" },
];

const ROLE_LABELS: Record<string, string> = {
  none:   "모든 로그인 사용자",
  member: "담당자(멤버) 이상",
  admin:  "관리자만",
};

export default function ProjectSettingsPage() {
  const supabase = createClient();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<Record<string, TabSetting>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const applicableTabs = project
    ? ALL_TABS.filter((t) => t.allowed_types.includes("*") || t.allowed_types.includes(project.project_type))
    : [];

  const fetchData = useCallback(async () => {
    // 권한 확인 (admin만)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    const { data: mem } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (mem?.role !== "admin") {
      toast.error("관리자만 접근할 수 있습니다.");
      router.push(`/projects/${id}`);
      return;
    }

    // 프로젝트 정보
    const { data: proj } = await supabase.from("projects").select("id, name, project_type").eq("id", id).single();
    if (!proj) { router.push("/projects"); return; }
    setProject(proj);

    // 탭 설정 로드
    const { data: tabData } = await supabase
      .from("project_tab_settings")
      .select("tab_key, is_visible, min_role")
      .eq("project_id", id);

    const map: Record<string, TabSetting> = {};
    if (tabData) {
      tabData.forEach((s) => { map[s.tab_key] = { is_visible: s.is_visible, min_role: s.min_role }; });
    }
    setSettings(map);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getEffectiveSetting = (tab: TabDef): TabSetting => ({
    is_visible: settings[tab.key]?.is_visible ?? true,
    min_role:   settings[tab.key]?.min_role   ?? tab.defaultMinRole,
  });

  const updateSetting = (tabKey: string, patch: Partial<TabSetting>) => {
    setSettings((prev) => ({
      ...prev,
      [tabKey]: { ...getEffectiveSetting(ALL_TABS.find((t) => t.key === tabKey)!), ...patch },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const upserts = applicableTabs.map((tab) => {
      const s = getEffectiveSetting(tab);
      return {
        project_id: id,
        tab_key:    tab.key,
        is_visible: s.is_visible,
        min_role:   s.min_role,
      };
    });

    const { error } = await supabase
      .from("project_tab_settings")
      .upsert(upserts, { onConflict: "project_id,tab_key" });

    if (error) toast.error("저장 실패: " + error.message);
    else toast.success("탭 권한 설정이 저장되었습니다.");
    setSaving(false);
  };

  const handleReset = async () => {
    if (!confirm("탭 권한 설정을 기본값으로 초기화할까요?")) return;
    const { error } = await supabase
      .from("project_tab_settings")
      .delete()
      .eq("project_id", id);
    if (error) toast.error("초기화 실패");
    else { toast.success("초기화되었습니다."); setSettings({}); }
  };

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

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push(`/projects/${id}`)}
          className="text-gray-400 hover:text-gray-600 p-1 rounded"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">프로젝트 설정</h1>
          <p className="text-sm text-gray-500">{project.name}</p>
        </div>
      </div>

      {/* 탭 권한 설정 */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h2 className="font-bold text-gray-800">탭 접근 권한</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            각 탭의 표시 여부와 최소 접근 역할을 설정합니다. 탭을 숨기면 해당 역할이어도 볼 수 없습니다.
          </p>
        </div>

        <div className="divide-y divide-gray-100">
          {applicableTabs.map((tab) => {
            const s = getEffectiveSetting(tab);
            const isDefault =
              settings[tab.key] === undefined ||
              (settings[tab.key]?.is_visible === true && settings[tab.key]?.min_role === tab.defaultMinRole);

            return (
              <div
                key={tab.key}
                className={`px-6 py-4 flex items-center gap-4 ${!s.is_visible ? "opacity-50" : ""}`}
              >
                {/* 표시/숨김 토글 */}
                <button
                  onClick={() => updateSetting(tab.key, { is_visible: !s.is_visible })}
                  className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${
                    s.is_visible ? "bg-blue-500" : "bg-gray-300"
                  }`}
                  title={s.is_visible ? "탭 숨기기" : "탭 표시"}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      s.is_visible ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>

                {/* 탭 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{tab.label}</span>
                    {!isDefault && (
                      <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-medium">
                        커스텀
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{tab.description}</p>
                </div>

                {/* 역할 선택 */}
                <select
                  value={s.min_role}
                  onChange={(e) => updateSetting(tab.key, { min_role: e.target.value })}
                  disabled={!s.is_visible}
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  <option value="none">모든 로그인 사용자</option>
                  <option value="member">담당자(멤버) 이상</option>
                  <option value="admin">관리자만</option>
                </select>
              </div>
            );
          })}
        </div>

        {/* 역할 설명 */}
        <div className="px-6 py-4 bg-gray-50 border-t">
          <p className="text-xs text-gray-500 font-semibold mb-2">역할 설명</p>
          <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-gray-300" />
              모든 로그인 사용자 — 프로젝트에 속하지 않아도 조회 가능
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              담당자 이상 — 프로젝트 멤버/관리자만
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              관리자만 — 프로젝트 관리자(admin)만
            </div>
          </div>
        </div>
      </div>

      {/* 저장 버튼 */}
      <div className="flex justify-between items-center mt-5">
        <button
          onClick={handleReset}
          className="text-sm text-red-500 hover:text-red-700 px-4 py-2 border border-red-200 rounded-lg hover:bg-red-50"
        >
          기본값으로 초기화
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "설정 저장"}
        </button>
      </div>
    </div>
  );
}
