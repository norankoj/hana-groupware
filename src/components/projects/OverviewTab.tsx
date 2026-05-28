"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Props = {
  projectId: string;
  myUserId: string;
  isAdmin: boolean;
  project: {
    name: string;
    year: number | null;
    status: string;
    recurrence_years: number | null;
  };
  isMarf: boolean;
};

// ── 로우 타입 ──────────────────────────────────────────────────────

type MissionaryRaw = {
  id: string;
  name: string;
  family_group: string | null;
  accommodation_needed: boolean;
  vehicle_needed: boolean;
  ride_needed: boolean;
  arrival_date: string | null;
  arrival_time: string | null;
  arrival_flight: string | null;
  arrival_terminal: string | null;
  departure_date: string | null;
  departure_time: string | null;
  departure_flight: string | null;
  departure_terminal: string | null;
};

type AssnEntry = { missionary_id: string; from: string; to: string };

type AccomRaw = {
  id: string;
  provider_name: string;
  available_from: string | null;
  available_to: string | null;
  assigned_missionary_id: string | null;
  assignments: AssnEntry[] | null;
};

type VehicleRaw = {
  id: string;
  provider_name: string;
  car_model: string | null;
  available_from: string | null;
  available_to: string | null;
  insurance_added: boolean;
  assigned_missionary_id: string | null;
  assignments: AssnEntry[] | null;
};

type Schedule = {
  id: string;
  title: string;
  event_date: string;
  location: string | null;
};
type GiftRaw = { id: string; status: string };

type ChecklistItem = {
  id: string;
  title: string;
  category: string;
  due_date: string | null;
  is_completed: boolean;
  source_type: string | null;
};

// ── 타임라인 이벤트 ────────────────────────────────────────────────

type TLType =
  | "arrival"
  | "ride_in"
  | "accom_start"
  | "vehicle_start"
  | "vehicle_end"
  | "accom_end"
  | "cleaning"
  | "ride_out"
  | "departure";

type TLEvent = {
  id: string;
  date: string;
  time: string | null;
  type: TLType;
  title: string;
  sub: string | null;
  sortP: number;
};

const TYPE_SORT: Record<TLType, number> = {
  arrival: 0,
  ride_in: 1,
  accom_start: 2,
  vehicle_start: 3,
  vehicle_end: 4,
  accom_end: 5,
  cleaning: 6,
  ride_out: 7,
  departure: 8,
};

type TLMeta = { label: string; badgeCls: string };
const TYPE_META: Record<TLType, TLMeta> = {
  arrival: { label: "입국", badgeCls: "bg-blue-100 text-blue-700" },
  ride_in: { label: "라이드", badgeCls: "bg-amber-100 text-amber-700" },
  accom_start: {
    label: "숙소시작",
    badgeCls: "bg-emerald-100 text-emerald-700",
  },
  accom_end: { label: "숙소종료", badgeCls: "bg-gray-100 text-gray-500" },
  cleaning: { label: "청소", badgeCls: "bg-orange-100 text-orange-600" },
  vehicle_start: { label: "차량시작", badgeCls: "bg-sky-100 text-sky-700" },
  vehicle_end: { label: "차량반납", badgeCls: "bg-gray-100 text-gray-500" },
  ride_out: { label: "라이드OUT", badgeCls: "bg-amber-100 text-amber-700" },
  departure: { label: "출국", badgeCls: "bg-purple-100 text-purple-700" },
};

// ── 헬퍼 ──────────────────────────────────────────────────────────

function normalizeAsn(item: {
  assignments?: AssnEntry[] | null;
  assigned_missionary_id: string | null;
  available_from?: string | null;
  available_to?: string | null;
}): AssnEntry[] {
  if (item.assignments?.length) return item.assignments;
  if (item.assigned_missionary_id) {
    return [
      {
        missionary_id: item.assigned_missionary_id,
        from: item.available_from ?? "",
        to: item.available_to ?? "",
      },
    ];
  }
  return [];
}

const fmtMD = (d: string) => {
  const [, mm, dd] = d.split("-");
  return `${mm}/${dd}`;
};

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
const getDayName = (dateStr: string) => {
  const d = new Date(dateStr + "T00:00:00");
  return DAY_KO[d.getDay()];
};

// 이벤트 타입별 색상 점
const TYPE_DOT: Record<TLType, string> = {
  arrival:       "bg-blue-400",
  ride_in:       "bg-amber-400",
  accom_start:   "bg-emerald-500",
  accom_end:     "bg-gray-300",
  cleaning:      "bg-orange-400",
  vehicle_start: "bg-sky-500",
  vehicle_end:   "bg-gray-300",
  ride_out:      "bg-amber-400",
  departure:     "bg-purple-400",
};

/**
 * windowOffset = 0 → 오늘 ~ 다음달 말
 * windowOffset = 1 → 그 다음달
 * windowOffset = 2 → 그 다다음달  ...
 */
function getWindowDates(
  offset: number,
  todayStr: string,
): { from: string; to: string; label: string } {
  const [ty, tm] = todayStr.split("-").map(Number); // tm: 1-based
  const m0 = tm - 1; // 0-based

  if (offset === 0) {
    const nextM0 = (m0 + 1) % 12;
    const nextY = m0 + 1 >= 12 ? ty + 1 : ty;
    const lastDay = new Date(Date.UTC(nextY, nextM0 + 1, 0)).getUTCDate();
    const to = `${nextY}-${String(nextM0 + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { from: todayStr, to, label: `${tm}~${nextM0 + 1}월` };
  }

  // offset 1 = m0+2, offset 2 = m0+3 ...
  const tM0 = m0 + 1 + offset;
  const normM0 = tM0 % 12;
  const tY = ty + Math.floor(tM0 / 12);
  const from = `${tY}-${String(normM0 + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(tY, normM0 + 1, 0)).getUTCDate();
  const to = `${tY}-${String(normM0 + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const label = normM0 === 0 ? `${tY}년 1월` : `${normM0 + 1}월`;
  return { from, to, label };
}

// ── 컴포넌트 ──────────────────────────────────────────────────────

export default function OverviewTab({ projectId, isMarf }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [tlEvents, setTlEvents] = useState<TLEvent[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [checklists, setChecklists] = useState<ChecklistItem[]>([]);
  const [windowOffset, setWindowOffset] = useState(0);
  const [summary, setSummary] = useState({
    totalIndividuals: 0,
    totalFamilies: 0,
    accomNeeded: 0,
    accomMatched: 0,
    vehicleNeeded: 0,
    vehicleMatched: 0,
    giftTotal: 0,
    giftPurchased: 0,
    giftDelivered: 0,
    vehicleInsuranceDone: 0,
    vehicleTotal: 0,
    unmetAccom: [] as string[],
    unmetVehicle: [] as string[],
    noInsurance: [] as string[],
  });

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const empty = Promise.resolve([] as any[]);

      const [rawM, rawA, rawV, rawS, rawC, rawG] = await Promise.all([
        isMarf
          ? supabase
              .from("marf_missionaries")
              .select(
                "id, name, family_group, accommodation_needed, vehicle_needed, ride_needed, arrival_date, arrival_time, arrival_flight, arrival_terminal, departure_date, departure_time, departure_flight, departure_terminal",
              )
              .eq("project_id", projectId)
              .then((r) => r.data ?? [])
          : empty,
        isMarf
          ? supabase
              .from("marf_accommodations")
              .select(
                "id, provider_name, available_from, available_to, assigned_missionary_id, assignments",
              )
              .eq("project_id", projectId)
              .then((r) => r.data ?? [])
          : empty,
        isMarf
          ? supabase
              .from("marf_vehicles")
              .select(
                "id, provider_name, car_model, available_from, available_to, insurance_added, assigned_missionary_id, assignments",
              )
              .eq("project_id", projectId)
              .then((r) => r.data ?? [])
          : empty,
        supabase
          .from("project_schedules")
          .select("id, title, event_date, location")
          .eq("project_id", projectId)
          .gte("event_date", today)
          .order("event_date")
          .limit(5)
          .then((r) => r.data ?? []),
        supabase
          .from("project_checklists")
          .select("id, title, category, due_date, is_completed, source_type")
          .eq("project_id", projectId)
          .not("due_date", "is", null)
          .order("due_date")
          .then((r) => r.data ?? []),
        isMarf
          ? supabase
              .from("marf_gifts")
              .select("id, status")
              .eq("project_id", projectId)
              .not("gift_item_id", "is", null)
              .then((r) => r.data ?? [])
          : empty,
      ]);

      const mArr = rawM as MissionaryRaw[];
      const aArr = rawA as AccomRaw[];
      const vArr = rawV as VehicleRaw[];
      setSchedules(rawS as Schedule[]);
      setChecklists(rawC as ChecklistItem[]);

      // ── 통계 ─────────────────────────────────────────────────

      const getFamilyLabel = (m: MissionaryRaw) =>
        m.family_group?.trim() || m.name;

      const countUnits = (arr: MissionaryRaw[]) => {
        const gs = new Set<string>();
        let solo = 0;
        arr.forEach((m) => {
          const g = m.family_group?.trim();
          if (g) gs.add(g);
          else solo++;
        });
        return gs.size + solo;
      };

      const getAssignedIds = (arr: (AccomRaw | VehicleRaw)[]) => {
        const ids = new Set<string>();
        arr.forEach((x) =>
          normalizeAsn(x).forEach((a) => {
            if (a.missionary_id) ids.add(a.missionary_id);
          }),
        );
        return ids;
      };

      const countMatchedUnits = (ids: Set<string>) => {
        const gs = new Set<string>();
        let solo = 0;
        mArr.forEach((m) => {
          if (ids.has(m.id)) {
            const g = m.family_group?.trim();
            if (g) gs.add(g);
            else solo++;
          }
        });
        return gs.size + solo;
      };

      const accomIds = getAssignedIds(aArr);
      const vehicleIds = getAssignedIds(vArr);

      const matchedAccomLabels = new Set(
        mArr.filter((m) => accomIds.has(m.id)).map(getFamilyLabel),
      );
      const matchedVehicleLabels = new Set(
        mArr.filter((m) => vehicleIds.has(m.id)).map(getFamilyLabel),
      );

      const unmetAccom = [
        ...new Set(
          mArr.filter((m) => m.accommodation_needed).map(getFamilyLabel),
        ),
      ].filter((l) => !matchedAccomLabels.has(l));
      const unmetVehicle = [
        ...new Set(mArr.filter((m) => m.vehicle_needed).map(getFamilyLabel)),
      ].filter((l) => !matchedVehicleLabels.has(l));
      const noInsurance = vArr
        .filter((v) => !v.insurance_added && normalizeAsn(v).length > 0)
        .map((v) =>
          v.car_model ? `${v.car_model}(${v.provider_name})` : v.provider_name,
        );

      const gArr = rawG as GiftRaw[];
      setSummary({
        totalIndividuals: mArr.length,
        totalFamilies: countUnits(mArr),
        accomNeeded: countUnits(mArr.filter((m) => m.accommodation_needed)),
        accomMatched: countMatchedUnits(accomIds),
        vehicleNeeded: countUnits(mArr.filter((m) => m.vehicle_needed)),
        vehicleMatched: countMatchedUnits(vehicleIds),
        giftTotal: gArr.length,
        giftPurchased: gArr.filter((g) =>
          ["purchased", "prepared", "delivered"].includes(g.status),
        ).length,
        giftDelivered: gArr.filter((g) => g.status === "delivered").length,
        vehicleInsuranceDone: vArr.filter((v) => v.insurance_added).length,
        vehicleTotal: vArr.length,
        unmetAccom,
        unmetVehicle,
        noInsurance,
      });

      // ── 타임라인 이벤트 ──────────────────────────────────────

      if (!isMarf) {
        setLoading(false);
        return;
      }

      const missionaryMap = new Map(mArr.map((m) => [m.id, m]));
      const events: TLEvent[] = [];

      // 입국/출국 + 라이드 — 개인별 (부부 따로 입국 고려)
      mArr.forEach((m) => {
        if (m.arrival_date) {
          const sub =
            [m.arrival_flight, m.arrival_time, m.arrival_terminal]
              .filter(Boolean)
              .join(" · ") || null;
          events.push({
            id: `arr-${m.id}`,
            date: m.arrival_date,
            time: m.arrival_time,
            type: "arrival",
            title: m.name,
            sub,
            sortP: TYPE_SORT.arrival,
          });
          if (m.ride_needed) {
            events.push({
              id: `ride-in-${m.id}`,
              date: m.arrival_date,
              time: m.arrival_time,
              type: "ride_in",
              title: m.name,
              sub: m.arrival_flight || null,
              sortP: TYPE_SORT.ride_in,
            });
          }
        }
        if (m.departure_date) {
          const sub =
            [m.departure_flight, m.departure_time, m.departure_terminal]
              .filter(Boolean)
              .join(" · ") || null;
          if (m.ride_needed) {
            events.push({
              id: `ride-out-${m.id}`,
              date: m.departure_date,
              time: m.departure_time,
              type: "ride_out",
              title: m.name,
              sub: m.departure_flight || null,
              sortP: TYPE_SORT.ride_out,
            });
          }
          events.push({
            id: `dep-${m.id}`,
            date: m.departure_date,
            time: m.departure_time,
            type: "departure",
            title: m.name,
            sub,
            sortP: TYPE_SORT.departure,
          });
        }
      });

      // 숙소 배정
      aArr.forEach((accom) => {
        normalizeAsn(accom).forEach((a, i) => {
          if (!a.missionary_id) return;
          const m = missionaryMap.get(a.missionary_id);
          const fam = m ? m.family_group?.trim() || m.name : "";
          const name = accom.provider_name;
          if (a.from)
            events.push({
              id: `as-${accom.id}-${i}`,
              date: a.from,
              time: null,
              type: "accom_start",
              title: name,
              sub: fam || null,
              sortP: TYPE_SORT.accom_start,
            });
          if (a.to) {
            events.push({
              id: `ae-${accom.id}-${i}`,
              date: a.to,
              time: null,
              type: "accom_end",
              title: name,
              sub: fam || null,
              sortP: TYPE_SORT.accom_end,
            });
            events.push({
              id: `cl-${accom.id}-${i}`,
              date: a.to,
              time: null,
              type: "cleaning",
              title: name,
              sub: fam ? `${fam} 퇴실` : null,
              sortP: TYPE_SORT.cleaning,
            });
          }
        });
      });

      // 차량 배정
      vArr.forEach((vehicle) => {
        normalizeAsn(vehicle).forEach((a, i) => {
          if (!a.missionary_id) return;
          const m = missionaryMap.get(a.missionary_id);
          const fam = m ? m.family_group?.trim() || m.name : "";
          const name = vehicle.car_model
            ? `${vehicle.car_model} (${vehicle.provider_name})`
            : vehicle.provider_name;
          if (a.from)
            events.push({
              id: `vs-${vehicle.id}-${i}`,
              date: a.from,
              time: null,
              type: "vehicle_start",
              title: name,
              sub: fam || null,
              sortP: TYPE_SORT.vehicle_start,
            });
          if (a.to)
            events.push({
              id: `ve-${vehicle.id}-${i}`,
              date: a.to,
              time: null,
              type: "vehicle_end",
              title: name,
              sub: fam || null,
              sortP: TYPE_SORT.vehicle_end,
            });
        });
      });

      const sorted = events
        .filter((e) => e.date >= today)
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          if (a.time && b.time) return a.time.localeCompare(b.time);
          if (a.time) return -1;
          if (b.time) return 1;
          return a.sortP - b.sortP;
        });

      setTlEvents(sorted);
      setLoading(false);
    })();
  }, [projectId, isMarf]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading)
    return <div className="text-center py-10 text-gray-400">로딩 중...</div>;

  const today = new Date().toISOString().slice(0, 10);
  const win = getWindowDates(windowOffset, today);

  // 현재 윈도우 이벤트
  const winEvents = tlEvents.filter(
    (e) => e.date >= win.from && e.date <= win.to,
  );
  const winDates = [...new Set(winEvents.map((e) => e.date))];

  // 현재 윈도우 체크리스트
  const winChecklists = checklists.filter(
    (c) => c.due_date && c.due_date >= win.from && c.due_date <= win.to,
  );

  return (
    <div className="space-y-4">
      {/* ── 통계 카드 5개 ── */}
      {isMarf && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard
            icon="✈️"
            label="전체 명단"
            value={`${summary.totalIndividuals}명`}
            sub={`${summary.totalFamilies}가구`}
            color="blue"
          />
          <StatCard
            icon="🏠"
            label="숙소 매칭"
            value={`${summary.accomMatched}/${summary.accomNeeded}가구`}
            sub={
              summary.accomMatched < summary.accomNeeded
                ? "미배정 있음"
                : "완료"
            }
            color={
              summary.accomMatched < summary.accomNeeded ? "yellow" : "green"
            }
            tooltipTitle="숙소 미배정"
            tooltipItems={summary.unmetAccom}
          />
          <StatCard
            icon="🚗"
            label="차량 매칭"
            value={`${summary.vehicleMatched}/${summary.vehicleNeeded}가구`}
            sub={
              summary.vehicleMatched < summary.vehicleNeeded
                ? "미배정 있음"
                : "완료"
            }
            color={
              summary.vehicleMatched < summary.vehicleNeeded
                ? "yellow"
                : "green"
            }
            tooltipTitle="차량 미배정"
            tooltipItems={summary.unmetVehicle}
          />
          <StatCard
            icon="🎁"
            label="선물 현황"
            value={`${summary.giftDelivered}/${summary.giftTotal}개`}
            sub={
              summary.giftTotal > 0
                ? `구매완료 ${summary.giftPurchased}개`
                : "배치 없음"
            }
            color="sky"
          />
          <StatCard
            icon="🛡️"
            label="차량 보험"
            value={`${summary.vehicleInsuranceDone}/${summary.vehicleTotal}대`}
            sub="운전자 추가 완료"
            color="purple"
            tooltipTitle="보험 미처리"
            tooltipItems={summary.noInsurance}
          />
        </div>
      )}

      {/* ── 타임라인 + 체크리스트 (사이드바이사이드) ── */}
      {isMarf && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* 타임라인 카드 */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
            {/* 헤더 + 월 네비게이션 */}
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-gray-800">
                다가오는 일정
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setWindowOffset((o) => Math.max(0, o - 1))}
                  disabled={windowOffset === 0}
                  className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition text-xs"
                >
                  ‹
                </button>
                <span className="text-xs font-semibold text-gray-700 w-16 text-center tabular-nums">
                  {win.label}
                </span>
                <button
                  onClick={() => setWindowOffset((o) => o + 1)}
                  className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 transition text-xs"
                >
                  ›
                </button>
              </div>
            </div>

            {/* 이벤트 목록 (카드 안 스크롤) */}
            <div className="overflow-y-auto" style={{ maxHeight: 680 }}>
              {winEvents.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">
                  이 기간에 일정이 없습니다.
                </p>
              ) : (
                winDates.map((date) => {
                  const dayEvents = winEvents.filter((e) => e.date === date);
                  const isToday = date === today;
                  return (
                    <div
                      key={date}
                      className={`flex border-b border-gray-50 last:border-b-0 ${isToday ? "bg-blue-50/30" : ""}`}
                    >
                      {/* 날짜 컬럼 */}
                      <div
                        className={`w-[68px] shrink-0 flex flex-col items-center pt-3.5 pb-3 gap-0.5 ${isToday ? "border-l-[3px] border-blue-400" : "border-l-[3px] border-transparent"}`}
                      >
                        <span
                          className={`text-xs font-bold tabular-nums leading-none ${isToday ? "text-blue-600" : "text-gray-500"}`}
                        >
                          {fmtMD(date)}
                        </span>
                        {isToday && (
                          <span className="text-[10px] text-blue-400 font-medium">
                            오늘
                          </span>
                        )}
                      </div>
                      {/* 이벤트 */}
                      <div className="flex-1 py-2 pr-4 space-y-1">
                        {dayEvents.map((e) => {
                          const meta = TYPE_META[e.type];
                          return (
                            <div
                              key={e.id}
                              className="flex items-center gap-2 py-0.5"
                            >
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-sm shrink-0 ${meta.badgeCls}`}
                              >
                                {meta.label}
                              </span>
                              <span className="text-sm text-gray-800 font-medium truncate">
                                {e.title}
                              </span>
                              {e.sub && (
                                <span className="text-xs text-gray-400 shrink-0">
                                  {e.sub}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 체크리스트 카드 */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-gray-100 shrink-0">
              <h3 className="text-sm font-semibold text-gray-800">
                체크리스트{" "}
                <span className="text-gray-400 font-normal">— {win.label}</span>
              </h3>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 560 }}>
              {winChecklists.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">
                  이 기간에 항목이 없습니다.
                </p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {winChecklists.map((c) => (
                    <div
                      key={c.id}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${c.is_completed ? "opacity-50" : ""}`}
                    >
                      {/* 체크박스 */}
                      <span
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${c.is_completed ? "bg-green-500 border-green-500" : "border-gray-300"}`}
                      >
                        {c.is_completed && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      {/* 내용 */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${c.is_completed ? "line-through text-gray-400" : "text-gray-800"}`}>
                          {c.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {c.due_date && (
                            <span className="text-xs text-gray-400 tabular-nums">
                              {fmtMD(c.due_date)}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {c.category}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 행사 일정 ── */}
      {schedules.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">행사 일정</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                <span className="text-xs text-gray-400 tabular-nums w-12 shrink-0">
                  {fmtMD(s.event_date)}
                </span>
                <span className="text-sm text-gray-800 flex-1">{s.title}</span>
                {s.location && (
                  <span className="text-xs text-gray-400 shrink-0">
                    {s.location}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 서브 컴포넌트 ──────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
  tooltipTitle,
  tooltipItems,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  color: string;
  tooltipTitle?: string;
  tooltipItems?: string[];
}) {
  const [open, setOpen] = useState(false);
  const hasAlert = (tooltipItems?.length ?? 0) > 0;

  const colors: Record<string, string> = {
    blue: "bg-white border-gray-200",
    green: "bg-white border-gray-200",
    yellow: "bg-white border-gray-200",
    purple: "bg-white border-gray-200",
    sky: "bg-white border-gray-200",
  };

  return (
    <div className="relative">
      <div
        className={`rounded-xl border p-4 ${colors[color] ?? "bg-gray-50 border-gray-100"} ${hasAlert ? "cursor-pointer select-none" : ""}`}
        onClick={() => hasAlert && setOpen((o) => !o)}
      >
        <div className="flex items-start justify-between mb-1">
          <span className="text-2xl leading-none">{icon}</span>
          {hasAlert && (
            <span className="text-[11px] font-bold text-orange-500 bg-orange-100 rounded px-1 py-0.5 leading-none">
              !
            </span>
          )}
        </div>
        <div className="text-lg font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-600 font-medium">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>

      {hasAlert && open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[180px] max-w-[260px]">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {tooltipTitle}
            </p>
            <ul className="space-y-1">
              {tooltipItems!.map((item, i) => (
                <li
                  key={i}
                  className="flex items-center gap-1.5 text-sm text-gray-700"
                >
                  <span className="w-1 h-1 rounded-full bg-orange-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
