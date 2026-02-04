"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "@/styles/calendar.css";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  parseISO,
} from "date-fns";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import { showConfirm } from "@/utils/alert";
import { HOLIDAYS } from "@/constants/holidays";
import {
  VacationRequest,
  UserProfile,
  calculateChurchVacationDays,
  DEDUCTIBLE_TYPES,
  btnStyles,
} from "./shared";

// 내부용 InfoRow 컴포넌트
const InfoRow = ({
  label,
  value,
  isLast,
}: {
  label: string;
  value: React.ReactNode;
  isLast?: boolean;
}) => (
  <div
    className={`flex border-b border-gray-200 ${isLast ? "border-b-0" : ""}`}
  >
    <div className="w-32 bg-gray-50 p-3 text-sm font-bold text-gray-600 flex items-center justify-center border-r border-gray-200">
      {label}
    </div>
    <div className="flex-1 bg-white p-3 text-sm text-gray-800 flex items-center whitespace-pre-wrap">
      {value}
    </div>
  </div>
);

export default function VacationCalendar({
  user,
  myRequests,
  onRefresh,
}: {
  user: UserProfile;
  myRequests: VacationRequest[];
  onRefresh: () => void;
}) {
  const supabase = createClient();
  const [date, setDate] = useState<Date>(new Date());
  const [activeStartDate, setActiveStartDate] = useState<Date>(new Date());
  const [calendarViewMode, setCalendarViewMode] = useState<"month" | "list">(
    "month",
  );

  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    type: "연차",
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [calculatedDays, setCalculatedDays] = useState(0);

  // 기간 선택 달력 (Range Picker) 상태
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0, width: 0 });
  const rangePickerRef = useRef<HTMLDivElement>(null);

  // 상세 보기 모달 상태
  const [selectedRequest, setSelectedRequest] =
    useState<VacationRequest | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // 1. 최근 신청 내역 정렬 (최신순: created_at 내림차순)
  const sortedMyRequests = useMemo(() => {
    return [...myRequests].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [myRequests]);

  // 일수 자동 계산
  useEffect(() => {
    if (formData.start_date && formData.end_date) {
      const days = calculateChurchVacationDays(
        formData.start_date,
        formData.end_date,
        formData.type,
      );
      setCalculatedDays(days);
    } else {
      setCalculatedDays(0);
    }
  }, [formData.start_date, formData.end_date, formData.type]);

  // 날짜 클릭 핸들러 (달력 뷰에서 날짜 클릭)
  const onDateClick = (value: Date) => {
    const dateStr = format(value, "yyyy-MM-dd");
    const dayOfWeek = value.getDay();

    if (dayOfWeek === 1 || dayOfWeek === 6) {
      return toast("월요일과 토요일은 휴무일이라 신청할 수 없습니다.", {
        icon: "🙅‍♂️",
      });
    }

    if (HOLIDAYS[dateStr]) {
      return toast("공휴일에는 휴가를 신청할 수 없습니다.", { icon: "🙅‍♂️" });
    }

    const existingReq = myRequests.find(
      (r) =>
        dateStr >= r.start_date &&
        dateStr <= r.end_date &&
        r.status !== "cancelled" &&
        r.status !== "rejected",
    );

    if (existingReq) {
      setSelectedRequest(existingReq);
      setIsDetailModalOpen(true);
      return;
    }

    // 새 기안
    setFormData({
      type: "연차",
      start_date: dateStr,
      end_date: dateStr,
      reason: "",
    });
    setIsRequestModalOpen(true);
  };

  // 범위 선택 핸들러 (기안 모달 내 달력)
  const handleRangeChange = (value: any) => {
    if (Array.isArray(value)) {
      const [start, end] = value;
      setFormData({
        ...formData,
        start_date: format(start, "yyyy-MM-dd"),
        end_date: format(end, "yyyy-MM-dd"),
      });
      setShowRangePicker(false);
    } else {
      const dateStr = format(value, "yyyy-MM-dd");
      setFormData({
        ...formData,
        start_date: dateStr,
        end_date: dateStr,
      });
      if (["오전반차", "오후반차"].includes(formData.type)) {
        setShowRangePicker(false);
      }
    }
  };

  // 팝업 달력 위치 계산
  const openRangePicker = () => {
    if (rangePickerRef.current) {
      const rect = rangePickerRef.current.getBoundingClientRect();
      const calendarWidth = 350;
      const windowWidth = window.innerWidth;

      let leftPos = rect.left + window.scrollX;

      if (rect.left + calendarWidth > windowWidth) {
        leftPos = windowWidth - calendarWidth - 20;
      }
      if (leftPos < 10) leftPos = 10;

      setPickerPos({
        top: rect.bottom + window.scrollY + 5,
        left: leftPos,
        width: rect.width,
      });
      setShowRangePicker(true);
    }
  };

  // 신청 제출
  const handleRequestSubmit = async () => {
    if (!formData.start_date || !formData.end_date || !formData.reason)
      return toast.error("모든 항목을 입력해주세요.");

    const daysCount = calculateChurchVacationDays(
      formData.start_date,
      formData.end_date,
      formData.type,
    );

    if (daysCount <= 0)
      return toast.error("유효하지 않은 기간이거나, 휴가 일수가 0일입니다.");

    const isOverlapping = myRequests.some((req) => {
      if (req.status === "cancelled" || req.status === "rejected") return false;
      return (
        formData.start_date <= req.end_date &&
        formData.end_date >= req.start_date
      );
    });

    if (isOverlapping) {
      return toast.error("이미 휴가가 신청된 날짜가 포함되어 있습니다.");
    }

    const isDeductible = DEDUCTIBLE_TYPES.includes(formData.type);

    if (isDeductible && user) {
      const remaining = user.total_leave_days - user.used_leave_days;
      if (daysCount > remaining) {
        return toast.error(
          `잔여 연차가 부족합니다!\n(남은 연차: ${remaining}일 / 신청: ${daysCount}일)`,
        );
      }
    }

    const confirmMessage = isDeductible
      ? `총 ${daysCount}일이 차감됩니다.`
      : `총 ${daysCount}일이 신청됩니다. (연차 차감 없음)`;

    if (!(await showConfirm("휴가를 기안하시겠습니까?", confirmMessage)))
      return;

    const { error } = await supabase.from("vacation_requests").insert({
      user_id: user?.id,
      type: formData.type,
      start_date: formData.start_date,
      end_date: formData.end_date,
      days_count: daysCount,
      reason: formData.reason,
    });

    if (error) toast.error("신청 실패: " + error.message);
    else {
      toast.success("결재 상신 완료!");
      setIsRequestModalOpen(false);
      onRefresh();
    }
  };

  // 취소 처리
  const handleCancel = async (req: VacationRequest) => {
    if (!(await showConfirm("정말 취소하시겠습니까?"))) return;
    try {
      if (req.status === "approved" && DEDUCTIBLE_TYPES.includes(req.type)) {
        const { data: myProfile } = await supabase
          .from("profiles")
          .select("used_leave_days")
          .eq("id", user?.id)
          .single();
        if (myProfile) {
          await supabase
            .from("profiles")
            .update({
              used_leave_days: myProfile.used_leave_days - req.days_count,
            })
            .eq("id", user?.id);
        }
      }
      await supabase
        .from("vacation_requests")
        .update({ status: "cancelled" })
        .eq("id", req.id);
      toast.success("취소되었습니다.");
      setIsDetailModalOpen(false);
      onRefresh();
    } catch (e: any) {
      toast.error("취소 실패: " + e.message);
    }
  };

  return (
    <>
      {/* 팝업 달력 포탈 */}
      {showRangePicker && (
        <div
          className="fixed inset-0 z-[9998]"
          onClick={() => setShowRangePicker(false)}
        />
      )}
      {showRangePicker && (
        <div
          className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-2xl p-3 range-calendar-wrapper animate-fadeIn"
          style={{
            top: pickerPos.top,
            left: pickerPos.left,
            width: pickerPos.width,
            maxWidth: "90vw",
          }}
        >
          <Calendar
            onChange={handleRangeChange}
            selectRange={!["오전반차", "오후반차"].includes(formData.type)}
            value={
              formData.start_date && formData.end_date
                ? [new Date(formData.start_date), new Date(formData.end_date)]
                : null
            }
            formatDay={(locale, date) => format(date, "d")}
            calendarType="gregory"
            locale="ko-KR"
            minDate={new Date()}
            tileClassName={({ date, view }) => {
              if (view !== "month") return null;
              const dateStr = format(date, "yyyy-MM-dd");
              if (HOLIDAYS[dateStr]) {
                return "holiday-day";
              }
              const isUnavailable = myRequests.some(
                (req) =>
                  (req.status === "approved" || req.status === "pending") &&
                  dateStr >= req.start_date &&
                  dateStr <= req.end_date,
              );
              if (isUnavailable)
                return "!bg-gray-100 !text-gray-400 cursor-not-allowed";
            }}
            tileDisabled={({ date, view }) => {
              if (view !== "month") return false;
              const dateStr = format(date, "yyyy-MM-dd");
              const day = date.getDay();
              return (
                !!HOLIDAYS[dateStr] ||
                day === 1 ||
                day === 6 ||
                myRequests.some(
                  (req) =>
                    (req.status === "approved" || req.status === "pending") &&
                    dateStr >= req.start_date &&
                    dateStr <= req.end_date,
                )
              );
            }}
          />
        </div>
      )}

      {/* 메인 레이아웃 */}
      {/* 2. 수정: 왼쪽 패널 높이를 모바일에서도 고정 (h-[580px]) */}
      <div className="flex flex-col lg:flex-row gap-6 h-auto lg:h-[650px] animate-fadeIn">
        {/* 달력/리스트 영역 */}
        <div className="lg:flex-[2] bg-white p-6 rounded-xl shadow-md border border-gray-200 h-[580px] lg:h-[650px] w-full flex flex-col">
          {/* 1. 수정: 모바일에서는 2줄 (날짜 위 / 버튼 아래), PC에서는 1줄 */}
          {/* Grid를 사용하여 모바일 정렬 제어 */}
          <div className="grid grid-cols-2 gap-y-3 sm:flex sm:flex-row sm:justify-between sm:items-center mb-6 w-full relative">
            {/* 1. 달력/리스트 뷰 모드 버튼 (모바일: 2행 좌측) */}
            <div className="col-start-1 row-start-2 sm:col-auto sm:row-auto sm:order-1 w-auto sm:w-1/3 flex justify-start">
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setCalendarViewMode("month")}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                    calendarViewMode === "month"
                      ? "bg-white text-blue-600 shadow-sm font-bold"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  달력
                </button>
                <button
                  onClick={() => setCalendarViewMode("list")}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                    calendarViewMode === "list"
                      ? "bg-white text-blue-600 shadow-sm font-bold"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  리스트
                </button>
              </div>
            </div>

            {/* 2. 중앙 날짜 네비게이션 (모바일: 1행 전체 중앙) */}
            <div className="col-span-2 row-start-1 sm:col-auto sm:row-auto sm:order-2 w-full sm:w-1/3 flex items-center justify-center gap-4">
              <button
                onClick={() =>
                  setActiveStartDate(subMonths(activeStartDate, 1))
                }
                className="p-2 hover:bg-gray-100 rounded-full transition text-gray-500 hover:text-gray-900"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>

              <h2 className="text-xl font-bold text-gray-800 tracking-tight min-w-[110px] text-center">
                {format(activeStartDate, "yyyy년 M월")}
              </h2>

              <button
                onClick={() =>
                  setActiveStartDate(addMonths(activeStartDate, 1))
                }
                className="p-2 hover:bg-gray-100 rounded-full transition text-gray-500 hover:text-gray-900"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>

            {/* 3. 오늘 + 등록 버튼 (모바일: 2행 우측) */}
            <div className="col-start-2 row-start-2 sm:col-auto sm:row-auto sm:order-3 w-auto sm:w-1/3 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  const now = new Date();
                  setDate(now);
                  setActiveStartDate(now);
                }}
                className="px-3 py-1.5 text-sm font-bold bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition border border-blue-100 cursor-pointer"
              >
                오늘
              </button>

              <button
                onClick={() => {
                  setFormData({
                    type: "연차",
                    start_date: format(new Date(), "yyyy-MM-dd"),
                    end_date: format(new Date(), "yyyy-MM-dd"),
                    reason: "",
                  });
                  setIsRequestModalOpen(true);
                }}
                className="px-3 py-1.5 text-sm font-bold rounded-md text-blue-600 hover:bg-blue-50 border border-blue-200  transition flex items-center gap-1 cursor-pointer"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                휴가 등록
              </button>
            </div>
          </div>

          {calendarViewMode === "month" ? (
            <div className="flex-1 overflow-hidden">
              <Calendar
                onChange={(v) => setDate(v as Date)}
                value={date}
                onClickDay={onDateClick}
                activeStartDate={activeStartDate}
                onActiveStartDateChange={({ activeStartDate }) =>
                  activeStartDate && setActiveStartDate(activeStartDate)
                }
                calendarType="gregory"
                formatDay={(locale, date) => format(date, "d")}
                prevLabel={null}
                nextLabel={null}
                prev2Label={null}
                next2Label={null}
                tileClassName={({ date, view }) => {
                  if (view === "month" && HOLIDAYS[format(date, "yyyy-MM-dd")])
                    return "holiday-day";
                }}
                tileContent={({ date, view }) => {
                  if (view === "month") {
                    const dateStr = format(date, "yyyy-MM-dd");
                    const dayOfWeek = date.getDay();
                    const holiday = HOLIDAYS[dateStr];
                    const req = myRequests.find(
                      (r) =>
                        dateStr >= r.start_date &&
                        dateStr <= r.end_date &&
                        r.status !== "cancelled" &&
                        r.status !== "rejected",
                    );
                    const isExcluded =
                      holiday || dayOfWeek === 1 || dayOfWeek === 6;
                    return (
                      <div className="flex flex-col items-center w-full h-full pt-1">
                        {holiday && (
                          <div className="text-[10px] text-red-500 font-medium truncate px-1 w-full text-center mt-0.5">
                            {holiday}
                          </div>
                        )}
                        {req &&
                          !isExcluded &&
                          (req.status === "approved" ? (
                            <div className="w-full px-0.5 mt-0.5">
                              <div className="text-[9px] bg-green-100 text-green-700 border border-green-200 rounded px-1 py-0.5 truncate text-center font-medium">
                                {req.type}
                              </div>
                            </div>
                          ) : (
                            <div className="w-full px-0.5 mt-0.5">
                              <div className="text-[9px] bg-yellow-50 text-yellow-700 border border-yellow-200 rounded px-1 py-0.5 truncate text-center font-medium">
                                {req.type}[대기]
                              </div>
                            </div>
                          ))}
                      </div>
                    );
                  }
                }}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar">
              {(() => {
                const currentMonthData = myRequests.filter((req) => {
                  const reqStart = parseISO(req.start_date);
                  return (
                    isSameMonth(reqStart, activeStartDate) &&
                    req.status !== "cancelled"
                  );
                });

                if (currentMonthData.length === 0) {
                  return (
                    <div className="py-20 text-center text-gray-400">
                      해당 월의 신청 내역이 없습니다.
                    </div>
                  );
                }

                return (
                  <>
                    <div className="block sm:hidden space-y-3">
                      {currentMonthData.map((req) => (
                        <div
                          key={req.id}
                          className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                              {req.type}
                            </span>
                            <span
                              className={`px-2 py-1 rounded text-xs font-bold ${
                                req.status === "approved"
                                  ? "bg-green-100 text-green-700"
                                  : req.status === "rejected"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-yellow-100 text-yellow-700"
                              }`}
                            >
                              {req.status === "pending"
                                ? "대기중"
                                : req.status === "approved"
                                  ? "승인됨"
                                  : "반려됨"}
                            </span>
                          </div>
                          <div className="text-sm text-gray-800 font-bold mb-1">
                            {req.start_date} ~ {req.end_date}
                            <span className="text-xs text-gray-500 font-normal ml-1">
                              ({req.days_count}일)
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mb-3 truncate">
                            {req.reason}
                          </div>
                          <button
                            onClick={() => {
                              setSelectedRequest(req);
                              setIsDetailModalOpen(true);
                            }}
                            className="w-full py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg border border-blue-100 hover:bg-blue-100 transition"
                          >
                            상세보기
                          </button>
                        </div>
                      ))}
                    </div>

                    <table className="min-w-full divide-y divide-gray-200 hidden sm:table">
                      <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                            종류
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                            기간
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                            사유
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                            상태
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                            관리
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {currentMonthData.map((req) => (
                          <tr
                            key={req.id}
                            className="hover:bg-blue-50/30 transition"
                          >
                            <td className="px-4 py-4">
                              <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 whitespace-nowrap">
                                {req.type}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-600 whitespace-nowrap">
                              {req.start_date} ~ {req.end_date}
                              <span className="text-xs text-gray-400 block sm:inline sm:ml-1">
                                ({req.days_count}일)
                              </span>
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-500 max-w-[150px] truncate">
                              {req.reason}
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap ${
                                  req.status === "approved"
                                    ? "bg-green-100 text-green-700"
                                    : req.status === "rejected"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-yellow-100 text-yellow-700"
                                }`}
                              >
                                {req.status === "pending"
                                  ? "대기중"
                                  : req.status === "approved"
                                    ? "승인됨"
                                    : "반려됨"}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <button
                                onClick={() => {
                                  setSelectedRequest(req);
                                  setIsDetailModalOpen(true);
                                }}
                                className="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded text-sm font-medium border border-blue-200 transition cursor-pointer whitespace-nowrap"
                              >
                                상세보기
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        <div className="lg:flex-1 w-full flex flex-col gap-6 h-auto lg:h-[650px]">
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">
              내 연차 현황 ({new Date().getFullYear()})
            </h3>
            <div className="flex items-end justify-between mb-2">
              <span className="text-4xl font-extrabold text-blue-600">
                {(user?.total_leave_days || 0) - (user?.used_leave_days || 0)}
              </span>
              <span className="text-sm text-gray-400 mb-1 font-medium">
                / {user?.total_leave_days}일
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-1000"
                style={{
                  width: `${Math.min(
                    (((user?.total_leave_days || 0) -
                      (user?.used_leave_days || 0)) /
                      (user?.total_leave_days || 1)) *
                      100,
                    100,
                  )}%`,
                }}
              ></div>
            </div>
            <div className="mt-3 text-right text-xs text-gray-500 font-medium">
              {user?.used_leave_days}일 사용함
            </div>
          </div>

          {/* 3. 수정: 최근 신청 내역 높이 고정 및 스크롤 (모바일 300px, PC auto) */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 flex-1 overflow-hidden flex flex-col h-[300px] lg:h-auto">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 font-bold text-gray-700">
              최근 신청 내역
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {sortedMyRequests.length === 0 ? (
                <div className="text-center py-10 text-xs text-gray-400">
                  내역이 없습니다.
                </div>
              ) : (
                sortedMyRequests.map((req) => (
                  <div
                    key={req.id}
                    onClick={() => {
                      setSelectedRequest(req);
                      setIsDetailModalOpen(true);
                    }}
                    className="bg-white border border-gray-100 p-3 rounded-lg hover:shadow-sm hover:border-blue-200 cursor-pointer transition group"
                  >
                    <div className="flex justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded ${
                            req.status === "approved"
                              ? "bg-green-100 text-green-700"
                              : req.status === "rejected"
                                ? "bg-red-100 text-red-700"
                                : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {req.status === "approved"
                            ? "승인"
                            : req.status === "rejected"
                              ? "반려"
                              : "대기"}
                        </span>
                        <div className="text-sm font-medium text-gray-800 mb-0.5">
                          [{req.type}] {req.days_count}일
                        </div>
                      </div>
                      {req.status !== "rejected" &&
                        req.status !== "cancelled" &&
                        (req.status === "pending" ||
                          (req.status === "approved" &&
                            req.start_date >=
                              format(new Date(), "yyyy-MM-dd"))) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancel(req);
                            }}
                            className="mt-2 text-xs text-red-500 underline opacity-0 group-hover:opacity-100 transition"
                          >
                            취소하기
                          </button>
                        )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {req.start_date} ~ {req.end_date}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 기안 작성 모달 */}
      <Modal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        title="휴가 기안 작성"
        footer={
          <>
            <button onClick={handleRequestSubmit} className={btnStyles.save}>
              상신하기
            </button>
            <button
              onClick={() => setIsRequestModalOpen(false)}
              className={btnStyles.cancel}
            >
              취소
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="종류"
            value={formData.type}
            onChange={(v) => {
              const isHalf = ["오전반차", "오후반차"].includes(v);
              setFormData({
                ...formData,
                type: v,
                end_date: isHalf ? formData.start_date : formData.end_date,
              });
            }}
            options={[
              "연차",
              "오전반차",
              "오후반차",
              "경조사",
              "병가",
              "특별휴가",
            ]}
          />
          <div className="relative" ref={rangePickerRef}>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
              {["오전반차", "오후반차"].includes(formData.type)
                ? "날짜 선택"
                : "기간 선택"}
            </label>

            <button
              onClick={openRangePicker}
              className="w-full flex items-center justify-between p-2.5 border border-gray-300 rounded-md text-sm text-left hover:border-blue-500 focus:ring-2 focus:ring-blue-200 transition bg-white"
            >
              <span
                className={
                  formData.start_date
                    ? "text-gray-900 font-medium"
                    : "text-gray-400"
                }
              >
                {formData.start_date
                  ? ["오전반차", "오후반차"].includes(formData.type) ||
                    formData.start_date === formData.end_date
                    ? formData.start_date
                    : `${formData.start_date} ~ ${formData.end_date}`
                  : "날짜를 선택하세요"}
              </span>
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </button>
          </div>
          {calculatedDays > 0 && (
            <div className="bg-blue-50 text-blue-700 text-sm px-3 py-2 rounded font-bold text-right">
              {DEDUCTIBLE_TYPES.includes(formData.type)
                ? `총 ${calculatedDays}일 사용 (토/월요일 제외됨)`
                : `총 ${calculatedDays}일 (연차 차감 없음)`}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
              사유
            </label>
            <textarea
              required
              rows={5}
              className="w-full p-2.5 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm font-normal"
              placeholder="사유 입력"
              value={formData.reason}
              onChange={(e) =>
                setFormData({ ...formData, reason: e.target.value })
              }
            />
          </div>
        </div>
      </Modal>

      {/* 내 신청 상세 모달 - 디자인 개선 & 날짜 추가 */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="휴가 신청 상세"
        footer={
          <div className="flex gap-2 justify-end w-full">
            {selectedRequest &&
              selectedRequest.status !== "rejected" &&
              selectedRequest.status !== "cancelled" &&
              (selectedRequest.status === "pending" ||
                (selectedRequest.status === "approved" &&
                  selectedRequest.start_date >=
                    format(new Date(), "yyyy-MM-dd"))) && (
                <button
                  onClick={() => handleCancel(selectedRequest)}
                  className={btnStyles.delete}
                >
                  취소하기
                </button>
              )}
            <button
              onClick={() => setIsDetailModalOpen(false)}
              className={btnStyles.cancel}
            >
              닫기
            </button>
          </div>
        }
      >
        {selectedRequest && (
          <div className="space-y-6">
            {/* 1. 상단 상태 요약 카드 */}
            <div
              className={`flex flex-col items-center justify-center p-6 rounded-xl border ${
                selectedRequest.status === "approved"
                  ? "bg-green-50 border-green-100"
                  : selectedRequest.status === "rejected"
                    ? "bg-red-50 border-red-100"
                    : "bg-yellow-50 border-yellow-100"
              }`}
            >
              <h3
                className={`text-xl font-bold ${
                  selectedRequest.status === "approved"
                    ? "text-green-700"
                    : selectedRequest.status === "rejected"
                      ? "text-red-700"
                      : "text-yellow-700"
                }`}
              >
                {selectedRequest.status === "approved"
                  ? "승인되었습니다"
                  : selectedRequest.status === "rejected"
                    ? "반려되었습니다"
                    : "결재 대기중입니다"}
              </h3>

              <div className="mt-3 flex flex-col items-center gap-1 text-sm opacity-80">
                {selectedRequest.status === "approved" &&
                selectedRequest.approved_at ? (
                  // 1. 승인 상태이고 승인일이 있는 경우 -> 승인일만 표시
                  <span className="text-green-800 font-medium">
                    승인일:{" "}
                    {format(
                      parseISO(selectedRequest.approved_at),
                      "yyyy-MM-dd HH:mm",
                    )}
                  </span>
                ) : selectedRequest.status === "rejected" &&
                  selectedRequest.rejected_at ? (
                  // 2. 반려 상태이고 반려일이 있는 경우 -> 반려일만 표시
                  <span className="text-red-800 font-medium">
                    반려일:{" "}
                    {format(
                      parseISO(selectedRequest.rejected_at),
                      "yyyy-MM-dd HH:mm",
                    )}
                  </span>
                ) : (
                  // 3. 대기중이거나(pending) 날짜 데이터가 없는 경우 -> 신청일 표시
                  <span className="text-gray-600 font-medium">
                    신청일:{" "}
                    {selectedRequest.created_at
                      ? format(
                          parseISO(selectedRequest.created_at),
                          "yyyy-MM-dd HH:mm",
                        )
                      : "-"}
                  </span>
                )}
              </div>
            </div>

            {/* 2. 상세 정보 테이블 */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex border-b border-gray-200">
                <div className="w-32 bg-gray-50 p-3 text-sm font-bold text-gray-600 flex items-center justify-center border-r border-gray-200">
                  기안자
                </div>
                <div className="flex-1 bg-white p-3 text-sm text-gray-800 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                    {selectedRequest.profiles.full_name.slice(0, 1)}
                  </div>
                  {selectedRequest.profiles.full_name}
                  <span className="text-gray-400 text-xs">
                    ({selectedRequest.profiles.position})
                  </span>
                </div>
              </div>
              {selectedRequest.status !== "pending" && (
                <InfoRow
                  label="신청일"
                  value={
                    selectedRequest.created_at
                      ? format(
                          parseISO(selectedRequest.created_at),
                          "yyyy-MM-dd HH:mm",
                        )
                      : "-"
                  }
                />
              )}

              <InfoRow label="휴가 구분" value={selectedRequest.type} />
              <InfoRow
                label="기간"
                value={`${selectedRequest.start_date} ~ ${selectedRequest.end_date}`}
              />
              <InfoRow
                label="사용 일수"
                value={`${selectedRequest.days_count}일`}
              />
              <InfoRow
                label="신청 사유"
                value={selectedRequest.reason}
                isLast={selectedRequest.status === "pending"}
              />

              {/* 결재자 정보 */}
              {selectedRequest.status !== "pending" && (
                <>
                  <div className="flex border-t border-gray-200 border-b border-gray-200">
                    <div className="w-32 bg-gray-50 p-3 text-sm font-bold text-gray-600 flex items-center justify-center border-r border-gray-200">
                      결재자
                    </div>
                    <div className="flex-1 bg-white p-3 text-sm text-gray-800 flex items-center gap-2">
                      {selectedRequest.approver ? (
                        <>
                          <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold">
                            {selectedRequest.approver.full_name.slice(0, 1)}
                          </div>
                          {selectedRequest.approver.full_name}
                        </>
                      ) : (
                        "-"
                      )}
                    </div>
                  </div>

                  {selectedRequest.status === "rejected" && (
                    <div className="flex border-b-0">
                      <div className="w-32 bg-red-50 p-3 text-sm font-bold text-red-600 flex items-center justify-center border-r border-gray-200">
                        반려 사유
                      </div>
                      <div className="flex-1 bg-white p-3 text-sm text-red-600 font-medium">
                        {selectedRequest.rejection_reason}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
