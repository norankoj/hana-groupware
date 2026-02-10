"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import toast from "react-hot-toast";
import { showConfirm } from "@/utils/alert";
import "react-calendar/dist/Calendar.css";
import DetailModal from "@/components/vehicle/DetailModal";
import VehicleReserveModal from "@/components/vehicle/VehicleReserveModal";
import "@/styles/calendar.css";
import HistoryModal from "@/components/vehicle/HistoryModal";
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
  //  차량별 운행일지
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedVehicleHistory, setSelectedVehicleHistory] =
    useState<Vehicle | null>(null);

  // 특정 차량 선택해서 예약 모달 열기
  const handleReserveWithCar = (carId: number) => {
    setForm((prev) => ({ ...prev, resource_id: carId }));
    setIsReserveModalOpen(true);
  };

  // 특정 차량 운행일지 모달 열기
  const handleOpenHistory = (vehicle: Vehicle) => {
    setSelectedVehicleHistory(vehicle);
    setIsHistoryModalOpen(true);
  };

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

  // // 반납 폼
  // const [checkoutForm, setCheckoutForm] = useState({
  //   mileage: "" as number | "",
  //   cleanup: true,
  //   parking: "교회 주차장",
  //   condition: "이상 없음",
  // });

  // // 출발 폼
  // const [checkinMileage, setCheckinMileage] = useState<number | "">("");

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
      // setShowCalendar(false); // 선택 후 닫기
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
              tabIndex={0}
              className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between h-44 relative overflow-hidden group transition outline-none"
            >
              {/* === [디자인 수정] 마우스 오버 오버레이 & 버튼 === */}
              <div className="absolute inset-0 z-20 bg-slate-900/40 backdrop-blur-[3px] opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-2 p-6">
                <button
                  onClick={() => handleReserveWithCar(v.id)}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold tracking-tight rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer"
                >
                  예약하기
                </button>
                <button
                  onClick={() => handleOpenHistory(v)}
                  className="w-full py-3 bg-white hover:bg-gray-50 text-slate-800 text-sm font-semibold tracking-tight rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer"
                >
                  운행기록
                </button>
              </div>

              {/* 상태 뱃지 */}
              <div
                className={`absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-xs font-bold z-10 ${
                  currentUsage
                    ? "bg-green-100 text-green-700 animate-pulse"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {currentUsage ? "운행중" : "대기중"}
              </div>

              {/* 차량 정보 */}
              <div className="z-10">
                <h3 className="text-[17px] font-semibold text-gray-900 tracking-tight leading-tight">
                  {v.name}
                </h3>
                <p className="text-[13px] text-gray-400 font-medium tracking-tight mt-0.5 font-mono">
                  {v.description}
                </p>
              </div>

              {/* 차량 이미지 */}
              {carImage ? (
                <img
                  src={carImage}
                  alt={v.name}
                  className={`absolute h-auto object-contain opacity-90 transition-transform duration-500 ease-out group-hover:scale-105
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
                <div className="absolute right-4 bottom-4 opacity-5 text-gray-900">
                  {/* 이미지가 없을 때 텍스트로 대체하거나 빈 공간 */}
                  <span className="text-4xl font-black">CAR</span>
                </div>
              )}

              {/* 하단 누적거리 정보 */}
              <div className="z-10 mt-auto">
                <p className="text-[10px] text-gray-400 font-medium mb-0.5 tracking-tight">
                  누적 주행거리
                </p>
                <div className="inline-flex items-baseline gap-0.5 bg-white/60 backdrop-blur-sm px-1.5 py-0.5 -ml-1.5 rounded-lg">
                  <span className="text-[18px] font-semibold text-slate-800 tracking-tight">
                    {v.current_mileage?.toLocaleString()}
                  </span>
                  <span className="text-[12px] font-medium text-gray-500">
                    km
                  </span>
                </div>
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
      <VehicleReserveModal
        isOpen={isReserveModalOpen}
        onClose={() => setIsReserveModalOpen(false)}
        form={form}
        logs={logs}
        setForm={setForm}
        vehicles={vehicles}
        handleReserve={handleReserve}
        handleRangeChange={handleRangeChange}
      />
      {/* --- 모달: 운행 일지 상세 및 체크인/아웃 --- */}
      <DetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        selectedLog={selectedLog}
        currentUser={currentUser}
        onRefresh={fetchData}
      />

      {/* --- 모달: 차량별 운행 기록 --- */}
      <HistoryModal
        isHistoryModalOpen={isHistoryModalOpen}
        setIsHistoryModalOpen={setIsHistoryModalOpen}
        selectedVehicleHistory={selectedVehicleHistory}
        logs={logs}
      />
    </div>
  );
}
