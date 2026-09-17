// scripts/seed-withdraw-accounts.js
// 출금계좌(교회 계좌)와 비목별 기본 출금계좌 시딩 SQL 생성
//
//   node scripts/seed-withdraw-accounts.js
//
// 원본 엑셀의 두 곳을 읽는다.
//  · "은행계좌코드" 시트   — #A_일반재정(936801-01-014298) 형태, 전부 국민은행/수원하나교회
//  · 예산안 시트의 '계좌코드' 열 — 비목마다 어느 계좌에서 나가는지
//
// 비목은 코드(1707 등)로 맞추므로 이미 시딩된 예산안을 건드리지 않는다.

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const CONFIG = {
  file:
    process.argv[2] ||
    "C:/Users/suwonhanaweb/Documents/카카오톡 받은 파일/2026년 예산(안)-예산코드별계좌코드정리.xlsx",
  accountSheet: "은행계좌코드",
  budgetSheet: "예산안(계획실적)_20251214",
  fiscalYear: 2026,
  codeCol: 3, // 예산안 시트의 '계좌코드' 열
  out: "supabase/migrations/add_expense_v5_withdraw_accounts.sql",
};

const root = path.resolve(__dirname, "..");
const q = (v) =>
  v === null || v === undefined || v === ""
    ? "null"
    : `'${String(v).replace(/'/g, "''")}'`;

const wb = XLSX.readFile(CONFIG.file);

// ── 출금계좌 ──────────────────────────────────────────────────────────────
const accountRows = XLSX.utils.sheet_to_json(wb.Sheets[CONFIG.accountSheet], {
  header: 1,
  defval: "",
});

const accounts = [];
for (const row of accountRows) {
  const raw = String(row[0] ?? "").trim();
  if (!raw) continue;
  // #A_일반재정(936801-01-014298)
  const m = raw.match(/^#?([A-Z])_(.+?)\(([\d-]+)\)\s*$/);
  if (!m) {
    console.error(`⚠ 형식을 알 수 없는 계좌 줄: ${raw}`);
    process.exit(1);
  }
  accounts.push({ code: m[1], name: m[2].trim(), accountNo: m[3] });
}
accounts.sort((a, b) => a.code.localeCompare(b.code));

// ── 비목별 계좌코드 ────────────────────────────────────────────────────────
const budgetRows = XLSX.utils.sheet_to_json(wb.Sheets[CONFIG.budgetSheet], {
  header: 1,
  defval: "",
});

const cell = (row, i) => String(row[i] ?? "").trim();
const leadingCode = (raw) => {
  const head = raw.split("\n").map((s) => s.trim()).filter(Boolean)[0] ?? "";
  const m = head.match(/^(\d+)[.\s]+(.*)$/);
  return m ? m[1] : null;
};

const mapping = [];
const known = new Set(accounts.map((a) => a.code));
const problems = [];

for (let r = 2; r < budgetRows.length; r++) {
  const row = budgetRows[r];
  const major = cell(row, 0);
  const minor = cell(row, 1);
  const leaf = cell(row, 2);
  if (major.startsWith("총 합계") || major.startsWith("합계")) break;

  let raw;
  if (major) raw = major;
  else if (minor && minor !== "계") raw = minor;
  else if (leaf && leaf !== "소계" && leaf !== "계") raw = leaf;
  else continue;

  const code = leadingCode(raw);
  const withdraw = cell(row, CONFIG.codeCol);
  if (!withdraw) continue; // 상위 항목은 비어 있다 (하위에서 정한다)

  if (!code) {
    problems.push(`코드 없는 항목에 계좌코드 ${withdraw}: ${raw.split("\n")[0]}`);
    continue;
  }
  if (!known.has(withdraw)) {
    problems.push(
      `${code}: 계좌 목록에 없는 코드 '${withdraw}' (엑셀 ${r + 1}행)`,
    );
    continue;
  }
  mapping.push({ code, withdraw });
}

if (problems.length) {
  console.error("⚠ 시딩을 멈췄습니다:\n");
  for (const p of problems) console.error("  · " + p);
  process.exit(1);
}

// ── SQL ───────────────────────────────────────────────────────────────────
const lines = [
  `-- ──────────────────────────────────────────────────────────────────────────`,
  `-- 지출결의서 v5 — 출금계좌 (교회 계좌 ${accounts.length}개 / 비목 ${mapping.length}건 연결)`,
  `--`,
  `-- 자동 생성: node scripts/seed-withdraw-accounts.js`,
  `-- 원본: ${path.basename(CONFIG.file)}`,
  `-- 실행: Supabase Dashboard > SQL Editor (add_expense_v4 실행 후)`,
  `--`,
  `-- 예산안 항목마다 돈이 나가는 교회 계좌가 정해져 있다. 담당자가 비목을`,
  `-- 배정하면 그 계좌가 자동으로 붙고, 같은 비목이라도 달라야 하는 경우가`,
  `-- 있어 청구 줄에서 손으로 바꿀 수 있다.`,
  `-- ──────────────────────────────────────────────────────────────────────────`,
  ``,
  `begin;`,
  ``,
  `-- ── 1. 출금계좌 ────────────────────────────────────────────────────────────`,
  `-- 전부 국민은행, 예금주 수원하나교회.`,
  `create table if not exists withdraw_accounts (`,
  `  code           text primary key,                       -- 'A' ~ 'P'`,
  `  name           text not null,                          -- '일반재정'`,
  `  bank_name      text not null default '국민은행',`,
  `  account_no     text not null,`,
  `  account_holder text not null default '수원하나교회',`,
  `  sort_order     int  not null default 0,`,
  `  is_active      boolean not null default true`,
  `);`,
  ``,
  `insert into withdraw_accounts (code, name, account_no, sort_order) values`,
  accounts
    .map(
      (a, i) => `  (${q(a.code)}, ${q(a.name)}, ${q(a.accountNo)}, ${i + 1})`,
    )
    .join(",\n") + `\non conflict (code) do update`,
  `  set name       = excluded.name,`,
  `      account_no = excluded.account_no,`,
  `      sort_order = excluded.sort_order;`,
  ``,
  `-- ── 2. 비목별 기본 출금계좌 ────────────────────────────────────────────────`,
  `alter table budget_items`,
  `  add column if not exists withdraw_code text`,
  `  references withdraw_accounts(code) on delete set null;`,
  ``,
  `-- ── 3. 청구 줄의 출금계좌 (배정 때 자동으로 채우고, 손으로 고칠 수 있다) ──`,
  `alter table expense_request_items`,
  `  add column if not exists withdraw_code text`,
  `  references withdraw_accounts(code) on delete set null;`,
  ``,
  `-- ── 4. 열람 권한 ───────────────────────────────────────────────────────────`,
  `alter table withdraw_accounts enable row level security;`,
  ``,
  `drop policy if exists "출금계좌 열람" on withdraw_accounts;`,
  `create policy "출금계좌 열람"`,
  `  on withdraw_accounts for select`,
  `  using (can_read_budget());`,
  ``,
  `-- ── 5. 비목에 계좌코드를 연결한다 (코드로 맞추므로 예산안은 그대로) ───────`,
  `update budget_items b set withdraw_code = v.wcode`,
  `  from (values`,
  mapping.map((m) => `    (${q(m.code)}, ${q(m.withdraw)})`).join(",\n"),
  `  ) as v(code, wcode)`,
  ` where b.code = v.code`,
  `   and b.fiscal_year = ${CONFIG.fiscalYear};`,
  ``,
  `-- ── 6. 이미 배정된 청구 줄에도 채운다 ─────────────────────────────────────`,
  `-- 이 스크립트를 돌리기 전에 배정한 줄은 출금계좌가 비어 있다.`,
  `-- 아직 손으로 정한 값이 없으므로(null) 비목의 기본값으로 채운다.`,
  `update expense_request_items i`,
  `   set withdraw_code = b.withdraw_code`,
  `  from budget_items b`,
  ` where b.id = i.budget_item_id`,
  `   and i.withdraw_code is null`,
  `   and b.withdraw_code is not null;`,
  ``,
  `commit;`,
  ``,
  ``,
  `-- ── 확인 ──────────────────────────────────────────────────────────────────`,
  `-- 계좌코드가 없는 '배정 가능한' 항목을 찾는다 (하위가 없는 항목만 해당).`,
  `-- select b.code, b.name, b.level`,
  `--   from budget_items b`,
  `--  where b.fiscal_year = ${CONFIG.fiscalYear}`,
  `--    and b.withdraw_code is null`,
  `--    and not exists (select 1 from budget_items c where c.parent_id = b.id)`,
  `--  order by b.sort_order;`,
];

fs.writeFileSync(path.join(root, CONFIG.out), lines.join("\n"), "utf8");

console.log(`✓ ${CONFIG.out}`);
console.log(`  출금계좌 ${accounts.length}개: ${accounts.map((a) => a.code).join(", ")}`);
console.log(`  비목 연결 ${mapping.length}건`);
