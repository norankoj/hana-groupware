// ── 안내문 메시지 템플릿 빌더 ─────────────────────────────────────────────
// 숙소/차량 배정 안내, 봉사자 확정 알림 등 카톡·이메일에 붙여넣을 텍스트 생성

import { formatPeriods, type DatePeriod } from "@/utils/projectUtils";

/** "2026-06-03" → "6월 3일 (화)" */
export function fmtKDate(iso: string | null | undefined): string {
  if (!iso) return "(미정)";
  const d = new Date(iso + "T12:00:00Z");
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  return `${month}월 ${day}일 (${dow})`;
}

/** "2026-06-03" → "Jun 3 (Tue)" */
export function fmtEDate(iso: string | null | undefined): string {
  if (!iso) return "(TBD)";
  const d = new Date(iso + "T12:00:00Z");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dows   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()} (${dows[d.getUTCDay()]})`;
}

// ─── 숙소 안내 (선교사 → 가정용) ─────────────────────────────────────────
export function buildAccomGuestKO(opts: {
  familyName: string;
  providerName: string;
  providerContact?: string | null;
  address?: string | null;
  from: string;
  to: string;
  amenities?: string[] | null;
  notes?: string | null;
}): string {
  const lines = [
    `안녕하세요, ${opts.familyName} 가정. MARF 환영합니다 🙌`,
    ``,
    `이번 한국 체류 기간 동안 숙소 안내드립니다.`,
    ``,
    `[숙소 정보]`,
    `· 제공자: ${opts.providerName}${opts.providerContact ? ` (${opts.providerContact})` : ""}`,
    opts.address ? `· 주소: ${opts.address}` : "",
    `· 이용 기간: ${fmtKDate(opts.from)} ~ ${fmtKDate(opts.to)}`,
    opts.amenities?.length ? `· 편의시설: ${opts.amenities.join(", ")}` : "",
    opts.notes ? `· 비고: ${opts.notes}` : "",
    ``,
    `도착 시 제공자분께 연락 부탁드립니다.`,
    `문의사항 있으시면 언제든 알려주세요.`,
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildAccomGuestEN(opts: {
  familyName: string;
  providerName: string;
  providerContact?: string | null;
  address?: string | null;
  from: string;
  to: string;
  amenities?: string[] | null;
  notes?: string | null;
}): string {
  const lines = [
    `Dear ${opts.familyName} family,`,
    `Welcome to MARF! Here is your accommodation information.`,
    ``,
    `[Accommodation]`,
    `· Host: ${opts.providerName}${opts.providerContact ? ` (${opts.providerContact})` : ""}`,
    opts.address ? `· Address: ${opts.address}` : "",
    `· Stay: ${fmtEDate(opts.from)} ~ ${fmtEDate(opts.to)}`,
    opts.amenities?.length ? `· Amenities: ${opts.amenities.join(", ")}` : "",
    opts.notes ? `· Notes: ${opts.notes}` : "",
    ``,
    `Please contact the host upon arrival.`,
    `Feel free to reach out with any questions.`,
  ].filter(Boolean);
  return lines.join("\n");
}

// ─── 숙소 봉사자 확정 알림 ───────────────────────────────────────────────
export function buildAccomHostKO(opts: {
  providerName: string;
  familyName: string;
  familySize?: number;
  from: string;
  to: string;
  notes?: string | null;
}): string {
  return [
    `${opts.providerName} 집사님 / 권사님께,`,
    ``,
    `MARF 숙소 봉사에 협조해 주셔서 감사합니다 🙏`,
    `아래와 같이 선교사 가정 배정이 확정되었습니다.`,
    ``,
    `[배정 안내]`,
    `· 가정: ${opts.familyName}${opts.familySize ? ` (${opts.familySize}명)` : ""}`,
    `· 체류 기간: ${fmtKDate(opts.from)} ~ ${fmtKDate(opts.to)}`,
    opts.notes ? `· 비고: ${opts.notes}` : "",
    ``,
    `상세 일정·연락처는 따로 보내드리겠습니다.`,
    `감사합니다.`,
  ].filter(Boolean).join("\n");
}

// ─── 차량 안내 (선교사 → 가정용) ─────────────────────────────────────────
export function buildVehicleGuestKO(opts: {
  familyName: string;
  providerName: string;
  providerContact?: string | null;
  carModel?: string | null;
  carNumber?: string | null;
  from: string;
  to: string;
  insuranceAdded?: boolean;
  notes?: string | null;
}): string {
  return [
    `${opts.familyName} 가정,`,
    `한국 체류 기간 차량을 안내드립니다 🚗`,
    ``,
    `[차량 정보]`,
    `· 제공자: ${opts.providerName}${opts.providerContact ? ` (${opts.providerContact})` : ""}`,
    opts.carModel ? `· 차종: ${opts.carModel}` : "",
    opts.carNumber ? `· 차량번호: ${opts.carNumber}` : "",
    `· 사용 기간: ${fmtKDate(opts.from)} ~ ${fmtKDate(opts.to)}`,
    opts.insuranceAdded ? `· 운전자 보험: ✓ 등록 완료` : `· 운전자 보험: 등록 진행 중`,
    opts.notes ? `· 비고: ${opts.notes}` : "",
    ``,
    `차량 인수 시 제공자분과 시간/장소 조율 부탁드립니다.`,
  ].filter(Boolean).join("\n");
}

export function buildVehicleGuestEN(opts: {
  familyName: string;
  providerName: string;
  providerContact?: string | null;
  carModel?: string | null;
  carNumber?: string | null;
  from: string;
  to: string;
  insuranceAdded?: boolean;
  notes?: string | null;
}): string {
  return [
    `Dear ${opts.familyName} family,`,
    `Vehicle arrangement during your stay in Korea:`,
    ``,
    `[Vehicle]`,
    `· Provider: ${opts.providerName}${opts.providerContact ? ` (${opts.providerContact})` : ""}`,
    opts.carModel  ? `· Model: ${opts.carModel}` : "",
    opts.carNumber ? `· Plate: ${opts.carNumber}` : "",
    `· Period: ${fmtEDate(opts.from)} ~ ${fmtEDate(opts.to)}`,
    opts.insuranceAdded ? `· Driver insurance: ✓ Added` : `· Driver insurance: In progress`,
    opts.notes ? `· Notes: ${opts.notes}` : "",
    ``,
    `Please coordinate the pickup time/place with the provider.`,
  ].filter(Boolean).join("\n");
}

// ─── 차량 봉사자 확정 알림 ───────────────────────────────────────────────
export function buildVehicleHostKO(opts: {
  providerName: string;
  familyName: string;
  from: string;
  to: string;
  insuranceAdded?: boolean;
  notes?: string | null;
}): string {
  return [
    `${opts.providerName} 집사님 / 권사님께,`,
    ``,
    `MARF 차량 봉사에 감사드립니다 🙏`,
    `아래와 같이 배정이 확정되었습니다.`,
    ``,
    `[배정 안내]`,
    `· 사용 가정: ${opts.familyName}`,
    `· 사용 기간: ${fmtKDate(opts.from)} ~ ${fmtKDate(opts.to)}`,
    opts.insuranceAdded
      ? `· 운전자 보험: ✓ 등록 완료`
      : `· 운전자 보험: 등록 부탁드립니다 (별도 안내 예정)`,
    opts.notes ? `· 비고: ${opts.notes}` : "",
    ``,
    `구체적인 차량 인수 일정은 따로 협의드리겠습니다.`,
    `감사합니다.`,
  ].filter(Boolean).join("\n");
}

// ─── 환영 메시지 (도착 직전 보내는 일반 인사) ──────────────────────────
export function buildWelcomeKO(opts: {
  familyName: string;
  arrivalDate?: string | null;
  arrivalFlight?: string | null;
  accomProvider?: string | null;
  vehicleProvider?: string | null;
  shareUrl?: string | null;
}): string {
  return [
    `${opts.familyName} 가정 환영합니다 🇰🇷✈️`,
    ``,
    `한국 도착 ${opts.arrivalDate ? fmtKDate(opts.arrivalDate) : "(예정일)"} ` +
      `${opts.arrivalFlight ? `· ${opts.arrivalFlight}편` : ""} 무사히 들어오시길 기도드립니다.`,
    ``,
    opts.accomProvider   ? `· 숙소: ${opts.accomProvider} 가정에서 모십니다.` : "",
    opts.vehicleProvider ? `· 차량: ${opts.vehicleProvider} 가정에서 협조해 주십니다.` : "",
    opts.shareUrl ? `· 자세한 정보(영문/한글): ${opts.shareUrl}` : "",
    ``,
    `궁금하신 점 있으시면 언제든 연락주세요!`,
  ].filter(Boolean).join("\n");
}

// ─── 다중 기간 포맷 ───────────────────────────────────────────────────────
export function periodsToKText(periods: DatePeriod[]): string {
  if (!periods?.length) return "(미정)";
  return periods.map((p) => `${fmtKDate(p.from)} ~ ${fmtKDate(p.to)}`).join(", ");
}

export function periodsToEText(periods: DatePeriod[]): string {
  if (!periods?.length) return "(TBD)";
  return periods.map((p) => `${fmtEDate(p.from)} ~ ${fmtEDate(p.to)}`).join(", ");
}

// 호환성: formatPeriods 재export
export { formatPeriods };
