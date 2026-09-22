// src/components/ui/DetailTable.tsx
// 상세 팝업의 '항목 | 값' 표. 운행 상세 정보의 표 모양을 기준으로 삼았다.
// 휴가 신청 상세 · 선교펀드 내역 상세 · 지출결의서 상세 · 운행 상세가 같이 쓴다.
//
//   <DetailTable>
//     <DetailRow label="기안자">노나연</DetailRow>
//     <DetailRow label="기간">2026-09-09 ~ 2026-09-09</DetailRow>
//   </DetailTable>
//
// 선은 모두 표 격자색(table-line) 하나 — 겉테두리와 칸 선이 달라 보이지 않게.
// 줄 구분선은 마지막 줄만 빼고 그린다(last:border-0) — 줄마다 isLast 를
// 넘기지 않아도 된다. 예전 InfoRow 는 그걸 빼먹으면 바닥선이 두 겹이 됐다.

export function DetailTable({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border border-table-line rounded-lg overflow-hidden bg-white ${className}`}
    >
      {children}
    </div>
  );
}

export function DetailRow({
  label,
  children,
  /** 값 칸을 위쪽에 붙인다 — 여러 줄짜리 값(사유, 사진 묶음)일 때 */
  top = false,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  top?: boolean;
}) {
  return (
    <div className="flex border-b border-table-line last:border-b-0">
      <div
        className={`w-24 sm:w-28 shrink-0 bg-table-header px-3 py-2.5 text-sm font-semibold text-heading border-r border-table-line flex ${
          top ? "items-start" : "items-center"
        }`}
      >
        {label}
      </div>
      <div
        className={`flex-1 min-w-0 px-3 py-2.5 text-sm text-heading leading-relaxed break-keep flex ${
          top ? "items-start" : "items-center"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
