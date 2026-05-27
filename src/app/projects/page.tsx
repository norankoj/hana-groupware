"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import Select from "@/components/Select";

type Project = {
  id: string;
  name: string;
  description: string | null;
  project_type: string;
  recurrence_years: number | null;
  year: number | null;
  status: string;
  created_at: string;
  my_role?: string;
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  planning: { label: "기획중", color: "bg-yellow-100 text-yellow-700" },
  active:   { label: "진행중", color: "bg-green-100 text-green-700" },
  completed:{ label: "완료",   color: "bg-gray-100 text-gray-500" },
};

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  marf:    { label: "MARF", color: "bg-blue-100 text-blue-700" },
  general: { label: "일반", color: "bg-purple-100 text-purple-700" },
};

export default function ProjectsPage() {
  const supabase = createClient();
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string>("member");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    project_type: "marf",
    year: new Date().getFullYear(),
    recurrence_years: "",
    status: "planning",
  });
  const [saving, setSaving] = useState(false);

  const fetchProjects = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("project_members")
      .select(`role, projects(id, name, description, project_type, recurrence_years, year, status, created_at)`)
      .eq("user_id", userId);

    if (error) { toast.error("프로젝트 목록을 불러오지 못했습니다."); return; }

    const list: Project[] = (data || [])
      .filter((r) => r.projects)
      .map((r) => ({ ...(r.projects as any), my_role: r.role }))
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

    setProjects(list);
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      setMyUserId(data.user.id);
      supabase.from("profiles").select("role").eq("id", data.user.id).single()
        .then(({ data: p }) => { if (p) setMyRole(p.role); });
      fetchProjects(data.user.id);
      setLoading(false);
    });
  }, []);

  const canCreate = ["admin", "director"].includes(myRole);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("프로젝트명을 입력하세요."); return; }
    setSaving(true);

    const res = await fetch("/api/projects/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        description: form.description.trim() || null,
        project_type: form.project_type,
        year: form.year || null,
        recurrence_years: form.recurrence_years ? Number(form.recurrence_years) : null,
        status: form.status,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "프로젝트 생성 실패");
      setSaving(false);
      return;
    }

    toast.success("프로젝트가 생성되었습니다.");
    setShowCreateModal(false);
    setForm({ name: "", description: "", project_type: "marf", year: new Date().getFullYear(), recurrence_years: "", status: "planning" });
    if (myUserId) fetchProjects(myUserId);
    setSaving(false);
  };

  if (loading) {
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
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">프로젝트</h1>
          <p className="text-sm text-gray-500 mt-1">담당자로 지정된 프로젝트만 표시됩니다.</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            새 프로젝트
          </button>
        )}
      </div>

      {/* 프로젝트 카드 목록 */}
      {projects.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <p className="font-medium">참여 중인 프로젝트가 없습니다.</p>
          {canCreate && (
            <p className="text-sm mt-1">위의 버튼으로 첫 프로젝트를 만들어보세요.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const status = STATUS_LABEL[p.status] ?? { label: p.status, color: "bg-gray-100 text-gray-500" };
            const type = TYPE_LABEL[p.project_type] ?? { label: p.project_type, color: "bg-gray-100 text-gray-500" };
            return (
              <button
                key={p.id}
                onClick={() => router.push(`/projects/${p.id}`)}
                className="text-left bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-400 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${type.color}`}>{type.label}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
                  </div>
                  {p.my_role === "admin" && (
                    <span className="text-xs text-gray-400 font-medium">관리자</span>
                  )}
                </div>

                <h2 className="font-bold text-gray-900 text-base group-hover:text-blue-600 transition-colors">
                  {p.name}
                </h2>
                {p.year && <p className="text-sm text-gray-400 mt-0.5">{p.year}년</p>}
                {p.description && (
                  <p className="text-sm text-gray-500 mt-2 line-clamp-2">{p.description}</p>
                )}
                {p.recurrence_years && (
                  <p className="text-xs text-gray-400 mt-3">{p.recurrence_years}년 주기 반복</p>
                )}

                <div className="mt-4 flex items-center justify-end text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity text-sm font-medium">
                  열기
                  <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 새 프로젝트 생성 모달 */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="새 프로젝트 만들기"
        footer={
          <>
            <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">취소</button>
            <button onClick={handleCreate} disabled={saving} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
              {saving ? "저장 중..." : "만들기"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">프로젝트명 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="예: MARF 2026"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">설명</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="프로젝트 간단 설명"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">유형</label>
              <Select
                value={form.project_type}
                onChange={(v) => setForm({ ...form, project_type: v })}
                options={[
                  { value: "marf", label: "MARF" },
                  { value: "general", label: "일반" },
                ]}
                className="w-full py-2 px-3 bg-white border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">연도</label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">반복 주기 (년, 선택)</label>
              <input
                type="number"
                value={form.recurrence_years}
                onChange={(e) => setForm({ ...form, recurrence_years: e.target.value })}
                placeholder="예: 3"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">상태</label>
              <Select
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v })}
                options={[
                  { value: "planning", label: "기획중" },
                  { value: "active",   label: "진행중" },
                  { value: "completed",label: "완료" },
                ]}
                className="w-full py-2 px-3 bg-white border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
