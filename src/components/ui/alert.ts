// src/components/ui/alert.ts
// 안내 · 알림 박스 — 디자인 시스템 색 규칙.
//
// 알림은 주색(primary)이 아니라 info(시안)를 쓴다. 주색은 '누를 것'에만 써야
// 눈이 버튼을 찾는다. 안내문이 주색이면 클릭할 수 있는 줄 알게 된다.
//
//   <div className={alertInfo}>
//     <p className={alertTitle}>사용 방법</p>
//     <p className={alertBody}>…</p>
//   </div>

const box = "rounded-xl border px-4 py-3";

/** 알려주는 것 — 사용 방법, 참고 사항 */
export const alertInfo = `${box} border-info/30 bg-info-soft`;
/** 조심할 것 — 되돌릴 수 없음, 값이 비었음 */
export const alertWarning = `${box} border-warning/30 bg-warning-soft`;
/** 잘못된 것 — 실패, 반려 */
export const alertDanger = `${box} border-danger/30 bg-danger-soft`;
/** 잘된 것 — 완료 */
export const alertSuccess = `${box} border-success/30 bg-success-soft`;

/** 박스 안 머리말 · 본문 — 연한 틴트에서 대비가 나오는 -active 색을 쓴다 */
export const alertTitle = "text-sm font-bold";
export const alertBody = "text-xs leading-relaxed";

export const alertInfoText = "text-info-active";
export const alertWarningText = "text-warning-active";
export const alertDangerText = "text-danger-active";
export const alertSuccessText = "text-success-active";
