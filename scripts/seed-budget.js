// scripts/seed-budget.js
// 예산안 엑셀 → budget_items 시딩 SQL 생성
//
//   node scripts/seed-budget.js
//
// 만들어진 SQL을 Supabase Dashboard > SQL Editor 에 붙여넣어 실행한다.
// (SQL Editor 는 RLS를 우회하므로 budget_items 에 insert 정책이 없어도 들어간다)
//
// 내년 예산안이 확정되면 아래 CONFIG 네 줄만 고쳐서 다시 돌리면 된다.

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const CONFIG = {
  file: "2026년 예산(안) v1-0125공동의회보고안.xlsx",
  sheet: "예산안(계획실적)_20251214",
  fiscalYear: 2026,
  plannedCol: 7, // H열 = '26년(계획)'. 연도가 바뀌면 이 인덱스도 옮겨야 한다.
  out: "supabase/migrations/seed_budget_2026.sql",
};

const COL = { major: 0, minor: 1, leaf: 2, priority: 3, note: 10 };

const root = path.resolve(__dirname, "..");

/** "1707. 선교지/선교사 후원" → { code: "1707", name: "선교지/선교사 후원" } */
const splitCode = (raw) => {
  const lines = raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const head = lines[0] ?? "";
  const rest = lines.slice(1).join(" ");
  const m = head.match(/^(\d+)[.\s]+(.*)$/);
  return {
    code: m ? m[1] : null,
    name: (m ? m[2] : head).trim() || head,
    extra: rest,
  };
};

const cell = (row, i) => String(row[i] ?? "").trim();

const num = (row, i) => {
  const v = row[i];
  if (typeof v === "number") return Math.round(v);
  const digits = String(v ?? "").replace(/[^\d-]/g, "");
  return digits ? Math.round(Number(digits)) : 0;
};

const q = (v) =>
  v === null || v === undefined || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`;

// ── 파싱 ──────────────────────────────────────────────────────────────────
const wb = XLSX.readFile(path.join(root, CONFIG.file));
const ws = wb.Sheets[CONFIG.sheet];
if (!ws) throw new Error(`시트를 찾을 수 없습니다: ${CONFIG.sheet}`);

const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

const items = [];
let parent1 = null;
let parent2 = null;

for (let r = 2; r < rows.length; r++) {
  const row = rows[r];
  const major = cell(row, COL.major);
  const minor = cell(row, COL.minor);
  const leaf = cell(row, COL.leaf);

  // '총 합계' 아래는 합계행과 운영 메모 — 항목이 아니다
  if (major.startsWith("총 합계") || major.startsWith("합계")) break;

  // 어느 칸이 먼저 채워졌는지가 곧 단계다.
  // (소항목 행의 세 번째 칸에는 '소계' 또는 설명이 들어와 있어 이름으로 쓰지 않는다)
  let level, raw;
  if (major) {
    level = 1;
    raw = major;
  } else if (minor && minor !== "계") {
    level = 2;
    raw = minor;
  } else if (leaf && leaf !== "소계" && leaf !== "계") {
    level = 3;
    raw = leaf;
  } else {
    continue; // 통합된 비목의 빈 껍데기 행
  }

  const { code, name, extra } = splitCode(raw);
  const noteParts = [cell(row, COL.note), extra].filter(Boolean);

  const item = {
    id: crypto.randomUUID(),
    level,
    code,
    name,
    planned: num(row, CONFIG.plannedCol),
    priority: cell(row, COL.priority) || null,
    note: noteParts.join("\n") || null,
    sort: items.length + 1,
    parent: level === 1 ? null : level === 2 ? parent1 : parent2,
    excelRow: r + 1,
  };

  if (level === 1) {
    parent1 = item.id;
    parent2 = null;
  } else if (level === 2) {
    parent2 = item.id;
  }

  items.push(item);
}

// ── 검증 ──────────────────────────────────────────────────────────────────
const problems = [];

const byCode = new Map();
for (const it of items) {
  if (!it.code) {
    problems.push(`코드 없음: ${it.level}단 "${it.name}" (엑셀 ${it.excelRow}행)`);
    continue;
  }
  if (byCode.has(it.code)) {
    problems.push(
      `코드 중복 ${it.code}: "${byCode.get(it.code).name}" (${byCode.get(it.code).excelRow}행) / "${it.name}" (${it.excelRow}행)`,
    );
  }
  byCode.set(it.code, it);
}
for (const it of items) {
  if (it.level > 1 && !it.parent)
    problems.push(`상위 항목 없음: ${it.code} ${it.name} (${it.excelRow}행)`);
}

// 계층이 잘못 붙으면 금액으로 드러난다 — 상위 항목의 계획액은 자녀 합계와 같아야 한다.
// (엑셀의 '계'·'소계' 행이 곧 상위 항목의 금액이므로 이게 맞으면 트리가 맞다)
const children = new Map();
for (const it of items) {
  if (!it.parent) continue;
  if (!children.has(it.parent)) children.set(it.parent, []);
  children.get(it.parent).push(it);
}
for (const it of items) {
  const kids = children.get(it.id);
  if (!kids) continue;
  const sum = kids.reduce((s, c) => s + c.planned, 0);
  if (sum !== it.planned)
    problems.push(
      `합계 불일치 ${it.code} ${it.name} (${it.excelRow}행): ` +
        `계획 ${it.planned.toLocaleString("ko-KR")} ≠ 하위 ${kids.length}개 합 ${sum.toLocaleString("ko-KR")}`,
    );
}

if (problems.length) {
  console.error("⚠ 시딩을 멈췄습니다 — 엑셀을 확인해주세요:\n");
  for (const p of problems) console.error("  · " + p);
  process.exit(1);
}

// ── SQL 생성 ──────────────────────────────────────────────────────────────
const total = items
  .filter((i) => i.level === 1)
  .reduce((s, i) => s + i.planned, 0);

const counts = [1, 2, 3].map((l) => items.filter((i) => i.level === l).length);

const lines = [
  `-- ──────────────────────────────────────────────────────────────────────────`,
  `-- ${CONFIG.fiscalYear}년 예산안 시딩 (${items.length}행 — 대항목 ${counts[0]} / 소항목 ${counts[1]} / 비목 ${counts[2]})`,
  `-- 계획 총액: ${total.toLocaleString("ko-KR")}원`,
  `--`,
  `-- 자동 생성: node scripts/seed-budget.js`,
  `-- 원본: ${CONFIG.file} / 시트 "${CONFIG.sheet}"`,
  `-- 실행: Supabase Dashboard > SQL Editor (add_expense_v1.sql 실행 후)`,
  `-- ──────────────────────────────────────────────────────────────────────────`,
  ``,
  `begin;`,
  ``,
  `-- 다시 시딩하면 비목 배정(expense_request_items.budget_item_id)이 지워진다.`,
  `-- 이미 배정된 결의서가 있으면 멈춘다.`,
  `do $$`,
  `begin`,
  `  if exists (`,
  `    select 1 from expense_request_items i`,
  `      join budget_items b on b.id = i.budget_item_id`,
  `     where b.fiscal_year = ${CONFIG.fiscalYear}`,
  `  ) then`,
  `    raise exception '이미 비목이 배정된 결의서가 있습니다. 예산안을 다시 시딩할 수 없습니다.';`,
  `  end if;`,
  `end $$;`,
  ``,
  `delete from budget_items where fiscal_year = ${CONFIG.fiscalYear};`,
  ``,
  `insert into budget_items`,
  `  (id, fiscal_year, parent_id, level, code, name, planned_amount, priority, note, sort_order)`,
  `values`,
];

lines.push(
  items
    .map(
      (i) =>
        `  (${q(i.id)}, ${CONFIG.fiscalYear}, ${i.parent ? q(i.parent) : "null"}, ${i.level}, ` +
        `${q(i.code)}, ${q(i.name)}, ${i.planned}, ${q(i.priority)}, ${q(i.note)}, ${i.sort})`,
    )
    .join(",\n") + ";",
);

lines.push(
  ``,
  `-- 새 연도는 가예산으로 들어간다. 앱의 예산안 탭에서 확정한다.`,
  `insert into budget_years (fiscal_year, status) values (${CONFIG.fiscalYear}, 'draft')`,
  `on conflict (fiscal_year) do nothing;`,
);
lines.push(``, `commit;`, ``);

const outPath = path.join(root, CONFIG.out);
fs.writeFileSync(outPath, lines.join("\n"), "utf8");

console.log(`✓ ${CONFIG.out}`);
console.log(
  `  ${items.length}행 — 대항목 ${counts[0]} / 소항목 ${counts[1]} / 비목 ${counts[2]}`,
);
console.log(`  ${CONFIG.fiscalYear}년 계획 총액 ${total.toLocaleString("ko-KR")}원`);
