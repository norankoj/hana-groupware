"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import Modal from "@/components/Modal";

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
  isRide?: boolean;
};

type PastorRide = {
  id: string;
  ride_number: string | null;
  status: string;
  is_important: boolean;
  event_date: string;
  event_name: string | null;
  rider_name: string | null;
  direction: string;
  departure_location: string | null;
  departure_time: string | null;
  arrival_location: string | null;
  arrival_time: string | null;
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
  phone: string | null;
  dietary_notes: string | null;
  notes: string | null;
};

type AssnEntry = { missionary_id: string; from: string; to: string };

type AccomRaw = {
  id: string;
  provider_name: string;
  provider_contact: string | null;
  address: string | null;
  available_from: string | null;
  available_to: string | null;
  assigned_missionary_id: string | null;
  assignments: AssnEntry[] | null;
  notes: string | null;
};

type VehicleRaw = {
  id: string;
  provider_name: string;
  provider_contact: string | null;
  car_model: string | null;
  car_number: string | null;
  available_from: string | null;
  available_to: string | null;
  insurance_added: boolean;
  assigned_missionary_id: string | null;
  assignments: AssnEntry[] | null;
  notes: string | null;
};

type Schedule = {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  location: string | null;
  category: string | null;
  responsible_name: string | null;
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
  missionaryId?: string;   // 선교사 이벤트용
  resourceId?: string;     // 숙소/차량 이벤트용
  assignmentIdx?: number;  // 숙소/차량 배정 인덱스
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

/* ── 일정 카테고리 표시 ─────────────────────────────────────────── */
const SCHED_CATS: Record<string, string> = {
  arrival:   "도착",
  event:     "행사",
  meeting:   "모임",
  departure: "출발",
  general:   "일반",
};
const SCHED_CAT_CLS: Record<string, string> = {
  arrival:   "bg-blue-100 text-blue-700",
  event:     "bg-purple-100 text-purple-700",
  meeting:   "bg-green-100 text-green-700",
  departure: "bg-orange-100 text-orange-700",
  general:   "bg-gray-100 text-gray-600",
};

export default function OverviewTab({ projectId, myUserId, isMarf, isRide }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [tlEvents, setTlEvents] = useState<TLEvent[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [checklists, setChecklists] = useState<ChecklistItem[]>([]);
  const [windowOffset, setWindowOffset] = useState(0);

  /* 상세 모달용 원본 데이터 */
  const [missionariesData, setMissionariesData] = useState<MissionaryRaw[]>([]);
  const [accomsData,       setAccomsData]       = useState<AccomRaw[]>([]);
  const [vehiclesData,     setVehiclesData]     = useState<VehicleRaw[]>([]);
  const [upcomingRides,    setUpcomingRides]    = useState<PastorRide[]>([]);

  /* TL 이벤트 툴팁 팝업 */
  type TLPopup = { ev: TLEvent; x: number; y: number };
  const [tlPopup,    setTlPopup]    = useState<TLPopup | null>(null);
  const tlPopupRef = useRef<HTMLDivElement>(null);

  /* 일정 상세 모달 */
  const [showSchedDetail, setShowSchedDetail] = useState(false);
  const [detailSched,     setDetailSched]     = useState<Schedule | null>(null);
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

  /* TL 팝업 외부 클릭 닫기 */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tlPopupRef.current && !tlPopupRef.current.contains(e.target as Node)) {
        setTlPopup(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleToggle = useCallback(async (item: ChecklistItem) => {
    const now = new Date().toISOString();
    const patch = item.is_completed
      ? { is_completed: false, completed_by: null, completed_at: null }
      : { is_completed: true, completed_by: myUserId, completed_at: now };
    await supabase.from("project_checklists").update(patch).eq("id", item.id);
    setChecklists((prev) => prev.map((c) => c.id === item.id ? { ...c, ...patch } : c));
  }, [supabase, myUserId]);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const empty = Promise.resolve([] as any[]);

      const [rawM, rawA, rawV, rawS, rawC, rawG, rawRides] = await Promise.all([
        isMarf
          ? supabase
              .from("marf_missionaries")
              .select(
                "id, name, family_group, accommodation_needed, vehicle_needed, ride_needed, arrival_date, arrival_time, arrival_flight, arrival_terminal, departure_date, departure_time, departure_flight, departure_terminal, phone, dietary_notes, notes",
              )
              .eq("project_id", projectId)
              .then((r) => r.data ?? [])
          : empty,
        isMarf
          ? supabase
              .from("marf_accommodations")
              .select(
                "id, provider_name, provider_contact, address, available_from, available_to, assigned_missionary_id, assignments, notes",
              )
              .eq("project_id", projectId)
              .then((r) => r.data ?? [])
          : empty,
        isMarf
          ? supabase
              .from("marf_vehicles")
              .select(
                "id, provider_name, provider_contact, car_model, car_number, available_from, available_to, insurance_added, assigned_missionary_id, assignments, notes",
              )
              .eq("project_id", projectId)
              .then((r) => r.data ?? [])
          : empty,
        supabase
          .from("project_schedules")
          .select("id, title, event_date, start_time, end_time, description, location, category, responsible_name")
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
        isRide
          ? supabase
              .from("pastor_rides")
              .select("id, ride_number, status, is_important, event_date, event_name, rider_name, direction, departure_location, departure_time, arrival_location, arrival_time")
              .eq("project_id", projectId)
              .gte("event_date", today)
              .lte("event_date", new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
              .order("event_date")
              .limit(20)
              .then((r) => r.data ?? [])
          : empty,
      ]);

      const mArr = rawM as MissionaryRaw[];
      const aArr = rawA as AccomRaw[];
      const vArr = rawV as VehicleRaw[];
      setSchedules(rawS as Schedule[]);
      setChecklists(rawC as ChecklistItem[]);
      setMissionariesData(mArr);
      setAccomsData(aArr);
      setVehiclesData(vArr);
      if (isRide) setUpcomingRides(rawRides as PastorRide[]);

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
            missionaryId: m.id,
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
              missionaryId: m.id,
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
              missionaryId: m.id,
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
            missionaryId: m.id,
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
              resourceId: accom.id,
              assignmentIdx: i,
              missionaryId: a.missionary_id,
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
              resourceId: accom.id,
              assignmentIdx: i,
              missionaryId: a.missionary_id,
            });
            events.push({
              id: `cl-${accom.id}-${i}`,
              date: a.to,
              time: null,
              type: "cleaning",
              title: name,
              sub: fam ? `${fam} 퇴실` : null,
              sortP: TYPE_SORT.cleaning,
              resourceId: accom.id,
              assignmentIdx: i,
              missionaryId: a.missionary_id,
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
              resourceId: vehicle.id,
              assignmentIdx: i,
              missionaryId: a.missionary_id,
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
              resourceId: vehicle.id,
              assignmentIdx: i,
              missionaryId: a.missionary_id,
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

  // 현재 윈도우 체크리스트 — offset=0일 때 해당 월 1일부터 표시 (날짜 지난 항목도 포함)
  const checklistFrom = windowOffset === 0 ? `${today.slice(0, 7)}-01` : win.from;
  const winChecklists = checklists.filter(
    (c) => c.due_date && c.due_date >= checklistFrom && c.due_date <= win.to,
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
                              className="flex items-center gap-2 py-0.5 px-1 -mx-1 rounded cursor-pointer hover:bg-blue-50 transition-colors group/ev"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setTlPopup({ ev: e, x: ev.clientX, y: ev.clientY });
                              }}
                            >
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-sm shrink-0 ${meta.badgeCls}`}
                              >
                                {meta.label}
                              </span>
                              <span className="text-sm text-gray-800 font-medium truncate group-hover/ev:text-blue-700 transition-colors">
                                {e.title}
                              </span>
                              {e.sub && (
                                <span className="text-xs text-gray-400 shrink-0">
                                  {e.sub}
                                </span>
                              )}
                              <svg className="w-3 h-3 text-gray-200 group-hover/ev:text-blue-400 shrink-0 ml-auto transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
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
                      onClick={() => handleToggle(c)}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${c.is_completed ? "opacity-50" : ""}`}
                    >
                      {/* 체크박스 */}
                      <span
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${c.is_completed ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-green-400"}`}
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

      {/* ── 라이드 일정 + 체크리스트 (ride_schedule 프로젝트) ── */}
      {isRide && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* 다가오는 라이드 일정 */}
          {upcomingRides.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col h-[460px]">
            <div className="px-4 py-2.5 border-b border-gray-100 shrink-0">
              <h3 className="text-sm font-semibold text-gray-800">다가오는 라이드 일정</h3>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {(() => {
                const rideDates = [...new Set(upcomingRides.map((r) => r.event_date))];
                return rideDates.map((date) => {
                  const dayRides = upcomingRides.filter((r) => r.event_date === date);
                  const isToday = date === today;
                  const [, mm, dd] = date.split("-");
                  const dayName = DAY_KO[new Date(date + "T00:00:00").getDay()];
                  return (
                    <div key={date} className={`flex border-b border-gray-50 last:border-b-0 ${isToday ? "bg-blue-50/30" : ""}`}>
                      {/* 날짜 컬럼 */}
                      <div className={`w-[72px] shrink-0 flex flex-col items-center pt-3.5 pb-3 gap-0.5 ${isToday ? "border-l-[3px] border-blue-400" : "border-l-[3px] border-transparent"}`}>
                        <span className={`text-xs font-bold tabular-nums leading-none ${isToday ? "text-blue-600" : "text-gray-500"}`}>
                          {mm}/{dd}({dayName})
                        </span>
                        {isToday && <span className="text-[10px] text-blue-400 font-medium">오늘</span>}
                      </div>
                      {/* 라이드 목록 */}
                      <div className="flex-1 py-2 pr-4 space-y-1.5">
                        {dayRides.map((ride) => {
                          const statusCls = ride.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : ride.status === "confirmed"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-500";
                          const statusLabel = ride.status === "completed" ? "완료" : ride.status === "confirmed" ? "확정" : "미정";
                          return (
                            <div key={ride.id} className={`rounded-lg px-3 py-2 text-sm ${ride.is_important ? "bg-blue-50 border border-blue-100" : "bg-gray-50"}`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${statusCls}`}>
                                  {statusLabel}
                                </span>
                                <span className="font-medium text-gray-800 truncate flex-1">
                                  {ride.event_name ?? <span className="text-gray-400">집회명 없음</span>}
                                </span>
                                {ride.departure_time && (
                                  <span className="text-xs text-gray-400 shrink-0">
                                    {ride.departure_time.slice(0, 5)} 출발
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500 flex-wrap">
                                {ride.rider_name && <span>🚗 {ride.rider_name}</span>}
                                {(ride.departure_location || ride.arrival_location) && (
                                  <span>
                                    {ride.departure_location ?? "-"} → {ride.arrival_location ?? "-"}
                                  </span>
                                )}
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${{왕복:"bg-purple-100 text-purple-700",편도:"bg-green-100 text-green-700"}[ride.direction] ?? "bg-gray-100 text-gray-500"}`}>{ride.direction}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
          )}

          {/* 체크리스트 */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-gray-100 shrink-0">
              <h3 className="text-sm font-semibold text-gray-800">
                체크리스트
                {checklists.filter((c) => !c.is_completed).length > 0 && (
                  <span className="ml-2 text-xs font-normal text-orange-500">
                    {checklists.filter((c) => !c.is_completed).length}개 미완료
                  </span>
                )}
              </h3>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 600 }}>
              {checklists.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">체크리스트가 없습니다.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {checklists.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => handleToggle(c)}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${c.is_completed ? "opacity-50" : ""}`}
                    >
                      <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${c.is_completed ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-green-400"}`}>
                        {c.is_completed && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${c.is_completed ? "line-through text-gray-400" : "text-gray-800"}`}>
                          {c.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {c.due_date && (
                            <span className="text-xs text-gray-400 tabular-nums">{fmtMD(c.due_date)}</span>
                          )}
                          <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{c.category}</span>
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
              <div
                key={s.id}
                className="flex items-center gap-3 px-5 py-3 hover:bg-blue-50/40 cursor-pointer transition-colors group"
                onClick={() => { setDetailSched(s); setShowSchedDetail(true); }}
              >
                <span className="text-xs text-gray-400 tabular-nums w-12 shrink-0">
                  {fmtMD(s.event_date)}
                </span>
                {s.category && (
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${SCHED_CAT_CLS[s.category] ?? "bg-gray-100 text-gray-500"}`}>
                    {SCHED_CATS[s.category] ?? s.category}
                  </span>
                )}
                <span className="text-sm text-gray-800 flex-1 group-hover:text-blue-700 transition-colors">{s.title}</span>
                {s.location && (
                  <span className="text-xs text-gray-400 shrink-0">
                    📍 {s.location}
                  </span>
                )}
                <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          다가오는 일정 툴팁 팝업
      ══════════════════════════════════════ */}
      {tlPopup && (() => {
        const { ev: e } = tlPopup;
        const meta  = TYPE_META[e.type];
        const isMEvt = (["arrival","departure","ride_in","ride_out"] as TLType[]).includes(e.type);
        const isAEvt = (["accom_start","accom_end","cleaning"] as TLType[]).includes(e.type);
        const isVEvt = (["vehicle_start","vehicle_end"] as TLType[]).includes(e.type);

        // 선교사 조회
        const m = e.missionaryId ? missionariesData.find((x) => x.id === e.missionaryId) : undefined;

        // ── 가족 그룹 기반 자원 조회 (버그 수정: 같은 가족 ID 전체로 검색) ──
        const familyIds = m
          ? (m.family_group?.trim()
              ? missionariesData.filter((x) => x.family_group?.trim() === m.family_group!.trim()).map((x) => x.id)
              : [m.id])
          : [];
        const mAccom   = familyIds.length
          ? accomsData.find((r) =>
              (r.assigned_missionary_id && familyIds.includes(r.assigned_missionary_id)) ||
              (r.assignments ?? []).some((a) => familyIds.includes(a.missionary_id)))
          : undefined;
        const mVehicle = familyIds.length
          ? vehiclesData.find((r) =>
              (r.assigned_missionary_id && familyIds.includes(r.assigned_missionary_id)) ||
              (r.assignments ?? []).some((a) => familyIds.includes(a.missionary_id)))
          : undefined;

        // 가족 대표 배정 기간 (assignments에서 가족 ID 중 하나로 찾음)
        const getFamPeriod = (res: AccomRaw | VehicleRaw) => {
          for (const fid of familyIds) {
            const asn = (res.assignments ?? []).find((a) => a.missionary_id === fid);
            if (asn?.from) return `${asn.from.slice(5)} ~ ${asn.to?.slice(5) || "미정"}`;
          }
          if (res.available_from) return `${res.available_from.slice(5)} ~ ${res.available_to?.slice(5) || "미정"}`;
          return "";
        };

        // 자원 이벤트용
        const accom      = e.resourceId ? accomsData.find((a) => a.id === e.resourceId)   : undefined;
        const vehicle    = e.resourceId ? vehiclesData.find((v) => v.id === e.resourceId) : undefined;
        const accomAsn   = accom   ? normalizeAsn(accom)[e.assignmentIdx ?? 0]   : undefined;
        const vehicleAsn = vehicle ? normalizeAsn(vehicle)[e.assignmentIdx ?? 0] : undefined;

        // 팝업 제목
        const title = isMEvt ? (m?.name || e.title) : e.title;

        // 위치 계산
        const W = 340;
        const px = typeof window !== "undefined"
          ? (tlPopup.x > window.innerWidth * 0.6 ? tlPopup.x - W - 8 : tlPopup.x + 10)
          : tlPopup.x + 10;
        const py = typeof window !== "undefined"
          ? Math.min(tlPopup.y + 8, window.innerHeight - 420)
          : tlPopup.y + 8;

        return (
          <div
            ref={tlPopupRef}
            className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
            style={{ width: W, top: py, left: px }}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${TYPE_DOT[e.type]}`} />
                <span className="font-bold text-gray-900 text-base truncate">{title}</span>
                {isMEvt && m?.family_group?.trim() && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                    {m.family_group.trim()}
                  </span>
                )}
              </div>
              <button
                onClick={() => setTlPopup(null)}
                className="shrink-0 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xl leading-none ml-2"
              >
                ×
              </button>
            </div>

            {/* 내용 테이블 */}
            <div className="px-2 py-2">
            <table className="w-full text-sm rounded-xl overflow-hidden border border-gray-100">
              <tbody className="divide-y divide-gray-100">

                {/* ── 선교사 이벤트 ── */}
                {isMEvt && m && (
                  <>
                    {/* 체류 기간 */}
                    <tr>
                      <th className="w-[84px] px-5 py-3.5 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">체류 기간</th>
                      <td className="px-5 py-3.5 text-gray-800 font-semibold">
                        {m.arrival_date?.slice(5) ?? "—"} ~ {m.departure_date?.slice(5) ?? "미정"}
                      </td>
                    </tr>
                    {/* 항공편 */}
                    {(e.type === "arrival" || e.type === "ride_in") && m.arrival_flight && (
                      <tr>
                        <th className="px-5 py-3.5 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">항공편</th>
                        <td className="px-5 py-3.5 text-gray-700">
                          {[m.arrival_flight, m.arrival_time?.slice(0,5), m.arrival_terminal].filter(Boolean).join(" · ")}
                        </td>
                      </tr>
                    )}
                    {(e.type === "departure" || e.type === "ride_out") && m.departure_flight && (
                      <tr>
                        <th className="px-5 py-3.5 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">항공편</th>
                        <td className="px-5 py-3.5 text-gray-700">
                          {[m.departure_flight, m.departure_time?.slice(0,5), m.departure_terminal].filter(Boolean).join(" · ")}
                        </td>
                      </tr>
                    )}
                    {/* 숙소 */}
                    <tr>
                      <th className="px-5 py-3.5 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">숙소</th>
                      <td className="px-5 py-3.5">
                        {mAccom ? (
                          <span className="text-gray-800">
                            {mAccom.provider_name}
                            {mAccom.address && <span className="block text-xs text-gray-400 mt-1">{mAccom.address}</span>}
                            {getFamPeriod(mAccom) && <span className="block text-xs text-gray-400">{getFamPeriod(mAccom)}</span>}
                          </span>
                        ) : (
                          <span className="text-orange-400">미배정</span>
                        )}
                      </td>
                    </tr>
                    {/* 차량 */}
                    <tr>
                      <th className="px-5 py-3.5 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">차량</th>
                      <td className="px-5 py-3.5">
                        {mVehicle ? (
                          <span className="text-gray-800">
                            {mVehicle.car_model
                              ? `${mVehicle.car_model} (${mVehicle.provider_name})`
                              : mVehicle.provider_name}
                            {getFamPeriod(mVehicle) && <span className="block text-xs text-gray-400 mt-1">{getFamPeriod(mVehicle)}</span>}
                          </span>
                        ) : (
                          <span className="text-orange-400">미배정</span>
                        )}
                      </td>
                    </tr>
                  </>
                )}

                {/* ── 숙소 이벤트 ── */}
                {isAEvt && accom && (
                  <>
                    {accomAsn?.from && (
                      <tr>
                        <th className="w-[84px] px-5 py-3.5 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">입실</th>
                        <td className="px-5 py-3.5 text-gray-800 font-semibold">{accomAsn.from.slice(5)}</td>
                      </tr>
                    )}
                    {accomAsn?.to && (
                      <tr>
                        <th className="px-5 py-3.5 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">퇴실</th>
                        <td className="px-5 py-3.5 text-gray-800 font-semibold">{accomAsn.to.slice(5)}</td>
                      </tr>
                    )}
                    {accom.address && (
                      <tr>
                        <th className="px-5 py-3.5 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">주소</th>
                        <td className="px-5 py-3.5 text-gray-700 leading-relaxed">{accom.address}</td>
                      </tr>
                    )}
                    {accom.notes && (
                      <tr>
                        <th className="px-5 py-3.5 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap align-top">메모</th>
                        <td className="px-5 py-3.5 text-gray-700 whitespace-pre-wrap leading-relaxed">{accom.notes}</td>
                      </tr>
                    )}
                    {e.type === "cleaning" && (
                      <tr>
                        <td colSpan={2} className="px-5 py-3 text-orange-600 text-sm font-medium bg-orange-50">
                          퇴실 청소 일정
                        </td>
                      </tr>
                    )}
                  </>
                )}

                {/* ── 차량 이벤트 ── */}
                {isVEvt && vehicle && (
                  <>
                    {vehicleAsn?.from && (
                      <tr>
                        <th className="w-[84px] px-5 py-3.5 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">시작</th>
                        <td className="px-5 py-3.5 text-gray-800 font-semibold">{vehicleAsn.from.slice(5)}</td>
                      </tr>
                    )}
                    {vehicleAsn?.to && (
                      <tr>
                        <th className="px-5 py-3.5 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap">반납</th>
                        <td className="px-5 py-3.5 text-gray-800 font-semibold">{vehicleAsn.to.slice(5)}</td>
                      </tr>
                    )}
                    {!vehicle.insurance_added && (
                      <tr>
                        <td colSpan={2} className="px-5 py-3 text-orange-500 text-sm font-medium bg-orange-50">
                          운전자 보험 미추가
                        </td>
                      </tr>
                    )}
                    {vehicle.notes && (
                      <tr>
                        <th className="px-5 py-3.5 bg-gray-50 text-gray-500 font-medium text-left whitespace-nowrap align-top">메모</th>
                        <td className="px-5 py-3.5 text-gray-700 whitespace-pre-wrap leading-relaxed">{vehicle.notes}</td>
                      </tr>
                    )}
                  </>
                )}

              </tbody>
            </table>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════
          행사 일정 상세 모달
      ══════════════════════════════════════ */}
      {detailSched && (
        <Modal
          isOpen={showSchedDetail}
          onClose={() => setShowSchedDetail(false)}
          title={detailSched.title}
          className="sm:max-w-[620px]"
        >
          <div className="space-y-4">
            {/* ── 일정 기본 정보 ── */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-gray-400 w-12 shrink-0">날짜</span>
                <span className="font-semibold text-gray-900">
                  {detailSched.event_date}
                  <span className="ml-2 font-normal text-gray-400">
                    ({["일","월","화","수","목","금","토"][new Date(detailSched.event_date + "T00:00:00").getDay()]}요일)
                  </span>
                </span>
              </div>
              {(detailSched.start_time || detailSched.end_time) && (
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 w-12 shrink-0">시간</span>
                  <span className="text-gray-700">
                    {detailSched.start_time?.slice(0, 5)}
                    {detailSched.end_time ? ` ~ ${detailSched.end_time.slice(0, 5)}` : ""}
                  </span>
                </div>
              )}
              {detailSched.location && (
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 w-12 shrink-0">장소</span>
                  <span className="text-gray-700">📍 {detailSched.location}</span>
                </div>
              )}
              {detailSched.responsible_name && (
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 w-12 shrink-0">담당</span>
                  <span className="text-gray-700">👤 {detailSched.responsible_name}</span>
                </div>
              )}
              {detailSched.description && (
                <div className="flex items-start gap-3">
                  <span className="text-gray-400 w-12 shrink-0 pt-0.5">내용</span>
                  <span className="text-gray-700 whitespace-pre-wrap">{detailSched.description}</span>
                </div>
              )}
            </div>

            {/* ── 관련 선교사 (MARF only) ── */}
            {isMarf && (() => {
              const d = detailSched.event_date;
              const related = missionariesData.filter((m) =>
                m.arrival_date === d ||
                m.departure_date === d ||
                (m.arrival_date && m.departure_date && d > m.arrival_date && d < m.departure_date),
              );
              if (related.length === 0) return (
                <p className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-xl">
                  이 날짜와 관련된 선교사가 없습니다.
                </p>
              );

              /* 가족 단위 묶기 */
              const groupMap = new Map<string, MissionaryRaw[]>();
              const solos: MissionaryRaw[] = [];
              related.forEach((m) => {
                const g = m.family_group?.trim();
                if (g) { if (!groupMap.has(g)) groupMap.set(g, []); groupMap.get(g)!.push(m); }
                else solos.push(m);
              });

              const getAccom = (mId: string) =>
                accomsData.find((a) =>
                  a.assigned_missionary_id === mId ||
                  (a.assignments ?? []).some((as) => as.missionary_id === mId),
                );
              const getVehicle = (mId: string) =>
                vehiclesData.find((v) =>
                  v.assigned_missionary_id === mId ||
                  (v.assignments ?? []).some((as) => as.missionary_id === mId),
                );
              const getPeriod = (mId: string, res: AccomRaw | VehicleRaw) => {
                const a = (res.assignments ?? []).find((as) => as.missionary_id === mId);
                if (a?.from) return `${a.from} ~ ${a.to || "미정"}`;
                if (res.available_from) return `${res.available_from} ~ ${res.available_to || "미정"}`;
                return "";
              };

              const renderCard = (m: MissionaryRaw) => {
                const accom   = getAccom(m.id);
                const vehicle = getVehicle(m.id);
                const isArr = m.arrival_date === d;
                const isDep = m.departure_date === d;
                return (
                  <div className="space-y-1.5 text-sm">
                    {isArr && (
                      <div className="text-xs text-blue-700 font-medium flex items-center gap-1.5">
                        <span>✈️ 입국</span>
                        {m.arrival_time && <span>{m.arrival_time.slice(0,5)}</span>}
                        {m.arrival_terminal && <span>· {m.arrival_terminal}</span>}
                        {m.arrival_flight && <span className="font-bold">{m.arrival_flight}</span>}
                      </div>
                    )}
                    {isDep && (
                      <div className="text-xs text-orange-600 font-medium flex items-center gap-1.5">
                        <span>✈️ 출국</span>
                        {m.departure_time && <span>{m.departure_time.slice(0,5)}</span>}
                        {m.departure_terminal && <span>· {m.departure_terminal}</span>}
                        {m.departure_flight && <span className="font-bold">{m.departure_flight}</span>}
                      </div>
                    )}
                    {!isArr && !isDep && (
                      <div className="text-xs text-gray-400">
                        체류 기간: {m.arrival_date} ~ {m.departure_date}
                      </div>
                    )}
                    {/* 숙소 */}
                    {m.accommodation_needed && (
                      <div className="flex items-start gap-1.5 text-xs text-gray-600">
                        <span className="shrink-0">🏠</span>
                        {accom ? (
                          <span>
                            <span className="font-medium text-gray-800">{accom.provider_name}</span>
                            {accom.address && <span className="text-gray-400 ml-1">{accom.address}</span>}
                            {accom.provider_contact && <span className="text-gray-400 ml-1">({accom.provider_contact})</span>}
                            {getPeriod(m.id, accom) && <span className="text-gray-400 ml-1">{getPeriod(m.id, accom)}</span>}
                          </span>
                        ) : <span className="text-orange-400 font-medium">숙소 미배정</span>}
                      </div>
                    )}
                    {/* 차량 */}
                    {m.vehicle_needed && (
                      <div className="flex items-start gap-1.5 text-xs text-gray-600">
                        <span className="shrink-0">🚗</span>
                        {vehicle ? (
                          <span>
                            <span className="font-medium text-gray-800">{vehicle.provider_name}</span>
                            {vehicle.car_model && <span className="text-gray-400 ml-1">{vehicle.car_model}</span>}
                            {vehicle.car_number && <span className="text-gray-400 ml-0.5">({vehicle.car_number})</span>}
                            {!vehicle.insurance_added && <span className="text-orange-500 ml-1 font-medium">⚠️ 보험미완료</span>}
                            {getPeriod(m.id, vehicle) && <span className="text-gray-400 ml-1">{getPeriod(m.id, vehicle)}</span>}
                          </span>
                        ) : <span className="text-orange-400 font-medium">차량 미배정</span>}
                      </div>
                    )}
                    {m.ride_needed && <div className="text-xs text-purple-600">🚕 공항 라이드 필요</div>}
                    {/* 특이사항 / 메모 */}
                    {m.dietary_notes && (
                      <div className="text-xs text-gray-500">🍽️ {m.dietary_notes}</div>
                    )}
                    {m.notes && (
                      <div className="text-xs text-gray-600 bg-yellow-50 border border-yellow-100 rounded px-2 py-1.5 whitespace-pre-wrap">
                        📝 {m.notes}
                      </div>
                    )}
                    {m.phone && (
                      <div className="text-xs text-gray-400">📞 {m.phone}</div>
                    )}
                  </div>
                );
              };

              return (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-bold text-gray-700">관련 선교사</h3>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{related.length}명</span>
                  </div>
                  <div className="space-y-3">
                    {[...groupMap.entries()].map(([grp, members]) => (
                      <div key={grp} className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="font-semibold text-gray-800 text-sm mb-2">
                          👨‍👩‍👧 {grp}
                          <span className="ml-1.5 text-xs text-gray-400 font-normal">{members.length}명</span>
                        </div>
                        {renderCard(members[0])}
                        {members.length > 1 && (
                          <div className="mt-1.5 pt-1.5 border-t border-gray-100 text-xs text-gray-400">
                            동반: {members.slice(1).map((m) => m.name).join(", ")}
                          </div>
                        )}
                      </div>
                    ))}
                    {solos.map((m) => (
                      <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="font-semibold text-gray-800 text-sm mb-2">👤 {m.name}</div>
                        {renderCard(m)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </Modal>
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
