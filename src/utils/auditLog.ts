// ── MARF 변경 이력 로깅 헬퍼 ─────────────────────────────────────────────
// 모든 주요 변경(배정·자원 수정·명단 변경 등) 시 호출해서 marf_audit_logs에 기록.
// 실패해도 본 작업은 진행되어야 하므로 항상 try/catch로 감싸 사용한다.

import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditEntityType =
  | "accommodation"
  | "vehicle"
  | "missionary"
  | "gift"
  | "schedule"
  | "checklist"
  | "document"
  | "project";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "assign"
  | "unassign"
  | "reassign";

type LogOpts = {
  projectId: string;
  entityType: AuditEntityType;
  entityId?: string | null;
  action: AuditAction;
  summary: string;
  beforeData?: unknown;
  afterData?: unknown;
};

let cachedActorName: string | null = null;

async function getActorName(supabase: SupabaseClient): Promise<string | null> {
  if (cachedActorName) return cachedActorName;
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const { data: p } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", data.user.id)
      .maybeSingle();
    // 이름 우선, 없으면 auth 메타데이터, 없으면 이메일 @ 앞부분만
    cachedActorName =
      p?.name ||
      (data.user.user_metadata?.name as string | undefined) ||
      (data.user.user_metadata?.full_name as string | undefined) ||
      data.user.email?.split("@")[0] ||
      null;
    return cachedActorName;
  } catch {
    return null;
  }
}

/**
 * 변경 이력 한 줄 기록. 실패는 silently swallow (본 작업 흐름 방해 X).
 */
export async function logAudit(supabase: SupabaseClient, opts: LogOpts): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const actorId = userData.user?.id ?? null;
    const actorName = await getActorName(supabase);
    await supabase.from("marf_audit_logs").insert({
      project_id:  opts.projectId,
      entity_type: opts.entityType,
      entity_id:   opts.entityId ?? null,
      action:      opts.action,
      summary:     opts.summary,
      before_data: opts.beforeData ?? null,
      after_data:  opts.afterData ?? null,
      actor_id:    actorId,
      actor_name:  actorName,
    });
  } catch (e) {
    // 로깅 실패는 콘솔에만 남기고 본 작업은 계속 진행
    console.warn("[auditLog] 기록 실패:", e);
  }
}

// ── 변경 요약 생성기 (assignments 비교용) ───────────────────────────────
type AssignmentLike = { missionary_id: string; from: string; to: string };

/**
 * assignments 배열 변화를 사람이 읽을 수 있는 텍스트로 변환.
 * 예: "김선교 가정 추가 (6/3~6/10) / 박선교 가정 제거"
 */
export function summarizeAssignmentDiff(
  before: AssignmentLike[],
  after: AssignmentLike[],
  missionaryNameMap: Map<string, string>,
): string {
  const beforeSet = new Map<string, AssignmentLike>();
  before.forEach((a) => beforeSet.set(`${a.missionary_id}|${a.from}|${a.to}`, a));
  const afterSet = new Map<string, AssignmentLike>();
  after.forEach((a) => afterSet.set(`${a.missionary_id}|${a.from}|${a.to}`, a));

  const added:   AssignmentLike[] = [];
  const removed: AssignmentLike[] = [];

  afterSet.forEach((v, k) => { if (!beforeSet.has(k)) added.push(v); });
  beforeSet.forEach((v, k) => { if (!afterSet.has(k)) removed.push(v); });

  const fmt = (a: AssignmentLike) => {
    const name = missionaryNameMap.get(a.missionary_id) ?? "(알수없음)";
    const dr = a.from && a.to ? ` ${a.from.slice(5)}~${a.to.slice(5)}` : "";
    return `${name}${dr}`;
  };
  const parts: string[] = [];
  if (added.length)   parts.push(`+ ${added.map(fmt).join(", ")}`);
  if (removed.length) parts.push(`- ${removed.map(fmt).join(", ")}`);
  return parts.join(" / ") || "변경 없음";
}
