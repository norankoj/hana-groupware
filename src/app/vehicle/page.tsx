"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { showConfirm } from "@/utils/alert";
import "react-calendar/dist/Calendar.css";
import DetailModal from "@/components/vehicle/DetailModal";
import VehicleReserveModal from "@/components/vehicle/VehicleReserveModal";
import "@/styles/calendar.css";
import HistoryModal from "@/components/vehicle/HistoryModal";
import MaintenanceModal from "@/components/vehicle/MaintenanceModal";
import StatsSection from "@/components/vehicle/StatsSection";
import Select from "@/components/Select";

// --- [이미지 설정] 차량별 이미지 매핑 ---
const VEHICLE_IMAGES: Record<string, string> = {
  스타렉스: "/images/cars/starex.webp",
  스타리아: "/images/cars/staria.webp",
  스타리아HEV: "/images/cars/staria-hev.webp",
  마티즈: "/images/cars/matiz.webp",
  모닝: "/images/cars/morning.webp",
  쏘나타: "/images/cars/sonata.webp",
  봉고트럭: "/images/cars/bongo.png",
  카니발: "/images/cars/carnival.png",
};

type Vehicle = {
  id: number;
  name: string;
  description: string;
  current_mileage: number;
  color: string;
  insurance_info?: string;
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
  vehicle_status: "reserved" | "in_use" | "returned" | "noshow";
  checkin_photo_url?: string;
  checkout_photo_url?: string;
  checkin_exterior_urls?: string[];
  checkout_exterior_urls?: string[];
  cleanup_status?: boolean;
  parking_location?: string;
  vehicle_condition?: string;
  fuel_level_start?: number;
  fuel_level_end?: number;
  incident_type?: string;
  profiles?: { full_name: string; position: string };
  resources?: { name: string; description: string; insurance_info?: string };
};

const toTimePercent = (dt: Date) =>
  Math.min(100, Math.max(0, ((dt.getHours() * 60 + dt.getMinutes()) / 1440) * 100));

export default function VehicleReservationPage() {
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [logs, setLogs] = useState<VehicleLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentProfile, setCurrentProfile] = useState<{
    is_approver: boolean;
    role: string;
  } | null>(null);
  const [activeCardId, setActiveCardId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"log" | "stats">("log");
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [selectedVehicleMaintenance, setSelectedVehicleMaintenance] =
    useState<Vehicle | null>(null);

  // [신규] 모바일 전용 탭 (예약 vs 운행일지)
  const [mobileTab, setMobileTab] = useState<"reserve" | "log">("reserve");

  const [isReserveModalOpen, setIsReserveModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<VehicleLog | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedVehicleHistory, setSelectedVehicleHistory] =
    useState<Vehicle | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [myReservationsOnly, setMyReservationsOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const getNowTime = () => {
    const now = new Date();
    return format(now, "HH:mm");
  };
  const getTwoHoursLater = () => {
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000);
    return format(later, "HH:mm");
  };

  const [form, setForm] = useState({
    resource_id: 0,
    start_date: format(new Date(), "yyyy-MM-dd"),
    start_time: getNowTime(),
    end_date: format(new Date(), "yyyy-MM-dd"),
    end_time: getTwoHoursLater(),
    purpose: "",
    destination: "",
    driver_name: "",
    department: "",
  });

  const handleReserveWithCar = (carId: number) => {
    setForm((prev) => ({ ...prev, resource_id: carId }));
    setIsReserveModalOpen(true);
  };

  const handleCloseReserveModal = () => {
    setIsReserveModalOpen(false);
    setForm((prev) => ({
      ...prev,
      purpose: "",
      destination: "",
      department: "",
      start_date: format(new Date(), "yyyy-MM-dd"),
      end_date: format(new Date(), "yyyy-MM-dd"),
      start_time: getNowTime(),
      end_time: getTwoHoursLater(),
    }));
  };

  const handleCancelReservation = async (id: number) => {
    const ok = await showConfirm("예약을 취소하시겠습니까?");
    if (!ok) return;
    const { error } = await supabase
      .from("reservations")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("예약이 취소되었습니다.");
      setIsDetailModalOpen(false);
      fetchData();
    }
  };

  const handleOpenHistory = (vehicle: Vehicle) => {
    setSelectedVehicleHistory(vehicle);
    setIsHistoryModalOpen(true);
  };

  const autoExpireReservations = async () => {
    // 반납 예정 시간 + 3일 경과 후 노쇼 처리 (기록 입력 유예 기간)
    const expireThreshold = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await supabase
      .from("reservations")
      .update({ vehicle_status: "noshow" })
      .eq("vehicle_status", "reserved")
      .lt("end_at", expireThreshold);
  };

  const fetchData = async () => {
    await autoExpireReservations();
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      setCurrentUser(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, is_approver, role")
        .eq("id", user.id)
        .single();
      if (profile) {
        setForm((prev) => ({ ...prev, driver_name: profile.full_name }));
        setCurrentProfile({
          is_approver: profile.is_approver || false,
          role: profile.role || "user",
        });
      }
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
        resources:resource_id (name, description, insurance_info)
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

  const handleRangeChange = (value: any) => {
    if (Array.isArray(value) && value.length === 2) {
      const [start, end] = value;
      setForm((prev) => ({
        ...prev,
        start_date: format(start, "yyyy-MM-dd"),
        end_date: format(end, "yyyy-MM-dd"),
      }));
    }
  };

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
      if (log.vehicle_status === "returned") return false;
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
      setForm((prev) => ({
        ...prev,
        purpose: "",
        destination: "",
        department: "",
        start_date: format(new Date(), "yyyy-MM-dd"),
        end_date: format(new Date(), "yyyy-MM-dd"),
        start_time: "10:00",
        end_time: "12:00",
      }));
      fetchData();
    }
  };

  /* 정기 예약 생성 */
  const handleRecurringReserve = async ({
    days,
    startDate,
    endDate,
    startTime,
    endTime,
  }: {
    days: number[];
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
  }): Promise<void> => {
    if (!form.resource_id) { toast.error("차량을 선택해주세요."); return; }
    if (days.length === 0) { toast.error("반복 요일을 선택해주세요."); return; }
    if (!startDate || !endDate) { toast.error("반복 기간을 설정해주세요."); return; }
    if (startDate > endDate) { toast.error("종료일이 시작일보다 빠릅니다."); return; }
    if (!form.purpose || !form.destination || !form.driver_name || !form.department) {
      toast.error("모든 정보를 입력해주세요."); return;
    }

    // 선택 요일에 해당하는 날짜 목록 생성
    const entries: { start: Date; end: Date }[] = [];
    const cur = new Date(startDate);
    const last = new Date(endDate);
    while (cur <= last) {
      if (days.includes(cur.getDay())) {
        const start = new Date(`${format(cur, "yyyy-MM-dd")}T${startTime}`);
        const end = new Date(`${format(cur, "yyyy-MM-dd")}T${endTime}`);
        if (start < end) entries.push({ start, end });
      }
      cur.setDate(cur.getDate() + 1);
    }

    if (entries.length === 0) { toast.error("선택한 요일과 기간에 해당하는 날짜가 없습니다."); return; }

    // 겹치는 예약 제외
    const available = entries.filter(({ start, end }) =>
      !logs.some(
        (l) =>
          l.resource_id === form.resource_id &&
          l.vehicle_status !== "returned" &&
          start < new Date(l.end_at) &&
          end > new Date(l.start_at),
      ),
    );

    const skipped = entries.length - available.length;
    if (available.length === 0) { toast.error("모든 날짜가 이미 예약되어 있습니다."); return; }

    if (!(await showConfirm(
      `총 ${available.length}건 예약을 생성합니다.${skipped > 0 ? `\n(중복 ${skipped}건 제외)` : ""}\n계속하시겠습니까?`
    ))) return;

    const rows = available.map(({ start, end }) => ({
      resource_id: form.resource_id,
      user_id: currentUser,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      purpose: form.purpose,
      destination: form.destination,
      driver_name: form.driver_name,
      department: form.department,
      vehicle_status: "reserved",
    }));

    const { error } = await supabase.from("reservations").insert(rows);
    if (error) { toast.error(error.message); return; }

    toast.success(`${available.length}건 정기 예약이 완료되었습니다!`);
    setIsReserveModalOpen(false);
    fetchData();
  };

  // 1. 검색 및 상태 필터
  const filteredLogs = logs.filter((log) => {
    const matchesStatus =
      statusFilter === "all" || log.vehicle_status === statusFilter;
    const matchesSearch =
      log.driver_name.includes(searchTerm) ||
      log.resources?.name.includes(searchTerm) ||
      log.destination.includes(searchTerm);
    const matchesMine = !myReservationsOnly || log.user_id === currentUser;
    return matchesStatus && matchesSearch && matchesMine;
  });

  // 2. 이중 정렬 (1순위: 운행중>예약>반납 / 2순위: 현재 시간과 가장 가까운 순)
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    const order = { in_use: 1, reserved: 2, returned: 3, noshow: 4 };
    const statusA = order[a.vehicle_status as keyof typeof order] || 5;
    const statusB = order[b.vehicle_status as keyof typeof order] || 5;

    if (statusA !== statusB) return statusA - statusB;

    const nowTime = new Date().getTime();
    const diffA = Math.abs(new Date(a.start_at).getTime() - nowTime);
    const diffB = Math.abs(new Date(b.start_at).getTime() - nowTime);
    return diffA - diffB;
  });

  const totalPages = Math.ceil(sortedLogs.length / itemsPerPage);
  const currentLogs = sortedLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  return (
    <div className="w-full max-w-7xl mx-auto p-2 pb-20 space-y-6">
      <div className="md:hidden bg-slate-100 p-1.5 rounded-xl flex shadow-inner mb-2">
        <button
          onClick={() => setMobileTab("reserve")}
          className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${
            mobileTab === "reserve"
              ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200/50"
              : "text-slate-500"
          }`}
        >
          차량 예약하기
        </button>
        <button
          onClick={() => setMobileTab("log")}
          className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${
            mobileTab === "log"
              ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200/50"
              : "text-slate-500"
          }`}
        >
          차량 운행하기
        </button>
      </div>

      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className={`${mobileTab === "log" ? "hidden md:block" : "block"}`}>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            차량 운행 관리
          </h1>
          <p className="mt-1 text-sm text-gray-500 hidden md:block">
            차량 예약 및 운행 일지를 관리합니다.
          </p>
        </div>
        <button
          onClick={() => setIsReserveModalOpen(true)}
          className={`w-full md:w-auto items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 md:py-2.5 rounded-lg font-bold text-sm tracking-tight transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 cursor-pointer ${
            mobileTab === "log" ? "hidden md:flex" : "flex"
          }`}
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

      {/* --- 차량 대시보드 (카드) --- */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6 ${
          mobileTab === "log" ? "hidden md:grid" : "grid"
        }`}
      >
        {vehicles.map((v) => {
          const currentUsage = logs.find(
            (l) => l.resource_id === v.id && l.vehicle_status === "in_use",
          );
          const carImage = VEHICLE_IMAGES[v.name];
          const isActive = activeCardId === v.id;
          return (
            <div
              key={v.id}
              onClick={() => setActiveCardId(isActive ? null : v.id)}
              onMouseLeave={() => setActiveCardId(null)}
              tabIndex={0}
              className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between h-44 relative overflow-hidden group transition outline-none"
            >
              <div
                className={`absolute inset-0 z-20 bg-slate-900/40 backdrop-blur-[3px] transition-opacity duration-300 flex flex-col items-center justify-center gap-2 p-4
                ${
                  isActive
                    ? "opacity-100 visible"
                    : "opacity-0 invisible group-hover:opacity-100 group-hover:visible"
                }
                `}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReserveWithCar(v.id);
                    setActiveCardId(null);
                  }}
                  className="w-full py-3 bg-blue-700 hover:bg-blue-600 text-white text-sm font-bold tracking-tight rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer"
                >
                  예약하기
                </button>
                <div className="w-full flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenHistory(v);
                      setActiveCardId(null);
                    }}
                    className="flex-1 py-2.5 bg-white hover:bg-gray-50 text-slate-800 text-sm font-bold tracking-tight rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer"
                  >
                    운행기록
                  </button>
                  {(currentProfile?.is_approver ||
                    currentProfile?.role === "admin") && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedVehicleMaintenance(v);
                        setIsMaintenanceModalOpen(true);
                        setActiveCardId(null);
                      }}
                      className="flex-1 py-2.5 bg-white hover:bg-gray-50 text-slate-800 text-sm font-bold tracking-tight rounded-xl shadow-lg transition-all active:scale-[0.98] cursor-pointer"
                    >
                      정비이력
                    </button>
                  )}
                </div>
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

              <div className="z-10">
                <h3 className="text-[17px] font-semibold text-gray-900 tracking-tight leading-tight">
                  {v.name}
                </h3>
                <p className="text-[13px] text-gray-400 font-medium tracking-tight mt-0.5 font-mono">
                  {v.description}
                </p>
              </div>

              {carImage ? (
                <Image
                  src={carImage}
                  alt={v.name}
                  width={400}
                  height={250}
                  className={`absolute h-auto object-contain opacity-90 transition-transform duration-500 ease-out group-hover:scale-105
                     ${
                       v.name.includes("스타리아")
                         ? "w-36 -right-8 -bottom-0 scale-125 origin-bottom-right group-hover:scale-[1.35]"
                         : v.name.includes("쏘나타")
                           ? "w-38 -right-4 -bottom-1 group-hover:scale-110"
                           : "w-36 -right-4 bottom-1 group-hover:scale-110"
                     }
                  `}
                />
              ) : (
                <div className="absolute right-4 bottom-4 opacity-5 text-gray-900">
                  <span className="text-4xl font-black">CAR</span>
                </div>
              )}

              <div className="z-10 mt-auto">
                <p className="text-[10px] text-gray-400 font-medium mb-0.5 tracking-tight">
                  누적 주행거리
                </p>
                <div className="inline-flex items-baseline gap-0.5 bg-white/60 backdrop-blur-sm px-1.5 py-0.5 -ml-1.5 rounded-lg">
                  <span className="text-[18px] font-semibold text-slate-800 tracking-tight">
                    {(v.current_mileage || 0).toLocaleString()}
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

      {/* --- 운행 일지 / 통계 탭 (PC 전용) --- */}
      {(currentProfile?.is_approver || currentProfile?.role === "admin") && (
        <div
          className={`hidden md:flex gap-1 bg-gray-100 p-1 rounded-xl w-fit ${
            mobileTab === "reserve" ? "hidden" : ""
          }`}
        >
          <button
            onClick={() => setActiveTab("log")}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${
              activeTab === "log"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500"
            }`}
          >
            운행 일지
          </button>
          <button
            onClick={() => setActiveTab("stats")}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${
              activeTab === "stats"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500"
            }`}
          >
            월별 통계
          </button>
        </div>
      )}

      {activeTab === "stats" &&
      (currentProfile?.is_approver || currentProfile?.role === "admin") ? (
        <StatsSection logs={logs} vehicles={vehicles} />
      ) : (
      <div
        className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible flex-col h-auto md:h-[600px] ${
          mobileTab === "reserve" ? "hidden md:flex" : "flex"
        }`}
      >
        {/* 검색 및 필터 헤더 */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row gap-3 justify-between items-center shrink-0">
          <div className="hidden md:flex items-center gap-2 font-bold text-gray-700">
            <span>운행 일지</span>
            <span className="text-xs text-gray-400 font-normal">
              총 {filteredLogs.length}건
            </span>
          </div>
          <div className="flex gap-2 w-full md:w-auto items-center">
            <div className="w-32 shrink-0">
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "all", label: "전체 상태" },
                  { value: "reserved", label: "예약중" },
                  { value: "in_use", label: "운행중" },
                  { value: "returned", label: "반납완료" },
                  { value: "noshow", label: "노쇼" },
                ]}
                className="w-full h-[42px] px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg"
              />
            </div>
            {/* 검색창 — PC 전용 */}
            <input
              type="text"
              placeholder="차량명, 운전자 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="hidden md:block px-3 py-2 border border-gray-300 rounded-lg text-sm w-full md:w-60 focus:ring-blue-500 focus:border-blue-500 h-[42px] bg-white outline-none transition"
            />
            <button
              onClick={() => setMyReservationsOnly((v) => !v)}
              className={`px-3 py-2 rounded-lg text-sm font-bold border transition shrink-0 h-[42px] ${
                myReservationsOnly
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              내 예약
            </button>
            {/* 엑셀 다운로드 — PC 전용 */}
            <button
              onClick={() => {
                const rows = sortedLogs.map((l) => ({
                  상태:
                    l.vehicle_status === "in_use"
                      ? "운행중"
                      : l.vehicle_status === "returned"
                        ? "반납완료"
                        : l.vehicle_status === "noshow"
                          ? "노쇼"
                          : "예약",
                  차량: l.resources?.name ?? "",
                  운전자: l.driver_name,
                  부서: l.department ?? "",
                  목적지: l.destination,
                  운행목적: l.purpose,
                  시작: format(new Date(l.start_at), "yyyy-MM-dd HH:mm"),
                  종료: format(new Date(l.end_at), "yyyy-MM-dd HH:mm"),
                  주행거리:
                    l.start_mileage != null && l.end_mileage != null
                      ? l.end_mileage - l.start_mileage
                      : "",
                }));
                const header = Object.keys(rows[0] ?? {}).join(",");
                const csv = [
                  header,
                  ...rows.map((r) =>
                    Object.values(r)
                      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                      .join(","),
                  ),
                ].join("\n");
                const blob = new Blob(["\uFEFF" + csv], {
                  type: "text/csv;charset=utf-8;",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `운행일지_${format(new Date(), "yyyyMMdd")}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border border-gray-300 text-gray-600 hover:bg-gray-50 transition shrink-0 h-[42px]"
              title="엑셀 다운로드"
            >
              <svg
                className="w-4 h-4 text-green-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span className="hidden lg:inline">엑셀</span>
            </button>
          </div>
        </div>

        {/* 목록 (스크롤 영역) */}
        <div className="flex-1 overflow-visible md:overflow-auto custom-scrollbar relative">
          {/* --- 1. 데스크톱 테이블 뷰 (md 이상에서만 보임) --- */}
          <table className="hidden md:table min-w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3 bg-gray-50">상태</th>
                <th className="px-4 py-3 bg-gray-50">차량</th>
                <th className="px-4 py-3 bg-gray-50">사용시간</th>
                <th className="px-4 py-3 bg-gray-50">사용부서</th>
                <th className="px-4 py-3 bg-gray-50">목적지/용도</th>
                <th className="px-4 py-3 bg-gray-50">운전자</th>
                <th className="px-4 py-3 bg-gray-50 text-right">주행거리</th>
                <th className="px-4 py-3 bg-gray-50 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {currentLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50/50 transition">
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        log.vehicle_status === "in_use"
                          ? "bg-green-100 text-green-700"
                          : log.vehicle_status === "returned"
                            ? "bg-gray-100 text-gray-500"
                            : log.vehicle_status === "noshow"
                              ? "bg-orange-100 text-orange-600"
                              : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {log.vehicle_status === "in_use"
                        ? "운행중"
                        : log.vehicle_status === "returned"
                          ? "반납"
                          : log.vehicle_status === "noshow"
                            ? "노쇼"
                            : "예약"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {log.resources?.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div>{format(new Date(log.start_at), "MM.dd HH:mm")}</div>
                    <div className="text-xs text-gray-400">
                      ~ {format(new Date(log.end_at), "MM.dd HH:mm")}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{log.department}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">
                      {log.destination}
                    </div>
                    <div className="text-xs text-gray-500 truncate max-w-[150px]">
                      {log.purpose}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{log.driver_name}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {log.end_mileage && log.start_mileage ? (
                      <span className="font-bold text-gray-900">
                        {(log.end_mileage - log.start_mileage).toLocaleString()}{" "}
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
                      className="text-slate-600 border border-slate-300 px-3 py-1 rounded hover:bg-slate-50 text-xs font-bold transition"
                    >
                      상세
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* --- 2. 모바일 카드 뷰 (md 미만에서만 블록으로 보임) --- */}
          <div className="block md:hidden flex-col gap-3 p-3 space-y-3 h-auto">
            {currentLogs.map((log) => (
              <div
                key={log.id}
                className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col gap-3"
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-bold ${
                        log.vehicle_status === "in_use"
                          ? "bg-green-100 text-green-700"
                          : log.vehicle_status === "returned"
                            ? "bg-gray-100 text-gray-500"
                            : log.vehicle_status === "noshow"
                              ? "bg-orange-100 text-orange-600"
                              : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {log.vehicle_status === "in_use"
                        ? "운행중"
                        : log.vehicle_status === "returned"
                          ? "반납"
                          : log.vehicle_status === "noshow"
                            ? "노쇼"
                            : "예약"}
                    </span>
                    <span className="font-bold text-gray-900 text-lg">
                      {log.resources?.name}
                    </span>
                  </div>
                </div>

                <div className="text-sm text-gray-600 space-y-2 mt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-xs">운행시간</span>
                    <span className="font-mono text-xs font-medium">
                      {format(new Date(log.start_at), "MM.dd HH:mm")} ~{" "}
                      {format(new Date(log.end_at), "HH:mm")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-xs">운전자</span>
                    <span className="font-medium text-gray-800">
                      {log.driver_name}{" "}
                      <span className="text-gray-400 text-xs font-normal">
                        ({log.department})
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-xs">주행거리</span>
                    <span className="font-mono font-bold text-gray-800">
                      {log.end_mileage && log.start_mileage
                        ? `${(log.end_mileage - log.start_mileage).toLocaleString()} km`
                        : "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-gray-50 mt-1">
                    <span className="text-gray-400 text-xs w-16 shrink-0">
                      목적지
                    </span>
                    <span className="truncate text-right font-medium text-gray-800">
                      {log.destination}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedLog(log);
                    setIsDetailModalOpen(true);
                  }}
                  className="mt-3 w-full py-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg text-sm font-bold text-slate-700 transition shadow-sm"
                >
                  운행 상세 보기
                </button>
              </div>
            ))}

            {currentLogs.length === 0 && (
              <div className="text-center py-10 text-gray-400 text-sm">
                조건에 맞는 운행 기록이 없습니다.
              </div>
            )}
          </div>
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex justify-center py-4 border-t border-gray-200 shrink-0 bg-white">
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded border border-gray-300 text-gray-600 disabled:opacity-50"
              >
                이전
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 rounded border ${
                      currentPage === page
                        ? "bg-slate-800 text-white border-slate-800"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {page}
                  </button>
                ),
              )}
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-3 py-1 rounded border border-gray-300 text-gray-600 disabled:opacity-50"
              >
                다음
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      <VehicleReserveModal
        isOpen={isReserveModalOpen}
        onClose={handleCloseReserveModal}
        form={form}
        logs={logs}
        setForm={setForm}
        vehicles={vehicles}
        handleReserve={handleReserve}
        handleRecurringReserve={handleRecurringReserve}
        handleRangeChange={handleRangeChange}
      />
      <DetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        selectedLog={selectedLog}
        currentUser={currentUser}
        currentProfile={currentProfile}
        onRefresh={fetchData}
        onCancel={handleCancelReservation}
      />
      <MaintenanceModal
        isOpen={isMaintenanceModalOpen}
        onClose={() => setIsMaintenanceModalOpen(false)}
        vehicle={selectedVehicleMaintenance}
      />
      <HistoryModal
        isHistoryModalOpen={isHistoryModalOpen}
        setIsHistoryModalOpen={setIsHistoryModalOpen}
        selectedVehicleHistory={selectedVehicleHistory}
        logs={logs}
      />
    </div>
  );
}
