// src/components/ui/table.ts
// 표 공통 스타일 — 디자인 시스템 기준.
//
// 색·글자·선만 정하고, 칸 너비·정렬처럼 표마다 다른 건 뒤에 붙여 쓴다.
//   <th className={`${th} w-24`}>  <td className={`${td} ${num}`}>
//
// 표 머리를 붙여둘 때는 border-collapse 대신 border-separate 를 쓴다
// (collapse 는 스크롤 중에 머리 테두리가 사라진다).
//
// 지금은 클래스 상수만 둔다. 컴포넌트로 감싸는 건 표마다 구조가
// 너무 달라서 실익이 없다.
// ponytail: 세 번째 표가 같은 구조를 반복하면 그때 <DataTable> 로 올린다.

/** 표를 감싸는 카드 */
export const tableCard = "border border-table-line rounded-xl bg-white overflow-hidden";

/** 스크롤 영역 — 높이는 쓰는 쪽에서 (max-h-[68vh] 등) */
export const tableScroll = "overflow-auto";

export const table = "w-full border-separate border-spacing-0 text-sm";

/** 머리를 화면 위에 붙인다 */
export const thead = "sticky top-0 z-10";

/**
 * 머리칸 — 13px bold (디자인 시스템 Table-Header).
 * 정렬은 넣지 않는다 — 기본 왼쪽은 globals.css 의 base 층이 맡는다 (여기 넣으면 text-center 가 안 먹는다).
 * 자간은 스펙이 1px 인데 한글 13px 에서는 낱자가 흩어져 읽기 나빠서 0.2px 로 줄였다.
 * 영문 위주 표에서는 tracking-[1px] 을 뒤에 붙여 스펙대로 쓰면 된다.
 */
export const th =
  "px-3 py-2.5 bg-table-header text-[13px] font-bold text-heading tracking-[0.2px] border-b border-table-line whitespace-nowrap";

/** 본문칸 */
export const td = "px-3 py-2.5 border-b border-table-line text-heading align-middle";

/** 넉넉한 표 — 줄 수가 적고 한 줄에 정보가 많을 때 */
export const thWide = `${th} px-5 py-3.5`;
export const tdWide = `${td} px-5 py-3.5`;

/** 마우스를 올린 줄 · 고른 줄 */
export const trHover = "hover:bg-table-header/70 transition";
export const trOn = "bg-primary-wash";

/** 숫자는 우측 정렬 + 고정폭, 상태·ID는 가운데 */
export const num = "text-right font-mono tabular-nums";
export const center = "text-center";

/** 부가 정보 — 한 칸 안의 둘째 줄 */
export const sub = "text-xs text-muted";

/** 내용이 없을 때 */
export const empty = "py-16 text-center text-sm text-muted";
