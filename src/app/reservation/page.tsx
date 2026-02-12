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
  addWeeks,
  isBefore,
  areIntervalsOverlapping,
} from "date-fns";
import { ko } from "date-fns/locale";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import { showConfirm } from "@/utils/alert";
import { HOLIDAYS } from "@/constants/holidays";

const customCalendarStyles = `
  .react-calendar__navigation {
    display: flex !important;
    height: 44px;
    margin-bottom: 10px;
  }
  .react-calendar__navigation button {
    min-width: 44px;
    background: none;
    font-size: 16px;
    font-weight: bold;
  }
  .react-calendar__month-view__weekdays {
    text-align: center;
    text-decoration: none;
    font-size: 0.8em;
    font-weight: bold;
    margin-bottom: 5px;
  }
  .react-calendar__month-view__days__day {
    padding: 10px;
  }
`;

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
  group_id?: string;
};

// --- [설정] ---
const START_HOUR = 7;
const END_HOUR = 23;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const TIME_SLOTS = Array.from(
  { length: TOTAL_HOURS },
  (_, i) => START_HOUR + i,
);

const HOUR_HEIGHT = 40;
const HEADER_HEIGHT_PX = 45;
const TOTAL_GRID_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;

const TABS = [
  { id: "church", label: "교회 (예배실)" },
  { id: "edu1", label: "교육관 1" },
  { id: "edu2", label: "교육관 2" },
];

export default function FacilityReservationPage() {
  const supabase = createClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState("church");
  const [resources, setResources] = useState<Resource[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  const [mobileSelectedResId, setMobileSelectedResId] = useState<number | null>(
    null,
  );

  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const [showRecurringDatePicker, setShowRecurringDatePicker] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedResId, setSelectedResId] = useState<number | null>(null);
  const [form, setForm] = useState({
    start_time: "10:00",
    end_time: "12:00",
    purpose: "",
    isRecurring: false,
    recurringEndDate: format(addWeeks(new Date(), 4), "yyyy-MM-dd"),
  });

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null);

  const [selectingStart, setSelectingStart] = useState<{
    resId: number;
    time: Date;
    visualPos: number;
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
      .neq("category", "vehicle")
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

    const dayOfWeek = getDay(currentDate);
    const fixedSchedules: Reservation[] = [];
    const mainHall = resData?.find((r) => r.name.includes("본당"));

    if (mainHall) {
      if (dayOfWeek === 0) {
        const start = new Date(currentDate);
        start.setHours(8, 0, 0);
        const end = new Date(currentDate);
        end.setHours(16, 0, 0);
        fixedSchedules.push({
          id: `fixed_sun_${mainHall.id}`,
          resource_id: mainHall.id,
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
          id: `fixed_fri_${mainHall.id}`,
          resource_id: mainHall.id,
          user_id: "system",
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          purpose: "금요 성령집회",
          status: "fixed",
          isFixed: true,
        });
      }
    }

    setReservations([...loadedReservations, ...fixedSchedules]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [currentDate]);

  useEffect(() => {
    const firstRes = resources.find((r) => r.category === activeTab);
    if (firstRes) setMobileSelectedResId(firstRes.id);
    else setMobileSelectedResId(null);
  }, [activeTab, resources]);

  const checkOverlap = async (
    resourceId: number,
    start: Date,
    end: Date,
  ): Promise<boolean> => {
    const { data, error } = await supabase
      .from("reservations")
      .select("id")
      .eq("resource_id", resourceId)
      .neq("status", "cancelled")
      .lt("start_at", end.toISOString())
      .gt("end_at", start.toISOString());

    if (error) return true;
    return data && data.length > 0;
  };

  const handleReserve = async () => {
    if (!selectedResId || !form.purpose)
      return toast.error("내용을 입력해주세요.");
    if (form.start_time >= form.end_time)
      return toast.error("종료 시간이 시작 시간보다 빨라요.");

    const baseStart = new Date(currentDate);
    const [sH, sM] = form.start_time.split(":").map(Number);
    baseStart.setHours(sH, sM, 0);

    const baseEnd = new Date(currentDate);
    const [eH, eM] = form.end_time.split(":").map(Number);
    baseEnd.setHours(eH, eM, 0);

    const reservationsToInsert = [];
    const groupId = form.isRecurring ? crypto.randomUUID() : null;

    if (form.isRecurring) {
      let iterStart = new Date(baseStart);
      let iterEnd = new Date(baseEnd);
      const limitDate = new Date(form.recurringEndDate);
      limitDate.setHours(23, 59, 59);

      const maxLimit = addWeeks(new Date(), 26);
      if (isBefore(maxLimit, limitDate)) {
        return toast.error("정기 예약은 최대 6개월까지만 가능합니다.");
      }

      while (iterStart <= limitDate) {
        const isOverlapped = await checkOverlap(
          selectedResId,
          iterStart,
          iterEnd,
        );
        if (isOverlapped) {
          return toast.error(
            `${format(iterStart, "M월 d일")}에 이미 예약이 있습니다.`,
          );
        }

        reservationsToInsert.push({
          resource_id: selectedResId,
          user_id: currentUser,
          start_at: iterStart.toISOString(),
          end_at: iterEnd.toISOString(),
          purpose: form.purpose,
          group_id: groupId,
        });
        iterStart = addDays(iterStart, 7);
        iterEnd = addDays(iterEnd, 7);
      }
    } else {
      const isOverlapped = await checkOverlap(
        selectedResId,
        baseStart,
        baseEnd,
      );
      if (isOverlapped) {
        return toast.error("해당 시간에 이미 예약이 있습니다.");
      }

      reservationsToInsert.push({
        resource_id: selectedResId,
        user_id: currentUser,
        start_at: baseStart.toISOString(),
        end_at: baseEnd.toISOString(),
        purpose: form.purpose,
      });
    }

    if (
      !(await showConfirm(
        `${reservationsToInsert.length}건의 예약을 진행하시겠습니까?`,
      ))
    )
      return;

    const { error } = await supabase
      .from("reservations")
      .insert(reservationsToInsert);

    if (error) toast.error("예약 실패: " + error.message);
    else {
      toast.success("예약되었습니다.");
      setIsModalOpen(false);
      fetchData();
    }
  };

  const handleCancelOne = async () => {
    if (!selectedReservation || selectedReservation.isFixed) return;
    if (!(await showConfirm("이 예약만 취소하시겠습니까?"))) return;

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

  const handleCancelAll = async () => {
    if (!selectedReservation || !selectedReservation.group_id) return;
    if (
      !(await showConfirm(
        "정기 예약 전체(과거 포함)를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.",
      ))
    )
      return;

    const { error } = await supabase
      .from("reservations")
      .update({ status: "cancelled" })
      .eq("group_id", selectedReservation.group_id);

    if (error) toast.error("전체 취소 실패");
    else {
      toast.success("전체 일정이 취소되었습니다.");
      setDetailModalOpen(false);
      fetchData();
    }
  };

  const getVerticalBarStyle = (startStr: string, endStr: string) => {
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
    const top = (startDiff / 60) * HOUR_HEIGHT;
    const height = (duration / 60) * HOUR_HEIGHT;
    return { top: `${Math.max(0, top)}px`, height: `${Math.max(0, height)}px` };
  };

  const nowMinutes = (() => {
    const now = new Date();
    if (!isSameDay(now, currentDate)) return -1;
    const start = setHours(setMinutes(now, 0), START_HOUR);
    return differenceInMinutes(now, start);
  })();

  const filteredResources = resources.filter((r) => r.category === activeTab);

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

  const handleSlotClick = (resId: number, hour: number, minute: number) => {
    const clickedTime = new Date(currentDate);
    clickedTime.setHours(hour, minute, 0);

    if (!selectingStart || selectingStart.resId !== resId) {
      const diffMin = differenceInMinutes(
        clickedTime,
        setHours(setMinutes(new Date(currentDate), 0), START_HOUR),
      );
      const visualPos = (diffMin / 60) * HOUR_HEIGHT;

      setSelectingStart({ resId, time: clickedTime, visualPos });
      toast("종료 시간을 선택해주세요.", { icon: "⏱️" });
      return;
    }

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
      isRecurring: false,
      recurringEndDate: format(addWeeks(startTime, 4), "yyyy-MM-dd"),
    });
    setSelectingStart(null);
    setIsModalOpen(true);
  };

  return (
    <div className="w-full flex flex-col p-1 pb-10">
      <style>{customCalendarStyles}</style>

      {/* DatePicker */}
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
            formatMonthYear={(locale, date) => format(date, "yyyy. MM")}
            calendarType="gregory"
            locale="ko-KR"
            minDetail="year" // '년' 뷰까지 가서 월을 선택할 수 있게 설정
          />
        </div>
      )}

      {/* Header */}
      <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4 px-1">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            시설 예약
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            <span className="font-bold text-blue-600">시작 시간</span>을 누르고,{" "}
            <span className="font-bold text-red-500">종료 시간</span>을 누르면
            예약됩니다.
          </p>
        </div>
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

      {/* Tabs */}
      <div className="flex gap-1 mb-2 border-b border-gray-200 overflow-x-auto px-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-bold transition-all whitespace-nowrap border-b-2 ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-600 bg-blue-50/50"
                : "border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid Container */}
      <div
        className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col relative overflow-auto custom-scrollbar pb-px"
        style={{ height: "750px", maxHeight: "calc(100vh - 200px)" }}
      >
        {/* 모바일 자원 선택 */}
        <div className="block md:hidden p-4 border-b border-gray-100 bg-gray-50 sticky top-0 z-20">
          <select
            value={mobileSelectedResId || ""}
            onChange={(e) => setMobileSelectedResId(Number(e.target.value))}
            className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-3 font-bold"
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
        </div>

        {/* 스케줄러 영역 */}
        <div className="flex relative min-w-full">
          <div className="sticky left-0 z-30 bg-white border-r border-gray-200 w-16 shrink-0 flex flex-col shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
            <div
              className="border-b border-gray-200 bg-gray-50 shrink-0 sticky top-0 z-40"
              style={{ height: HEADER_HEIGHT_PX }}
            ></div>

            <div
              className="relative border-b border-gray-200"
              style={{ height: TOTAL_GRID_HEIGHT }}
            >
              {TIME_SLOTS.map((hour, i) => (
                <div
                  key={hour}
                  className="absolute w-full flex items-start justify-center pr-1"
                  style={{
                    top: i * HOUR_HEIGHT,
                    height: HOUR_HEIGHT,
                  }}
                >
                  <span
                    className={`text-xs font-bold text-gray-400 bg-white px-1 relative z-10 ${
                      i === 0 ? "top-0" : "-top-3"
                    }`}
                  >
                    {hour}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 2. 자원 컬럼들 */}
          <div className="flex flex-1 min-w-0">
            {(filteredResources.length > 0 ? filteredResources : [])
              .filter((r) => {
                if (typeof window !== "undefined" && window.innerWidth < 768)
                  return r.id === mobileSelectedResId;
                return true;
              })
              .map((res) => (
                <div
                  key={res.id}
                  className="flex-1 min-w-[160px] border-r border-gray-200 relative flex flex-col"
                >
                  {/* 자원 헤더 (Sticky Top) z-30 */}
                  <div
                    className="sticky top-0 z-30 bg-gray-50 border-b border-gray-200 p-1 text-center flex items-center justify-center shrink-0 shadow-sm"
                    style={{ height: HEADER_HEIGHT_PX }}
                  >
                    <span className="text-sm font-bold text-gray-900 truncate">
                      {res.name}
                    </span>
                  </div>

                  {/* 시간 그리드 */}
                  <div
                    className="relative border-b border-gray-200"
                    style={{ height: TOTAL_GRID_HEIGHT }}
                  >
                    {TIME_SLOTS.map((hour, i) => (
                      <div
                        key={hour}
                        className="absolute w-full border-b border-gray-100 flex flex-col"
                        style={{
                          top: i * HOUR_HEIGHT,
                          height: HOUR_HEIGHT,
                        }}
                      >
                        <div
                          className="flex-1 border-b border-gray-50 border-dashed cursor-pointer hover:bg-blue-50/50 transition-colors"
                          onClick={() => handleSlotClick(res.id, hour, 0)}
                        ></div>
                        <div
                          className="flex-1 cursor-pointer hover:bg-blue-50/50 transition-colors"
                          onClick={() => handleSlotClick(res.id, hour, 30)}
                        ></div>
                      </div>
                    ))}

                    {selectingStart && selectingStart.resId === res.id && (
                      <div
                        className="absolute left-1 right-1 bg-blue-400/30 border-2 border-blue-500 rounded animate-pulse z-10 pointer-events-none flex items-center justify-center"
                        style={{
                          top: selectingStart.visualPos,
                          height: HOUR_HEIGHT / 2,
                        }}
                      >
                        <span className="text-[10px] font-bold text-blue-700 bg-white/80 px-1 rounded">
                          시작
                        </span>
                      </div>
                    )}

                    {reservations
                      .filter((r) => r.resource_id === res.id)
                      .map((r) => {
                        const style = getVerticalBarStyle(r.start_at, r.end_at);
                        const isMyRes = r.user_id === currentUser;
                        return (
                          <div
                            key={r.id}
                            className={`absolute left-1 right-1 rounded-md shadow-sm px-2 py-1 text-white text-xs z-10 flex flex-col justify-center border border-white/20 overflow-hidden hover:scale-[1.02] transition-transform ${isMyRes ? "brightness-110 ring-1 ring-white" : "opacity-90"}`}
                            style={{
                              top: style.top,
                              height: style.height,
                              backgroundColor: r.isFixed
                                ? "#f3f4f6"
                                : res.color,
                              color: r.isFixed ? "#9ca3af" : "white",
                              cursor: r.isFixed ? "default" : "pointer",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!r.isFixed) {
                                setSelectedReservation(r);
                                setDetailModalOpen(true);
                              }
                            }}
                          >
                            <div className="font-bold truncate">
                              {r.profiles?.full_name}
                            </div>
                            {!r.isFixed && (
                              <div className="truncate opacity-90 text-[10px] whitespace-pre-wrap leading-tight">
                                {r.purpose}
                              </div>
                            )}
                          </div>
                        );
                      })}

                    {nowMinutes >= 0 && (
                      <div
                        className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none flex items-center"
                        style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                      >
                        <div className="w-2 h-2 bg-red-500 rounded-full -ml-1"></div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

            {filteredResources.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-gray-400 bg-gray-50 h-[300px]">
                등록된 자원이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 예약하기 모달 */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectingStart(null);
          setShowRecurringDatePicker(false);
        }}
        title="시설 예약"
        footer={
          <div className="flex gap-2 w-full">
            <button
              onClick={handleReserve}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition shadow-sm"
            >
              예약 완료
            </button>
            <button
              onClick={() => {
                setIsModalOpen(false);
                setSelectingStart(null);
                setShowRecurringDatePicker(false);
              }}
              className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-200 transition"
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
          <div className="grid grid-cols-2 gap-4">
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

          <div className="flex items-center justify-between border p-3 rounded-lg bg-gray-50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isRecurring}
                onChange={(e) =>
                  setForm({ ...form, isRecurring: e.target.checked })
                }
                className="w-5 h-5 text-blue-600 rounded"
              />
              <span className="text-sm font-bold text-gray-700">
                정기 예약 (매주 반복)
              </span>
            </label>
          </div>
          {form.isRecurring && (
            <div className="animate-fadeIn relative">
              <label className="block text-xs font-bold text-gray-500 mb-1">
                반복 종료일 (최대 6개월)
              </label>
              <div
                onClick={() =>
                  setShowRecurringDatePicker(!showRecurringDatePicker)
                }
                className="cursor-pointer"
              >
                <input
                  type="date"
                  value={form.recurringEndDate}
                  readOnly
                  className="w-full border p-3 rounded-lg border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white cursor-pointer pointer-events-none"
                />
              </div>
              {showRecurringDatePicker && (
                <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 range-calendar-wrapper animate-fadeIn w-full max-w-[350px]">
                  <Calendar
                    onChange={(val) => {
                      setForm({
                        ...form,
                        recurringEndDate: format(val as Date, "yyyy-MM-dd"),
                      });
                      setShowRecurringDatePicker(false);
                    }}
                    value={new Date(form.recurringEndDate)}
                    formatDay={(_, date) => format(date, "d")}
                    calendarType="gregory"
                    locale="ko-KR"
                    minDate={new Date()}
                    maxDate={addWeeks(new Date(), 26)}
                    tileClassName={({ date, view }) => {
                      if (view !== "month") return null;
                      const dateStr = format(date, "yyyy-MM-dd");
                      if (HOLIDAYS[dateStr]) {
                        return "holiday-day";
                      }
                    }}
                    tileDisabled={({ date, view }) => {
                      if (view !== "month") return false;
                      const dateStr = format(date, "yyyy-MM-dd");
                      return !!HOLIDAYS[dateStr];
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRecurringDatePicker(false)}
                    className="w-full mt-2 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 text-gray-600 font-bold"
                  >
                    닫기
                  </button>
                </div>
              )}
            </div>
          )}

          <textarea
            placeholder="사용 목적 (예: 선지국 회의)"
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            className="w-full h-24 border p-3 rounded-lg resize-none border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
          />
        </div>
      </Modal>

      {/* 상세 모달 */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title="예약 상세"
        footer={null}
      >
        {selectedReservation && (
          <div className="space-y-6 pt-2">
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
              {selectedReservation.group_id && (
                <span className="ml-auto bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-bold">
                  정기예약
                </span>
              )}
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

            <div className="mt-6 border-t border-gray-100 pt-4 space-y-2">
              {selectedReservation.user_id === currentUser && (
                <>
                  {selectedReservation.group_id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={handleCancelOne}
                        className="flex-1 bg-red-50 text-red-600 py-3 rounded-lg font-bold hover:bg-red-100 transition text-sm"
                      >
                        이 예약만 취소
                      </button>
                      <button
                        onClick={handleCancelAll}
                        className="flex-1 bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 transition text-sm"
                      >
                        전체 일정 취소
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleCancelOne}
                      className="w-full bg-red-50 text-red-600 py-3 rounded-lg font-bold hover:bg-red-100 transition"
                    >
                      예약 취소
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() => setDetailModalOpen(false)}
                className="w-full bg-gray-100 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-200 transition"
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
