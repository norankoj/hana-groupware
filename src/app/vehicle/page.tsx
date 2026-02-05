"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import { showConfirm } from "@/utils/alert";

import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import DetailModal from "@/components/vehicle/DetailModal";
import { HOLIDAYS } from "@/constants/holidays";
import "@/styles/calendar.css";
// --- [이미지 설정] 차량별 이미지 매핑 ---
const VEHICLE_IMAGES: Record<string, string> = {
  스타렉스: "/images/cars/starex.webp",
  스타리아: "/images/cars/staria.avif",
  스타리아HEV: "/images/cars/staria-hev.avif",
  마티즈: "/images/cars/matiz.webp",
  모닝: "/images/cars/morning.avif",
  쏘나타: "/images/cars/sonata.avif",
  봉고트럭: "/images/cars/bongo.png",
};

// --- 타입 정의 ---
type Vehicle = {
  id: number;
  name: string;
  description: string;
  current_mileage: number;
  color: string;
};

type VehicleLog = {
  id: number;
  resource_id: number;
  user_id: string;
  start_at: string;
  end_at: string;
  purpose: string;
  destination: string;
  driver_name: string;
  department?: string;
  start_mileage?: number;
  end_mileage?: number;
  vehicle_status: "reserved" | "in_use" | "returned";
  checkin_photo_url?: string;
  checkout_photo_url?: string;
  cleanup_status?: boolean;
  parking_location?: string;
  vehicle_condition?: string;
  profiles?: { full_name: string; position: string };
  resources?: { name: string; description: string };
};

export default function VehicleReservationPage() {
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [logs, setLogs] = useState<VehicleLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  // 모달 상태
  const [isReserveModalOpen, setIsReserveModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<VehicleLog | null>(null);
  const [uploading, setUploading] = useState(false);

  // [추가] 캘린더 표시 여부 상태
  const [showCalendar, setShowCalendar] = useState(false);

  // 예약 폼
  const [form, setForm] = useState({
    resource_id: 0,
    start_date: format(new Date(), "yyyy-MM-dd"),
    start_time: "10:00",
    end_date: format(new Date(), "yyyy-MM-dd"),
    end_time: "12:00",
    purpose: "",
    destination: "",
    driver_name: "",
    department: "",
  });

  // 반납 폼
  const [checkoutForm, setCheckoutForm] = useState({
    mileage: "" as number | "",
    cleanup: true,
    parking: "교회 주차장",
    condition: "이상 없음",
  });

  // 출발 폼
  const [checkinMileage, setCheckinMileage] = useState<number | "">("");

  // 데이터 로드
  const fetchData = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      setCurrentUser(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      if (profile)
        setForm((prev) => ({ ...prev, driver_name: profile.full_name }));
    }

    const { data: vData } = await supabase
      .from("resources")
      .select("*")
      .eq("category", "vehicle")
      .eq("is_active", true)
      .order("id");

    if (vData) {
      setVehicles(vData as any);
      if (vData.length > 0 && form.resource_id === 0) {
        setForm((prev) => ({ ...prev, resource_id: vData[0].id }));
      }
    }

    const { data: lData } = await supabase
      .from("reservations")
      .select(
        `
        *,
        profiles:user_id (full_name, position),
        resources:resource_id (name, description)
      `,
      )
      .in("resource_id", vData?.map((v) => v.id) || [])
      .neq("status", "cancelled")
      .order("start_at", { ascending: false });

    if (lData) setLogs(lData as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // [추가] 캘린더 날짜 변경 핸들러
  const handleRangeChange = (value: any) => {
    if (Array.isArray(value) && value.length === 2) {
      const [start, end] = value;
      setForm((prev) => ({
        ...prev,
        start_date: format(start, "yyyy-MM-dd"),
        end_date: format(end, "yyyy-MM-dd"),
      }));
      setShowCalendar(false); // 선택 후 닫기
    }
  };

  // --- 예약하기 ---
  const handleReserve = async () => {
    if (
      !form.purpose ||
      !form.destination ||
      !form.driver_name ||
      !form.department
    )
      return toast.error("모든 정보를 입력해주세요.");

    const startAt = new Date(`${form.start_date}T${form.start_time}`);
    const endAt = new Date(`${form.end_date}T${form.end_time}`);

    if (startAt >= endAt)
      return toast.error("종료 시간이 시작 시간보다 빨라요.");

    const isOverlapping = logs.some((log) => {
      if (log.resource_id !== form.resource_id) return false;
      const lStart = new Date(log.start_at);
      const lEnd = new Date(log.end_at);
      return startAt < lEnd && endAt > lStart;
    });

    if (isOverlapping) return toast.error("이미 예약된 시간입니다.");

    if (!(await showConfirm("차량을 예약하시겠습니까?"))) return;

    const { error } = await supabase.from("reservations").insert({
      resource_id: form.resource_id,
      user_id: currentUser,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      purpose: form.purpose,
      destination: form.destination,
      driver_name: form.driver_name,
      department: form.department,
      vehicle_status: "reserved",
    });

    if (error) toast.error(error.message);
    else {
      toast.success("예약되었습니다.");
      setIsReserveModalOpen(false);
      fetchData();
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-2 pb-20 space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            차량 운행 관리
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            차량 예약 및 운행 일지를 관리합니다.
          </p>
        </div>
        <button
          onClick={() => setIsReserveModalOpen(true)}
          className="w-full md:w-auto flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold text-sm tracking-tight transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 cursor-pointer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          <span className="mt-[1px]">차량 예약하기</span>
        </button>
      </div>

      {/* 차량 대시보드 (카드) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
        {vehicles.map((v) => {
          const currentUsage = logs.find(
            (l) => l.resource_id === v.id && l.vehicle_status === "in_use",
          );
          const carImage = VEHICLE_IMAGES[v.name];

          return (
            <div
              key={v.id}
              className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between h-44 relative overflow-hidden group hover:border-blue-300 transition"
            >
              <div
                className={`absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-xs font-bold z-10 ${
                  currentUsage
                    ? "bg-green-100 text-green-700 animate-pulse"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {currentUsage ? "운행중" : "대기중"}
              </div>

              <div className="z-10">
                <h3 className="text-lg font-bold text-gray-900">{v.name}</h3>
                <p className="text-sm text-gray-500 font-mono tracking-tight">
                  {v.description}
                </p>
              </div>

              {carImage ? (
                <img
                  src={carImage}
                  alt={v.name}
                  className={`absolute h-auto object-contain opacity-90 transition-transform duration-300
                    ${
                      v.name.includes("스타리아")
                        ? "w-32 -right-8 -bottom-0 scale-125 origin-bottom-right group-hover:scale-[1.35]"
                        : v.name.includes("쏘나타")
                          ? "w-34 -right-2 -bottom-1 group-hover:scale-110"
                          : "w-32 -right-2 bottom-1 group-hover:scale-110"
                    }
                  `}
                />
              ) : (
                <div className="absolute right-2 bottom-2 opacity-10 text-gray-400">
                  <svg
                    className="w-24 h-24"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                    <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v5a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0h1a1 1 0 001-1V9a2 2 0 00-2-2h-6z" />
                  </svg>
                </div>
              )}

              <div className="z-10 mt-auto">
                <p className="text-xs text-gray-400 mb-0.5">누적거리</p>
                <p className="text-xl font-extrabold text-gray-800 bg-white/80 inline-block px-1 rounded backdrop-blur-sm">
                  {v.current_mileage?.toLocaleString()}{" "}
                  <span className="text-sm font-normal text-gray-500">km</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 운행 일지 테이블 */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[500px]">
        {/* 헤더 (고정) */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 font-bold text-gray-700 flex justify-between items-center shrink-0">
          <span>📄 운행 일지</span>
          <span className="text-xs text-gray-400 font-normal">
            최근 30건 표시
          </span>
        </div>

        {/* 내용 영역 (스크롤 가능) */}
        <div className="flex-1 overflow-auto custom-scrollbar relative w-full">
          {/* PC View */}
          <div className="hidden md:block min-w-full inline-block align-middle">
            <table className="min-w-full text-sm text-left whitespace-nowrap relative">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 bg-gray-50 whitespace-nowrap">
                    상태
                  </th>
                  <th className="px-4 py-3 bg-gray-50 whitespace-nowrap">
                    차량
                  </th>
                  <th className="px-4 py-3 bg-gray-50 whitespace-nowrap">
                    사용시간
                  </th>
                  <th className="px-4 py-3 bg-gray-50 whitespace-nowrap">
                    사용부서
                  </th>
                  <th className="px-4 py-3 bg-gray-50 whitespace-nowrap">
                    목적지/용도
                  </th>
                  <th className="px-4 py-3 bg-gray-50 whitespace-nowrap">
                    운전자
                  </th>
                  <th className="px-4 py-3 bg-gray-50 text-right whitespace-nowrap">
                    주행거리
                  </th>
                  <th className="px-4 py-3 bg-gray-50 text-center whitespace-nowrap">
                    관리
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-bold ${
                          log.vehicle_status === "in_use"
                            ? "bg-green-100 text-green-700"
                            : log.vehicle_status === "returned"
                              ? "bg-gray-100 text-gray-500"
                              : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {log.vehicle_status === "in_use"
                          ? "운행중"
                          : log.vehicle_status === "returned"
                            ? "반납"
                            : "예약"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {log.resources?.name}
                      </div>
                      <div className="text-xs text-gray-400">
                        {log.resources?.description}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>{format(new Date(log.start_at), "MM.dd HH:mm")}</div>
                      <div className="text-xs text-gray-400">
                        ~ {format(new Date(log.end_at), "MM.dd HH:mm")}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {log.department}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">
                        {log.destination}
                      </div>
                      <div className="text-xs text-gray-500 truncate max-w-[150px]">
                        {log.purpose}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {log.driver_name}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {log.end_mileage && log.start_mileage ? (
                        <span className="font-bold text-gray-900">
                          {(
                            log.end_mileage - log.start_mileage
                          ).toLocaleString()}{" "}
                          km
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => {
                          setSelectedLog(log);
                          setIsDetailModalOpen(true);
                        }}
                        className="text-blue-600 border border-blue-200 px-3 py-1 rounded hover:bg-blue-50 text-xs font-bold transition"
                      >
                        상세
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View */}
          <div className="md:hidden divide-y divide-gray-100">
            {logs.map((log) => (
              <div
                key={log.id}
                onClick={() => {
                  setSelectedLog(log);
                  setIsDetailModalOpen(true);
                }}
                className="p-4 active:bg-gray-50 cursor-pointer"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold ${
                        log.vehicle_status === "in_use"
                          ? "bg-green-100 text-green-700"
                          : log.vehicle_status === "returned"
                            ? "bg-gray-100 text-gray-500"
                            : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {log.vehicle_status === "in_use"
                        ? "운행중"
                        : log.vehicle_status === "returned"
                          ? "반납완료"
                          : "예약중"}
                    </span>
                    <span className="text-xs font-bold text-gray-700">
                      {log.resources?.name}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {format(new Date(log.start_at), "MM.dd (eee)", {
                      locale: ko,
                    })}
                  </span>
                </div>
                <h4 className="text-base font-bold text-gray-900 mb-1">
                  {log.destination}{" "}
                  <span className="text-sm font-normal text-gray-500">
                    ({log.driver_name})
                  </span>
                </h4>
                <p className="text-sm text-gray-600 mb-1">
                  {log.department} · {log.purpose}
                </p>
                {log.vehicle_status === "returned" &&
                  log.end_mileage &&
                  log.start_mileage && (
                    <p className="text-xs text-blue-600 font-medium">
                      주행거리:{" "}
                      {(log.end_mileage - log.start_mileage).toLocaleString()}{" "}
                      km
                    </p>
                  )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* --- 모달: 예약하기 --- */}
      <Modal
        isOpen={isReserveModalOpen}
        onClose={() => setIsReserveModalOpen(false)}
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
              onClick={() => setIsReserveModalOpen(false)}
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
                  className={`px-3 py-3 rounded-xl border transition flex flex-col items-center justify-center text-center ${form.resource_id === v.id ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
                >
                  <div className="font-bold text-sm break-keep">{v.name}</div>
                  <div className="text-[10px] opacity-70 mt-1">
                    {v.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* [수정] 캘린더 통합 부분 */}
          <div className="relative">
            <div className="grid grid-cols-2 gap-3">
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
                  onChange={(e) =>
                    setForm({ ...form, end_time: e.target.value })
                  }
                />
              </div>
            </div>

            {/* 캘린더 팝업 */}
            {showCalendar && (
              <div className="absolute z-[50] mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 range-calendar-wrapper animate-fadeIn w-full max-w-[350px] left-0 md:left-auto md:right-0">
                <Calendar
                  onChange={handleRangeChange}
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
                    const isUnavailable = logs.some(
                      (req) =>
                        req.resource_id === form.resource_id && // 현재 선택된 차량의 예약만 체크
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
                    return logs.some(
                      (req) =>
                        req.resource_id === form.resource_id && // 현재 선택된 차량의 예약만 체크
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">
                사용 부서
              </label>
              <input
                type="text"
                placeholder="예: 행정실"
                className="w-full border p-3 rounded-lg  border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
                value={form.department}
                onChange={(e) =>
                  setForm({ ...form, department: e.target.value })
                }
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
              onChange={(e) =>
                setForm({ ...form, destination: e.target.value })
              }
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

      {/* --- 모달: 운행 일지 상세 및 체크인/아웃 --- */}

      <DetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        selectedLog={selectedLog}
        currentUser={currentUser}
        onRefresh={fetchData}
      />
    </div>
  );
}
