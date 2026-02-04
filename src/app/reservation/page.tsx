"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "@/styles/calendar.css";
import {
  format,
  addDays,
  subDays,
  setHours,
  setMinutes,
  differenceInMinutes,
  isSameDay,
  getDay,
  addMinutes,
} from "date-fns";
import { ko } from "date-fns/locale";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import { showConfirm } from "@/utils/alert";

// --- 타입 정의 ---
type Resource = {
  id: number;
  name: string;
  category: string;
  location: string;
  description: string;
  color: string;
};

type Reservation = {
  id: number | string;
  resource_id: number;
  user_id: string;
  start_at: string;
  end_at: string;
  purpose: string;
  status: string;
  profiles?: {
    full_name: string;
    position: string;
  };
  isFixed?: boolean;
};

// --- 설정: 07:00 ~ 23:00 ---
const START_HOUR = 7;
const END_HOUR = 23;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const TOTAL_MINUTES = TOTAL_HOURS * 60;
const TIME_SLOTS = Array.from(
  { length: TOTAL_HOURS },
  (_, i) => START_HOUR + i,
);

// PC용 가로 그리드 설정
const HOUR_WIDTH_PC = 120;
const TIMELINE_WIDTH_PC = TOTAL_HOURS * HOUR_WIDTH_PC;

// 모바일용 세로 그리드 설정
const HOUR_HEIGHT_MOBILE = 80; // 시간당 높이 80px

const TABS = [
  { id: "church", label: "교회 (예배실)" },
  { id: "education", label: "교육관 (모임)" },
  { id: "vehicle", label: "차량" },
];

export default function ReservationPage() {
  const supabase = createClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState("church");
  const [resources, setResources] = useState<Resource[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  // 모바일용 선택된 자원 ID
  const [mobileSelectedResId, setMobileSelectedResId] = useState<number | null>(
    null,
  );

  // 달력 팝업
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });

  // 예약 모달
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedResId, setSelectedResId] = useState<number | null>(null);
  const [form, setForm] = useState({
    start_time: "10:00",
    end_time: "12:00",
    purpose: "",
  });

  // 상세 모달
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null);

  // 구간 선택 상태 (Start Click)
  const [selectingStart, setSelectingStart] = useState<{
    resId: number;
    time: Date;
    visualPos: number; // PC: left(px), Mobile: top(px)
  } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) setCurrentUser(user.id);

    const { data: resData } = await supabase
      .from("resources")
      .select("*")
      .eq("is_active", true)
      .order("id");
    if (resData) setResources(resData);

    const startOf = new Date(currentDate);
    startOf.setHours(0, 0, 0, 0);
    const endOf = new Date(currentDate);
    endOf.setHours(23, 59, 59, 999);

    const { data: rsvData } = await supabase
      .from("reservations")
      .select(`*, profiles:user_id (full_name, position)`)
      .gte("start_at", startOf.toISOString())
      .lte("start_at", endOf.toISOString())
      .neq("status", "cancelled");

    let loadedReservations: Reservation[] = rsvData ? (rsvData as any) : [];

    // 고정 스케줄
    const dayOfWeek = getDay(currentDate);
    const fixedSchedules: Reservation[] = [];
    const mainHall = resData?.find((r) => r.name.includes("본당"));
    const subHall = resData?.find((r) => r.name.includes("중예배실"));
    const targetHalls = [mainHall, subHall].filter(Boolean);

    targetHalls.forEach((hall) => {
      if (!hall) return;
      if (dayOfWeek === 0) {
        const start = new Date(currentDate);
        start.setHours(8, 0, 0);
        const end = new Date(currentDate);
        end.setHours(16, 0, 0);
        fixedSchedules.push({
          id: `fixed_sun_${hall.id}`,
          resource_id: hall.id,
          user_id: "system",
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          purpose: "주일 예배",
          status: "fixed",
          isFixed: true,
        });
      }
      if (dayOfWeek === 5) {
        const start = new Date(currentDate);
        start.setHours(19, 0, 0);
        const end = new Date(currentDate);
        end.setHours(23, 0, 0);
        fixedSchedules.push({
          id: `fixed_fri_${hall.id}`,
          resource_id: hall.id,
          user_id: "system",
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          purpose: "금요 성령집회",
          status: "fixed",
          isFixed: true,
        });
      }
    });

    setReservations([...loadedReservations, ...fixedSchedules]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [currentDate]);

  // 탭 변경 시 모바일 선택 자원 초기화 (첫 번째 자원으로)
  useEffect(() => {
    const firstRes = resources.find((r) => r.location === activeTab);
    if (firstRes) setMobileSelectedResId(firstRes.id);
  }, [activeTab, resources]);

  // --- 예약 핸들러 ---
  const handleReserve = async () => {
    if (!selectedResId || !form.purpose)
      return toast.error("내용을 입력해주세요.");
    if (form.start_time >= form.end_time)
      return toast.error("종료 시간이 시작 시간보다 빨라요.");

    const startAt = new Date(currentDate);
    const [sH, sM] = form.start_time.split(":").map(Number);
    startAt.setHours(sH, sM, 0);

    const endAt = new Date(currentDate);
    const [eH, eM] = form.end_time.split(":").map(Number);
    endAt.setHours(eH, eM, 0);

    const isOverlapping = reservations
      .filter((r) => r.resource_id === selectedResId)
      .some((r) => {
        const rStart = new Date(r.start_at);
        const rEnd = new Date(r.end_at);
        return startAt < rEnd && endAt > rStart;
      });

    if (isOverlapping) return toast.error("이미 예약된 시간입니다.");

    if (!(await showConfirm("예약하시겠습니까?"))) return;

    const { error } = await supabase.from("reservations").insert({
      resource_id: selectedResId,
      user_id: currentUser,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      purpose: form.purpose,
    });

    if (error) toast.error("예약 실패: " + error.message);
    else {
      toast.success("예약되었습니다.");
      setIsModalOpen(false);
      fetchData();
    }
  };

  const handleCancel = async () => {
    if (!selectedReservation || selectedReservation.isFixed) return;
    if (!(await showConfirm("예약을 취소하시겠습니까?"))) return;

    const { error } = await supabase
      .from("reservations")
      .update({ status: "cancelled" })
      .eq("id", selectedReservation.id);

    if (error) toast.error("취소 실패");
    else {
      toast.success("취소되었습니다.");
      setDetailModalOpen(false);
      fetchData();
    }
  };

  // 스타일 계산 (PC: Left/Width)
  const getPCBarStyle = (startStr: string, endStr: string) => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const gridStart = setHours(
      setMinutes(new Date(currentDate), 0),
      START_HOUR,
    );
    let startDiff = differenceInMinutes(start, gridStart);
    let duration = differenceInMinutes(end, start);

    if (startDiff < 0) {
      duration += startDiff;
      startDiff = 0;
    }

    const left = (startDiff / 60) * HOUR_WIDTH_PC;
    const width = (duration / 60) * HOUR_WIDTH_PC;
    return { left: `${Math.max(0, left)}px`, width: `${width}px` };
  };

  // 스타일 계산 (Mobile: Top/Height)
  const getMobileBarStyle = (startStr: string, endStr: string) => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const gridStart = setHours(
      setMinutes(new Date(currentDate), 0),
      START_HOUR,
    );
    let startDiff = differenceInMinutes(start, gridStart);
    let duration = differenceInMinutes(end, start);

    if (startDiff < 0) {
      duration += startDiff;
      startDiff = 0;
    }

    const top = (startDiff / 60) * HOUR_HEIGHT_MOBILE;
    const height = (duration / 60) * HOUR_HEIGHT_MOBILE;
    return { top: `${Math.max(0, top)}px`, height: `${height}px` };
  };

  const nowMinutes = (() => {
    const now = new Date();
    if (!isSameDay(now, currentDate)) return -1;
    const start = setHours(setMinutes(now, 0), START_HOUR);
    return differenceInMinutes(now, start);
  })();

  const filteredResources = resources.filter((r) => r.location === activeTab);

  const openDatePicker = () => {
    if (datePickerRef.current) {
      const rect = datePickerRef.current.getBoundingClientRect();
      setPickerPos({
        top: rect.bottom + window.scrollY + 5,
        left: rect.left + window.scrollX,
      });
      setShowDatePicker(true);
    }
  };

  // 슬롯 클릭 핸들러 (PC & Mobile 공용 로직)
  const handleSlotClick = (
    resId: number,
    hour: number,
    minute: number,
    isMobile: boolean,
  ) => {
    const clickedTime = new Date(currentDate);
    clickedTime.setHours(hour, minute, 0);

    // 1. 첫 번째 클릭
    if (!selectingStart || selectingStart.resId !== resId) {
      // 시각적 표시 위치 계산
      const diffMin = differenceInMinutes(
        clickedTime,
        setHours(setMinutes(new Date(currentDate), 0), START_HOUR),
      );
      const visualPos = isMobile
        ? (diffMin / 60) * HOUR_HEIGHT_MOBILE
        : (diffMin / 60) * HOUR_WIDTH_PC;

      setSelectingStart({ resId, time: clickedTime, visualPos });
      toast("종료 시간을 선택해주세요.", { icon: "⏱️" });
      return;
    }

    // 2. 두 번째 클릭
    let startTime = selectingStart.time;
    let endTime = clickedTime;

    if (endTime < startTime) {
      const temp = startTime;
      startTime = endTime;
      endTime = temp;
    }

    endTime = addMinutes(endTime, 30);

    setSelectedResId(resId);
    setForm({
      start_time: format(startTime, "HH:mm"),
      end_time: format(endTime, "HH:mm"),
      purpose: "",
    });
    setSelectingStart(null);
    setIsModalOpen(true);
  };

  return (
    <div className="w-full h-full flex flex-col p-1 pb-10">
      {showDatePicker && (
        <div
          className="fixed inset-0 z-[9998]"
          onClick={() => setShowDatePicker(false)}
        />
      )}
      {showDatePicker && (
        <div
          className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-2xl p-3 animate-fadeIn"
          style={{ top: pickerPos.top, left: pickerPos.left }}
        >
          <Calendar
            onChange={(val) => {
              setCurrentDate(val as Date);
              setShowDatePicker(false);
            }}
            value={currentDate}
            formatDay={(_, date) => format(date, "d")}
            calendarType="gregory"
            locale="ko-KR"
          />
        </div>
      )}

      {/* 헤더 (모바일 대응: flex-col) */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            시설 및 차량 예약
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            <span className="font-bold text-blue-600">시작 시간</span>을 누르고,{" "}
            <span className="font-bold text-red-500">종료 시간</span>을 누르면
            예약됩니다.
          </p>
        </div>

        {/* 날짜 네비게이션 */}
        <div className="flex items-center justify-between bg-white border border-gray-300 rounded-lg shadow-sm p-1 w-full md:w-auto">
          <button
            onClick={() => setCurrentDate(subDays(currentDate, 1))}
            className="p-2 hover:bg-gray-50 rounded-md text-gray-600"
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
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <div
            ref={datePickerRef}
            onClick={openDatePicker}
            className="px-4 font-bold text-gray-900 text-base cursor-pointer hover:text-blue-600 transition-colors"
          >
            {format(currentDate, "yyyy.MM.dd (EEE)", { locale: ko })}
          </div>
          <button
            onClick={() => setCurrentDate(addDays(currentDate, 1))}
            className="p-2 hover:bg-gray-50 rounded-md text-gray-600"
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
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
          <div className="w-px h-4 bg-gray-300 mx-1 md:mx-2"></div>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="text-xs font-bold text-blue-600 px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors whitespace-nowrap"
          >
            오늘
          </button>
        </div>
      </div>

      {/* 탭 메뉴 */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-bold transition-all whitespace-nowrap border-b-2 ${activeTab === tab.id ? "border-blue-600 text-blue-600 bg-blue-50/50" : "border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* =======================
          1. 모바일 뷰 (세로)
         ======================= */}
      <div className="block md:hidden flex-1 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* 자원 선택 Select */}
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            예약할 장소 선택
          </label>
          <div className="relative">
            <select
              value={mobileSelectedResId || ""}
              onChange={(e) => setMobileSelectedResId(Number(e.target.value))}
              className="w-full appearance-none bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-3 pr-8 font-bold"
            >
              {filteredResources.map((res) => (
                <option key={res.id} value={res.id}>
                  {res.name}
                </option>
              ))}
              {filteredResources.length === 0 && (
                <option value="">등록된 자원 없음</option>
              )}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
              <svg
                className="fill-current h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
              >
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>
          {mobileSelectedResId && (
            <p className="mt-1 text-xs text-gray-500 px-1">
              {
                filteredResources.find((r) => r.id === mobileSelectedResId)
                  ?.description
              }
            </p>
          )}
        </div>

        {/* 세로 타임라인 */}
        <div className="flex-1 overflow-y-auto relative custom-scrollbar">
          <div
            className="relative"
            style={{ height: TOTAL_HOURS * HOUR_HEIGHT_MOBILE }}
          >
            {/* 시간 라벨 & 그리드 */}
            {TIME_SLOTS.map((hour, i) => (
              <div
                key={hour}
                className="absolute w-full border-b border-gray-100 flex"
                style={{
                  top: i * HOUR_HEIGHT_MOBILE,
                  height: HOUR_HEIGHT_MOBILE,
                }}
              >
                {/* 시간 텍스트 */}
                <div className="w-16 shrink-0 border-r border-gray-100 bg-gray-50 text-xs font-bold text-gray-500 flex items-start justify-center pt-2">
                  {hour}:00
                </div>
                {/* 클릭 영역 (30분 단위) */}
                <div className="flex-1 flex flex-col relative">
                  {/* 상반기 (00-30분) */}
                  <div
                    className="flex-1 border-b border-gray-50 border-dashed cursor-pointer hover:bg-blue-50/50"
                    onClick={() =>
                      mobileSelectedResId &&
                      handleSlotClick(mobileSelectedResId, hour, 0, true)
                    }
                  ></div>
                  {/* 하반기 (30-60분) */}
                  <div
                    className="flex-1 cursor-pointer hover:bg-blue-50/50"
                    onClick={() =>
                      mobileSelectedResId &&
                      handleSlotClick(mobileSelectedResId, hour, 30, true)
                    }
                  ></div>
                </div>
              </div>
            ))}

            {/* 현재 시간선 */}
            {nowMinutes >= 0 && (
              <div
                className="absolute left-16 right-0 border-t-2 border-red-500 z-20 pointer-events-none flex items-center"
                style={{ top: (nowMinutes / 60) * HOUR_HEIGHT_MOBILE }}
              >
                <div className="w-2 h-2 bg-red-500 rounded-full -ml-1"></div>
              </div>
            )}

            {/* 선택 중 표시 (시작점) */}
            {selectingStart && selectingStart.resId === mobileSelectedResId && (
              <div
                className="absolute left-16 right-0 bg-blue-400/30 border-y-2 border-blue-500 animate-pulse z-10 pointer-events-none flex items-center justify-center"
                style={{
                  top: selectingStart.visualPos,
                  height: HOUR_HEIGHT_MOBILE / 2,
                }}
              >
                <span className="text-xs font-bold text-blue-700 bg-white/80 px-2 rounded-full shadow-sm">
                  시작
                </span>
              </div>
            )}

            {/* 예약 바들 */}
            {mobileSelectedResId &&
              reservations
                .filter((r) => r.resource_id === mobileSelectedResId)
                .map((r) => {
                  const style = getMobileBarStyle(r.start_at, r.end_at);
                  const isMyRes = r.user_id === currentUser;
                  const resColor =
                    resources.find((res) => res.id === mobileSelectedResId)
                      ?.color || "#3B82F6";

                  if (r.isFixed) {
                    return (
                      <div
                        key={r.id}
                        className="absolute left-16 right-2 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 text-xs font-medium z-20 striped-bg"
                        style={{ top: style.top, height: style.height }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toast("고정된 예배 시간입니다.", { icon: "⛪" });
                        }}
                      >
                        {r.purpose}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={r.id}
                      className={`absolute left-16 right-2 rounded-md shadow-sm px-2 text-white text-xs z-20 flex flex-col justify-center border border-white/20 ${isMyRes ? "brightness-110 ring-1 ring-white" : "opacity-90"}`}
                      style={{
                        top: style.top,
                        height: style.height,
                        backgroundColor: resColor,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedReservation(r);
                        setDetailModalOpen(true);
                      }}
                    >
                      <div className="font-bold truncate">
                        {r.profiles?.full_name}
                      </div>
                      <div className="truncate opacity-90 text-[10px]">
                        {r.purpose}
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      </div>

      {/* =======================
          2. PC 뷰 (가로) - 기존 유지
         ======================= */}
      <div className="hidden md:flex flex-1 border border-gray-200 rounded-xl shadow-sm bg-white overflow-hidden flex-col relative select-none">
        <div className="flex-1 overflow-x-auto custom-scrollbar">
          <div
            className="min-w-[120px] flex flex-col h-full"
            style={{ width: 120 + TIMELINE_WIDTH_PC }}
          >
            {/* 시간 헤더 */}
            <div className="flex border-b border-gray-200 bg-gray-50 h-10 shrink-0 sticky top-0 z-30">
              <div className="w-[120px] shrink-0 p-2 text-xs font-bold text-gray-500 text-center border-r border-gray-200 bg-gray-50 sticky left-0 z-40 flex items-center justify-center">
                자원명
              </div>
              <div className="flex" style={{ width: TIMELINE_WIDTH_PC }}>
                {TIME_SLOTS.map((hour) => (
                  <div
                    key={hour}
                    className="flex-1 text-[10px] text-gray-500 font-medium text-center border-l border-gray-200 py-2 first:border-l-0"
                  >
                    {hour}시
                  </div>
                ))}
              </div>
            </div>

            {/* 자원 바디 */}
            <div className="relative flex-1 bg-white">
              <div className="absolute inset-0 flex pl-[120px] pointer-events-none h-full z-0">
                {TIME_SLOTS.map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 border-l ${i === 0 ? "border-transparent" : "border-gray-200"} h-full flex`}
                  >
                    <div className="w-1/2 border-r border-gray-50 h-full"></div>
                  </div>
                ))}
              </div>

              {nowMinutes >= 0 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                  style={{
                    left: `calc(120px + ${(nowMinutes / 60) * HOUR_WIDTH_PC}px)`,
                  }}
                >
                  <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-red-500 rounded-full shadow-sm"></div>
                </div>
              )}

              {filteredResources.length === 0 ? (
                <div className="py-20 text-center text-gray-400 sticky left-0 w-screen">
                  등록된 자원이 없습니다.
                </div>
              ) : (
                filteredResources.map((res) => (
                  <div
                    key={res.id}
                    className="flex h-16 border-b border-gray-100 hover:bg-gray-50/20 transition relative group z-10"
                  >
                    <div className="w-[120px] shrink-0 border-r border-gray-200 bg-white group-hover:bg-gray-50 flex flex-col items-center justify-center p-2 sticky left-0 z-30">
                      <span className="text-sm font-bold text-gray-900 break-keep text-center">
                        {res.name}
                      </span>
                      <span className="text-[10px] text-gray-500 truncate max-w-full">
                        {res.description}
                      </span>
                    </div>
                    <div
                      className="relative h-full flex"
                      style={{ width: TIMELINE_WIDTH_PC }}
                    >
                      {selectingStart && selectingStart.resId === res.id && (
                        <div
                          className="absolute top-1 bottom-1 bg-blue-400/30 border-2 border-blue-500 animate-pulse rounded z-10 pointer-events-none flex items-center justify-center"
                          style={{
                            left: `${selectingStart.visualPos}px`,
                            width: `${HOUR_WIDTH_PC / 2}px`,
                          }}
                        >
                          <span className="text-[10px] font-bold text-blue-700 bg-white/80 px-1 rounded">
                            시작
                          </span>
                        </div>
                      )}
                      {TIME_SLOTS.map((hour) => (
                        <div key={hour} className="flex-1 flex h-full">
                          <div
                            className="w-1/2 h-full cursor-pointer hover:bg-blue-500/5 active:bg-blue-500/10 transition-colors"
                            onClick={(e) =>
                              handleSlotClick(res.id, hour, 0, false)
                            }
                          ></div>
                          <div
                            className="w-1/2 h-full cursor-pointer hover:bg-blue-500/5 active:bg-blue-500/10 transition-colors"
                            onClick={(e) =>
                              handleSlotClick(res.id, hour, 30, false)
                            }
                          ></div>
                        </div>
                      ))}
                      {reservations
                        .filter((r) => r.resource_id === res.id)
                        .map((r) => {
                          const style = getPCBarStyle(r.start_at, r.end_at);
                          const isMyRes = r.user_id === currentUser;
                          if (r.isFixed) {
                            return (
                              <div
                                key={r.id}
                                className="absolute top-1 bottom-1 bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 text-xs font-medium rounded z-20 striped-bg pointer-events-auto"
                                style={{
                                  left: style.left,
                                  width: style.width,
                                  cursor: "not-allowed",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toast("고정된 예배 시간입니다.", {
                                    icon: "⛪",
                                  });
                                }}
                              >
                                <span className="truncate px-1">
                                  {r.purpose}
                                </span>
                              </div>
                            );
                          }
                          return (
                            <div
                              key={r.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedReservation(r);
                                setDetailModalOpen(true);
                              }}
                              className={`absolute top-2 bottom-2 rounded shadow-sm flex items-center px-2 text-xs text-white z-20 hover:scale-[1.01] transition border border-white/20 overflow-hidden pointer-events-auto ${isMyRes ? "brightness-110 ring-1 ring-white" : "opacity-90"}`}
                              style={{
                                left: style.left,
                                width: style.width,
                                backgroundColor: res.color,
                                cursor: "pointer",
                              }}
                            >
                              <span className="font-bold truncate mr-1">
                                {r.profiles?.full_name}
                              </span>
                              <span className="truncate opacity-80 text-[10px] hidden xl:inline">
                                - {r.purpose}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 예약하기 모달 (Textarea 적용) */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectingStart(null);
        }}
        title="시설/차량 예약"
        footer={
          <div className="flex gap-2 w-full">
            <button
              onClick={handleReserve}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-blue-700 transition shadow-sm"
            >
              예약 완료
            </button>
            <button
              onClick={() => {
                setIsModalOpen(false);
                setSelectingStart(null);
              }}
              className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-lg font-bold text-lg hover:bg-gray-200 transition"
            >
              취소
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="p-3 bg-blue-50 rounded-lg text-base text-blue-800 font-bold text-center border border-blue-100">
            {resources.find((r) => r.id === selectedResId)?.name}
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                시작 시간
              </label>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) =>
                  setForm({ ...form, start_time: e.target.value })
                }
                className="w-full h-12 border border-gray-300 px-3 rounded-lg text-lg outline-none focus:border-blue-500 text-gray-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                종료 시간
              </label>
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className="w-full h-12 border border-gray-300 px-3 rounded-lg text-lg outline-none focus:border-blue-500 text-gray-900 bg-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              사용 목적
            </label>
            <textarea
              placeholder="예: 선지국 회의 (구체적으로 작성)"
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              className="w-full h-24 border border-gray-300 p-3 rounded-lg text-lg outline-none focus:border-blue-500 text-gray-900 bg-white resize-none"
            />
          </div>
        </div>
      </Modal>

      {/* 상세 모달 */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title="예약 상세"
        footer={
          selectedReservation?.user_id === currentUser ? (
            <button
              onClick={handleCancel}
              className="w-full bg-red-50 text-red-600 py-3 rounded-lg font-bold text-lg hover:bg-red-100 transition"
            >
              예약 취소
            </button>
          ) : (
            <button
              onClick={() => setDetailModalOpen(false)}
              className="w-full bg-gray-100 text-gray-600 py-3 rounded-lg font-bold text-lg hover:bg-gray-200 transition"
            >
              닫기
            </button>
          )
        }
      >
        {selectedReservation && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-xl">
                {selectedReservation.profiles?.full_name.slice(0, 1)}
              </div>
              <div>
                <div className="font-bold text-gray-900 text-lg">
                  {selectedReservation.profiles?.full_name}
                </div>
                <div className="text-sm text-gray-500">
                  {selectedReservation.profiles?.position}
                </div>
              </div>
            </div>
            <div className="space-y-3 text-base">
              <div className="flex">
                <span className="w-24 text-gray-500 font-medium">장소</span>
                <span className="text-gray-900 font-bold">
                  {
                    resources.find(
                      (r) => r.id === selectedReservation.resource_id,
                    )?.name
                  }
                </span>
              </div>
              <div className="flex">
                <span className="w-24 text-gray-500 font-medium">시간</span>
                <span className="font-bold text-blue-600">
                  {format(new Date(selectedReservation.start_at), "HH:mm")} ~{" "}
                  {format(new Date(selectedReservation.end_at), "HH:mm")}
                </span>
              </div>
              <div className="flex">
                <span className="w-24 text-gray-500 font-medium">목적</span>
                <span className="text-gray-900 whitespace-pre-wrap">
                  {selectedReservation.purpose}
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
