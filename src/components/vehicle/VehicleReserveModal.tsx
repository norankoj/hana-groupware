"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import Calendar from "react-calendar";
import { format } from "date-fns";
import { HOLIDAYS } from "@/constants/holidays";

type Vehicle = {
  id: number;
  name: string;
  description: string;
};

type VehicleLog = {
  id: number;
  resource_id: number;
  start_at: string;
  end_at: string;
  vehicle_status: "reserved" | "in_use" | "returned";
};

type FormState = {
  resource_id: number;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  purpose: string;
  destination: string;
  driver_name: string;
  department: string;
};

interface VehicleReserveModalProps {
  isOpen: boolean;
  onClose: () => void;
  handleReserve: () => void;
  vehicles: Vehicle[];
  logs: VehicleLog[];
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  handleRangeChange: (value: any) => void;
}

export default function VehicleReserveModal({
  isOpen,
  onClose,
  handleReserve,
  vehicles,
  logs,
  form,
  setForm,
  handleRangeChange,
}: VehicleReserveModalProps) {
  const [showCalendar, setShowCalendar] = useState(false);

  const onCalendarChange = (value: any) => {
    handleRangeChange(value);
    // 날짜 범위를 선택하면 자동으로 캘린더 닫기
    if (Array.isArray(value) && value.length === 2) {
      setShowCalendar(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="차량 배차 신청"
      footer={
        <div className="flex gap-2 w-full">
          <button
            onClick={handleReserve}
            className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold"
          >
            예약하기
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-lg font-bold"
          >
            취소
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">
            차량 선택
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1 custom-scrollbar">
            {vehicles.map((v) => (
              <button
                key={v.id}
                onClick={() => setForm({ ...form, resource_id: v.id })}
                className={`px-3 py-3 rounded-xl border transition flex flex-col items-center justify-center text-center ${
                  form.resource_id === v.id
                    ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <div className="font-bold text-sm break-keep">{v.name}</div>
                <div className="text-[10px] opacity-70 mt-1">
                  {v.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => setShowCalendar(!showCalendar)}
                className="cursor-pointer"
              >
                <label className="block text-xs font-bold text-gray-500 mb-1 cursor-pointer">
                  시작일
                </label>
                <input
                  type="date"
                  className="w-full border p-2 rounded-lg border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
                  value={form.start_date}
                  readOnly
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  시간
                </label>
                <input
                  type="time"
                  className="w-full border p-2 rounded-lg  border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
                  value={form.start_time}
                  onChange={(e) =>
                    setForm({ ...form, start_time: e.target.value })
                  }
                />
              </div>
            </div>

            {showCalendar && (
              <div className="absolute top-full left-0 z-50 mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 range-calendar-wrapper animate-fadeIn w-full max-w-[350px]">
                <Calendar
                  onChange={onCalendarChange}
                  selectRange={true}
                  value={
                    form.start_date && form.end_date
                      ? [new Date(form.start_date), new Date(form.end_date)]
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
                    const isUnavailable = logs?.some(
                      (req) =>
                        req.resource_id === form.resource_id &&
                        (req.vehicle_status === "reserved" ||
                          req.vehicle_status === "in_use") &&
                        dateStr >=
                          format(new Date(req.start_at), "yyyy-MM-dd") &&
                        dateStr <= format(new Date(req.end_at), "yyyy-MM-dd"),
                    );
                    if (isUnavailable)
                      return "!bg-gray-100 !text-gray-400 cursor-not-allowed";
                  }}
                  tileDisabled={({ date, view }) => {
                    if (view !== "month") return false;
                    const dateStr = format(date, "yyyy-MM-dd");
                    return logs?.some(
                      (req) =>
                        req.resource_id === form.resource_id &&
                        (req.vehicle_status === "reserved" ||
                          req.vehicle_status === "in_use") &&
                        dateStr >=
                          format(new Date(req.start_at), "yyyy-MM-dd") &&
                        dateStr <= format(new Date(req.end_at), "yyyy-MM-dd"),
                    );
                  }}
                />
                <button
                  onClick={() => setShowCalendar(false)}
                  className="w-full mt-2 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 text-gray-600 font-bold"
                >
                  닫기
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              onClick={() => setShowCalendar(!showCalendar)}
              className="cursor-pointer"
            >
              <label className="block text-xs font-bold text-gray-500 mb-1 cursor-pointer">
                종료일
              </label>
              <input
                type="date"
                className="w-full border p-2 rounded-lg  border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
                value={form.end_date}
                readOnly
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">
                시간
              </label>
              <input
                type="time"
                className="w-full border p-2 rounded-lg  border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">
              사용 부서
            </label>
            <input
              type="text"
              placeholder="예: 행정실"
              className="w-full border p-3 rounded-lg  border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">
              운전자
            </label>
            <input
              type="text"
              placeholder="성명"
              className="w-full border p-3 rounded-lg  border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
              value={form.driver_name}
              onChange={(e) =>
                setForm({ ...form, driver_name: e.target.value })
              }
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">
            목적지
          </label>
          <input
            type="text"
            placeholder="예: 영통 홈플러스"
            className="w-full border p-3 rounded-lg border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
            value={form.destination}
            onChange={(e) => setForm({ ...form, destination: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">
            운행 목적
          </label>
          <textarea
            placeholder="구체적인 목적 입력"
            className="w-full h-24 border p-3 rounded-lg resize-none border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
          />
        </div>
      </div>
    </Modal>
  );
}
