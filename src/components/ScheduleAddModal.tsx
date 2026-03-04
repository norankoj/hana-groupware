"use client";

import { useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import Modal from "@/components/Modal";
import Calendar from "react-calendar";
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

type ScheduleAddModalProps = {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  users: Profile[];
  onSuccess: () => void;
};

export default function ScheduleAddModal({
  isOpen,
  onClose,
  profile,
  users,
  onSuccess,
}: ScheduleAddModalProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    title: "",
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    isAllDay: false,
    startTime: "09:00",
    endTime: "18:00",
    location: "",
    attendees: [] as Attendee[],
  });

  const toggleAttendee = (user: Profile) => {
    setForm((prev) => {
      const isSelected = prev.attendees.some((a) => a.id === user.id);
      if (isSelected)
        return {
          ...prev,
          attendees: prev.attendees.filter((a) => a.id !== user.id),
        };
      return {
        ...prev,
        attendees: [...prev.attendees, { id: user.id, name: user.full_name }],
      };
    });
  };

  const toggleAllAttendees = () => {
    const allOtherUsers = users.filter((u) => u.id !== profile?.id);
    if (form.attendees.length === allOtherUsers.length) {
      setForm({ ...form, attendees: [] });
    } else {
      setForm({
        ...form,
        attendees: allOtherUsers.map((u) => ({ id: u.id, name: u.full_name })),
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.startDate || !form.endDate)
      return toast.error("내용을 입력해주세요.");
    if (!profile) return;

    let startDateTime, endDateTime;

    if (form.isAllDay) {
      startDateTime = new Date(`${form.startDate}T00:00:00`);
      endDateTime = new Date(`${form.endDate}T23:59:59`);
    } else {
      startDateTime = new Date(`${form.startDate}T${form.startTime}:00`);
      endDateTime = new Date(`${form.endDate}T${form.endTime}:00`);
      if (startDateTime >= endDateTime)
        return toast.error("종료 시간이 시작 시간보다 빠릅니다.");
    }

    setLoading(true);
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
      setForm({
        title: "",
        startDate: format(new Date(), "yyyy-MM-dd"),
        endDate: format(new Date(), "yyyy-MM-dd"),
        isAllDay: false,
        startTime: "09:00",
        endTime: "18:00",
        location: "",
        attendees: [],
      });
      onSuccess();
      onClose();
    }
    setLoading(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        onClose();
        setShowDatePicker(false);
      }}
      title="새로운 사역 일정 추가"
      footer={
        <div className="flex gap-2 w-full">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-teal-600 text-white py-3 rounded-lg font-bold hover:bg-teal-700 transition shadow-sm disabled:opacity-50"
          >
            {loading ? "등록 중..." : "일정 등록"}
          </button>
          <button
            onClick={() => {
              onClose();
              setShowDatePicker(false);
            }}
            className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-200 transition"
          >
            취소
          </button>
        </div>
      }
    >
      <style>{`
        .modal-calendar-wrapper .react-calendar__navigation {
          display: flex !important;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          padding: 0 10px;
        }
        .modal-calendar-wrapper .react-calendar__navigation button {
          background: transparent;
          border: none;
          cursor: pointer;
          font-weight: 800;
          font-size: 16px;
          color: #1f2937;
          padding: 8px;
          border-radius: 8px;
          transition: background 0.2s;
        }
        .modal-calendar-wrapper .react-calendar__navigation button:hover {
          background: #f3f4f6;
        }
        .modal-calendar-wrapper .react-calendar__navigation button:disabled {
          opacity: 0.3;
        }
      `}</style>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">
            일정 내용 (필수)
          </label>
          <input
            type="text"
            placeholder="예: 기도사역, 인터뷰 촬영"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full border p-3 rounded-lg border-gray-300 focus:border-teal-500 outline-none text-gray-900 bg-white font-medium"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">
            장소 (선택)
          </label>
          <input
            type="text"
            placeholder="예: 여주 선교원"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="w-full border p-3 rounded-lg border-gray-300 focus:border-teal-500 outline-none text-gray-900 bg-white"
          />
        </div>

        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-gray-700">
              기간 및 시간
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isAllDay}
                onChange={(e) =>
                  setForm({ ...form, isAllDay: e.target.checked })
                }
                className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500 cursor-pointer"
              />
              <span className="text-sm font-bold text-teal-700">
                하루 종일 (기간 전체)
              </span>
            </label>
          </div>

          <div className="flex flex-col gap-3">
            <div className="relative" ref={datePickerRef}>
              <div
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="w-full border p-3 rounded-lg border-gray-300 bg-white cursor-pointer flex justify-between items-center hover:border-teal-500 transition-colors"
              >
                <span className="font-bold text-gray-900">
                  {form.startDate}{" "}
                  {form.startDate !== form.endDate && ` ~ ${form.endDate}`}
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
              </div>
              {showDatePicker && (
                <div className="absolute z-[60] mt-2 left-0 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 w-full sm:w-[320px] animate-fadeIn modal-calendar-wrapper">
                  <div className="text-xs text-teal-600 font-bold text-center mb-2">
                    시작일과 종료일을 각각 클릭하세요
                  </div>
                  <Calendar
                    selectRange={true}
                    onChange={(val: any) => {
                      if (Array.isArray(val)) {
                        setForm({
                          ...form,
                          startDate: format(val[0], "yyyy-MM-dd"),
                          endDate: format(val[1] || val[0], "yyyy-MM-dd"),
                        });
                      } else {
                        setForm({
                          ...form,
                          startDate: format(val, "yyyy-MM-dd"),
                          endDate: format(val, "yyyy-MM-dd"),
                        });
                      }
                    }}
                    value={[new Date(form.startDate), new Date(form.endDate)]}
                    formatDay={(_, date) => format(date, "d")}
                    formatMonthYear={(locale, date) =>
                      format(date, "yyyy년 M월")
                    }
                    minDetail="year"
                    prevLabel="<"
                    nextLabel=">"
                    next2Label={null}
                    prev2Label={null}
                    calendarType="gregory"
                    locale="ko-KR"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDatePicker(false)}
                    className="w-full mt-3 py-2.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-bold shadow-sm"
                  >
                    기간 선택 완료
                  </button>
                </div>
              )}
            </div>

            {!form.isAllDay && (
              <div className="flex items-center gap-2 animate-fadeIn">
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) =>
                    setForm({ ...form, startTime: e.target.value })
                  }
                  className="flex-1 border p-3 rounded-lg border-gray-300 focus:border-teal-500 outline-none text-gray-900 bg-white font-bold"
                  required
                />
                <span className="text-gray-400 font-bold">~</span>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) =>
                    setForm({ ...form, endTime: e.target.value })
                  }
                  className="flex-1 border p-3 rounded-lg border-gray-300 focus:border-teal-500 outline-none text-gray-900 bg-white font-bold"
                  required
                />
              </div>
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-bold text-gray-700">
              동행자 선택 (선택사항)
            </label>
            <button
              type="button"
              onClick={toggleAllAttendees}
              className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-1.5 rounded-md hover:bg-teal-100 transition-colors"
            >
              {form.attendees.length ===
              users.filter((u) => u.id !== profile?.id).length
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
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${isSelected ? "bg-teal-500 text-white shadow-sm ring-2 ring-teal-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                  >
                    {u.full_name}
                  </button>
                );
              })}
          </div>
        </div>
      </form>
    </Modal>
  );
}
