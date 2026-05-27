"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Props = {
  projectId: string;
  myUserId: string;
  isAdmin: boolean;
  project: { name: string; year: number | null; status: string; recurrence_years: number | null };
  isMarf: boolean;
};

type Stats = {
  totalFamilies: number;       // 가구 수
  totalIndividuals: number;    // 전체 인원 (서브텍스트용)
  accommodationNeeded: number; // 숙소 필요 가구
  accommodationMatched: number;
  vehicleNeeded: number;       // 차량 필요 가구
  vehicleMatched: number;
  vehicleInsuranceDone: number;
  upcomingSchedules: { id: string; title: string; event_date: string; location: string | null }[];
  pendingChecklists: { id: string; title: string; due_date: string | null; category: string }[];
};

export default function OverviewTab({ projectId, isMarf, project }: Props) {
  const supabase = createClient();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);

      const empty: Promise<{ data: any[] | null; error: null }> = Promise.resolve({ data: [], error: null });
      const [
        { data: missionaries },
        { data: accommodations },
        { data: vehicles },
        { data: schedules },
        { data: checklists },
      ] = await Promise.all([
        isMarf
          ? supabase.from("marf_missionaries").select("id, accommodation_needed, vehicle_needed, family_group").eq("project_id", projectId)
          : empty,
        isMarf
          ? supabase.from("marf_accommodations").select("id, assigned_missionary_id, assignments").eq("project_id", projectId)
          : empty,
        isMarf
          ? supabase.from("marf_vehicles").select("id, assigned_missionary_id, assignments, insurance_added").eq("project_id", projectId)
          : empty,
        supabase
          .from("project_schedules")
          .select("id, title, event_date, location")
          .eq("project_id", projectId)
          .gte("event_date", today)
          .order("event_date")
          .limit(5),
        supabase
          .from("project_checklists")
          .select("id, title, due_date, category")
          .eq("project_id", projectId)
          .eq("is_completed", false)
          .order("due_date", { nullsFirst: false })
          .limit(5),
      ]);

      const mArr = missionaries || [];
      const aArr = accommodations || [];
      const vArr = vehicles || [];

      // 가구 단위 카운트 헬퍼
      const countUnits = (arr: any[]) => {
        const groups = new Set<string>();
        let solo = 0;
        arr.forEach(m => {
          const g = m.family_group?.trim();
          if (g) groups.add(g);
          else solo++;
        });
        return groups.size + solo;
      };

      // 배정 완료 가구 수 계산 (assignments JSONB 배열 우선, 레거시 assigned_missionary_id 폴백)
      const matchedFamilyUnits = (
        arr: any[],           // accommodations or vehicles
        missionaryArr: any[]  // missionaries (for family_group lookup)
      ) => {
        const assignedIds = new Set<string>();
        arr.forEach(x => {
          if (Array.isArray(x.assignments) && x.assignments.length > 0) {
            x.assignments.forEach((a: any) => { if (a.missionary_id) assignedIds.add(a.missionary_id); });
          } else if (x.assigned_missionary_id) {
            assignedIds.add(x.assigned_missionary_id);
          }
        });
        const matchedGroups = new Set<string>();
        let matchedSolo = 0;
        missionaryArr.forEach(m => {
          if (assignedIds.has(m.id)) {
            const g = m.family_group?.trim();
            if (g) matchedGroups.add(g);
            else matchedSolo++;
          }
        });
        return matchedGroups.size + matchedSolo;
      };

      setStats({
        totalFamilies:        countUnits(mArr),
        totalIndividuals:     mArr.length,
        accommodationNeeded:  countUnits(mArr.filter((m: any) => m.accommodation_needed)),
        accommodationMatched: matchedFamilyUnits(aArr, mArr),
        vehicleNeeded:        countUnits(mArr.filter((m: any) => m.vehicle_needed)),
        vehicleMatched:       matchedFamilyUnits(vArr, mArr),
        vehicleInsuranceDone: vArr.filter((v: any) => v.insurance_added).length,
        upcomingSchedules: (schedules || []) as any[],
        pendingChecklists: (checklists || []) as any[],
      });
      setLoading(false);
    })();
  }, [projectId, isMarf]);

  if (loading) return <div className="text-center py-10 text-gray-400">로딩 중...</div>;
  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* MARF 통계 카드 */}
      {isMarf && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="전체 명단"
            value={`${stats.totalIndividuals}명`}
            sub={`${stats.totalFamilies ?? stats.totalIndividuals}가구`}
            color="blue"
            icon="✈️"
          />
          <StatCard
            label="숙소 매칭"
            value={`${stats.accommodationMatched}/${stats.accommodationNeeded}가구`}
            sub={stats.accommodationNeeded > 0 && stats.accommodationMatched < stats.accommodationNeeded ? "미배정 있음" : "완료"}
            color={stats.accommodationMatched < stats.accommodationNeeded ? "yellow" : "green"}
            icon="🏠"
          />
          <StatCard
            label="차량 매칭"
            value={`${stats.vehicleMatched}/${stats.vehicleNeeded}가구`}
            sub={stats.vehicleNeeded > 0 && stats.vehicleMatched < stats.vehicleNeeded ? "미배정 있음" : "완료"}
            color={stats.vehicleMatched < stats.vehicleNeeded ? "yellow" : "green"}
            icon="🚗"
          />
          <StatCard
            label="차량 보험"
            value={`${stats.vehicleInsuranceDone}대`}
            sub="운전자 추가 완료"
            color="purple"
            icon="🛡️"
          />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-6">
        {/* 임박한 일정 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            📅 <span>다가오는 일정</span>
          </h3>
          {stats.upcomingSchedules.length === 0 ? (
            <p className="text-sm text-gray-400">등록된 일정이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {stats.upcomingSchedules.map((s) => (
                <li key={s.id} className="flex items-start gap-3 text-sm">
                  <span className="text-gray-400 shrink-0 tabular-nums">{s.event_date}</span>
                  <div>
                    <span className="font-medium text-gray-800">{s.title}</span>
                    {s.location && <span className="text-gray-400 ml-1">· {s.location}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 미완료 체크리스트 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            ✅ <span>미완료 체크리스트</span>
          </h3>
          {stats.pendingChecklists.length === 0 ? (
            <p className="text-sm text-gray-400">남은 항목이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {stats.pendingChecklists.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                  <span className="text-gray-700 flex-1">{c.title}</span>
                  {c.due_date && <span className="text-gray-400 text-xs">{c.due_date}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color: string; icon: string;
}) {
  const colors: Record<string, string> = {
    blue:   "bg-blue-50 border-blue-100",
    green:  "bg-green-50 border-green-100",
    yellow: "bg-yellow-50 border-yellow-100",
    purple: "bg-purple-50 border-purple-100",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || "bg-gray-50 border-gray-100"}`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-lg font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-600 font-medium">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
