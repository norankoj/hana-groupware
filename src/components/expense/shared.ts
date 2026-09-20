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

/**
 * 은행 표기와 은행코드 — 이체 엑셀에 넣는다.
 * 코드는 금융결제원 기관코드, 표기는 기존 이체 양식에서 쓰던 짧은 이름.
 */
export const BANK_INFO: Record<string, { code: string; short: string }> = {
  국민은행: { code: "004", short: "국민" },
  하나은행: { code: "081", short: "KEB하나" },
  우리은행: { code: "020", short: "우리" },
  신한은행: { code: "088", short: "신한" },
  농협은행: { code: "011", short: "농협" },
  지역농축협: { code: "012", short: "단위농협" },
  기업은행: { code: "003", short: "기업" },
  SC제일은행: { code: "023", short: "SC제일" },
  한국씨티은행: { code: "027", short: "씨티" },
  수협은행: { code: "007", short: "수협" },
  새마을금고: { code: "045", short: "새마을" },
  신협: { code: "048", short: "신협" },
  우체국: { code: "071", short: "우체국" },
  산업은행: { code: "002", short: "산업" },
  카카오뱅크: { code: "090", short: "카카오뱅크" },
  케이뱅크: { code: "089", short: "케이뱅크" },
  토스뱅크: { code: "092", short: "토스뱅크" },
  부산은행: { code: "032", short: "부산" },
  대구은행: { code: "031", short: "대구" },
  경남은행: { code: "039", short: "경남" },
  광주은행: { code: "034", short: "광주" },
  전북은행: { code: "037", short: "전북" },
  제주은행: { code: "035", short: "제주" },
};

/** 교회 출금계좌 — 전부 국민은행, 예금주 수원하나교회 */
export type WithdrawAccount = {
  code: string;
  name: string;
  bank_name: string;
  account_no: string;
  account_holder: string;
  sort_order: number;
  is_active: boolean;
};

/** "A 일반재정" */
export const withdrawLabel = (a: WithdrawAccount) => `${a.code} ${a.name}`;

/**
 * 항목마다 자동으로 붙일 출금계좌.
 *
 * 엑셀의 계좌코드는 말단(비목, 또는 하위가 없는 소항목)에만 적혀 있다.
 * 소항목·대항목에 바로 배정하는 경우를 위해, 하위 말단이 모두 같은
 * 계좌를 쓰면 그 계좌를 쓰고, 섞여 있으면 정하지 않는다(null → 직접 고름).
 *   예) 3. 사역자 사례 → 하위 전부 A → A
 *       170. 선교지원  → E 와 G 가 섞임 → null
 */
export function withdrawDefaults(
  items: { id: string; parent_id: string | null; withdraw_code: string | null }[],
): Map<string, string | null> {
  const children = new Map<string, string[]>();
  for (const it of items) {
    if (!it.parent_id) continue;
    if (!children.has(it.parent_id)) children.set(it.parent_id, []);
    children.get(it.parent_id)!.push(it.id);
  }
  const byId = new Map(items.map((it) => [it.id, it]));
  const memo = new Map<string, Set<string>>();

  /** 이 항목 아래(자기 포함) 말단들이 쓰는 계좌 모음 */
  const codesUnder = (id: string): Set<string> => {
    const cached = memo.get(id);
    if (cached) return cached;
    const own = byId.get(id)?.withdraw_code;
    const kids = children.get(id) ?? [];
    const set = new Set<string>();
    if (own) set.add(own);
    else for (const k of kids) codesUnder(k).forEach((c) => set.add(c));
    memo.set(id, set);
    return set;
  };

  const out = new Map<string, string | null>();
  for (const it of items) {
    const set = codesUnder(it.id);
    out.set(it.id, set.size === 1 ? [...set][0] : null);
  }
  return out;
}

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
  /** 이 항목의 돈이 나가는 교회 계좌 */
  withdraw_code: string | null;
  sort_order: number;
  /** 추경·전용 전의 원안 금액 (변경이 있을 때만 채워진다) */
  original_planned?: number;
};

/** 예산 변경 — 추경(늘리기·줄이기) · 전용(옮기기). 원안은 두고 기록을 쌓는다 */
export type BudgetChange = {
  id: string;
  fiscal_year: number;
  kind: "revise" | "transfer";
  from_item_id: string | null;
  to_item_id: string;
  amount: number;
  memo: string;
  changed_on: string;
  created_at: string;
};

export const CHANGE_LABEL: Record<BudgetChange["kind"], string> = {
  revise: "추경",
  transfer: "전용",
};

/**
 * 원안에 추경·전용을 더해 현재 예산을 만든다. 바뀐 금액은 상위 항목까지 올려서
 * 대항목·소항목 합계가 하위 합과 계속 맞게 한다. 원안은 original_planned 에 남긴다.
 */
export function applyBudgetChanges(
  items: BudgetItem[],
  changes: BudgetChange[],
): BudgetItem[] {
  const byId = new Map(
    items.map((i) => [i.id, { ...i, original_planned: i.planned_amount }]),
  );
  const bump = (id: string, delta: number) => {
    let cur = byId.get(id);
    while (cur) {
      cur.planned_amount += delta;
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
  };
  for (const c of changes) {
    if (c.kind === "transfer" && c.from_item_id) bump(c.from_item_id, -c.amount);
    bump(c.to_item_id, c.amount);
  }
  return items.map((i) => byId.get(i.id)!);
}

/** 예산 연도 — 가예산(draft)으로 넣고 담당자가 확정(final)한다 */
export type BudgetYear = {
  fiscal_year: number;
  status: "draft" | "final";
  finalized_at: string | null;
};

/**
 * 청구의 예산 연도 — 청구일자(지출일) 기준. 승인일이 아니다.
 * 12월에 쓴 것을 1월에 승인해도 그 해 예산이다.
 * 그 해 예산이 아직 확정되지 않았으면 확정된 최근 연도로 넣는다.
 */
export const fiscalYearFor = (
  date: string,
  years: BudgetYear[],
  fallback: number,
) => {
  const y = Number(date.slice(0, 4));
  return years.some((v) => v.fiscal_year === y && v.status === "final")
    ? y
    : fallback;
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
  /** 이체 목록에 들어가 은행에 들고 간 상태 */
  | "paying"
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
  /** 출금계좌 — 비목을 배정하면 자동으로 붙고, 손으로 바꿀 수 있다 */
  withdraw_code: string | null;
  // 이 줄만 지급 대상이 다를 때. 비어 있으면 결의서 헤더 계좌로 지급한다.
  bank_name: string | null;
  account_no: string | null;
  account_holder: string | null;
  receipt_files: ProofFile[];
  created_at: string;
  budget_item?: { code: string | null; name: string } | null;
  /** 지급완료 뒤 추가 지급 · 과지급 반환 기록 */
  adjustments?: ExpenseAdjustment[];
};

/** 지급 정정 — 원래 금액은 두고 정정을 쌓는다 (고치거나 지우지 않는다) */
export type ExpenseAdjustment = {
  id: string;
  item_id: string;
  kind: "extra" | "refund";
  amount: number;
  occurred_on: string;
  memo: string;
  created_at: string;
};

export const ADJ_LABEL: Record<ExpenseAdjustment["kind"], string> = {
  extra: "추가 지급",
  refund: "과지급 반환",
};

/** 정정까지 반영한 최종 지급액 */
export const netPaid = (it: { amount: number; adjustments?: ExpenseAdjustment[] }) =>
  it.amount +
  (it.adjustments ?? []).reduce(
    (sum, a) => sum + (a.kind === "extra" ? a.amount : -a.amount),
    0,
  );

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
  /** 이체 목록을 만든 시각 — 같은 시각이면 같은 묶음 */
  payout_listed_at: string | null;
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
  paying: "이체중",
  paid: "지급완료",
  rejected: "반려됨",
  cancelled: "취소됨",
};

export const STATUS_STYLE: Record<ExpenseStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paying: "bg-indigo-50 text-indigo-700 border-indigo-200",
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

/** 비목 id → 그 비목이 속한 대항목 이름 (걸러보기·엑셀에서 함께 쓴다) */
export const majorLabels = (options: BudgetFlat[]) => {
  const map = new Map<string, string>();
  for (const o of options)
    map.set(o.id, o.path.split(" › ")[0] || itemLabel(o));
  return map;
};

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

