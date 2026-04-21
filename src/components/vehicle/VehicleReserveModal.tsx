"use client";

import { useState, useEffect } from "react";
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
  vehicle_status: "reserved" | "in_use" | "returned" | "noshow";
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

interface RecurringOptions {
  days: number[];        // 0=일, 1=월, 2=화, 3=수, 4=목, 5=금, 6=토
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}

interface VehicleReserveModalProps {
  isOpen: boolean;
  onClose: () => void;
  handleReserve: () => void;
  handleRecurringReserve: (opts: RecurringOptions) => Promise<void>;
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
  handleRecurringReserve,
  vehicles,
  logs,
  form,
  setForm,
  handleRangeChange,
}: VehicleReserveModalProps) {
  // 예약 타입 상태 (single: 당일, multi: 기간, recurring: 정기)
  const [reserveType, setReserveType] = useState<"single" | "multi" | "recurring">("single");

  // 정기 예약 상태
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [recurringSubmitting, setRecurringSubmitting] = useState(false);

  const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
  const [activeInput, setActiveInput] = useState<"start" | "end" | null>(null);

  // 예약 타입 변경 시 날짜 동기화
  useEffect(() => {
    if (reserveType === "single") {
      setForm((prev) => ({ ...prev, end_date: prev.start_date }));
    }
  }, [reserveType, form.start_date, setForm]);

  const onCalendarChange = (value: any) => {
    // 기간 예약일 때
    if ((reserveType === "multi" || reserveType === "recurring") && Array.isArray(value)) {
      handleRangeChange(value);
      setActiveInput(null);
    }
    // 당일 예약일 때 (날짜 하나만 선택)
    else if (reserveType === "single" && !Array.isArray(value)) {
      const dateStr = format(value, "yyyy-MM-dd");
      setForm((prev) => ({
        ...prev,
        start_date: dateStr,
        end_date: dateStr,
      }));
      setActiveInput(null);
    }
  };

  // 달력 팝업 컴포넌트
  const calendarPopup = (
    <div className="absolute top-full left-0 z-50 mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 range-calendar-wrapper animate-fadeIn w-[300px] sm:w-[350px]">
      <Calendar
        onChange={onCalendarChange}
        selectRange={reserveType === "multi" || reserveType === "recurring"}
        value={
          reserveType === "multi" || reserveType === "recurring"
            ? [new Date(form.start_date), new Date(form.end_date)]
            : new Date(form.start_date)
        }
        formatDay={(locale, date) => format(date, "d")}
        calendarType="gregory"
        locale="ko-KR"
        minDate={new Date()}
        tileClassName={({ date, view }) => {
          if (view !== "month") return null;
          const dateStr = format(date, "yyyy-MM-dd");
          if (HOLIDAYS[dateStr]) return "holiday-day";

          const isUnavailable = logs?.some(
            (req) =>
              req.resource_id === form.resource_id &&
              (req.vehicle_status === "reserved" ||
                req.vehicle_status === "in_use") &&
              dateStr >= format(new Date(req.start_at), "yyyy-MM-dd") &&
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
              dateStr >= format(new Date(req.start_at), "yyyy-MM-dd") &&
              dateStr <= format(new Date(req.end_at), "yyyy-MM-dd"),
          );
        }}
      />
      <button
        onClick={(e) => {
          e.stopPropagation();
          setActiveInput(null);
        }}
        className="w-full mt-2 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 text-gray-600 font-bold"
      >
        닫기
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="차량 배차 신청"
      footer={
        <div className="flex gap-2 w-full">
          <button
            onClick={async () => {
              if (reserveType === "recurring") {
                setRecurringSubmitting(true);
                await handleRecurringReserve({
                  days: recurringDays,
                  startDate: form.start_date,
                  endDate: form.end_date,
                  startTime: form.start_time,
                  endTime: form.end_time,
                });
                setRecurringSubmitting(false);
              } else {
                handleReserve();
              }
            }}
            disabled={recurringSubmitting}
            className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold shadow-md hover:bg-blue-700 transition disabled:opacity-60"
          >
            {recurringSubmitting ? "처리 중..." : "예약하기"}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-200 transition"
          >
            취소
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* 차량 선택 */}
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
                    ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500 shadow-sm"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
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

        <div className="bg-blue-50 p-1 rounded-xl flex border border-blue-100">
          {(["single", "multi", "recurring"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setReserveType(type)}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
                reserveType === type
                  ? "bg-white text-blue-600 shadow-sm ring-1 ring-black/5"
                  : "text-blue-400 hover:text-blue-600"
              }`}
            >
              {type === "single" ? "당일" : type === "multi" ? "기간" : "정기"}
            </button>
          ))}
        </div>

        {/* 날짜 및 시간 입력 */}
        <div className="space-y-4">
          {reserveType === "single" ? (
            // === 당일 예약 UI ===
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 relative">
                <div
                  onClick={() =>
                    setActiveInput(activeInput === "start" ? null : "start")
                  }
                  className="cursor-pointer"
                >
                  <label className="block text-xs font-bold text-gray-500 mb-1 cursor-pointer">
                    사용 날짜
                  </label>
                  <input
                    type="date"
                    className="w-full border p-3 rounded-lg border-gray-300 text-gray-900 bg-white pointer-events-none text-center font-bold focus:border-blue-500 outline-none"
                    value={form.start_date}
                    readOnly
                  />
                </div>
                {activeInput === "start" && calendarPopup}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  시작 시간
                </label>
                {/* [수정] input type="time"으로 복귀 */}
                <input
                  type="time"
                  className="w-full border p-3 rounded-lg border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
                  value={form.start_time}
                  onChange={(e) =>
                    setForm({ ...form, start_time: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  종료 시간
                </label>
                {/* [수정] input type="time"으로 복귀 */}
                <input
                  type="time"
                  className="w-full border p-3 rounded-lg border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
                  value={form.end_time}
                  onChange={(e) =>
                    setForm({ ...form, end_time: e.target.value })
                  }
                />
              </div>
            </div>
          ) : (
            // === 기간/정기 예약 UI (공용) ===
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <div
                    onClick={() =>
                      setActiveInput(activeInput === "start" ? null : "start")
                    }
                    className="cursor-pointer"
                  >
                    <label className="block text-xs font-bold text-gray-500 mb-1 cursor-pointer">
                      {reserveType === "recurring" ? "반복 시작일" : "시작일"}
                    </label>
                    <input
                      type="date"
                      className="w-full border p-2 rounded-lg border-gray-300 text-gray-900 bg-white pointer-events-none focus:border-blue-500 outline-none"
                      value={form.start_date}
                      readOnly
                    />
                  </div>
                  {activeInput === "start" && calendarPopup}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    시간
                  </label>
                  <input
                    type="time"
                    className="w-full border p-2 rounded-lg border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
                    value={form.start_time}
                    onChange={(e) =>
                      setForm({ ...form, start_time: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <div
                    onClick={() =>
                      setActiveInput(activeInput === "end" ? null : "end")
                    }
                    className="cursor-pointer"
                  >
                    <label className="block text-xs font-bold text-gray-500 mb-1 cursor-pointer">
                      {reserveType === "recurring" ? "반복 종료일" : "종료일"}
                    </label>
                    <input
                      type="date"
                      className="w-full border p-2 rounded-lg border-gray-300 text-gray-900 bg-white pointer-events-none focus:border-blue-500 outline-none"
                      value={form.end_date}
                      readOnly
                    />
                  </div>
                  {activeInput === "end" && calendarPopup}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    시간
                  </label>
                  <input
                    type="time"
                    className="w-full border p-2 rounded-lg border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
                    value={form.end_time}
                    onChange={(e) =>
                      setForm({ ...form, end_time: e.target.value })
                    }
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* 선택 날짜 예약 현황 타임라인 */}
        {(() => {
          const selectedVehicleLogs = logs.filter(
            (l) =>
              l.resource_id === form.resource_id &&
              l.vehicle_status !== "returned" &&
              (l.vehicle_status as string) !== "noshow",
          );
          const dateStr = form.start_date;
          const dayLogs = selectedVehicleLogs.filter(
            (l) =>
              format(new Date(l.start_at), "yyyy-MM-dd") <= dateStr &&
              format(new Date(l.end_at), "yyyy-MM-dd") >= dateStr,
          );
          if (dayLogs.length === 0) return null;
          return (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3">
              <p className="text-xs font-bold text-red-600 mb-2">
                해당 날짜 이미 예약된 시간대
              </p>
              <div className="flex flex-wrap gap-1">
                {dayLogs.map((l) => (
                  <span
                    key={l.id}
                    className="text-xs bg-red-100 text-red-600 px-2.5 py-1 rounded-full font-bold"
                  >
                    {format(new Date(l.start_at), "HH:mm")}~
                    {format(new Date(l.end_at), "HH:mm")}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

        {/* 정기 예약 — 요일 선택만 */}
        {reserveType === "recurring" && (
          <div className="space-y-3 bg-purple-50 border border-purple-100 rounded-xl p-4">
            <label className="block text-xs font-bold text-gray-500">반복 요일 선택</label>
            <div className="flex gap-2 flex-wrap">
              {DAY_LABELS.map((label, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() =>
                    setRecurringDays((prev) =>
                      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx],
                    )
                  }
                  className={`w-10 h-10 rounded-full text-sm font-bold border transition ${
                    recurringDays.includes(idx)
                      ? idx === 0
                        ? "bg-red-500 text-white border-red-500"
                        : idx === 6
                          ? "bg-blue-500 text-white border-blue-500"
                          : "bg-purple-600 text-white border-purple-600"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {recurringDays.length > 0 && form.start_date && form.end_date && (
              <p className="text-xs text-purple-700 bg-purple-100 rounded-lg px-3 py-2 font-medium">
                {form.start_date} ~ {form.end_date} 기간 중{" "}
                <span className="font-bold">{[...recurringDays].sort().map((d) => DAY_LABELS[d]).join(", ")}요일</span>에
                매주 {form.start_time} ~ {form.end_time} 예약이 생성됩니다.
              </p>
            )}
          </div>
        )}

        {/* 나머지 입력 폼 (부서, 운전자 등) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">
              사용 부서
            </label>
            <input
              type="text"
              placeholder="예: 행정실"
              className="w-full border p-3 rounded-lg border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
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
              className="w-full border p-3 rounded-lg border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
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
