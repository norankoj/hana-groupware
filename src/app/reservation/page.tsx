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

// 타임라인의 물리적 너비를 고정 (가로 스크롤 발생)
const HOUR_WIDTH = 80;
const TIMELINE_WIDTH = TOTAL_HOURS * HOUR_WIDTH;

const TABS = [
  { id: "church", label: "교회" },
  { id: "education", label: "교육관 " },
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

  // 드래그 상태
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{
    x: number;
    resId: number;
  } | null>(null);
  const [dragCurrentX, setDragCurrentX] = useState<number>(0);

  // 상세 모달
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null);

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

  // --- 드래그 핸들러 (좌표계 수정됨) ---
  const handleMouseDown = (e: React.MouseEvent, resId: number) => {
    // nativeEvent.offsetX를 사용해야 스크롤되어도 내부 좌표를 정확히 가져옴
    const offsetX = e.nativeEvent.offsetX;
    setDragStartPos({ x: offsetX, resId });
    setDragCurrentX(offsetX);
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStartPos) return;
    let offsetX = e.nativeEvent.offsetX;
    // 범위 제한
    if (offsetX < 0) offsetX = 0;
    if (offsetX > TIMELINE_WIDTH) offsetX = TIMELINE_WIDTH;
    setDragCurrentX(offsetX);
  };

  const handleMouseUp = () => {
    if (!isDragging || !dragStartPos) return;
    setIsDragging(false);

    // 단순 클릭 (이동거리 5px 미만) -> onClick에서 처리
    if (Math.abs(dragCurrentX - dragStartPos.x) < 5) {
      setDragStartPos(null);
      return;
    }

    const startX = Math.min(dragStartPos.x, dragCurrentX);
    const endX = Math.max(dragStartPos.x, dragCurrentX);

    // 고정된 TIMELINE_WIDTH를 기준으로 계산하므로 오차 없음
    const startMinutes = (startX / TIMELINE_WIDTH) * TOTAL_MINUTES;
    const endMinutes = (endX / TIMELINE_WIDTH) * TOTAL_MINUTES;

    const roundedStartMin = Math.round(startMinutes / 10) * 10;
    const roundedEndMin = Math.round(endMinutes / 10) * 10;

    // 최소 30분 보정
    let finalStartMin = roundedStartMin;
    let finalEndMin = roundedEndMin;
    if (finalEndMin - finalStartMin < 30) finalEndMin = finalStartMin + 30;

    const startDate = addMinutes(
      setHours(setMinutes(new Date(currentDate), 0), START_HOUR),
      finalStartMin,
    );
    const endDate = addMinutes(
      setHours(setMinutes(new Date(currentDate), 0), START_HOUR),
      finalEndMin,
    );

    setSelectedResId(dragStartPos.resId);
    setForm({
      start_time: format(startDate, "HH:mm"),
      end_time: format(endDate, "HH:mm"),
      purpose: "",
    });
    setIsModalOpen(true);
    setDragStartPos(null);
  };

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

  const getBarStyle = (startStr: string, endStr: string) => {
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

    // 비율 계산
    const left = (startDiff / TOTAL_MINUTES) * 100;
    const width = (duration / TOTAL_MINUTES) * 100;
    return {
      left: `${Math.max(0, left)}%`,
      width: `${Math.min(100 - left, width)}%`,
    };
  };

  const nowPos = (() => {
    const now = new Date();
    if (!isSameDay(now, currentDate)) return -1;
    const start = setHours(setMinutes(now, 0), START_HOUR);
    return (differenceInMinutes(now, start) / TOTAL_MINUTES) * 100;
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

  return (
    <div
      className="w-full h-full flex flex-col p-1 pb-10"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
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

      {/* 헤더 */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            시설 및 차량 예약
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            시간표를 드래그하거나 터치하여 예약하세요.
          </p>
        </div>

        <div className="flex items-center bg-white border border-gray-300 rounded-lg shadow-sm p-1">
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
            className="px-6 font-bold text-gray-900 text-base cursor-pointer hover:text-blue-600 transition-colors"
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
          <div className="w-px h-4 bg-gray-300 mx-2"></div>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="text-xs font-bold text-blue-600 px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors"
          >
            오늘
          </button>
        </div>
      </div>

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

      {/* --- 메인 타임라인 (통합 스크롤 컨테이너) --- */}
      {/* 바깥쪽: 가로 스크롤 담당 */}
      <div className="flex-1 border border-gray-200 rounded-xl shadow-sm bg-white overflow-hidden flex flex-col relative select-none">
        {/* 안쪽: 스크롤되는 영역 (헤더 + 바디를 하나로 묶음) */}
        <div className="flex-1 overflow-x-auto custom-scrollbar">
          {/* 컨텐츠 래퍼: 최소 너비 지정 (모바일에서도 찌그러지지 않음) */}
          <div
            className="min-w-[120px] flex flex-col h-full"
            style={{ width: 120 + TIMELINE_WIDTH }}
          >
            {" "}
            {/* 120px는 자원명 컬럼 너비 */}
            {/* 1. 시간 헤더 */}
            <div className="flex border-b border-gray-200 bg-gray-50 h-10 shrink-0 sticky top-0 z-30">
              <div className="w-[120px] shrink-0 p-2 text-xs font-bold text-gray-500 text-center border-r border-gray-200 bg-gray-50 sticky left-0 z-40 flex items-center justify-center shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                자원명
              </div>
              {/* 시간 표시줄 */}
              <div className="flex" style={{ width: TIMELINE_WIDTH }}>
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
            {/* 2. 자원 바디 */}
            <div className="relative flex-1 bg-white">
              {/* 배경 그리드 (세로선) */}
              <div className="absolute inset-0 flex pl-[120px] pointer-events-none h-full z-0">
                {TIME_SLOTS.map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 border-l ${i === 0 ? "border-transparent" : "border-gray-50"} h-full`}
                  ></div>
                ))}
              </div>

              {/* 현재 시간선 */}
              {nowPos >= 0 && nowPos <= 100 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                  style={{ left: `calc(120px + ${nowPos}%)` }}
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
                    className="flex h-16 border-b border-gray-100 hover:bg-gray-50/50 transition relative group z-10"
                  >
                    {/* 자원명 (Sticky Column) */}
                    <div className="w-[120px] shrink-0 border-r border-gray-200 bg-white group-hover:bg-gray-50 flex flex-col items-center justify-center p-2 sticky left-0 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                      <span className="text-sm font-bold text-gray-900 break-keep text-center">
                        {res.name}
                      </span>
                      <span className="text-[10px] text-gray-500 truncate max-w-full">
                        {res.description}
                      </span>
                    </div>

                    {/* 타임라인 영역 (Interactive) */}
                    <div
                      className="relative h-full cursor-crosshair"
                      style={{ width: TIMELINE_WIDTH }}
                      onMouseDown={(e) => handleMouseDown(e, res.id)}
                      onMouseMove={handleMouseMove}
                      onClick={(e) => {
                        if (isDragging) return;
                        // 정확한 클릭 위치 계산 (nativeEvent.offsetX 사용)
                        const offsetX = e.nativeEvent.offsetX;
                        const clickMinutes =
                          (offsetX / TIMELINE_WIDTH) * TOTAL_MINUTES;
                        const roundedMin = Math.floor(clickMinutes / 30) * 30; // 30분 단위 스냅

                        const startDate = addMinutes(
                          setHours(
                            setMinutes(new Date(currentDate), 0),
                            START_HOUR,
                          ),
                          roundedMin,
                        );
                        const endDate = addMinutes(startDate, 60);

                        setSelectedResId(res.id);
                        setForm({
                          start_time: format(startDate, "HH:mm"),
                          end_time: format(endDate, "HH:mm"),
                          purpose: "",
                        });
                        setIsModalOpen(true);
                      }}
                    >
                      {/* 드래그 박스 */}
                      {isDragging && dragStartPos?.resId === res.id && (
                        <div
                          className="absolute top-2 bottom-2 bg-blue-500/20 border border-blue-500/50 rounded z-30 pointer-events-none"
                          style={{
                            left: Math.min(dragStartPos.x, dragCurrentX),
                            width: Math.abs(dragCurrentX - dragStartPos.x),
                          }}
                        ></div>
                      )}

                      {/* 예약 바들 */}
                      {reservations
                        .filter((r) => r.resource_id === res.id)
                        .map((r) => {
                          const style = getBarStyle(r.start_at, r.end_at);
                          const isMyRes = r.user_id === currentUser;

                          if (r.isFixed) {
                            return (
                              <div
                                key={r.id}
                                className="absolute top-1 bottom-1 bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 text-xs font-medium rounded z-20 striped-bg"
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
                                onMouseDown={(e) => e.stopPropagation()}
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
                              onMouseDown={(e) => e.stopPropagation()}
                              className={`absolute top-2 bottom-2 rounded shadow-sm flex items-center px-2 text-xs text-white z-20 hover:scale-[1.01] transition border border-white/20 overflow-hidden ${isMyRes ? "brightness-110 ring-1 ring-white" : "opacity-90"}`}
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

      {/* 예약하기 모달 (모바일 최적화: w-full, p-4) */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
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
              onClick={() => setIsModalOpen(false)}
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
            {" "}
            {/* 모바일에서 무조건 1열로 큼직하게 */}
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
                className="w-full h-12 border border-gray-300 px-3 rounded-lg text-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-gray-900 bg-white"
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
                className="w-full h-12 border border-gray-300 px-3 rounded-lg text-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-gray-900 bg-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              사용 목적
            </label>
            <input
              type="text"
              placeholder="예: 청년부 임원 회의"
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              className="w-full h-12 border border-gray-300 px-3 rounded-lg text-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-gray-900 bg-white"
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
                <span className="text-gray-900">
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
