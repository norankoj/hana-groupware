"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/utils/supabase/client";
import Modal from "@/components/Modal";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "@/styles/calendar.css";
import { format } from "date-fns";
import toast from "react-hot-toast";

type Profile = {
  id: string;
  full_name: string;
  position: string;
  team_id: number;
  role: string;
};

type Attendee = {
  id: string;
  name: string;
};

/** 수정 모드에서 전달받는 최소 데이터 */
export type EditableSchedule = {
  original_id: number;
  title: string;
  start_date: string;
  end_date: string;
  time_label: string;   // "일정 전체" | "HH:mm~HH:mm"
  location?: string;
  attendees?: Attendee[];
};

type ScheduleAddModalProps = {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  users: Profile[];
  onSuccess: () => void;
  /** 전달 시 수정 모드로 동작 */
  editEvent?: EditableSchedule | null;
};

const EMPTY_FORM = {
  title: "",
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  isAllDay: false,
  startTime: "09:00",
  endTime: "18:00",
  location: "",
  attendees: [] as Attendee[],
};

/** time_label → isAllDay, startTime, endTime 역산 */
function parseTimeLabel(label: string) {
  if (label === "일정 전체") {
    return { isAllDay: true, startTime: "09:00", endTime: "18:00" };
  }
  const parts = label.split("~");
  if (parts.length === 2) {
    return { isAllDay: false, startTime: parts[0], endTime: parts[1] };
  }
  return { isAllDay: false, startTime: "09:00", endTime: "18:00" };
}

export default function ScheduleAddModal({
  isOpen,
  onClose,
  profile,
  users,
  onSuccess,
  editEvent,
}: ScheduleAddModalProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0, width: 0, maxH: 400 });
  const datePickerRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState(EMPTY_FORM);

  const isEditMode = !!editEvent;

  // 수정 모드: editEvent가 바뀌면 form 채우기. 추가 모드: 닫힐 때 초기화
  useEffect(() => {
    if (isOpen && editEvent) {
      const { isAllDay, startTime, endTime } = parseTimeLabel(editEvent.time_label);
      setForm({
        title: editEvent.title,
        startDate: editEvent.start_date,
        endDate: editEvent.end_date,
        isAllDay,
        startTime,
        endTime,
        location: editEvent.location || "",
        attendees: editEvent.attendees || [],
      });
    } else if (!isOpen) {
      setForm(EMPTY_FORM);
    }
  }, [isOpen, editEvent]);

  const openRangePicker = () => {
    if (datePickerRef.current) {
      const rect = datePickerRef.current.getBoundingClientRect();
      const calendarWidth = 350;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      let leftPos = rect.left;
      if (rect.left + calendarWidth > windowWidth) leftPos = windowWidth - calendarWidth - 20;
      if (leftPos < 10) leftPos = 10;

      // 아래 공간이 부족하면 버튼 위에 달력 표시 (모바일 대응)
      const CALENDAR_H = 340;
      const spaceBelow = windowHeight - rect.bottom - 10;
      let topPos: number;
      let maxH: number;
      if (spaceBelow >= CALENDAR_H || rect.top < CALENDAR_H + 10) {
        topPos = rect.bottom + 5;
        maxH = Math.max(200, spaceBelow);
      } else {
        topPos = Math.max(10, rect.top - CALENDAR_H - 5);
        maxH = CALENDAR_H;
      }

      setPickerPos({ top: topPos, left: leftPos, width: rect.width, maxH });
      setShowDatePicker(true);
    }
  };

  const handleRangeChange = (value: any) => {
    if (Array.isArray(value)) {
      const [start, end] = value;
      setForm({ ...form, startDate: format(start, "yyyy-MM-dd"), endDate: format(end, "yyyy-MM-dd") });
      setShowDatePicker(false);
    } else {
      const dateStr = format(value, "yyyy-MM-dd");
      setForm({ ...form, startDate: dateStr, endDate: dateStr });
    }
  };

  const toggleAttendee = (user: Profile) => {
    setForm((prev) => {
      const isSelected = prev.attendees.some((a) => a.id === user.id);
      if (isSelected) return { ...prev, attendees: prev.attendees.filter((a) => a.id !== user.id) };
      return { ...prev, attendees: [...prev.attendees, { id: user.id, name: user.full_name }] };
    });
  };

  const toggleAllAttendees = () => {
    const allOtherUsers = users.filter((u) => u.id !== profile?.id);
    if (form.attendees.length === allOtherUsers.length) {
      setForm({ ...form, attendees: [] });
    } else {
      setForm({ ...form, attendees: allOtherUsers.map((u) => ({ id: u.id, name: u.full_name })) });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.startDate || !form.endDate) return toast.error("내용을 입력해주세요.");
    if (!profile) return;

    let startDateTime, endDateTime;

    if (form.isAllDay) {
      startDateTime = new Date(`${form.startDate}T00:00:00`);
      endDateTime = new Date(`${form.endDate}T23:59:59`);
    } else {
      startDateTime = new Date(`${form.startDate}T${form.startTime}:00`);
      endDateTime = new Date(`${form.endDate}T${form.endTime}:00`);
      if (startDateTime >= endDateTime) return toast.error("종료 시간이 시작 시간보다 빠릅니다.");
    }

    setLoading(true);

    if (isEditMode && editEvent) {
      // ── 수정 모드 ──
      const { error } = await supabase
        .from("user_schedules")
        .update({
          title: form.title,
          start_at: startDateTime.toISOString(),
          end_at: endDateTime.toISOString(),
          location: form.location,
          attendees: form.attendees,
        })
        .eq("id", editEvent.original_id);

      if (error) {
        toast.error("수정 실패: " + error.message);
      } else {
        toast.success("일정이 수정되었습니다!");
        onSuccess();
        onClose();
      }
    } else {
      // ── 추가 모드 ──
      const { error } = await supabase.from("user_schedules").insert({
        user_id: profile.id,
        title: form.title,
        start_at: startDateTime.toISOString(),
        end_at: endDateTime.toISOString(),
        location: form.location,
        attendees: form.attendees,
      });

      if (error) {
        toast.error("일정 등록 실패: " + error.message);
      } else {
        toast.success("사역 일정이 등록되었습니다!");
        onSuccess();
        onClose();
      }
    }

    setLoading(false);
  };

  const datePicker = showDatePicker
    ? createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setShowDatePicker(false)} />
          <div
            className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-2xl p-3 range-calendar-wrapper animate-fadeIn"
            style={{ top: pickerPos.top, left: pickerPos.left, width: pickerPos.width, maxWidth: "90vw", maxHeight: pickerPos.maxH, overflowY: "auto" }}
          >
            <style>{`
              .range-calendar-wrapper .react-calendar__month-view__days {
                display: grid !important; grid-template-columns: repeat(7, 1fr) !important; height: auto !important;
              }
              .range-calendar-wrapper .react-calendar__month-view__weekdays {
                display: grid !important; grid-template-columns: repeat(7, 1fr) !important;
              }
              .range-calendar-wrapper .react-calendar__tile {
                height: 40px !important; display: flex !important; align-items: center !important; justify-content: center !important;
              }
            `}</style>
            <Calendar
              onChange={handleRangeChange}
              selectRange={true}
              value={form.startDate && form.endDate ? [new Date(form.startDate), new Date(form.endDate)] : null}
              formatDay={(locale, date) => format(date, "d")}
              calendarType="gregory"
              locale="ko-KR"
            />
          </div>
        </>,
        document.body,
      )
    : null;

  const handleClose = () => {
    onClose();
    setShowDatePicker(false);
  };

  return (
    <>
      {datePicker}

      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={isEditMode ? "사역 일정 수정" : "새로운 사역 일정 추가"}
        footer={
          <div className="flex gap-2 w-full">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className={`flex-1 text-white py-3 rounded-lg font-bold transition shadow-sm disabled:opacity-50 ${
                isEditMode ? "bg-blue-600 hover:bg-blue-700" : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {loading ? (isEditMode ? "수정 중..." : "등록 중...") : isEditMode ? "수정 완료" : "일정 등록"}
            </button>
            <button
              onClick={handleClose}
              className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-200 transition"
            >
              취소
            </button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5 relative">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              일정 내용 (필수)
            </label>
            <input
              type="text"
              placeholder="예: 기도사역, 인터뷰 촬영"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border p-3 rounded-lg border-gray-300 focus:border-indigo-500 outline-none text-gray-900 bg-white"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              장소 (선택)
            </label>
            <input
              type="text"
              placeholder="예: 여주 선교관"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full border p-3 rounded-lg border-gray-300 focus:border-indigo-500 outline-none text-gray-900 bg-white"
            />
          </div>

          <div className="bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-100 space-y-3 sm:space-y-4 w-full">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-gray-700">기간 및 시간</label>
              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={form.isAllDay}
                  onChange={(e) => setForm({ ...form, isAllDay: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="text-[13px] sm:text-sm font-bold text-indigo-700">하루 종일 (기간 전체)</span>
              </label>
            </div>

            <div className="flex flex-col gap-2.5 sm:gap-3 w-full">
              <div className="relative w-full" ref={datePickerRef}>
                <button
                  type="button"
                  onClick={openRangePicker}
                  className="w-full flex items-center justify-between p-2.5 sm:p-3 border border-gray-300 rounded-md text-sm text-left hover:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition bg-white"
                >
                  <span className="font-bold text-gray-900 text-sm sm:text-base tracking-tight truncate mr-2">
                    {form.startDate === form.endDate
                      ? form.startDate
                      : `${form.startDate} ~ ${form.endDate}`}
                  </span>
                  <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>

              {!form.isAllDay && (
                <div className="flex items-center gap-1.5 sm:gap-2 animate-fadeIn w-full">
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="flex-1 min-w-0 w-full border p-2.5 sm:p-3 rounded-md border-gray-300 focus:border-indigo-500 outline-none text-gray-900 bg-white font-bold text-[13px] sm:text-base text-center tracking-tighter"
                    required
                  />
                  <span className="text-gray-400 font-bold shrink-0">~</span>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    className="flex-1 min-w-0 w-full border p-2.5 sm:p-3 rounded-md border-gray-300 focus:border-indigo-500 outline-none text-gray-900 bg-white font-bold text-[13px] sm:text-base text-center tracking-tighter"
                    required
                  />
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-bold text-gray-700">동행자 선택 (선택사항)</label>
              <button
                type="button"
                onClick={toggleAllAttendees}
                className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1.5 rounded-md hover:bg-indigo-100 transition-colors"
              >
                {form.attendees.length === users.filter((u) => u.id !== profile?.id).length
                  ? "전체 해제"
                  : "전체 선택"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar p-1">
              {users
                .filter((u) => u.id !== profile?.id)
                .map((u) => {
                  const isSelected = form.attendees.some((a) => a.id === u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleAttendee(u)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                        isSelected
                          ? "bg-indigo-500 text-white shadow-sm ring-2 ring-indigo-200"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {u.full_name}
                    </button>
                  );
                })}
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
