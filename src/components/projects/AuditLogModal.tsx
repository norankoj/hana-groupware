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
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  entityType?: string;
  entityId?: string;
  title?: string;
};

// ─── 필드명 한국어 매핑 ────────────────────────────────────────────
const FIELD_KO: Record<string, string> = {
  name: "이름", affiliation: "소속", country: "국가",
  departure_location: "출발지", family_group: "가족그룹", phone: "연락처",
  arrival_date: "도착일", arrival_time: "도착시간",
  arrival_flight: "항공편(IN)", arrival_terminal: "터미널(IN)",
  departure_date: "출국일", departure_time: "출국시간",
  departure_flight: "항공편(OUT)", departure_terminal: "터미널(OUT)",
  accommodation_needed: "숙소필요", vehicle_needed: "차량필요",
  ride_needed: "라이드필요", dietary_notes: "식이제한",
  notes: "메모",
  provider_name: "제공자", provider_contact: "제공자연락처",
  address: "주소", capacity: "수용인원", amenities: "시설",
  available_from: "제공시작", available_to: "제공종료",
  car_model: "차종", car_number: "차량번호", insurance_added: "보험",
  assignments: "배정",
  item_name: "선물명", quantity: "수량", status: "상태",
  responsible_name: "담당자", budget: "예산", actual_cost: "실비",
  title: "제목", event_date: "날짜", start_time: "시작", end_time: "종료",
  location: "장소", description: "내용", category: "카테고리",
};

// 출력에서 제외할 기술적 필드
const SKIP_KEYS = new Set([
  "id", "project_id", "created_at", "updated_at", "share_token",
  "accommodation_from", "accommodation_to", "vehicle_from", "vehicle_to",
  "accommodation_periods", "vehicle_periods",
]);

// 값 포매터
function fmtVal(val: unknown): string {
  if (val === null || val === undefined || val === "") return "(없음)";
  if (typeof val === "boolean") return val ? "예" : "아니오";
  if (Array.isArray(val)) {
    if (val.length === 0) return "(없음)";
    // assignments 배열은 간결하게
    if (typeof val[0] === "object" && val[0] !== null && "missionary_id" in val[0]) {
      return `배정 ${val.length}건`;
    }
    return val.join(", ");
  }
  return String(val);
}

type DiffRow = { key: string; before: unknown; after: unknown };

function getDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): DiffRow[] {
  const b = before ?? {};
  const a = after ?? {};
  const allKeys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
  return allKeys
    .filter((k) => !SKIP_KEYS.has(k))
    .filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null))
    .map((k) => ({ key: k, before: b[k] ?? null, after: a[k] ?? null }));
}

// ─── Action 배지 ────────────────────────────────────────────────────
const ACTION_LABEL: Record<string, { label: string; color: string }> = {
  create:   { label: "추가",    color: "bg-emerald-100 text-emerald-700" },
  update:   { label: "수정",    color: "bg-blue-100 text-blue-700" },
  delete:   { label: "삭제",    color: "bg-red-100 text-red-700" },
  assign:   { label: "배정",    color: "bg-indigo-100 text-indigo-700" },
  unassign: { label: "배정해제", color: "bg-gray-100 text-gray-600" },
  reassign: { label: "재배정",  color: "bg-purple-100 text-purple-700" },
};

const ENTITY_LABEL: Record<string, string> = {
  accommodation: "숙소", vehicle: "차량", missionary: "선교사",
  gift: "선물", schedule: "일정", checklist: "체크리스트",
  document: "문서", project: "프로젝트",
};

export default function AuditLogModal({
  isOpen, onClose, projectId, entityType, entityId, title,
}: Props) {
  const supabase = createClient();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [profileNames, setProfileNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expandId, setExpandId] = useState<string | null>(null);

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
    const rows = (data ?? []) as AuditLog[];
    setLogs(rows);

    // actor_id로 profiles에서 이름 일괄 조회 (기존 이메일 저장 데이터 보정)
    const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", ids);
      const map = new Map<string, string>();
      (profiles ?? []).forEach((p: { id: string; name: string | null }) => {
        if (p.name) map.set(p.id, p.name);
      });
      setProfileNames(map);
    }
    setLoading(false);
  }, [projectId, entityType, entityId, supabase]);

  useEffect(() => { if (isOpen) fetchLogs(); }, [isOpen, fetchLogs]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title ?? "변경 이력"} bodyClassName="p-0">
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
            const dateStr = `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;

            // diff 계산
            const diff = getDiff(log.before_data, log.after_data);
            const hasDiff = diff.length > 0;
            const isExpanded = expandId === log.id;

            return (
              <li key={log.id} className="px-4 py-3 hover:bg-gray-50">
                {/* 요약 줄 */}
                <div className="flex items-start gap-2 flex-wrap">
                  <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${act.color}`}>
                    {act.label}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-gray-400">{entityName}</span>
                  <span className="text-sm text-gray-800 flex-1 min-w-0">{log.summary ?? "(요약 없음)"}</span>
                </div>

                {/* 메타 줄 */}
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-400">
                  <span>{(log.actor_id && profileNames.get(log.actor_id)) ?? log.actor_name ?? "(알수없음)"} · {dateStr}</span>
                  {hasDiff && (
                    <button
                      onClick={() => setExpandId(isExpanded ? null : log.id)}
                      className="text-blue-500 hover:text-blue-700 font-medium"
                    >
                      {isExpanded ? "▲ 닫기" : `▼ 변경내용 ${diff.length}건`}
                    </button>
                  )}
                </div>

                {/* diff 펼침 */}
                {isExpanded && hasDiff && (
                  <div className="mt-2 rounded-lg border border-gray-200 overflow-hidden text-xs">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 text-[10px]">
                          <th className="px-3 py-1.5 text-left font-semibold w-24">항목</th>
                          {log.before_data && <th className="px-3 py-1.5 text-left font-semibold text-red-400">변경 전</th>}
                          {log.after_data  && <th className="px-3 py-1.5 text-left font-semibold text-blue-500">변경 후</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {diff.map((row) => (
                          <tr key={row.key} className="hover:bg-gray-50/50">
                            <td className="px-3 py-1.5 font-medium text-gray-500 whitespace-nowrap">
                              {FIELD_KO[row.key] ?? row.key}
                            </td>
                            {log.before_data && (
                              <td className="px-3 py-1.5 text-gray-500 break-all">
                                {fmtVal(row.before)}
                              </td>
                            )}
                            {log.after_data && (
                              <td className="px-3 py-1.5 text-gray-800 break-all font-medium">
                                {fmtVal(row.after)}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
