"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Select from "@/components/Select";
import Modal from "@/components/Modal";

type Props = { projectId: string; myUserId: string; isMember: boolean; isAdmin: boolean };

type Doc = {
  id: string;
  title: string;
  content: string | null;
  doc_type: string;
  created_at: string;
  updated_at: string;
};

const DOC_TYPES: Record<string, { label: string; color: string }> = {
  accommodation_guide: { label: "숙소 안내문", color: "bg-blue-100 text-blue-700" },
  vehicle_guide:       { label: "차량 안내문", color: "bg-green-100 text-green-700" },
  insurance:           { label: "보험 서류",   color: "bg-orange-100 text-orange-700" },
  general:             { label: "일반",         color: "bg-gray-100 text-gray-600" },
};

const EMPTY_FORM = { title: "", content: "", doc_type: "general" };

export default function DocumentTab({ projectId, myUserId, isMember, isAdmin }: Props) {
  const supabase = createClient();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Doc | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const fetch = useCallback(async () => {
    const { data } = await supabase.from("project_documents").select("*").eq("project_id", projectId).order("updated_at", { ascending: false });
    setDocs((data || []) as Doc[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetch(); }, [fetch]);

  const openCreate = () => { setSelected(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (d: Doc) => {
    setSelected(d);
    setForm({ title: d.title, content: d.content || "", doc_type: d.doc_type });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("제목을 입력하세요."); return; }
    setSaving(true);
    const payload = { title: form.title, content: form.content || null, doc_type: form.doc_type };
    if (selected) {
      const { error } = await supabase.from("project_documents").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", selected.id);
      if (error) { toast.error("수정 실패"); setSaving(false); return; }
      toast.success("수정되었습니다.");
    } else {
      const { error } = await supabase.from("project_documents").insert({ ...payload, project_id: projectId, created_by: myUserId });
      if (error) { toast.error("저장 실패"); setSaving(false); return; }
      toast.success("저장되었습니다.");
    }
    setShowModal(false);
    fetch();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await supabase.from("project_documents").delete().eq("id", id);
    toast.success("삭제되었습니다.");
    fetch();
  };

  const filtered = filterType === "all" ? docs : docs.filter((d) => d.doc_type === filterType);

  if (loading) return <div className="text-center py-10 text-gray-400">로딩 중...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="w-36">
          <Select
            value={filterType}
            onChange={(v) => setFilterType(v)}
            options={[
              { value: "all", label: "전체" },
              ...Object.entries(DOC_TYPES).map(([k, v]) => ({ value: k, label: v.label })),
            ]}
            className="w-full py-2 px-3 bg-white border border-gray-300 rounded-lg text-sm"
          />
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            문서 추가
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">등록된 문서가 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => {
            const type = DOC_TYPES[d.doc_type] ?? DOC_TYPES.general;
            return (
              <div key={d.id} className={`bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4 hover:shadow-sm transition ${isMember ? "cursor-pointer" : ""}`} onClick={() => isMember && openEdit(d)}>
                <div className="shrink-0">
                  <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${type.color}`}>{type.label}</span>
                    <span className="font-medium text-gray-900 truncate">{d.title}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">최종 수정: {new Date(d.updated_at).toLocaleDateString("ko-KR")}</p>
                </div>
                {isAdmin && (
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }}
                    className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50 transition shrink-0">삭제</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={selected ? "문서 수정" : "문서 추가"}
        className="sm:max-w-[750px]"
        bodyClassName="p-6"
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "저장 중..." : "저장"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">제목 *</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">문서 유형</label>
              <Select
                value={form.doc_type}
                onChange={(v) => setForm({ ...form, doc_type: v })}
                options={Object.entries(DOC_TYPES).map(([k, v]) => ({ value: k, label: v.label }))}
                className="w-full py-2 px-3 bg-white border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">내용</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={14}
              placeholder="안내문 내용을 작성하세요..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono leading-relaxed"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
