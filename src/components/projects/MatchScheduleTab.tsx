"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { checkCoverage, type Coverage } from "@/utils/projectUtils";
import { type AssignmentEntry } from "@/components/projects/AccommodationTab";

type Props = { projectId: string; myUserId: string; isMember: boolean; isAdmin: boolean };

type Resource = {
  id: string;
  provider_name: string;
  available_from: string | null;
  available_to: string | null;
  is_church_owned: boolean;
  assignments: AssignmentEntry[] | null;
  assigned_missionary_id: string | null;
  // 숙소 전용
  address?: string | null;
  capacity?: number | null;
  // 차량 전용
  car_model?: string | null;
  car_number?: string | null;
  insurance_added?: boolean | null;
};

type Missionary = {
  id: string;
  name: string;
  family_group: string | null;
  arrival_date: string | null;
  departure_date: string | null;
};

type TimelineBlock = {
  from: string;
  to: string;
  label: string;           // 가족명 / 선교사명
  coverage: Coverage;
  color: string;           // 가정별 고유 색상
  resource: Resource;
  missionaryId: string;
  resourceName: string;    // 숙소 or 차량 제공자명
};

type PopupInfo = { block: TimelineBlock; x: number; y: number };

// ── 가정별 색상 팔레트 ───────────────────────────────────────────────────────
const PALETTE = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#84cc16", // lime-500
  "#6366f1", // indigo-500
  "#14b8a6", // teal-500
  "#d946ef", // fuchsia-500
  "#ef4444", // red-500
];

// ── 유틸 함수 ────────────────────────────────────────────────────────────────

function normalizeAssignments(item: {
  assignments?: AssignmentEntry[] | null;
  assigned_missionary_id: string | null;
  available_from: string | null;
  available_to: string | null;
}): AssignmentEntry[] {
  if (item.assignments && item.assignments.length > 0) return item.assignments;
  if (item.assigned_missionary_id) {
    return [{
      missionary_id: item.assigned_missionary_id,
      from: item.available_from ?? "",
      to:   item.available_to   ?? "",
    }];
  }
  return [];
}

/** UTC 정오 기준 dateRange — 타임존 영향 없음 */
function dateRange(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  const dates: string[] = [];
  const cur = new Date(from + "T12:00:00Z");
  const end = new Date(to   + "T12:00:00Z");
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/** "2026-06-03" → "6/3" */
function fmtDay(d: string): string {
  return `${parseInt(d.slice(5, 7))}/${parseInt(d.slice(8, 10))}`;
}

/** "2026-06-03" → "2026년 6월" */
function monthLabel(d: string): string {
  return `${d.slice(0, 4)}년 ${parseInt(d.slice(5, 7))}월`;
}

/** UTC 기준 요일 체크 */
function isWeekend(d: string): boolean {
  const dow = new Date(d + "T12:00:00Z").getUTCDay();
  return dow === 0 || dow === 6;
}

/** yearMonth: "2026-06", blocks: 해당 섹션의 전체 블록 */
function getCalendarWeeks(yearMonth: string, blocks: TimelineBlock[]) {
  const [y, mo] = yearMonth.split("-").map(Number);
  const firstDay = new Date(y, mo - 1, 1);
  const lastDay  = new Date(y, mo,     0);
  const startDow = firstDay.getDay(); // 0=일요일

  const cur = new Date(firstDay);
  cur.setDate(cur.getDate() - startDow); // 해당 주 일요일로 이동

  const padDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const weeks: { date: string; isCurrentMonth: boolean; dayBlocks: TimelineBlock[] }[][] = [];

  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = padDate(cur);
      week.push({
        date: dateStr,
        isCurrentMonth: cur.getMonth() === mo - 1,
        dayBlocks: blocks.filter((b) => dateStr >= b.from && dateStr <= b.to),
      });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
    if (cur > lastDay) break; // 다음 주가 이미 다음 달이면 중단
  }
  return weeks;
}

/** yearMonth에 delta 개월 가감 → "YYYY-MM" */
function addMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── 상수 ─────────────────────────────────────────────────────────────────────
const CELL    = 36;  // px/일
const ROW     = 40;  // px/자원 행
const LABEL_W = 148; // px 고정 이름 열

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────
export default function MatchScheduleTab({ projectId }: Props) {
  const supabase = createClient();

  const [section,       setSection]       = useState<"accommodation" | "vehicle">("accommodation");
  const [viewMode,      setViewMode]      = useState<"timeline" | "calendar">("timeline");
  const [accommodations, setAccoms]       = useState<Resource[]>([]);
  const [vehicles,      setVehicles]      = useState<Resource[]>([]);
  const [missionaries,  setMissionaries]  = useState<Missionary[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [popup,         setPopup]         = useState<PopupInfo | null>(null);
  const [calMonth,      setCalMonth]      = useState("");
  const popupRef = useRef<HTMLDivElement>(null);

  // ── 데이터 로드 ─────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const [{ data: a }, { data: v }, { data: m }] = await Promise.all([
      supabase
        .from("marf_accommodations")
        .select("id, provider_name, available_from, available_to, is_church_owned, assignments, assigned_missionary_id, address, capacity")
        .eq("project_id", projectId)
        .order("created_at"),
      supabase
        .from("marf_vehicles")
        .select("id, provider_name, available_from, available_to, is_church_owned, assignments, assigned_missionary_id, car_model, car_number, insurance_added")
        .eq("project_id", projectId)
        .order("created_at"),
      supabase
        .from("marf_missionaries")
        .select("id, name, family_group, arrival_date, departure_date")
        .eq("project_id", projectId)
        .order("family_group")
        .order("name"),
    ]);
    setAccoms((a ?? []) as Resource[]);
    setVehicles((v ?? []) as Resource[]);
    setMissionaries((m ?? []) as Missionary[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── 프로젝트 날짜 범위 ───────────────────────────────────────────────────
  const projectFrom = missionaries.map((m) => m.arrival_date).filter(Boolean).sort()[0]      ?? "";
  const projectTo   = missionaries.map((m) => m.departure_date).filter(Boolean).sort().at(-1) ?? "";

  // calMonth 초기화 (projectFrom 로드 후 1회)
  useEffect(() => {
    if (projectFrom && !calMonth) setCalMonth(projectFrom.slice(0, 7));
  }, [projectFrom, calMonth]);

  // ── 가정별 색상 맵 ───────────────────────────────────────────────────────
  const familyColorMap = useMemo(() => {
    const map    = new Map<string, string>();
    const labels = new Set<string>();
    missionaries.forEach((m) => labels.add(m.family_group?.trim() || m.name));
    let i = 0;
    for (const label of labels) {
      map.set(label, PALETTE[i % PALETTE.length]);
      i++;
    }
    return map;
  }, [missionaries]);

  // ── 선교사 라벨 ─────────────────────────────────────────────────────────
  const getMLabel = useCallback(
    (id: string) => {
      const m = missionaries.find((x) => x.id === id);
      if (!m) return "?";
      return m.family_group?.trim() || m.name;
    },
    [missionaries],
  );

  // ── 자원별 블록 계산 ─────────────────────────────────────────────────────
  const getBlocks = useCallback(
    (r: Resource): TimelineBlock[] =>
      normalizeAssignments(r)
        .filter((a) => a.missionary_id && a.from && a.to)
        .map((a) => {
          const label    = getMLabel(a.missionary_id);
          const color    = familyColorMap.get(label) ?? "#6b7280";
          const coverage = r.is_church_owned
            ? ("full" as Coverage)
            : checkCoverage(r.available_from, r.available_to, a.from, a.to);
          return {
            from: a.from, to: a.to,
            label, coverage, color,
            resource:     r,
            missionaryId: a.missionary_id,
            resourceName: r.provider_name,
          };
        }),
    [getMLabel, familyColorMap],
  );

  const resources = section === "accommodation" ? accommodations : vehicles;

  // ── 타임라인 날짜 배열 ───────────────────────────────────────────────────
  const dates     = useMemo(() => dateRange(projectFrom, projectTo), [projectFrom, projectTo]);
  const dateIndex = useMemo(() => new Map(dates.map((d, i) => [d, i])), [dates]);
  const totalW    = dates.length * CELL;

  // ── 월 그룹 (타임라인 헤더) ──────────────────────────────────────────────
  const monthGroups = useMemo(() => {
    const groups: { month: string; count: number }[] = [];
    dates.forEach((d) => {
      const ml   = monthLabel(d);
      const last = groups.at(-1);
      if (last?.month === ml) last.count++;
      else groups.push({ month: ml, count: 1 });
    });
    return groups;
  }, [dates]);

  // ── 달력용 전체 블록 ─────────────────────────────────────────────────────
  const allBlocks = useMemo(
    () => resources.flatMap((r) => getBlocks(r)),
    [resources, getBlocks],
  );

  // ── 달력 주 계산 ─────────────────────────────────────────────────────────
  const calWeeks = useMemo(
    () => (calMonth ? getCalendarWeeks(calMonth, allBlocks) : []),
    [calMonth, allBlocks],
  );

  // ── 팝업 외부 클릭 닫기 ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopup(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── 렌더 ────────────────────────────────────────────────────────────────
  if (loading) return <div className="text-center py-10 text-gray-400">로딩 중...</div>;

  if (dates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <svg className="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-sm">선교사 도착·출발 날짜를 입력하면 타임라인이 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div>
      {/* ── 팝업 ──────────────────────────────────────────────────────────── */}
      {popup && (
        <div
          ref={popupRef}
          className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200"
          style={{
            width: 280,
            top:  Math.min(popup.y + 12, (typeof window !== "undefined" ? window.innerHeight : 700) - 330),
            left: (typeof window !== "undefined" && popup.x > window.innerWidth * 0.6)
              ? popup.x - 290
              : popup.x + 10,
          }}
        >
          {/* 팝업 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: popup.block.color }}
              />
              <span className="font-bold text-gray-800 text-sm truncate">{popup.block.label}</span>
            </div>
            <button
              onClick={() => setPopup(null)}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-lg leading-none ml-2"
            >
              ×
            </button>
          </div>

          {/* 팝업 바디 */}
          <div className="p-4 space-y-3">
            {/* 배정 기간 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">배정 기간</span>
              <span className="text-xs font-semibold text-gray-800">
                {popup.block.from.slice(5)} ~ {popup.block.to.slice(5)}
              </span>
              {popup.block.coverage !== "full" && (
                <span className="text-xs text-orange-500 font-semibold">⚠️ 기간 불일치</span>
              )}
            </div>

            {/* 자원 정보 테이블 */}
            <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
              <tbody className="divide-y divide-gray-100">
                {section === "accommodation" ? (
                  <>
                    <tr>
                      <th className="w-20 px-3 py-2 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">숙소</th>
                      <td className="px-3 py-2 text-gray-800 font-semibold">{popup.block.resource.provider_name}</td>
                    </tr>
                    {popup.block.resource.address && (
                      <tr>
                        <th className="px-3 py-2 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">주소</th>
                        <td className="px-3 py-2 text-gray-700">{popup.block.resource.address}</td>
                      </tr>
                    )}
                    {popup.block.resource.capacity && (
                      <tr>
                        <th className="px-3 py-2 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">수용 인원</th>
                        <td className="px-3 py-2 text-gray-700">{popup.block.resource.capacity}명</td>
                      </tr>
                    )}
                    {!popup.block.resource.is_church_owned && popup.block.resource.available_from && (
                      <tr>
                        <th className="px-3 py-2 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">제공 기간</th>
                        <td className="px-3 py-2 text-gray-700">
                          {popup.block.resource.available_from.slice(5)} ~ {popup.block.resource.available_to?.slice(5) ?? "미정"}
                        </td>
                      </tr>
                    )}
                  </>
                ) : (
                  <>
                    <tr>
                      <th className="w-20 px-3 py-2 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">차량 제공</th>
                      <td className="px-3 py-2 text-gray-800 font-semibold">{popup.block.resource.provider_name}</td>
                    </tr>
                    {popup.block.resource.car_model && (
                      <tr>
                        <th className="px-3 py-2 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">차종</th>
                        <td className="px-3 py-2 text-gray-700">{popup.block.resource.car_model}</td>
                      </tr>
                    )}
                    {popup.block.resource.car_number && (
                      <tr>
                        <th className="px-3 py-2 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">차량 번호</th>
                        <td className="px-3 py-2 text-gray-700">{popup.block.resource.car_number}</td>
                      </tr>
                    )}
                    <tr>
                      <th className="px-3 py-2 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">보험</th>
                      <td className="px-3 py-2">
                        {popup.block.resource.insurance_added
                          ? <span className="text-emerald-600 font-semibold">✓ 추가 완료</span>
                          : <span className="text-orange-500">미완료</span>
                        }
                      </td>
                    </tr>
                    {!popup.block.resource.is_church_owned && popup.block.resource.available_from && (
                      <tr>
                        <th className="px-3 py-2 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">제공 기간</th>
                        <td className="px-3 py-2 text-gray-700">
                          {popup.block.resource.available_from.slice(5)} ~ {popup.block.resource.available_to?.slice(5) ?? "미정"}
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 상단 컨트롤 ────────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {/* 섹션 탭 */}
        <button
          onClick={() => setSection("accommodation")}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
            section === "accommodation"
              ? "bg-blue-600 text-white"
              : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          🏠 숙소 배정 ({accommodations.length}개)
        </button>
        <button
          onClick={() => setSection("vehicle")}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
            section === "vehicle"
              ? "bg-blue-600 text-white"
              : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          🚗 차량 배정 ({vehicles.length}대)
        </button>

        {/* 뷰 모드 토글 */}
        <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode("timeline")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              viewMode === "timeline"
                ? "bg-white shadow text-gray-800"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            📊 타임라인
          </button>
          <button
            onClick={() => setViewMode("calendar")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              viewMode === "calendar"
                ? "bg-white shadow text-gray-800"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            📅 달력
          </button>
        </div>
      </div>

      {resources.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          {section === "accommodation" ? "등록된 숙소가 없습니다." : "등록된 차량이 없습니다."}
        </div>
      ) : viewMode === "timeline" ? (

        /* ── 타임라인 뷰 ───────────────────────────────────────────────────── */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* 범례 */}
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs flex-wrap">
            <span className="font-semibold text-gray-500 shrink-0">가정별 색상</span>
            {[...familyColorMap.entries()].slice(0, 7).map(([label, color]) => (
              <span key={label} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-gray-600">{label}</span>
              </span>
            ))}
            {familyColorMap.size > 7 && (
              <span className="text-gray-400">외 {familyColorMap.size - 7}가정</span>
            )}
            <span className="flex items-center gap-1 ml-auto shrink-0">
              <span>⚠️</span>
              <span className="text-gray-500">기간 불일치</span>
            </span>
          </div>

          {/* 스크롤 영역 */}
          <div className="overflow-x-auto">
            <div style={{ minWidth: LABEL_W + totalW }}>

              {/* 헤더 1: 월 */}
              <div className="flex border-b border-gray-200" style={{ height: 26 }}>
                <div
                  className="shrink-0 bg-gray-50 border-r border-gray-200 sticky left-0 z-20"
                  style={{ width: LABEL_W }}
                />
                <div className="flex" style={{ width: totalW, flexShrink: 0 }}>
                  {monthGroups.map((mg, i) => (
                    <div
                      key={i}
                      className="border-r border-gray-300 flex items-center justify-center text-xs font-bold text-gray-600 bg-gray-50"
                      style={{ width: mg.count * CELL, flexShrink: 0 }}
                    >
                      {mg.month}
                    </div>
                  ))}
                </div>
              </div>

              {/* 헤더 2: 날짜 */}
              <div className="flex border-b border-gray-300" style={{ height: 26 }}>
                <div
                  className="shrink-0 bg-gray-50 border-r border-gray-200 sticky left-0 z-20 flex items-center px-3"
                  style={{ width: LABEL_W }}
                >
                  <span className="text-xs font-semibold text-gray-500">
                    {section === "accommodation" ? "숙소" : "차량"}
                  </span>
                </div>
                <div className="flex" style={{ width: totalW, flexShrink: 0 }}>
                  {dates.map((date) => (
                    <div
                      key={date}
                      className={`border-r border-gray-200 flex items-center justify-center text-xs select-none ${
                        isWeekend(date)
                          ? "bg-blue-50 text-blue-500 font-semibold"
                          : "bg-white text-gray-500"
                      }`}
                      style={{ width: CELL, flexShrink: 0 }}
                    >
                      {fmtDay(date)}
                    </div>
                  ))}
                </div>
              </div>

              {/* 자원 행 */}
              {resources.map((resource) => {
                const blocks      = getBlocks(resource);
                const hasAssigned = blocks.length > 0;
                const hasWarning  = blocks.some((b) => b.coverage !== "full");

                return (
                  <div
                    key={resource.id}
                    className="flex border-b border-gray-100 last:border-b-0"
                    style={{ height: ROW }}
                  >
                    {/* 이름 (sticky) */}
                    <div
                      className="shrink-0 flex items-center px-3 border-r border-gray-200 bg-white sticky left-0 z-10"
                      style={{ width: LABEL_W }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">
                            {resource.provider_name}
                          </p>
                          {hasWarning && <span className="shrink-0 text-xs">⚠️</span>}
                        </div>
                        {resource.is_church_owned ? (
                          <span className="text-xs text-indigo-500">🏛️ 교회</span>
                        ) : resource.available_from ? (
                          <p className="text-xs text-gray-400">
                            {resource.available_from.slice(5)}~{resource.available_to?.slice(5) ?? "?"}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-300">기간 미입력</p>
                        )}
                      </div>
                      {!hasAssigned && (
                        <span className="shrink-0 text-xs text-orange-400 font-medium ml-1">미배정</span>
                      )}
                    </div>

                    {/* 타임라인 셀 */}
                    <div
                      className="relative"
                      style={{ width: totalW, flexShrink: 0, height: ROW }}
                    >
                      {/* 제공 가능 기간 배경 */}
                      {!resource.is_church_owned &&
                        resource.available_from &&
                        resource.available_to &&
                        (() => {
                          const fi =
                            dateIndex.get(resource.available_from) ??
                            (resource.available_from < dates[0] ? 0 : null);
                          const ti =
                            dateIndex.get(resource.available_to) ??
                            (resource.available_to > dates[dates.length - 1]
                              ? dates.length - 1
                              : null);
                          if (fi === null || ti === null || fi > ti) return null;
                          return (
                            <div
                              className="absolute top-0 bottom-0 bg-gray-100"
                              style={{ left: fi * CELL, width: (ti - fi + 1) * CELL }}
                            />
                          );
                        })()}

                      {/* 교회 소속 전체 배경 */}
                      {resource.is_church_owned && (
                        <div className="absolute inset-0 bg-indigo-50 opacity-50" />
                      )}

                      {/* 수직 구분선 */}
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent ${CELL - 1}px, #e5e7eb ${CELL - 1}px, #e5e7eb ${CELL}px)`,
                          backgroundSize:  `${CELL}px 100%`,
                        }}
                      />

                      {/* 주말 강조 */}
                      {dates.map((date, di) =>
                        isWeekend(date) ? (
                          <div
                            key={date}
                            className="absolute top-0 bottom-0 bg-blue-100 opacity-30 pointer-events-none"
                            style={{ left: di * CELL, width: CELL }}
                          />
                        ) : null,
                      )}

                      {/* 배정 블록 */}
                      {blocks.map((block, bi) => {
                        let fi = dateIndex.get(block.from);
                        let ti = dateIndex.get(block.to);
                        if (fi === undefined) {
                          if (block.from < dates[0]) fi = 0;
                          else return null;
                        }
                        if (ti === undefined) {
                          if (block.to > dates[dates.length - 1]) ti = dates.length - 1;
                          else return null;
                        }
                        if (fi > ti) return null;

                        return (
                          <div
                            key={bi}
                            title={`${block.label}: ${block.from} ~ ${block.to}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPopup({ block, x: e.clientX, y: e.clientY });
                            }}
                            className={`absolute rounded flex items-center px-1.5 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity ${
                              block.coverage !== "full"
                                ? "outline outline-2 outline-orange-400"
                                : ""
                            }`}
                            style={{
                              left:            fi * CELL + 2,
                              width:           (ti - fi + 1) * CELL - 4,
                              top:             5,
                              bottom:          5,
                              backgroundColor: block.color,
                            }}
                          >
                            <span className="text-xs font-semibold text-white truncate leading-tight">
                              {block.coverage !== "full" && "⚠️ "}
                              {block.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 타임라인 푸터 요약 */}
          <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex gap-4 text-xs text-gray-500 flex-wrap">
            <span>총 {resources.length}{section === "accommodation" ? "개 숙소" : "대 차량"}</span>
            <span className="text-green-600">
              배정 완료 {resources.filter((r) => normalizeAssignments(r).length > 0).length}
            </span>
            <span className="text-orange-500">
              미배정 {resources.filter((r) => normalizeAssignments(r).length === 0).length}
            </span>
            {resources.some((r) => getBlocks(r).some((b) => b.coverage !== "full")) && (
              <span className="text-orange-600 font-semibold">⚠️ 기간 불일치 항목 있음</span>
            )}
          </div>
        </div>

      ) : (

        /* ── 달력 뷰 ────────────────────────────────────────────────────────── */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* 달력 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button
              onClick={() => setCalMonth((m) => addMonth(m, -1))}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-xl transition"
            >
              ‹
            </button>
            <span className="font-bold text-gray-800 text-sm">
              {calMonth ? monthLabel(calMonth + "-01") : ""}
            </span>
            <button
              onClick={() => setCalMonth((m) => addMonth(m, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-xl transition"
            >
              ›
            </button>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
            {["일", "월", "화", "수", "목", "금", "토"].map((dow, i) => (
              <div
                key={dow}
                className={`text-center text-xs font-semibold py-2 ${
                  i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-500"
                }`}
              >
                {dow}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="divide-y divide-gray-100">
            {calWeeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 divide-x divide-gray-100">
                {week.map(({ date, isCurrentMonth, dayBlocks }) => {
                  const dayNum  = parseInt(date.slice(8));
                  const dow     = new Date(date + "T12:00:00Z").getUTCDay();
                  const isSun   = dow === 0;
                  const isSat   = dow === 6;
                  const isToday = date === new Date().toISOString().slice(0, 10);

                  return (
                    <div
                      key={date}
                      className={`min-h-[76px] p-1.5 ${!isCurrentMonth ? "bg-gray-50/60" : ""}`}
                    >
                      {/* 날짜 숫자 */}
                      <div
                        className={`text-xs font-semibold mb-1 w-5 h-5 flex items-center justify-center rounded-full ${
                          isToday
                            ? "bg-blue-600 text-white"
                            : isSun
                            ? "text-red-400"
                            : isSat
                            ? "text-blue-400"
                            : isCurrentMonth
                            ? "text-gray-700"
                            : "text-gray-300"
                        }`}
                      >
                        {dayNum}
                      </div>

                      {/* 배정 점 표시 — 전체 표시, 범례와 동일한 점 스타일 */}
                      {dayBlocks.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {dayBlocks.map((b, i) => (
                            <span
                              key={i}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPopup({ block: b, x: e.clientX, y: e.clientY });
                              }}
                              title={`${b.label} · ${b.resourceName}`}
                              className={`w-2.5 h-2.5 rounded-full shrink-0 inline-block cursor-pointer hover:scale-125 transition-transform ${
                                b.coverage !== "full" ? "ring-1 ring-orange-400" : ""
                              }`}
                              style={{ backgroundColor: b.color }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* 달력 푸터 — 범례 */}
          <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex-wrap">
            <span className="text-xs font-semibold text-gray-500 shrink-0">가정별 색상</span>
            {[...familyColorMap.entries()].slice(0, 9).map(([label, color]) => (
              <span key={label} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs text-gray-600">{label}</span>
              </span>
            ))}
            {familyColorMap.size > 9 && (
              <span className="text-xs text-gray-400">외 {familyColorMap.size - 9}가정</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
