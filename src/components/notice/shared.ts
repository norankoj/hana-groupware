// src/components/notice/shared.ts
// 공지 목록 · 상세 · 팝업 · 미리보기가 같이 쓰는 표시 규칙.
// 예전엔 파일마다 복사돼 있어서 한 곳만 고치면 화면끼리 색이 어긋났다.

/** 분류 배지 — 디자인 시스템 규칙 (배경 12% 틴트, 글자 -active, 선 원색 30%) */
export const CATEGORY_STYLE: Record<string, string> = {
  공지: "bg-primary-soft text-primary-active border-primary/30",
  중요: "bg-danger-soft text-danger-active border-danger/30",
  일반: "bg-secondary-soft text-dark border-secondary/30",
};

/**
 * 본문 HTML 을 그리는 틀. 상세 화면과 미리보기가 반드시 같아야
 * '미리 본 그대로' 올라간다 — 여기 한 곳에서만 정한다.
 */
export const NOTICE_PROSE = [
  "prose prose-sm max-w-none text-gray-800 leading-relaxed break-words [&_a]:break-all",
  // 표 — 칸마다 선이 있어야 읽힌다 (prose 기본은 가로선만 그린다)
  "[&_table]:w-full [&_table]:border-collapse [&_table]:my-3",
  "[&_th]:border [&_th]:border-table-line [&_th]:bg-table-header [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold",
  "[&_td]:border [&_td]:border-table-line [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top",
  "[&_th_p]:m-0 [&_td_p]:m-0",
  // 본문 이미지 — 화면 폭을 넘지 않게
  "[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-2",
].join(" ");
