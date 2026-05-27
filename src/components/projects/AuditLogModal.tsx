"use client";

import { useEffect, useState, useCallback } from "react";
import Modal from "@/components/Modal";
import { createClient } from "@/utils/supabase/client";

type AuditLog = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  summary: string | null;
  actor_name: string | null;
  created_at: string;
  before_data: unknown;
  after_data: unknown;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  /** 특정 자원의 이력만 보고 싶을 때 */
  entityType?: string;
  entityId?: string;
  title?: string;
};

const ENTITY_LABEL: Record<string, string> = {
  accommodation: "숙소",
  vehicle:       "차량",
  missionary:    "선교사",
  gift:          "선물",
  schedule:      "일정",
  checklist:     "체크리스트",
  document:      "문서",
  project:       "프로젝트",
};

const ACTION_LABEL: Record<string, { label: string; color: string }> = {
  create:    { label: "추가",    color: "bg-emerald-100 text-emerald-700" },
  update:    { label: "수정",    color: "bg-blue-100 text-blue-700" },
  delete:    { label: "삭제",    color: "bg-red-100 text-red-700" },
  assign:    { label: "배정",    color: "bg-indigo-100 text-indigo-700" },
  unassign:  { label: "배정해제", color: "bg-gray-100 text-gray-600" },
  reassign:  { label: "재배정",  color: "bg-purple-100 text-purple-700" },
};

export default function AuditLogModal({
  isOpen, onClose, projectId, entityType, entityId, title,
}: Props) {
  const supabase = createClient();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRaw, setShowRaw] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("marf_audit_logs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (entityType) q = q.eq("entity_type", entityType);
    if (entityId)   q = q.eq("entity_id",   entityId);
    const { data } = await q;
    setLogs((data ?? []) as AuditLog[]);
    setLoading(false);
  }, [projectId, entityType, entityId, supabase]);

  useEffect(() => { if (isOpen) fetchLogs(); }, [isOpen, fetchLogs]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title ?? "변경 이력"}
      bodyClassName="p-0"
    >
      {loading ? (
        <p className="text-center text-gray-400 py-10">불러오는 중...</p>
      ) : logs.length === 0 ? (
        <p className="text-center text-gray-400 py-10">아직 기록된 이력이 없습니다.</p>
      ) : (
        <ol className="divide-y divide-gray-100">
          {logs.map((log) => {
            const act = ACTION_LABEL[log.action] ?? { label: log.action, color: "bg-gray-100 text-gray-600" };
            const entityName = ENTITY_LABEL[log.entity_type] ?? log.entity_type;
            const dt = new Date(log.created_at);
            const dateStr = `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`;
            const hasRaw = !!(log.before_data || log.after_data);

            return (
              <li key={log.id} className="px-4 py-3 hover:bg-gray-50">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${act.color}`}>
                    {act.label}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-gray-500">{entityName}</span>
                  <span className="text-sm text-gray-800 flex-1 min-w-0">{log.summary ?? "(요약 없음)"}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-400">
                  <span>
                    {log.actor_name ?? "(알수없음)"} · {dateStr}
                  </span>
                  {hasRaw && (
                    <button
                      onClick={() => setShowRaw(showRaw === log.id ? null : log.id)}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      {showRaw === log.id ? "▲ 상세 닫기" : "▼ 상세보기"}
                    </button>
                  )}
                </div>
                {showRaw === log.id && hasRaw && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                    {log.before_data != null && (
                      <div>
                        <div className="font-semibold text-gray-500 mb-0.5">변경 전</div>
                        <pre className="bg-gray-50 border border-gray-100 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                          {JSON.stringify(log.before_data, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.after_data != null && (
                      <div>
                        <div className="font-semibold text-gray-500 mb-0.5">변경 후</div>
                        <pre className="bg-gray-50 border border-gray-100 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                          {JSON.stringify(log.after_data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}
