// src/components/expense/shared.ts
// 지출결의서 공용 타입 · 상수 · 헬퍼

// 은행 목록·금액 포맷·입력칸 스타일은 선교펀드와 완전히 같다. 새로 만들지 않고 재수출한다.
// (세 번째 모듈이 같은 것을 쓰게 되면 그때 공용 위치로 올린다)
export {
  BANK_OPTIONS,
  formatWon,
  toCommaInput,
  parseAmount,
  todayString,
  inputClass,
  selectClass,
  btnStyles,
} from "@/components/fund/shared";
import { joinAccountInfo, type ProofFile } from "@/components/fund/shared";
export type { ProofFile } from "@/components/fund/shared";

export type ExpenseUser = {
  id: string;
  full_name: string;
  role: string;
  is_expense_manager: boolean;
};

/** 예산안 한 줄 — 대항목(1) / 소항목(2) / 비목(3) */
export type BudgetItem = {
  id: string;
  fiscal_year: number;
  parent_id: string | null;
  level: 1 | 2 | 3;
  code: string | null;
  name: string;
  planned_amount: number;
  priority: string | null;
  note: string | null;
  sort_order: number;
};

/** budget_usage 뷰 — 비목별 소진 집계 */
export type BudgetUsage = {
  budget_item_id: string;
  fiscal_year: number;
  spent_total: number; // 승인 + 이체완료
  pending_total: number; // 처리 대기중
  spent_count: number;
};

/** 화면에서 쓰는 트리 노드 — 소진액은 하위까지 합산된 값 */
export type BudgetNode = BudgetItem & {
  children: BudgetNode[];
  spent: number;
  pending: number;
};

export type ExpenseStatus =
  | "pending"
  | "approved"
  | "paid"
  | "rejected"
  | "cancelled";

/** 결의서 줄 — 청구 양식의 순번 1, 2, 3 … */
export type ExpenseRequestItem = {
  id: string;
  request_id: string;
  sort_order: number;
  item_name: string; // 품명 / 지출대상
  qty: number;
  unit_price: number;
  amount: number; // 총액
  purpose: string | null; // 용도 / 비고
  budget_item_id: string | null; // 담당자가 승인할 때 배정
  // 이 줄만 지급 대상이 다를 때. 비어 있으면 결의서 헤더 계좌로 지급한다.
  bank_name: string | null;
  account_no: string | null;
  account_holder: string | null;
  receipt_files: ProofFile[];
  created_at: string;
  budget_item?: { code: string | null; name: string } | null;
};

/** 결의서 헤더 — 한 번의 청구 */
export type ExpenseRequest = {
  id: string;
  requester_id: string;
  fiscal_year: number;
  title: string;
  request_date: string;
  bank_name: string | null;
  account_no: string | null;
  account_holder: string | null;
  status: ExpenseStatus;
  handler_id: string | null;
  decided_at: string | null;
  paid_at: string | null;
  reject_reason: string | null;
  result_seen: boolean;
  created_at: string;
  items?: ExpenseRequestItem[];
  requester?: { full_name: string; position: string | null } | null;
  handler?: { full_name: string } | null;
};

export const STATUS_LABEL: Record<ExpenseStatus, string> = {
  pending: "처리대기",
  approved: "승인됨",
  paid: "지급완료",
  rejected: "반려됨",
  cancelled: "취소됨",
};

export const STATUS_STYLE: Record<ExpenseStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-600 border-red-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

/**
 * 예산안 목록과 소진 집계를 트리로 묶는다.
 * 소진액은 자기 항목에 직접 배정된 것 + 하위 전체를 더한다
 * (담당자가 비목이 아닌 소항목에 바로 배정할 수도 있다).
 */
export function buildBudgetTree(
  items: BudgetItem[],
  usage: BudgetUsage[],
): BudgetNode[] {
  const byId = new Map<string, BudgetNode>(
    items.map((it) => [it.id, { ...it, children: [], spent: 0, pending: 0 }]),
  );
  const used = new Map(usage.map((u) => [u.budget_item_id, u]));

  const roots: BudgetNode[] = [];
  for (const it of items) {
    const node = byId.get(it.id)!;
    const parent = it.parent_id ? byId.get(it.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const rollUp = (n: BudgetNode) => {
    const own = used.get(n.id);
    n.spent = own?.spent_total ?? 0;
    n.pending = own?.pending_total ?? 0;
    for (const c of n.children) {
      rollUp(c);
      n.spent += c.spent;
      n.pending += c.pending;
    }
  };
  roots.forEach(rollUp);

  return roots;
}

/** 비목 선택·배정 화면에서 쓰는 납작한 목록 — 트리 순서 + 합산된 소진액 + 경로 */
export type BudgetFlat = BudgetItem & {
  spent: number;
  pending: number;
  /** "1. 선교비 › 170. 선교지원" — 어느 항목 밑인지 */
  path: string;
};

/** 트리를 화면 순서 그대로 납작하게 펴고, 각 항목에 상위 경로를 붙인다 */
export function flattenBudget(
  items: BudgetItem[],
  usage: BudgetUsage[],
): BudgetFlat[] {
  const out: BudgetFlat[] = [];
  const walk = (nodes: BudgetNode[], trail: string[]) => {
    for (const n of nodes) {
      const { children, ...rest } = n;
      out.push({ ...rest, path: trail.join(" › ") });
      walk(children, [...trail, itemLabel(n)]);
    }
  };
  walk(buildBudgetTree(items, usage), []);
  return out;
}

/** 소진율 주의 기준(%) — 넘으면 주황, 100% 넘으면 초과로 표시한다 */
export const WARN_AT = 80;

/** 소진율(%) — 계획이 0이면 0으로 본다 */
export const spentRatio = (n: { planned_amount: number; spent: number }) =>
  n.planned_amount > 0 ? (n.spent / n.planned_amount) * 100 : 0;

/**
 * 가용 잔액 — 계획에서 확정지출과 처리대기를 모두 뺀 금액.
 *
 * 비목을 배정할 때 담당자가 봐야 하는 숫자는 이것이다.
 * '계획 − 확정지출'만 보여주면 대기중인 청구가 안 보여서,
 * 잔액이 남은 줄 알고 여러 건을 같은 비목에 배정한 뒤
 * 한꺼번에 승인하면 예산을 넘긴다.
 */
export const availableAmount = (n: {
  planned_amount: number;
  spent: number;
  pending: number;
}) => n.planned_amount - n.spent - n.pending;

/** "1707 선교지/선교사 후원" — 비목 검색·표시용 */
export const itemLabel = (it: { code: string | null; name: string }) =>
  it.code ? `${it.code} ${it.name}` : it.name;

/** 결의서 총액 */
export const requestTotal = (items: { amount: number }[]) =>
  items.reduce((sum, i) => sum + (i.amount ?? 0), 0);

/**
 * 이 줄을 실제로 지급할 계좌.
 * 계좌는 줄마다 적지만, 헤더에 계좌가 남아 있는 예전 결의서도 있으므로
 * 줄이 비어 있으면 헤더 값으로 되돌아간다.
 */
export const resolveAccount = (
  item: Pick<ExpenseRequestItem, "bank_name" | "account_no" | "account_holder">,
  req: Pick<ExpenseRequest, "bank_name" | "account_no" | "account_holder">,
) =>
  item.bank_name && item.account_no
    ? item
    : {
        bank_name: req.bank_name,
        account_no: req.account_no,
        account_holder: req.account_holder,
      };

/** 계좌 한 줄로 — "국민은행 000-00-0000 홍길동" */
export const accountText = (a: {
  bank_name: string | null;
  account_no: string | null;
  account_holder: string | null;
}) => joinAccountInfo(a) || "계좌 미입력";

