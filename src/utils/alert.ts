import Swal from "sweetalert2";

// 여백 균형잡힌 디자인 + Pretendard 폰트
const swalCustomClasses = {
  popup: "rounded-2xl shadow-lg !w-[340px] !p-7 font-pretendard",
  title: "!text-lg !font-bold !text-gray-900 !mb-4 !mt-0", // ! 추가로 우선순위 높임
  htmlContainer: "!text-sm !text-gray-600 !mt-0 !pt-0 !mb-0 !leading-relaxed",
  actions: "gap-3 !mt-6 !mb-0 w-full flex justify-center",
  confirmButton:
    "bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-6 py-2.5 text-sm w-[100px] transition-colors shadow-sm",
  cancelButton:
    "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold rounded-lg px-6 py-2.5 text-sm w-[100px] transition-colors",
};
/**
 * 예쁜 Confirm 창을 띄우는 공통 함수
 * @param title 제목
 * @param text 본문
 * @param confirmBtnText 확인 버튼 텍스트 (기본값: 확인)
 * @param cancelBtnText 취소 버튼 텍스트 (기본값: 닫기)
 * @returns 확인 버튼 누르면 true, 취소하면 false
 */
export const showConfirm = async (
  title: string,
  text: string = "",
  confirmBtnText: string = "확인",
  cancelBtnText: string = "닫기",
) => {
  const result = await Swal.fire({
    title: title,
    text: text,
    icon: undefined,
    showCancelButton: true,
    confirmButtonText: confirmBtnText,
    cancelButtonText: cancelBtnText,
    reverseButtons: false,
    buttonsStyling: false,
    customClass: swalCustomClasses,
    width: "340px",
    padding: "1.75rem", // 패딩 증가
    backdrop: "rgba(0, 0, 0, 0.4)",
    heightAuto: true,
  });

  return result.isConfirmed;
};

// 단순 알림창
export const showAlert = (title: string, text: string = "") => {
  return Swal.fire({
    title,
    text,
    icon: undefined,
    buttonsStyling: false,
    customClass: {
      ...swalCustomClasses,
      confirmButton:
        "bg-[#5B5FED] hover:bg-[#4A4DDB] text-white font-semibold rounded-lg px-8 py-2.5 text-sm w-[140px] transition-colors shadow-sm",
      actions: "!mt-6 !mb-0 w-full flex justify-center",
    },
    confirmButtonText: "확인",
    width: "340px",
    padding: "1.75rem",
    backdrop: "rgba(0, 0, 0, 0.4)",
    heightAuto: true,
  });
};
