// src/components/fund/shared.ts
// 해외사역매칭펀드(선교펀드) 공용 타입 · 상수 · 헬퍼

// --- 타입 정의 ---
export type FundEntryType = "deposit" | "withdraw";
export type FundStatus = "pending" | "completed" | "cancelled" | "rejected";

/** 펀드 대상자 — 그룹웨어 계정이 없어도 원장에 기록할 수 있게 하는 명부 */
export type FundPayee = {
  id: string;
  name: string;
  user_id: string | null;
  kind: "person" | "fund";
  memo: string | null;
  is_active: boolean;
  created_at: string;
};

export type FundLedger = {
  id: string;
  payee_id: string;
  entry_type: FundEntryType;
  amount: number;
  note: string | null;
  description: string | null;
  entry_date: string;
  request_id: string | null;
  corrects_id: string | null;
  created_by: string | null;
  created_at: string;
  payee?: { name: string; kind: "person" | "fund" } | null;
};

export type FundRequest = {
  id: string;
  user_id: string;
  amount: number;
  purpose: string;
  bank_name: string | null;
  account_no: string | null;
  account_holder: string | null;
  proof_url: string | null;
  proof_name: string | null;
  status: FundStatus;
  requested_at: string;
  handler_id: string | null;
  transfer_date: string | null;
  completed_at: string | null;
  reject_reason: string | null;
  result_seen: boolean;
  created_at: string;
  profiles?: { full_name: string; position: string } | null;
  handler?: { full_name: string } | null;
};

export type FundBalance = {
  payee_id: string;
  user_id: string | null;
  name: string;
  kind: "person" | "fund";
  deposit_total: number;
  withdraw_total: number;
  pending_total: number;
  balance: number;
};

export const PAYEE_KIND_LABEL: Record<FundPayee["kind"], string> = {
  person: "사역자",
  fund: "기타",
};

export type FundUser = {
  id: string;
  full_name: string;
  role: string;
  position: string;
  is_fund_manager: boolean;
};

/** 명부에 아직 등록되지 않은 사용자의 빈 잔액 */
export const emptyBalance = (name: string): FundBalance => ({
  payee_id: "",
  user_id: null,
  name,
  kind: "person",
  deposit_total: 0,
  withdraw_total: 0,
  pending_total: 0,
  balance: 0,
});

// --- 라벨 ---
export const ENTRY_TYPE_LABEL: Record<FundEntryType, string> = {
  deposit: "적립",
  withdraw: "사용",
};

// 건별 입력 · 전체 내역 필터의 '구분'
export const ENTRY_MODE_OPTIONS = [
  { value: "deposit", label: "적립" },
  { value: "withdraw", label: "사용" },
];

// 엑셀 구분 칸에 들어올 수 있는 표기들 → 내부 값
// (예전 양식의 '본인적립금 / 교회지원금'도 적립으로 받아준다)
export const ENTRY_TYPE_ALIASES: Record<string, FundEntryType> = {
  적립: "deposit",
  적립금: "deposit",
  입금: "deposit",
  본인적립금: "deposit",
  본인적립: "deposit",
  교회지원금: "deposit",
  교회지원: "deposit",
  교회매칭금: "deposit",
  사용: "withdraw",
  출금: "withdraw",
};

export const STATUS_LABEL: Record<FundStatus, string> = {
  pending: "처리대기",
  completed: "이체완료",
  cancelled: "취소됨",
  rejected: "반려됨",
};

export const STATUS_STYLE: Record<FundStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  rejected: "bg-red-50 text-red-600 border-red-200",
};

export const STATUS_OPTIONS = [
  { value: "all", label: "전체 상태" },
  { value: "pending", label: "처리대기" },
  { value: "completed", label: "이체완료" },
  { value: "rejected", label: "반려됨" },
  { value: "cancelled", label: "취소됨" },
];

// --- 은행 목록 (받을 계좌 선택용) ---
export const BANK_OPTIONS = [
  "국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "농협은행",
  "지역농축협",
  "기업은행",
  "SC제일은행",
  "한국씨티은행",
  "수협은행",
  "새마을금고",
  "신협",
  "우체국",
  "산업은행",
  "카카오뱅크",
  "케이뱅크",
  "토스뱅크",
  "부산은행",
  "대구은행",
  "경남은행",
  "광주은행",
  "전북은행",
  "제주은행",
].map((b) => ({ value: b, label: b }));

// --- 운영규정 안내 (신청 화면에 고정 표시) ---
export const FUND_ACCOUNT = "국민은행 920301-01-620290 (예금주: 수원하나교회)";

export const FUND_USAGE_ALLOWED = [
  "해외행사·집회 참여, 단기선교, 비전트립, 선교지 방문",
  "항공료 및 교통비 (국제선·현지 이동·국내 공항 이동 포함)",
  "체류 경비 (숙박비, 식비, 간식비, 비자비, 현장 선교사 및 팀 헌금·헌물·식사접대, 공공요금)",
];

export const FUND_USAGE_DENIED = [
  "개인 물품 구입",
  "개인 선물",
  "관광 목적의 비용",
];

// --- 공통 스타일 ---
// 입력칸과 Select 버튼의 높이를 맞추기 위해 같은 padding·font-size를 쓴다.
export const inputClass =
  "w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500";

export const selectClass =
  "w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm";

export const btnStyles = {
  save: "px-5 py-2.5 bg-[#2151EC] text-white font-medium rounded-lg hover:bg-[#1a43c9] transition text-sm shadow-md flex-1 sm:flex-none justify-center cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed",
  delete:
    "px-5 py-2.5 bg-[#EA5455] text-white font-medium rounded-lg hover:bg-[#d34647] transition text-sm shadow-md flex-1 sm:flex-none justify-center cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed",
  cancel:
    "px-5 py-2.5 bg-white border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition text-sm flex-1 sm:flex-none sm:min-w-[80px] justify-center cursor-pointer",
};

// --- 헬퍼 ---
export const formatWon = (n: number) =>
  new Intl.NumberFormat("ko-KR").format(n ?? 0);

/** 금액 입력칸용: 숫자만 남기고 천단위 콤마를 붙인다 (한글·기호는 그대로 버림) */
export const toCommaInput = (raw: string) => {
  const digits = raw.replace(/\D/g, "").slice(0, 15);
  return digits ? Number(digits).toLocaleString("ko-KR") : "";
};

/** "250,000", "250000원", " 250000 " 등을 숫자로. 실패하면 null */
export const parseAmount = (raw: unknown): number | null => {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.trunc(raw) : null;
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[^\d-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

/** "2026.09.01", "2026-9-1", 엑셀 날짜(시리얼) 등을 yyyy-MM-dd 로. 실패하면 null */
export const parseEntryDate = (raw: unknown): string | null => {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return toDateString(raw);
  }
  // 엑셀에서 날짜 서식이면 1900-01-01 기준 시리얼 숫자로 들어온다
  if (typeof raw === "number" && raw > 0) {
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : toDateString(d);
  }
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(mo) - 1 ||
    date.getDate() !== Number(d)
  ) {
    return null;
  }
  return toDateString(date);
};

const toDateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

export const todayString = () => toDateString(new Date());

/** 증빙자료 열기 — 교회 NAS에서 받아온다. 권한은 서버에서 확인한다. */
export const openProof = (requestId: string) => {
  window.open(
    `/api/fund/proof?request=${encodeURIComponent(requestId)}`,
    "_blank",
    "noopener",
  );
};

/** "국민, 00000-00-00000, 고성호" 형태의 계좌정보를 세 조각으로 */
export const splitAccountInfo = (raw: string) => {
  const parts = raw.split(/[,/|]/).map((s) => s.trim());
  return {
    bank_name: parts[0] || null,
    account_no: parts[1] || null,
    account_holder: parts[2] || null,
  };
};

export const joinAccountInfo = (r: {
  bank_name: string | null;
  account_no: string | null;
  account_holder: string | null;
}) => [r.bank_name, r.account_no, r.account_holder].filter(Boolean).join(" ");
