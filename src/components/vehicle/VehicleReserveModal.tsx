"use client";

import { useState, useEffect, useMemo } from "react";
import Modal from "@/components/Modal";
import Calendar from "react-calendar";
import { format } from "date-fns";
import { HOLIDAYS } from "@/constants/holidays";

type Vehicle = {
  id: number;
  name: string;
  description: string;
  is_rented?: boolean;
  renter_name?: string;
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
  driver_user_id: string;
  department: string;
};

interface RecurringOptions {
  days: number[];
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
  staffList: { id: string; full_name: string; position: string }[];
}

// "2026-04-24" → "2026년 4월 24일"
const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return "날짜 선택";
  const [y, m, d] = dateStr.split("-");
  return `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일`;
};

// 시간 선택 컴포넌트 (OS 로케일 포맷 회피)
const TimeSelect = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (time: string) => void;
}) => {
  const parts = value ? value.split(":") : ["09", "00"];
  const hr = parts[0] ?? "09";
  const min = parts[1] ?? "00";
  const MINUTE_OPTS = ["00", "10", "20", "30", "40", "50"];
  // 현재 분 값이 목록에 없으면 임시 추가
  const minuteOptions = MINUTE_OPTS.includes(min)
    ? MINUTE_OPTS
    : [...MINUTE_OPTS, min].sort();

  return (
    <div className="flex gap-1.5">
      <select
        value={hr}
        onChange={(e) => onChange(`${e.target.value}:${min}`)}
        className="flex-1 border border-gray-300 rounded-lg px-2 py-3 bg-white text-gray-900 outline-none focus:border-blue-500 text-sm font-semibold"
      >
        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map(
          (h) => (
            <option key={h} value={h}>
              {h}시
            </option>
          ),
        )}
      </select>
      <select
        value={min}
        onChange={(e) => onChange(`${hr}:${e.target.value}`)}
        className="flex-1 border border-gray-300 rounded-lg px-2 py-3 bg-white text-gray-900 outline-none focus:border-blue-500 text-sm font-semibold"
      >
        {minuteOptions.map((m) => (
          <option key={m} value={m}>
            {m}분
          </option>
        ))}
      </select>
    </div>
  );
};

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
  staffList,
}: VehicleReserveModalProps) {
  const [reserveType, setReserveType] = useState<
    "single" | "multi" | "recurring"
  >("single");
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [recurringSubmitting, setRecurringSubmitting] = useState(false);
  const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
  const [activeInput, setActiveInput] = useState<"start" | "end" | null>(null);

  // 운전자 검색 목록 표시 여부
  const [showDriverList, setShowDriverList] = useState(false);

  // 모달 열릴 때 상태 초기화 + 대여중 차량 선택 시 자동 변경
  useEffect(() => {
    if (!isOpen) {
      setShowDriverList(false);
    } else {
      // 현재 선택된 차량이 대여중이면 첫 번째 사용 가능 차량으로 변경
      const selected = vehicles.find((v) => v.id === form.resource_id);
      if (selected?.is_rented) {
        const available = vehicles.find((v) => !v.is_rented);
        if (available)
          setForm((prev) => ({ ...prev, resource_id: available.id }));
      }
    }
  }, [isOpen, form.resource_id, vehicles, setForm]);

  useEffect(() => {
    if (reserveType === "single") {
      setForm((prev) => ({ ...prev, end_date: prev.start_date }));
    }
  }, [reserveType, form.start_date, setForm]);

  // 검색어를 form.driver_name에 직접 바인딩하여 필터링
  const filteredDrivers = useMemo(
    () =>
      staffList.filter(
        (s) =>
          s.full_name.includes(form.driver_name) ||
          s.position.includes(form.driver_name),
      ),
    [staffList, form.driver_name],
  );

  const onCalendarChange = (value: any) => {
    if (
      (reserveType === "multi" || reserveType === "recurring") &&
      Array.isArray(value)
    ) {
      handleRangeChange(value);
      setActiveInput(null);
    } else if (reserveType === "single" && !Array.isArray(value)) {
      const dateStr = format(value, "yyyy-MM-dd");
      setForm((prev) => ({ ...prev, start_date: dateStr, end_date: dateStr }));
      setActiveInput(null);
    }
  };

  // 날짜 선택 팝업 (react-calendar)
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
          // 해당 날짜에 예약이 있으면 점 표시
          const hasReservation = logs?.some(
            (req) =>
              req.resource_id === form.resource_id &&
              (req.vehicle_status === "reserved" ||
                req.vehicle_status === "in_use") &&
              format(new Date(req.start_at), "yyyy-MM-dd") === dateStr,
          );
          if (hasReservation) return "has-reservation";
          return null;
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

  // 날짜 선택 버튼
  const DateButton = ({
    dateStr,
    which,
    label,
    className = "",
  }: {
    dateStr: string;
    which: "start" | "end";
    label: string;
    className?: string;
  }) => (
    <div className={`relative ${className}`}>
      <div
        onClick={() => setActiveInput(activeInput === which ? null : which)}
        className="cursor-pointer"
      >
        <label className="block text-xs font-bold text-gray-500 mb-1 cursor-pointer">
          {label}
        </label>
        <div className="w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-center font-bold text-sm select-none">
          {formatDateDisplay(dateStr)}
        </div>
      </div>
      {activeInput === which && calendarPopup}
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
            {vehicles.map((v) => (
              <button
                key={v.id}
                onClick={() =>
                  !v.is_rented && setForm({ ...form, resource_id: v.id })
                }
                disabled={!!v.is_rented}
                title={
                  v.is_rented
                    ? `대여중${v.renter_name ? ` · ${v.renter_name}` : ""}`
                    : undefined
                }
                className={`px-3 py-3 rounded-xl border transition flex flex-col items-center justify-center text-center relative overflow-hidden ${
                  v.is_rented
                    ? "border-indigo-200 bg-indigo-50 text-indigo-400 cursor-not-allowed opacity-70"
                    : form.resource_id === v.id
                      ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500 shadow-sm"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <div className="font-bold text-sm break-keep">{v.name}</div>
                {v.is_rented ? (
                  <div className="text-[10px] mt-1 font-semibold text-indigo-500">
                    대여중{v.renter_name ? ` · ${v.renter_name}` : ""}
                  </div>
                ) : (
                  <div className="text-[10px] opacity-70 mt-1">
                    {v.description}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 예약 타입 탭 */}
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
        <div className="space-y-3">
          {reserveType === "single" ? (
            // === 당일 예약 ===
            <>
              <DateButton
                dateStr={form.start_date}
                which="start"
                label="사용 날짜"
                className="col-span-2"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    시작 시간
                  </label>
                  <TimeSelect
                    value={form.start_time}
                    onChange={(t) => {
                      const [h, m] = t.split(":").map(Number);
                      const endH = Math.min(h + 1, 23);
                      const autoEnd = `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                      const currentEnd = form.end_time;
                      setForm({
                        ...form,
                        start_time: t,
                        end_time: currentEnd <= t ? autoEnd : currentEnd,
                      });
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    종료 시간
                  </label>
                  <TimeSelect
                    value={form.end_time}
                    onChange={(t) => setForm({ ...form, end_time: t })}
                  />
                </div>
              </div>
            </>
          ) : (
            // === 기간/정기 예약 ===
            <>
              <div className="grid grid-cols-2 gap-3">
                <DateButton
                  dateStr={form.start_date}
                  which="start"
                  label={reserveType === "recurring" ? "반복 시작일" : "시작일"}
                />
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    시작 시간
                  </label>
                  <TimeSelect
                    value={form.start_time}
                    onChange={(t) => {
                      const [h, m] = t.split(":").map(Number);
                      const endH = Math.min(h + 1, 23);
                      const autoEnd = `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                      const currentEnd = form.end_time;
                      setForm({
                        ...form,
                        start_time: t,
                        end_time: currentEnd <= t ? autoEnd : currentEnd,
                      });
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <DateButton
                  dateStr={form.end_date}
                  which="end"
                  label={reserveType === "recurring" ? "반복 종료일" : "종료일"}
                />
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    종료 시간
                  </label>
                  <TimeSelect
                    value={form.end_time}
                    onChange={(t) => setForm({ ...form, end_time: t })}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* 선택 날짜 예약 현황 */}
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

        {/* 정기 예약 — 요일 선택 */}
        {reserveType === "recurring" && (
          <div className="space-y-3 bg-purple-50 border border-purple-100 rounded-xl p-4">
            <label className="block text-xs font-bold text-gray-500">
              반복 요일 선택
            </label>
            <div className="flex gap-2 flex-wrap">
              {DAY_LABELS.map((label, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() =>
                    setRecurringDays((prev) =>
                      prev.includes(idx)
                        ? prev.filter((d) => d !== idx)
                        : [...prev, idx],
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
                <span className="font-bold">
                  {[...recurringDays]
                    .sort()
                    .map((d) => DAY_LABELS[d])
                    .join(", ")}
                  요일
                </span>
                에 매주 {form.start_time} ~ {form.end_time} 예약이 생성됩니다.
              </p>
            )}
          </div>
        )}

        {/* 부서 / 운전자 / 목적지 / 운행목적 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">
              사용 부서
            </label>
            <input
              type="text"
              placeholder="예: 행정실"
              className="w-full border p-3 rounded-lg border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white text-sm"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">
              운전자
            </label>
            {/* 운전자 하이브리드 입력 영역 */}
            {form.driver_user_id ? (
              /* 시스템 유저가 선택된 상태 (버블 UI) */
              <div className="flex items-center gap-2 p-2.5 border border-blue-400 rounded-lg bg-blue-50">
                <div className="w-6 h-6 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {form.driver_name.slice(0, 1)}
                </div>
                <span className="text-sm font-bold text-gray-800 flex-1">
                  {form.driver_name}
                </span>
                <button
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      driver_user_id: "",
                      driver_name: "",
                    }));
                  }}
                  className="text-gray-400 hover:text-red-500 transition"
                  type="button"
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            ) : (
              /* 미선택 상태 — 검색 input (동시에 외부인 텍스트 입력 가능) */
              <div className="relative">
                <input
                  type="text"
                  placeholder="이름 검색 또는 외부 운전자 직접 입력..."
                  value={form.driver_name}
                  onChange={(e) => {
                    setForm({
                      ...form,
                      driver_name: e.target.value,
                      driver_user_id: "",
                    });
                    setShowDriverList(true);
                  }}
                  onFocus={() => setShowDriverList(true)}
                  onBlur={() => setTimeout(() => setShowDriverList(false), 150)}
                  className="w-full p-2.5 pl-9 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition bg-white"
                />
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                {showDriverList && filteredDrivers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-44 overflow-y-auto">
                    {filteredDrivers.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={() => {
                          setForm((prev) => ({
                            ...prev,
                            driver_user_id: s.id,
                            driver_name: s.full_name,
                          }));
                          setShowDriverList(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left transition border-b border-gray-50 last:border-b-0"
                      >
                        <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">
                          {s.full_name.slice(0, 1)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-800">
                            {s.full_name}
                          </div>
                          <div className="text-xs text-gray-400">
                            {s.position}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">
            목적지
          </label>
          <input
            type="text"
            placeholder="예: 영통 홈플러스"
            className="w-full border p-3 rounded-lg border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white text-sm"
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
            className="w-full h-24 border p-3 rounded-lg resize-none border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white text-sm"
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
          />
        </div>
      </div>
    </Modal>
  );
}
