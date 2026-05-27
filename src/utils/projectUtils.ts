// ── 기간 호환성 유틸리티 (숙소·차량 매칭 기간 체크) ──────────────────────

export type Coverage = "full" | "partial" | "none";

/** 숙소/차량 요청 기간 단위 */
export type DatePeriod = { from: string; to: string };

export const COVER_ICON: Record<Coverage, string> = {
  full: "✅",
  partial: "⚠️",
  none: "❌",
};

/**
 * 선교사(가족) 체류 기간이 자원 제공 기간에 포함되는지 체크 (단일 기간)
 */
export function checkCoverage(
  availFrom: string | null,
  availTo: string | null,
  stayFrom: string | null,
  stayTo: string | null,
): Coverage {
  if (!availFrom || !availTo || !stayFrom || !stayTo) return "none";
  if (stayFrom >= availFrom && stayTo <= availTo) return "full";
  if (stayFrom > availTo || stayTo < availFrom) return "none";
  return "partial";
}

/**
 * 여러 자원의 합산 기간이 요청 기간(stayFrom~stayTo)을 커버하는지 체크.
 * 분산 배정(숙소2개, 차량2대 등) 시 전체 커버리지를 계산한다.
 */
export function checkCombinedCoverage(
  periods: Array<{ from: string | null; to: string | null }>,
  stayFrom: string | null,
  stayTo: string | null,
): Coverage {
  if (!stayFrom || !stayTo) return "none";

  const valid = periods
    .filter((p): p is { from: string; to: string } => !!p.from && !!p.to)
    .sort((a, b) => a.from.localeCompare(b.from));

  if (valid.length === 0) return "none";

  const anyOverlap = valid.some((p) => p.from <= stayTo && p.to >= stayFrom);
  if (!anyOverlap) return "none";

  let covered = stayFrom;
  for (const p of valid) {
    if (p.to < covered) continue;
    // 1일 공백 허용: 다음 자원이 커버 끝 다음날 시작이면 연속으로 간주
    const d = new Date(covered + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    const coveredPlusOne = d.toISOString().slice(0, 10);
    if (p.from > coveredPlusOne) break;
    if (p.to > covered) covered = p.to;
    if (covered >= stayTo) return "full";
  }
  return "partial";
}

/**
 * 여러 자원의 합산 기간이 복수 요청 기간을 모두 커버하는지 체크.
 * 요청 기간이 여러 개일 때 (예: 6/1~6/4 AND 7/15~8/24) 사용.
 */
export function checkMultiPeriodCoverage(
  resourcePeriods: Array<{ from: string | null; to: string | null }>,
  requestedPeriods: DatePeriod[],
): Coverage {
  if (requestedPeriods.length === 0) return "none";
  const results = requestedPeriods.map((rp) =>
    checkCombinedCoverage(resourcePeriods, rp.from, rp.to),
  );
  if (results.every((r) => r === "full")) return "full";
  if (results.every((r) => r === "none")) return "none";
  return "partial";
}

// ── 가족 단위 stay 계산 ────────────────────────────────────────────────────

/**
 * 가족 그룹 전체의 체류 기간 (min arrival ~ max departure)
 */
export function getFamilyStay<
  T extends {
    id: string;
    family_group: string | null;
    arrival_date: string | null;
    departure_date: string | null;
  },
>(
  missionaryId: string,
  missionaries: T[],
): { from: string | null; to: string | null } {
  const m = missionaries.find((x) => x.id === missionaryId);
  if (!m) return { from: null, to: null };
  if (!m.family_group?.trim()) {
    return { from: m.arrival_date, to: m.departure_date };
  }
  const group = missionaries.filter(
    (x) => x.family_group?.trim() === m.family_group!.trim(),
  );
  const froms = group.map((x) => x.arrival_date).filter(Boolean) as string[];
  const tos = group.map((x) => x.departure_date).filter(Boolean) as string[];
  return {
    from: froms.length ? [...froms].sort()[0] : null,
    to: tos.length ? [...tos].sort().at(-1)! : null,
  };
}

/**
 * 숙소 전용: accommodation_periods(배열) 우선,
 * 없으면 accommodation_from/to(단일), 없으면 arrival/departure 사용.
 */
export function getFamilyAccomPeriods<
  T extends {
    id: string;
    family_group: string | null;
    accommodation_periods?: DatePeriod[] | null;
    accommodation_from?: string | null;
    accommodation_to?: string | null;
    arrival_date: string | null;
    departure_date: string | null;
  },
>(missionaryId: string, missionaries: T[]): DatePeriod[] {
  const m = missionaries.find((x) => x.id === missionaryId);
  if (!m) return [];

  const getOne = (x: T): DatePeriod[] => {
    if (x.accommodation_periods?.length) return x.accommodation_periods;
    if (x.accommodation_from && x.accommodation_to)
      return [{ from: x.accommodation_from, to: x.accommodation_to }];
    if (x.arrival_date && x.departure_date)
      return [{ from: x.arrival_date, to: x.departure_date }];
    return [];
  };

  if (!m.family_group?.trim()) return getOne(m);
  const group = missionaries.filter(
    (x) => x.family_group?.trim() === m.family_group!.trim(),
  );
  return getOne(group[0]);
}

/**
 * 차량 전용: vehicle_periods(배열) 우선,
 * 없으면 vehicle_from/to(단일), 없으면 arrival/departure 사용.
 */
export function getFamilyVehiclePeriods<
  T extends {
    id: string;
    family_group: string | null;
    vehicle_periods?: DatePeriod[] | null;
    vehicle_from?: string | null;
    vehicle_to?: string | null;
    arrival_date: string | null;
    departure_date: string | null;
  },
>(missionaryId: string, missionaries: T[]): DatePeriod[] {
  const m = missionaries.find((x) => x.id === missionaryId);
  if (!m) return [];

  const getOne = (x: T): DatePeriod[] => {
    if (x.vehicle_periods?.length) return x.vehicle_periods;
    if (x.vehicle_from && x.vehicle_to)
      return [{ from: x.vehicle_from, to: x.vehicle_to }];
    if (x.arrival_date && x.departure_date)
      return [{ from: x.arrival_date, to: x.departure_date }];
    return [];
  };

  if (!m.family_group?.trim()) return getOne(m);
  const group = missionaries.filter(
    (x) => x.family_group?.trim() === m.family_group!.trim(),
  );
  return getOne(group[0]);
}

// ── 레거시 (하위 호환) ────────────────────────────────────────────────────

/** @deprecated getFamilyAccomPeriods 사용 권장 */
export function getFamilyAccomStay<
  T extends {
    id: string;
    family_group: string | null;
    accommodation_from: string | null;
    accommodation_to: string | null;
    arrival_date: string | null;
    departure_date: string | null;
  },
>(
  missionaryId: string,
  missionaries: T[],
): { from: string | null; to: string | null } {
  const periods = getFamilyAccomPeriods(missionaryId, missionaries as any);
  if (periods.length === 0) return { from: null, to: null };
  const froms = periods.map((p) => p.from).sort();
  const tos   = periods.map((p) => p.to).sort();
  return { from: froms[0], to: tos.at(-1)! };
}

/** @deprecated getFamilyVehiclePeriods 사용 권장 */
export function getFamilyVehicleStay<
  T extends {
    id: string;
    family_group: string | null;
    vehicle_from: string | null;
    vehicle_to: string | null;
    arrival_date: string | null;
    departure_date: string | null;
  },
>(
  missionaryId: string,
  missionaries: T[],
): { from: string | null; to: string | null } {
  const periods = getFamilyVehiclePeriods(missionaryId, missionaries as any);
  if (periods.length === 0) return { from: null, to: null };
  const froms = periods.map((p) => p.from).sort();
  const tos   = periods.map((p) => p.to).sort();
  return { from: froms[0], to: tos.at(-1)! };
}

/** 날짜 N일 가감 (내부 유틸) — UTC noon 기준으로 타임존 영향 방지 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z"); // UTC 정오 기준 → 한국(UTC+9) 등 어떤 tz에서도 날짜 오차 없음
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 기존 배정 후 남은 자유 기간 계산 (교회 소속 자원용).
 * projectFrom~projectTo 범위에서 assignments가 차지하지 않은 빈 구간을 반환.
 *
 * 예) 프로젝트 6/1~6/21, 배정 6/3~6/10 · 6/11~6/14
 *   → [{ from:"2026-06-01", to:"2026-06-02" }, { from:"2026-06-15", to:"2026-06-21" }]
 */
export function getRemainingPeriods(
  assignments: { from: string; to: string }[],
  projectFrom: string,
  projectTo: string,
): DatePeriod[] {
  if (!projectFrom || !projectTo) return [];

  // 유효하고 프로젝트 기간에 겹치는 배정만 정렬
  const sorted = assignments
    .filter((a) => a.from && a.to && a.from <= projectTo && a.to >= projectFrom)
    .sort((a, b) => a.from.localeCompare(b.from));

  const remaining: DatePeriod[] = [];
  let cursor = projectFrom;

  for (const a of sorted) {
    if (cursor < a.from) {
      remaining.push({ from: cursor, to: addDays(a.from, -1) });
    }
    const next = addDays(a.to, 1);
    if (next > cursor) cursor = next;
    if (cursor > projectTo) break;
  }

  if (cursor <= projectTo) {
    remaining.push({ from: cursor, to: projectTo });
  }

  // from > to 인 잘못된 구간 제거
  return remaining.filter((p) => p.from <= p.to);
}

/** 기간 배열을 표시용 문자열로 변환 (예: "06/01~06/04, 07/15~08/24") */
export function formatPeriods(periods: DatePeriod[], sliceYear = true): string {
  if (periods.length === 0) return "날짜 미입력";
  return periods
    .map((p) => {
      const f = sliceYear ? p.from.slice(5) : p.from;
      const t = sliceYear ? p.to.slice(5)   : p.to;
      return `${f}~${t}`;
    })
    .join(", ");
}
