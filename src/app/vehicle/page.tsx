"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
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
import MaintenanceModal from "@/components/vehicle/MaintenanceModal";
import StatsSection from "@/components/vehicle/StatsSection";
import ScheduleTab from "@/components/vehicle/ScheduleTab";
import Select from "@/components/Select";
import Modal from "@/components/Modal";

// --- [이미지 설정] 차량별 이미지 매핑 ---
const VEHICLE_IMAGES: Record<string, string> = {
  스타렉스: "/images/cars/starex.webp",
  스타리아: "/images/cars/staria.webp",
  스타리아HEV: "/images/cars/staria-hev.webp",
  마티즈: "/images/cars/matiz.webp",
  모닝: "/images/cars/morning.webp",
  쏘나타: "/images/cars/sonata.png",
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
  oil_changed_km?: number;
  oil_changed_date?: string;
  is_rented?: boolean;
  renter_name?: string;
};

type VehicleLog = {
  id: number;
  resource_id: number;
  user_id: string;
  driver_user_id?: string;
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
  resources?: {
    name: string;
    description: string;
    insurance_info?: string;
    fuel_segments?: number;
  };
};

type StaffMember = {
  id: string;
  full_name: string;
  position: string;
};

const toTimePercent = (dt: Date) =>
  Math.min(
    100,
    Math.max(0, ((dt.getHours() * 60 + dt.getMinutes()) / 1440) * 100),
  );

export default function VehicleReservationPage() {
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [logs, setLogs] = useState<VehicleLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [currentProfile, setCurrentProfile] = useState<{
    is_approver: boolean;
    role: string;
    is_vehicle_notify: boolean;
    full_name: string;
  } | null>(null);
  const [activeCardId, setActiveCardId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"log" | "stats" | "schedule">(
    "log",
  );
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [selectedVehicleMaintenance, setSelectedVehicleMaintenance] =
    useState<Vehicle | null>(null);
  const [rentalModalOpen, setRentalModalOpen] = useState(false);
  const [rentalVehicle, setRentalVehicle] = useState<Vehicle | null>(null);
  const [rentalName, setRentalName] = useState("");

  // [신규] 모바일 전용 탭 (예약 vs 운행일지)
  const [mobileTab, setMobileTab] = useState<"reserve" | "log">("reserve");
  // PC 하단 행 오프셋 (상단 4개 고정, 하단은 1칸씩 슬라이드)
  const [bottomRowOffset, setBottomRowOffset] = useState(0);

  const [isReserveModalOpen, setIsReserveModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<VehicleLog | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedVehicleHistory, setSelectedVehicleHistory] =
    useState<Vehicle | null>(null);

  const [logPopover, setLogPopover] = useState<{
    log: VehicleLog;
    x: number;
    y: number;
  } | null>(null);

  // 스크롤 시 팝오버 자동 닫기
  useEffect(() => {
    if (!logPopover) return;
    const close = () => setLogPopover(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [logPopover]);

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
    driver_user_id: "",
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
    const res = await fetch("/api/vehicle/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: id,
        updates: { status: "cancelled" },
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error || "취소 실패");
    } else {
      toast.success("예약이 취소되었습니다.");
      setIsDetailModalOpen(false);
      fetchData();
    }
  };

  const handleOpenHistory = (vehicle: Vehicle) => {
    setSelectedVehicleHistory(vehicle);
    setIsHistoryModalOpen(true);
  };

  const handleOpenRentalModal = (vehicle: Vehicle) => {
    setRentalVehicle(vehicle);
    setRentalName(vehicle.renter_name || "");
    setRentalModalOpen(true);
  };

  const handleSaveRental = async () => {
    if (!rentalVehicle) return;
    const isSettingRental = !rentalVehicle.is_rented;
    if (isSettingRental && !rentalName.trim()) {
      return toast.error("대여자 이름을 입력해주세요.");
    }
    const { error } = await supabase
      .from("resources")
      .update({
        is_rented: isSettingRental,
        renter_name: isSettingRental ? rentalName.trim() : null,
      })
      .eq("id", rentalVehicle.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(
        isSettingRental
          ? "대여 설정이 완료되었습니다."
          : "대여가 해제되었습니다.",
      );
      setRentalModalOpen(false);
      fetchData();
    }
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
        .select("full_name, is_approver, role, is_vehicle_notify")
        .eq("id", user.id)
        .single();
      if (profile) {
        setForm((prev) => ({
          ...prev,
          driver_name: profile.full_name,
          driver_user_id: user.id,
        }));
        setCurrentProfile({
          is_approver: profile.is_approver || false,
          role: profile.role || "user",
          full_name: profile.full_name || "",
          is_vehicle_notify: profile.is_vehicle_notify || false,
        });
      }
    }

    // staffList 로드
    supabase
      .from("profiles")
      .select("id, full_name, position")
      .neq("status", "inactive")
      .order("full_name")
      .then(({ data }) => {
        if (data) setStaffList(data as StaffMember[]);
      });

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

    const { data: lData, error: lError } = await supabase
      .from("reservations")
      .select(
        `
        *,
        profiles:user_id (full_name, position),
        resources:resource_id (name, description, insurance_info, fuel_segments)
      `,
      )
      .in("resource_id", vData?.map((v) => v.id) || [])
      .neq("status", "cancelled")
      .order("start_at", { ascending: false });

    if (lError) {
      console.error("운행일지 쿼리 오류:", lError.message);
      toast.error("운행일지를 불러오지 못했습니다: " + lError.message);
    }
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

    const targetVehicle = vehicles.find((v) => v.id === form.resource_id);
    if (targetVehicle?.is_rented) {
      return toast.error(
        `${targetVehicle.name}은(는) 현재 대여 중입니다. 예약이 불가합니다.`,
      );
    }

    if (!(await showConfirm("차량을 예약하시겠습니까?"))) return;

    const reminderAt = new Date(endAt.getTime() - 20 * 60 * 1000);
    const baseInsert = {
      resource_id: form.resource_id,
      user_id: currentUser,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      purpose: form.purpose,
      destination: form.destination,
      driver_name: form.driver_name,
      department: form.department,
      vehicle_status: "reserved",
      reminder_at: reminderAt.toISOString(),
      reminder_sent: false,
    };

    let insertResult = await supabase.from("reservations").insert({
      ...baseInsert,
      ...(form.driver_user_id ? { driver_user_id: form.driver_user_id } : {}),
    });

    // driver_user_id 컬럼 없을 경우 fallback
    if (insertResult.error && form.driver_user_id) {
      insertResult = await supabase.from("reservations").insert(baseInsert);
    }

    const error = insertResult.error;
    if (error) toast.error(error.message);
    else {
      const vehicleName =
        vehicles.find((v) => v.id === form.resource_id)?.name ?? "차량";
      const reserverName = form.driver_name;
      const reserverDept = form.department;
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
      // 차량 알림 수신자(is_vehicle_notify=true)에게 예약 알림 전송
      supabase
        .from("profiles")
        .select("id")
        .eq("is_vehicle_notify", true)
        .then(({ data: managers }) => {
          const ids = (managers ?? [])
            .map((m: any) => m.id as string)
            .filter((id) => id !== currentUser);
          if (ids.length > 0) {
            fetch("/api/push/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userIds: ids,
                title: "🚗 차량 예약 알림",
                body: `${reserverName}(${reserverDept})님이 ${vehicleName}을(를) 예약했습니다.`,
                url: "/vehicle",
              }),
            }).catch(() => {});
          }
        });
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
    if (!form.resource_id) {
      toast.error("차량을 선택해주세요.");
      return;
    }
    const recurringTargetVehicle = vehicles.find(
      (v) => v.id === form.resource_id,
    );
    if (recurringTargetVehicle?.is_rented) {
      toast.error(`${recurringTargetVehicle.name}은(는) 현재 대여 중입니다.`);
      return;
    }
    if (days.length === 0) {
      toast.error("반복 요일을 선택해주세요.");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("반복 기간을 설정해주세요.");
      return;
    }
    if (startDate > endDate) {
      toast.error("종료일이 시작일보다 빠릅니다.");
      return;
    }
    if (
      !form.purpose ||
      !form.destination ||
      !form.driver_name ||
      !form.department
    ) {
      toast.error("모든 정보를 입력해주세요.");
      return;
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

    if (entries.length === 0) {
      toast.error("선택한 요일과 기간에 해당하는 날짜가 없습니다.");
      return;
    }

    // 겹치는 예약 제외
    const available = entries.filter(
      ({ start, end }) =>
        !logs.some(
          (l) =>
            l.resource_id === form.resource_id &&
            l.vehicle_status !== "returned" &&
            start < new Date(l.end_at) &&
            end > new Date(l.start_at),
        ),
    );

    const skipped = entries.length - available.length;
    if (available.length === 0) {
      toast.error("모든 날짜가 이미 예약되어 있습니다.");
      return;
    }

    if (
      !(await showConfirm(
        `총 ${available.length}건 예약을 생성합니다.${skipped > 0 ? `\n(중복 ${skipped}건 제외)` : ""}\n계속하시겠습니까?`,
      ))
    )
      return;

    const baseRows = available.map(({ start, end }) => ({
      resource_id: form.resource_id,
      user_id: currentUser,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      purpose: form.purpose,
      destination: form.destination,
      driver_name: form.driver_name,
      department: form.department,
      vehicle_status: "reserved",
      reminder_at: new Date(end.getTime() - 20 * 60 * 1000).toISOString(),
      reminder_sent: false,
    }));

    const rows = form.driver_user_id
      ? baseRows.map((r) => ({ ...r, driver_user_id: form.driver_user_id }))
      : baseRows;

    let recurResult = await supabase.from("reservations").insert(rows);
    // driver_user_id 컬럼 없을 경우 fallback
    if (recurResult.error && form.driver_user_id) {
      recurResult = await supabase.from("reservations").insert(baseRows);
    }
    const error = recurResult.error;
    if (error) {
      toast.error(error.message);
      return;
    }

    const recurVehicleName =
      vehicles.find((v) => v.id === form.resource_id)?.name ?? "차량";
    const recurReserverName = form.driver_name;
    const recurReserverDept = form.department;
    const recurCount = available.length;
    toast.success(`${recurCount}건 정기 예약이 완료되었습니다!`);
    setIsReserveModalOpen(false);
    fetchData();
    // 차량 알림 수신자(is_vehicle_notify=true)에게 정기 예약 알림 전송
    supabase
      .from("profiles")
      .select("id")
      .eq("is_vehicle_notify", true)
      .then(({ data: managers }) => {
        const ids = (managers ?? [])
          .map((m: any) => m.id as string)
          .filter((id) => id !== currentUser);
        if (ids.length > 0) {
          fetch("/api/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userIds: ids,
              title: "🚗 정기 차량 예약 알림",
              body: `${recurReserverName}(${recurReserverDept})님이 ${recurVehicleName}을(를) ${recurCount}건 정기 예약했습니다.`,
              url: "/vehicle",
            }),
          }).catch(() => {});
        }
      });
  };

  // 1. 검색 및 상태 필터
  const filteredLogs = logs.filter((log) => {
    const matchesStatus =
      statusFilter === "all" || log.vehicle_status === statusFilter;
    const matchesSearch =
      log.driver_name.includes(searchTerm) ||
      log.resources?.name.includes(searchTerm) ||
      log.destination.includes(searchTerm);
    const matchesMine =
      !myReservationsOnly ||
      log.user_id === currentUser ||
      log.driver_user_id === currentUser;
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

  // ── 차량 카드 렌더 헬퍼 (모바일 그리드 · PC 캐러셀 공용) ──────────────────
  const renderVehicleCard = (v: Vehicle) => {
    const currentUsage = logs.find(
      (l) => l.resource_id === v.id && l.vehicle_status === "in_use",
    );
    const carImage = VEHICLE_IMAGES[v.name];
    const isActive = activeCardId === v.id;

    // 엔진오일 교환 상태
    const oilRemaining =
      v.oil_changed_km && v.current_mileage
        ? v.oil_changed_km + 7000 - v.current_mileage
        : null;
    const oilOverdue = oilRemaining !== null && oilRemaining <= 0;
    const oilSoon =
      oilRemaining !== null && oilRemaining > 0 && oilRemaining <= 1000;

    // 최근 반납 기준 주유량
    const lastReturnedLog = logs
      .filter(
        (l) =>
          l.resource_id === v.id &&
          l.vehicle_status === "returned" &&
          l.fuel_level_end != null,
      )
      .sort(
        (a, b) =>
          new Date(b.end_at).getTime() - new Date(a.end_at).getTime(),
      )[0];
    const lastFuel = lastReturnedLog?.fuel_level_end ?? null;
    const fuelLabel = (val: number) =>
      val === 0 ? "E" : val === 100 ? "F" : `${val}%`;
    const fuelColor = (val: number) =>
      val <= 25
        ? "text-red-500"
        : val <= 50
          ? "text-amber-500"
          : "text-emerald-600";

    return (
      <div
        key={v.id}
        onClick={() => setActiveCardId(isActive ? null : v.id)}
        onMouseLeave={() => setActiveCardId(null)}
        tabIndex={0}
        className={`bg-white p-5 rounded-xl shadow-sm flex flex-col justify-between h-44 relative overflow-hidden group transition outline-none border ${
          v.is_rented
            ? "border-indigo-300"
            : oilOverdue
              ? "border-red-300"
              : oilSoon
                ? "border-amber-300"
                : "border-gray-200"
        }`}
      >
        <div
          className={`absolute inset-0 z-20 bg-slate-900/60 backdrop-blur-[4px] transition-opacity duration-300 flex flex-col justify-center gap-2.5 p-4
          ${
            isActive
              ? "opacity-100 visible"
              : "opacity-0 invisible group-hover:opacity-100 group-hover:visible"
          }
          `}
        >
          {/* Primary: 예약하기 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!v.is_rented) {
                handleReserveWithCar(v.id);
                setActiveCardId(null);
              }
            }}
            disabled={!!v.is_rented}
            className={`w-full py-3.5 text-sm font-bold rounded-xl transition-all active:scale-[0.98] ${
              v.is_rented
                ? "bg-white/10 text-white/40 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-lg shadow-blue-900/40"
            }`}
          >
            {v.is_rented
              ? `대여중${v.renter_name ? ` · ${v.renter_name}` : ""}`
              : "예약하기"}
          </button>

          {/* Secondary: 기록 / 정비 / 대여(admin) */}
          <div className="flex gap-1.5 w-full">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenHistory(v);
                setActiveCardId(null);
              }}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 bg-white hover:bg-gray-100 text-slate-700 rounded-xl transition-all cursor-pointer shadow-sm"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                />
              </svg>
              <span className="text-[10px] font-bold leading-none">기록</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedVehicleMaintenance(v);
                setIsMaintenanceModalOpen(true);
                setActiveCardId(null);
              }}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 bg-white hover:bg-gray-100 text-slate-700 rounded-xl transition-all cursor-pointer shadow-sm"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span className="text-[10px] font-bold leading-none">정비</span>
            </button>

            {currentProfile?.is_vehicle_notify && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenRentalModal(v);
                  setActiveCardId(null);
                }}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm ${
                  v.is_rented
                    ? "bg-orange-500 hover:bg-orange-400 text-white"
                    : "bg-white hover:bg-gray-100 text-slate-700"
                }`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
                  />
                </svg>
                <span className="text-[10px] font-bold leading-none">
                  {v.is_rented ? "해제" : "대여"}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* 상태 뱃지 */}
        <div
          className={`absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-xs font-bold z-10 ${
            v.is_rented
              ? "bg-indigo-100 text-indigo-700"
              : currentUsage
                ? "bg-green-100 text-green-700 animate-pulse"
                : "bg-gray-100 text-gray-500"
          }`}
        >
          {v.is_rented ? (
            <div className="text-right">
              <div>대여중</div>
              {v.renter_name && (
                <div className="text-[9px] font-medium opacity-70">
                  {v.renter_name}
                </div>
              )}
            </div>
          ) : currentUsage ? (
            "운행중"
          ) : (
            "대기중"
          )}
        </div>

        <div className="z-10">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[17px] font-semibold text-gray-900 tracking-tight leading-tight">
              {v.name}
            </h3>
            {(oilOverdue || oilSoon) && (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${oilOverdue ? "bg-red-400" : "bg-amber-400"}`}
                  />
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${oilOverdue ? "bg-red-500" : "bg-amber-500"}`}
                  />
                </span>
                <span
                  className={`text-[10px] font-bold ${oilOverdue ? "text-red-500" : "text-amber-500"}`}
                >
                  {oilOverdue
                    ? "오일 교환 필요"
                    : `오일 교환 ${oilRemaining!.toLocaleString()}km 전`}
                </span>
              </div>
            )}
          </div>
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
                     ? "w-44 -right-6 -bottom-0 group-hover:scale-110"
                     : "w-36 -right-4 bottom-1 group-hover:scale-110"
               }
            `}
          />
        ) : (
          <div className="absolute right-4 bottom-4 opacity-5 text-gray-900">
            <span className="text-4xl font-black">CAR</span>
          </div>
        )}

        {/* 누적 주행거리 + 주유량 */}
        <div className="z-10 mt-auto flex items-end gap-3">
          {/* 누적 주행거리 */}
          <div>
            <p className="text-[10px] text-gray-400 font-medium mb-0.5 tracking-tight">
              누적 주행거리
            </p>

            <div className="inline-flex items-baseline gap-0.5 bg-white/60 backdrop-blur-sm px-1.5 py-0.5 -ml-1.5 rounded-lg">
              <span className="text-[18px] font-semibold text-slate-800 tracking-tight">
                {(v.current_mileage || 0).toLocaleString()}
              </span>
              <span className="text-[12px] font-medium text-gray-500">km</span>
              {/* 최근 반납 주유량 (누적 주행거리가 0이면 숨김) */}
              {v.current_mileage > 0 && lastFuel != null && (
                <div className="pb-[1px] ">
                  <div
                    className={`inline-flex items-center gap-0.5 bg-white/60 backdrop-blur-sm px-1.5 py-0.5 rounded-lg text-[13px] font-bold ${fuelColor(lastFuel)}`}
                  >
                    {fuelLabel(lastFuel)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };
  // ────────────────────────────────────────────────────────────────────────────

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

      {/* --- 차량 대시보드 (카드) — 모바일: 전체 스크롤 그리드 --- */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 md:hidden ${
          mobileTab === "log" ? "hidden" : "grid"
        }`}
      >
        {vehicles.map((v) => renderVehicleCard(v))}
      </div>

      {/* --- 차량 대시보드 (카드) — PC: 상단 4개 고정 + 하단 행 슬라이드 --- */}
      {(() => {
        const topVehicles = vehicles.slice(0, 4);
        // 하단: 4개 창을 1칸씩 슬라이드 (vehicles[4+offset] ~ [4+offset+3])
        const maxOffset = Math.max(0, vehicles.length - 8);
        const bottomVehicles = vehicles.slice(
          4 + bottomRowOffset,
          4 + bottomRowOffset + 4,
        );
        const canPrev = bottomRowOffset > 0;
        const canNext = bottomRowOffset < maxOffset;
        return (
          <div className={`hidden md:block mb-6 ${mobileTab === "log" ? "md:hidden" : ""}`}>
            {/* 상단 행: 항상 고정 */}
            <div className="grid grid-cols-4 gap-4">
              {topVehicles.map((v) => renderVehicleCard(v))}
            </div>

            {/* 하단 행: 5번째 차량부터, 1칸씩 슬라이드 */}
            {vehicles.length > 4 && (
              <div className="mt-4 relative">
                <div className="grid grid-cols-4 gap-4">
                  {bottomVehicles.map((v) => renderVehicleCard(v))}
                </div>
                {maxOffset > 0 && (
                  <>
                    <button
                      onClick={() => setBottomRowOffset((o) => Math.max(0, o - 1))}
                      disabled={!canPrev}
                      className="absolute -left-7 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-white shadow-lg disabled:opacity-20 disabled:cursor-not-allowed transition"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setBottomRowOffset((o) => Math.min(maxOffset, o + 1))}
                      disabled={!canNext}
                      className="absolute -right-7 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-white shadow-lg disabled:opacity-20 disabled:cursor-not-allowed transition"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* --- 운행 일지 / 통계 / 스케줄 탭 (PC 전용) --- */}
      <div className="hidden md:flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
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
        {(currentProfile?.is_approver || currentProfile?.role === "admin") && (
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
        )}
        <button
          onClick={() => setActiveTab("schedule")}
          className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${
            activeTab === "schedule"
              ? "bg-white text-blue-600 shadow-sm"
              : "text-gray-500"
          }`}
        >
          스케줄
        </button>
      </div>

      {/* 통계 탭 — PC 전용 */}
      {activeTab === "stats" &&
        (currentProfile?.is_approver || currentProfile?.role === "admin") && (
          <div className="hidden md:block">
            <StatsSection logs={logs} vehicles={vehicles} />
          </div>
        )}

      {/* 스케줄 탭 — PC 전용 */}
      {activeTab === "schedule" && (
        <div className="hidden md:block">
          <ScheduleTab
            vehicles={vehicles}
            logs={logs}
            onSelectLog={(log) => {
              setSelectedLog(log);
              setIsDetailModalOpen(true);
            }}
          />
        </div>
      )}

      {/* 운행 일지 — 모바일 항상 표시, PC는 log 탭일 때만 표시 */}
      {
        <div
          className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible flex-col h-auto md:h-[600px] ${
            mobileTab === "reserve"
              ? `hidden ${activeTab === "log" ? "md:flex" : "md:hidden"}`
              : `flex ${activeTab === "log" ? "md:flex" : "md:hidden"}`
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
                  <tr
                    key={log.id}
                    className="hover:bg-blue-50/40 transition cursor-pointer"
                    onClick={(e) =>
                      setLogPopover({ log, x: e.clientX, y: e.clientY })
                    }
                  >
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
                    <td
                      className="px-4 py-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          setSelectedLog(log);
                          setIsDetailModalOpen(true);
                        }}
                        className="text-slate-600 border border-slate-300 px-3 py-1 rounded hover:bg-slate-50 text-xs font-bold transition"
                      >
                        관리
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
      }

      {/* 대여 설정 모달 — createPortal 기반 Modal 사용 (z-index 이슈 해결) */}
      <Modal
        isOpen={rentalModalOpen && !!rentalVehicle}
        onClose={() => setRentalModalOpen(false)}
        title={rentalVehicle?.is_rented ? "대여 해제" : "대여 설정"}
        className="!max-w-[420px]"
        footer={
          rentalVehicle ? (
            <div className="flex gap-2 w-full">
              <button
                onClick={() => setRentalModalOpen(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-bold transition cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleSaveRental}
                className={`flex-1 py-2.5 text-white rounded-lg text-sm font-bold transition cursor-pointer ${
                  rentalVehicle.is_rented
                    ? "bg-orange-500 hover:bg-orange-600"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {rentalVehicle.is_rented ? "대여 해제" : "대여 설정"}
              </button>
            </div>
          ) : undefined
        }
      >
        {rentalVehicle && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 font-medium">
              {rentalVehicle.name}
            </p>
            {!rentalVehicle.is_rented ? (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  대여자 이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={rentalName}
                  onChange={(e) => setRentalName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveRental();
                  }}
                  placeholder="예: 홍길동 선교사님"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none transition"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  대여 기간 동안 해당 차량 예약이 불가합니다.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                <p className="text-sm text-orange-800">
                  <span className="font-bold">{rentalVehicle.renter_name}</span>
                  님의 대여를 해제하면 다시 예약이 가능해집니다.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

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
        staffList={staffList}
      />
      <DetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        selectedLog={selectedLog}
        currentUser={currentUser}
        currentUserName={currentProfile?.full_name ?? null}
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

      {/* ── 운행기록 빠른 팝오버 ── */}
      {logPopover &&
        typeof window !== "undefined" &&
        createPortal(
          <>
            {/* 외부 클릭 → 닫기 */}
            <div
              className="fixed inset-0"
              style={{ zIndex: 99998 }}
              onClick={() => setLogPopover(null)}
            />

            {/* 팝오버 카드 */}
            <div
              className="fixed bg-white rounded-2xl shadow-2xl w-[300px] overflow-hidden border border-gray-100"
              style={{
                zIndex: 99999,
                top: Math.max(
                  16,
                  Math.min(logPopover.y - 10, window.innerHeight - 440),
                ),
                left:
                  logPopover.x + 316 < window.innerWidth
                    ? logPopover.x + 8
                    : logPopover.x - 308,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const log = logPopover.log;
                const STATUS_CFG: Record<
                  string,
                  { label: string; headerBg: string; textCls: string }
                > = {
                  in_use: {
                    label: "운행중",
                    headerBg: "bg-green-50",
                    textCls: "text-green-700",
                  },
                  reserved: {
                    label: "예약",
                    headerBg: "bg-blue-50",
                    textCls: "text-blue-700",
                  },
                  returned: {
                    label: "반납",
                    headerBg: "bg-gray-50",
                    textCls: "text-gray-500",
                  },
                  noshow: {
                    label: "노쇼",
                    headerBg: "bg-orange-50",
                    textCls: "text-orange-600",
                  },
                };
                const cfg =
                  STATUS_CFG[log.vehicle_status] ?? STATUS_CFG.reserved;
                const start = new Date(log.start_at);
                const end = new Date(log.end_at);
                const sameDay =
                  format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");

                const InfoLine = ({
                  label,
                  children,
                }: {
                  label: string;
                  children: React.ReactNode;
                }) => (
                  <div className="flex items-start gap-3">
                    <span className="text-xs text-gray-400 w-[52px] shrink-0 pt-0.5">
                      {label}
                    </span>
                    <span className="text-sm text-gray-800 font-medium leading-snug flex-1 min-w-0">
                      {children}
                    </span>
                  </div>
                );

                return (
                  <>
                    {/* 헤더 */}
                    <div
                      className={`px-5 py-4 flex items-start justify-between gap-3 ${cfg.headerBg}`}
                    >
                      <div className="min-w-0">
                        <span className={`text-xs font-bold ${cfg.textCls}`}>
                          {cfg.label}
                        </span>
                        <p className="text-base font-extrabold text-gray-900 mt-0.5 leading-snug truncate">
                          {log.resources?.name ?? "차량"}
                        </p>
                      </div>
                      <button
                        onClick={() => setLogPopover(null)}
                        className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full hover:bg-black/10 transition text-gray-500"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>

                    {/* 본문 */}
                    <div className="px-5 py-4 space-y-2.5">
                      <InfoLine label="운행 시간">
                        {format(start, "MM.dd(EEE)", { locale: ko })}{" "}
                        {format(start, "HH:mm")} ~{" "}
                        {sameDay
                          ? format(end, "HH:mm")
                          : format(end, "MM.dd HH:mm")}
                      </InfoLine>

                      <InfoLine label="운전자">
                        {log.driver_name}
                        {log.department && (
                          <span className="text-gray-400">
                            {" "}
                            · {log.department}
                          </span>
                        )}
                      </InfoLine>

                      <InfoLine label="목적지">
                        <span className="truncate block">
                          {log.destination}
                        </span>
                      </InfoLine>

                      <InfoLine label="운행 목적">
                        <span className="line-clamp-2">{log.purpose}</span>
                      </InfoLine>

                      {/* 반납 시 — 주행거리 + 주차위치 */}
                      {log.vehicle_status === "returned" &&
                        log.start_mileage != null &&
                        log.end_mileage != null && (
                          <>
                            <div className="border-t border-gray-100 pt-1" />
                            <InfoLine label="주행 거리">
                              <span className="font-bold text-blue-600">
                                {(
                                  log.end_mileage - log.start_mileage
                                ).toLocaleString()}{" "}
                                km
                              </span>
                              <span className="text-xs text-gray-400 ml-1">
                                ({log.start_mileage.toLocaleString()} →{" "}
                                {log.end_mileage.toLocaleString()})
                              </span>
                            </InfoLine>
                            {log.parking_location && (
                              <InfoLine label="주차 위치">
                                {log.parking_location}
                              </InfoLine>
                            )}
                          </>
                        )}
                    </div>

                    {/* 하단 버튼 */}
                    <div className="px-5 pb-4">
                      <button
                        onClick={() => {
                          setSelectedLog(log);
                          setIsDetailModalOpen(true);
                          setLogPopover(null);
                        }}
                        className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white text-sm font-bold rounded-xl transition flex items-center justify-center gap-1.5"
                      >
                        운행 관리
                        <svg
                          className="w-4 h-4"
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
                    </div>
                  </>
                );
              })()}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
