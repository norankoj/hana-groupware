"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Select from "@/components/Select";
import Modal from "@/components/Modal";

type Props = { projectId: string; onClose: () => void };

type Member = {
  id: string;
  user_id: string;
  role: string;
  profiles: { full_name: string; position: string | null } | null;
};

type Profile = { id: string; full_name: string; position: string | null };

export default function MemberModal({ projectId, onClose }: Props) {
  const supabase = createClient();
  const [members, setMembers] = useState<Member[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("member");
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    const [{ data: m }, { data: p }] = await Promise.all([
      supabase.from("project_members").select("id, user_id, role, profiles(full_name, position)").eq("project_id", projectId),
      supabase.from("profiles").select("id, full_name, position").neq("role", "pending").order("full_name"),
    ]);
    setMembers((m || []) as any[]);
    setAllProfiles((p || []) as Profile[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleAdd = async () => {
    if (!addUserId) { toast.error("사용자를 선택하세요."); return; }
    setSaving(true);
    const { error } = await supabase.from("project_members").upsert({ project_id: projectId, user_id: addUserId, role: addRole }, { onConflict: "project_id,user_id" });
    if (error) { toast.error("추가 실패"); setSaving(false); return; }
    toast.success("담당자가 추가되었습니다.");
    setAddUserId(""); fetch();
    setSaving(false);
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm("담당자에서 제거하시겠습니까?")) return;
    await supabase.from("project_members").delete().eq("id", memberId);
    toast.success("제거되었습니다.");
    fetch();
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    await supabase.from("project_members").update({ role: newRole }).eq("id", memberId);
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role: newRole } : m));
  };

  const memberUserIds = new Set(members.map((m) => m.user_id));
  const available = allProfiles.filter((p) => !memberUserIds.has(p.id));

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="담당자 관리"
      className="sm:max-w-[500px]"
      footer={<button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">닫기</button>}
    >
      {loading ? (
        <div className="text-center py-6 text-gray-400">로딩 중...</div>
      ) : (
        <div className="space-y-5">
          {/* 현재 담당자 */}
          <div>
            <h4 className="text-sm font-bold text-gray-700 mb-2">현재 담당자</h4>
            {members.length === 0 ? (
              <p className="text-sm text-gray-400">없음</p>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate">
                      {(m.profiles as any)?.full_name ?? "알 수 없음"}
                      {(m.profiles as any)?.position && <span className="text-gray-400 ml-1 font-normal">({(m.profiles as any).position})</span>}
                    </span>
                    <div className="w-24 shrink-0">
                      <Select
                        value={m.role}
                        onChange={(v) => handleRoleChange(m.id, v)}
                        options={[
                          { value: "admin",  label: "관리자" },
                          { value: "member", label: "멤버" },
                        ]}
                        className="w-full py-1 px-2 bg-white border border-gray-300 rounded text-xs"
                      />
                    </div>
                    <button onClick={() => handleRemove(m.id)} className="shrink-0 text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50 transition">제거</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 담당자 추가 */}
          <div>
            <h4 className="text-sm font-bold text-gray-700 mb-2">담당자 추가</h4>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <Select
                  value={addUserId}
                  onChange={(v) => setAddUserId(v)}
                  placeholder="사용자 선택..."
                  options={[
                    { value: "", label: "사용자 선택..." },
                    ...available.map((p) => ({
                      value: p.id,
                      label: `${p.full_name}${p.position ? ` (${p.position})` : ""}`,
                    })),
                  ]}
                  className="w-full py-2 px-3 bg-white border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div className="w-24 shrink-0">
                <Select
                  value={addRole}
                  onChange={(v) => setAddRole(v)}
                  options={[
                    { value: "member", label: "멤버" },
                    { value: "admin",  label: "관리자" },
                  ]}
                  className="w-full py-2 px-3 bg-white border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <button onClick={handleAdd} disabled={saving || !addUserId}
                className="shrink-0 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                추가
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
