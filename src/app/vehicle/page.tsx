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
import VehicleReserveModal, { type FormState } from "@/components/vehicle/VehicleReserveModal";
import "@/styles/calendar.css";
import HistoryModal from "@/components/vehicle/HistoryModal";
import MaintenanceModal from "@/components/vehicle/MaintenanceModal";
import StatsSection from "@/components/vehicle/StatsSection";
import ScheduleTab from "@/components/vehicle/ScheduleTab";
import VehicleManageTab from "@/components/vehicle/VehicleManageTab";
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
  "봉고 트럭": "/images/cars/bongo.png",
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
  oil_change_interval_km?: number;
  is_rented?: boolean;
  renter_name?: string;
  inspection_due_date?: string | null;
  inspection_cycle_month?: number | null;
  notify_user_id?: string | null;
};

type Consumable = {
  id: number;
  resource_id: number;
  name: string;
  cycle_km: number;
  last_replaced_km: number;
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
  // 차량별 최신 엔진오일 정비 날짜 (교체완료 버튼 빨간색 판단용)
  const [lastEngineOilDates, setLastEngineOilDates] = useState<Record<number, string>>({});
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

  const [mobileTab, setMobileTab] = useState<"reserve" | "log">("reserve");
  const [mobileMyOnly, setMobileMyOnly] = useState(true);
  const [mobilePage, setMobilePage] = useState(1);
  const [isReserving, setIsReserving] = useState(false);
  const [mobileDriverSearch, setMobileDriverSearch] = useState("");
  const [pcSelectedVehicleId, setPcSelectedVehicleId] = useState<number | null>(
    null,
  );
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [allViewMode, setAllViewMode] = useState<"log" | "schedule">("log");
  const [isVehicleManageModalOpen, setIsVehicleManageModalOpen] = useState(false);
  const [scheduleVehicle, setScheduleVehicle] = useState<Vehicle | null>(null);
  const [consumables, setConsumables] = useState<Consumable[]>([]);

  const [isReserveModalOpen, setIsReserveModalOpen] = useState(false);
  // [신규] 예약 수정을 위한 상태
  const [editingLogId, setEditingLogId] = useState<number | null>(null);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<VehicleLog | null>(null);

  // logs 갱신 시 열려있는 상세 모달의 selectedLog도 자동 동기화
  useEffect(() => {
    if (selectedLog && isDetailModalOpen) {
      const updated = logs.find((l) => l.id === selectedLog.id);
      if (updated) setSelectedLog(updated as any);
    }
  }, [logs]);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedVehicleHistory, setSelectedVehicleHistory] =
    useState<Vehicle | null>(null);

  const [logPopover, setLogPopover] = useState<{
    log: VehicleLog;
    x: number;
    y: number;
  } | null>(null);
  const [isMobileView, setIsMobileView] = useState(false);
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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
  const itemsPerPage = 5;

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
    setEditingLogId(null); // 신규 예약이므로 초기화
    setIsReserveModalOpen(true);
  };

  // [신규] 예약 수정 모달 띄우기
  const handleOpenEdit = (log: VehicleLog) => {
    setForm({
      resource_id: log.resource_id,
      start_date: format(new Date(log.start_at), "yyyy-MM-dd"),
      start_time: format(new Date(log.start_at), "HH:mm"),
      end_date: format(new Date(log.end_at), "yyyy-MM-dd"),
      end_time: format(new Date(log.end_at), "HH:mm"),
      purpose: log.purpose,
      destination: log.destination,
      driver_name: log.driver_name,
      driver_user_id: log.driver_user_id || "",
      department: log.department || "",
    });
    setEditingLogId(log.id);
    setIsDetailModalOpen(false); // 상세 모달 닫기
    setIsReserveModalOpen(true); // 예약 모달 열기
  };

  const handleCloseReserveModal = () => {
    setIsReserveModalOpen(false);
    setEditingLogId(null);
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
        updates: { vehicle_status: "cancelled" },
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error || "취소 실패");
    } else {
      toast.success("예약이 취소되었습니다.");
      setIsDetailModalOpen(false);
      fetchData();

      // 차량 관리자에게 취소 알림 발송
      const cancelledLog = logs.find((l) => l.id === id);
      const cancelVehicleName = vehicles.find((v) => v.id === cancelledLog?.resource_id)?.name ?? "차량";
      const cancelDriverName = cancelledLog?.driver_name ?? "예약자";
      const cancelVehicleNotifyUserId = vehicles.find((v) => v.id === cancelledLog?.resource_id)?.notify_user_id ?? null;
      supabase
        .from("profiles")
        .select("id")
        .eq("is_vehicle_notify", true)
        .then(({ data: managers }) => {
          const baseIds = (managers ?? [])
            .map((m: any) => m.id as string)
            .filter((uid) => uid !== currentUser);
          const ids = cancelVehicleNotifyUserId && cancelVehicleNotifyUserId !== currentUser && !baseIds.includes(cancelVehicleNotifyUserId)
            ? [...baseIds, cancelVehicleNotifyUserId]
            : baseIds;
          if (ids.length > 0) {
            fetch("/api/push/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userIds: ids,
                title: "🚗 차량 예약 취소 알림",
                body: `${cancelDriverName}님이 ${cancelVehicleName} 예약을 취소했습니다.`,
                url: "/vehicle",
              }),
            }).catch(() => {});
          }
        });
    }
  };

  const handleOpenHistory = (vehicle: Vehicle) => {
    setSelectedVehicleHistory(vehicle);
    setIsHistoryModalOpen(true);
  };

  const handleOilChanged = async (vehicle: Vehicle) => {
    const km = vehicle.current_mileage;
    const confirmed = await showConfirm(
      "엔진오일 교체 완료 처리",
      `${vehicle.name}(${vehicle.description})의 엔진오일 교체를 현재 주행거리 ${km.toLocaleString()} km 기준으로 기록할까요?`,
    );
    if (!confirmed) return;
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("resources")
      .update({ oil_changed_km: km, oil_changed_date: today })
      .eq("id", vehicle.id);
    if (error) toast.error("저장 실패: " + error.message);
    else {
      toast.success(`엔진오일 교체 완료로 기록했습니다. (${km.toLocaleString()} km)`);
      fetchData();
    }
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
      // 전체 차량이 default이므로 자동 선택 없음
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
      .neq("vehicle_status", "cancelled")
      .order("start_at", { ascending: false });

    if (lError) {
      console.error("운행일지 쿼리 오류:", lError.message);
      toast.error("운행일지를 불러오지 못했습니다: " + lError.message);
    }
    if (lData) setLogs(lData as any);

    const { data: cData } = await supabase
      .from("vehicle_consumables")
      .select("*")
      .in("resource_id", vData?.map((v) => v.id) ?? []);
    if (cData) setConsumables(cData as Consumable[]);

    // 차량별 최신 엔진오일 정비 날짜 조회
    const { data: oilMaintData } = await supabase
      .from("maintenance_records")
      .select("resource_id, maintenance_date")
      .in("resource_id", vData?.map((v) => v.id) ?? [])
      .or("type.eq.engine_oil,type.eq.엔진오일 및 오일필터")
      .order("maintenance_date", { ascending: false });

    if (oilMaintData) {
      const oilMap: Record<number, string> = {};
      (oilMaintData as { resource_id: number; maintenance_date: string }[]).forEach((r) => {
        if (!oilMap[r.resource_id]) oilMap[r.resource_id] = r.maintenance_date;
      });
      setLastEngineOilDates(oilMap);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleReserve = async (form: FormState) => {
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
      // 수정 모드일 때는 자기 자신과의 시간 중복은 무시
      if (editingLogId && log.id === editingLogId) return false;

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

    if (
      !(await showConfirm(
        editingLogId ? "예약을 수정하시겠습니까?" : "차량을 예약하시겠습니까?",
      ))
    )
      return;

    setIsReserving(true);
    try {
    const reminderAt = new Date(endAt.getTime() - 20 * 60 * 1000);
    const basePayload = {
      resource_id: form.resource_id,
      user_id: currentUser,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      purpose: form.purpose,
      destination: form.destination,
      driver_name: form.driver_name,
      department: form.department,
      reminder_at: reminderAt.toISOString(),
    };

    let resultError = null;

    if (editingLogId) {
      // 수정 로직 — 관리자도 수정 가능하도록 service_role API 경유
      const { user_id: _omit, ...updatePayload } = basePayload;
      const _res = await fetch("/api/vehicle/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: editingLogId,
          updates: updatePayload,
        }),
      });
      const _json = await _res.json();
      resultError = _res.ok ? null : { message: _json.error || "수정 실패" };
    } else {
      // 신규 등록 로직
      let insertResult = await supabase.from("reservations").insert({
        ...basePayload,
        vehicle_status: "reserved",
        reminder_sent: false,
        ...(form.driver_user_id ? { driver_user_id: form.driver_user_id } : {}),
      });

      if (insertResult.error && form.driver_user_id) {
        insertResult = await supabase.from("reservations").insert({
          ...basePayload,
          vehicle_status: "reserved",
          reminder_sent: false,
        });
      }
      resultError = insertResult.error;
    }

    if (resultError) toast.error(resultError.message);
    else {
      const vehicleName =
        vehicles.find((v) => v.id === form.resource_id)?.name ?? "차량";
      const reserverName = form.driver_name;
      const reserverDept = form.department;

      toast.success(
        editingLogId ? "예약이 수정되었습니다." : "예약되었습니다.",
      );
      handleCloseReserveModal();
      fetchData();

      // 예약 신규/수정 모두 알림 발송
      {
        const vehicleNotifyUserId = vehicles.find((v) => v.id === form.resource_id)?.notify_user_id ?? null;
        supabase
          .from("profiles")
          .select("id")
          .eq("is_vehicle_notify", true)
          .then(({ data: managers }) => {
            const baseIds = (managers ?? [])
              .map((m: any) => m.id as string)
              .filter((id) => id !== currentUser);
            const ids = vehicleNotifyUserId && vehicleNotifyUserId !== currentUser && !baseIds.includes(vehicleNotifyUserId)
              ? [...baseIds, vehicleNotifyUserId]
              : baseIds;
            if (ids.length > 0) {
              const isEdit = !!editingLogId;
              fetch("/api/push/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userIds: ids,
                  title: isEdit ? "🚗 차량 예약 수정 알림" : "🚗 차량 예약 알림",
                  body: isEdit
                    ? `${reserverName}(${reserverDept})님이 ${vehicleName} 예약을 수정했습니다.`
                    : `${reserverName}(${reserverDept})님이 ${vehicleName}을(를) 예약했습니다.`,
                  url: "/vehicle",
                }),
              }).catch(() => {});
            }
          });
      }
    }
    } finally {
      setIsReserving(false);
    }
  };

  /* 정기 예약 생성 */
  const handleRecurringReserve = async (
    {
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
    },
    form: FormState,
  ): Promise<void> => {
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
    const recurVehicleNotifyUserId = vehicles.find((v) => v.id === form.resource_id)?.notify_user_id ?? null;
    supabase
      .from("profiles")
      .select("id")
      .eq("is_vehicle_notify", true)
      .then(({ data: managers }) => {
        const baseIds = (managers ?? [])
          .map((m: any) => m.id as string)
          .filter((id) => id !== currentUser);
        const ids = recurVehicleNotifyUserId && recurVehicleNotifyUserId !== currentUser && !baseIds.includes(recurVehicleNotifyUserId)
          ? [...baseIds, recurVehicleNotifyUserId]
          : baseIds;
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

  // 모바일 전용: 내 예약 + 운전자 이름 필터
  const mobileSortedLogs = sortedLogs.filter((l) => {
    const matchesMine = !mobileMyOnly || l.user_id === currentUser || l.driver_user_id === currentUser;
    const matchesDriver = !mobileDriverSearch.trim() || l.driver_name.includes(mobileDriverSearch.trim());
    return matchesMine && matchesDriver;
  });
  const mobileTotalPages = Math.ceil(mobileSortedLogs.length / itemsPerPage);
  const mobileCurrentLogs = mobileSortedLogs.slice(
    (mobilePage - 1) * itemsPerPage,
    mobilePage * itemsPerPage,
  );

  const renderVehicleCard = (v: Vehicle) => {
    const currentUsage = logs.find(
      (l) => l.resource_id === v.id && l.vehicle_status === "in_use",
    );
    const carImage = VEHICLE_IMAGES[v.name];
    const isActive = activeCardId === v.id;

    const oilInterval = v.oil_change_interval_km ?? 7000;
    const oilRemaining =
      v.current_mileage != null
        ? (v.oil_changed_km ?? 0) + oilInterval - v.current_mileage
        : null;
    const oilOverdue = oilRemaining !== null && oilRemaining <= 0;
    const oilSoon =
      oilRemaining !== null && oilRemaining > 0 && oilRemaining <= 1000;
    // 정비이력에 엔진오일 추가 후 교체완료 미처리 상태
    const latestOilMaint = lastEngineOilDates[v.id];
    const oilConfirmPending =
      !!latestOilMaint &&
      (!v.oil_changed_date || latestOilMaint > v.oil_changed_date);

    const lastReturnedLog = logs
      .filter(
        (l) =>
          l.resource_id === v.id &&
          l.vehicle_status === "returned" &&
          l.fuel_level_end != null,
      )
      .sort(
        (a, b) => new Date(b.end_at).getTime() - new Date(a.end_at).getTime(),
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
            : oilConfirmPending || oilOverdue
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
                  handleOilChanged(v);
                  setActiveCardId(null);
                }}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm ${
                  oilConfirmPending
                    ? "bg-red-500 hover:bg-red-400 text-white animate-pulse"
                    : oilOverdue
                      ? "bg-red-500 hover:bg-red-400 text-white"
                      : oilSoon
                        ? "bg-amber-500 hover:bg-amber-400 text-white"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-[10px] font-bold leading-none">
                  {oilConfirmPending ? "교체확인!" : "오일교체"}
                </span>
              </button>
            )}
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

        <div className="z-10 relative pointer-events-none">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[17px] font-semibold text-gray-900 tracking-tight leading-tight">
              {v.name}
            </h3>
            {(oilConfirmPending || oilOverdue || oilSoon) && (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${oilConfirmPending || oilOverdue ? "bg-red-400" : "bg-amber-400"}`}
                  />
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${oilConfirmPending || oilOverdue ? "bg-red-500" : "bg-amber-500"}`}
                  />
                </span>
                <span
                  className={`text-[10px] font-bold ${oilConfirmPending || oilOverdue ? "text-red-500" : "text-amber-500"}`}
                >
                  {oilConfirmPending
                    ? "교체완료 확인 필요"
                    : oilOverdue
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

        {/* --- [수정됨] 통일된 사이즈의 차량 이미지 --- */}
        {carImage ? (
          <Image
            src={carImage}
            alt={v.name}
            width={300}
            height={200}
            className="absolute right-[-10px] bottom-1 w-36 h-24 object-contain opacity-90 transition-transform duration-500 ease-out group-hover:scale-105 origin-bottom-right"
          />
        ) : (
          <div className="absolute right-4 bottom-4 opacity-5 text-gray-900">
            <span className="text-4xl font-black">CAR</span>
          </div>
        )}

        <div className="z-10 mt-auto flex items-end gap-3 pointer-events-none">
          <div>
            <p className="text-[10px] text-gray-400 font-medium mb-0.5 tracking-tight">
              누적 주행거리
            </p>
            <div className="inline-flex items-baseline gap-0.5 bg-white/60 backdrop-blur-sm px-1.5 py-0.5 -ml-1.5 rounded-lg">
              <span className="text-[18px] font-semibold text-slate-800 tracking-tight">
                {(v.current_mileage || 0).toLocaleString()}
              </span>
              <span className="text-[12px] font-medium text-gray-500">km</span>
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

  return (
    <div className="w-full max-w-7xl mx-auto p-2 pb-20">
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

      <div
        className={`md:hidden flex flex-col gap-4 mb-4 ${mobileTab === "log" ? "hidden" : ""}`}
      >
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          차량 운행 관리
        </h1>
        <button
          onClick={() => {
            setEditingLogId(null);
            setIsReserveModalOpen(true);
          }}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-lg font-bold text-sm tracking-tight transition-all shadow-md hover:shadow-lg cursor-pointer"
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

        {/* 스케줄 보기 버튼 */}
        <a
          href="/vehicle/schedule"
          className="w-full flex items-center justify-center gap-2 bg-white hover:bg-gray-50 active:bg-gray-100 text-slate-700 px-5 py-3 rounded-lg font-bold text-sm tracking-tight transition-all border border-gray-200 shadow-sm cursor-pointer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-4 h-4 text-slate-500"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
            />
          </svg>
          <span className="mt-[1px]">스케줄 보기</span>
        </a>
      </div>

      <div
        className={`grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 md:hidden ${mobileTab === "log" ? "hidden" : "grid"}`}
      >
        {vehicles.map((v) => renderVehicleCard(v))}
      </div>

      <div
        className={`md:hidden bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${mobileTab === "log" ? "block" : "hidden"}`}
      >
        <div className="px-3 pt-3 pb-2.5 border-b border-gray-200 bg-gray-50 flex flex-col gap-2">
          {/* 1행: 상태 필터 + 내 예약 토글 */}
          <div className="flex gap-2 items-center">
            <div className="w-32 shrink-0">
              <Select
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v); setCurrentPage(1); setMobilePage(1); }}
                options={[
                  { value: "all", label: "전체 상태" },
                  { value: "reserved", label: "예약중" },
                  { value: "in_use", label: "운행중" },
                  { value: "returned", label: "반납완료" },
                  { value: "noshow", label: "노쇼" },
                ]}
                className="w-full h-[38px] px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg"
              />
            </div>
            <button
              onClick={() => { setMobileMyOnly((v) => !v); setMobilePage(1); }}
              className="flex items-center gap-2 shrink-0 px-1 py-1 rounded-lg transition active:scale-95"
            >
              <span className={`text-sm font-bold transition-colors ${mobileMyOnly ? "text-blue-600" : "text-gray-400"}`}>
                {mobileMyOnly ? "내 예약" : "전체"}
              </span>
              <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${mobileMyOnly ? "bg-blue-600" : "bg-gray-300"}`}>
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${mobileMyOnly ? "translate-x-6" : "translate-x-1"}`} />
              </div>
            </button>
          </div>
          {/* 2행: 운전자 이름 검색 */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={mobileDriverSearch}
              onChange={(e) => { setMobileDriverSearch(e.target.value); setMobilePage(1); }}
              placeholder="운전자 이름 검색"
              className="w-full h-[38px] pl-9 pr-8 text-sm bg-white border border-gray-300 rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 transition"
            />
            {mobileDriverSearch && (
              <button
                onClick={() => { setMobileDriverSearch(""); setMobilePage(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="p-3 space-y-3">
          {mobileCurrentLogs.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              운행 기록이 없습니다.
            </div>
          ) : (
            mobileCurrentLogs.map((log) => (
              <div
                key={log.id}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold ${
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
                  <span className="font-bold text-gray-900">
                    {log.resources?.name}
                  </span>
                </div>
                <div className="text-sm space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-gray-400 text-xs">운행시간</span>
                    <span className="font-mono text-xs text-gray-700">
                      {format(new Date(log.start_at), "MM.dd HH:mm")} ~{" "}
                      {format(new Date(log.end_at), "HH:mm")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 text-xs">운전자</span>
                    <span className="font-medium text-gray-800">
                      {log.driver_name}{" "}
                      <span className="text-gray-400 text-xs">
                        ({log.department})
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 text-xs">목적지</span>
                    <span className="font-medium text-gray-800 truncate ml-4">
                      {log.destination}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 text-xs">주행거리</span>
                    <span className="font-mono font-bold text-gray-800">
                      {log.end_mileage && log.start_mileage
                        ? `${(log.end_mileage - log.start_mileage).toLocaleString()} km`
                        : "-"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedLog(log);
                    setIsDetailModalOpen(true);
                  }}
                  className="mt-3 w-full py-2.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg text-sm font-bold text-slate-700 transition"
                >
                  상세 보기
                </button>
              </div>
            ))
          )}
        </div>
        {mobileTotalPages > 1 && (
          <div className="flex items-center gap-2 py-3 px-3 border-t border-gray-200 bg-white">
            {/* 이전 — shrink-0 으로 항상 고정 */}
            <button
              onClick={() => setMobilePage((p) => Math.max(1, p - 1))}
              disabled={mobilePage === 1}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 text-gray-500 disabled:opacity-30 text-lg leading-none"
            >
              ‹
            </button>

            {/* 숫자 영역 — 넘치면 내부만 가로 스크롤 */}
            <div className="flex-1 overflow-x-auto">
              <div className="flex gap-1 justify-center min-w-fit">
                {buildPageWindow(mobilePage, mobileTotalPages, 1).map((item, i) =>
                  item === "..." ? (
                    <span key={`m-ellipsis-${i}`} className="w-7 h-9 flex items-center justify-center text-gray-400 text-sm shrink-0">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setMobilePage(item as number)}
                      className={`shrink-0 w-9 h-9 rounded-lg border text-sm font-medium ${
                        mobilePage === item
                          ? "bg-slate-800 text-white border-slate-800"
                          : "border-gray-300 text-gray-600 bg-white"
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* 다음 — shrink-0 으로 항상 고정 */}
            <button
              onClick={() => setMobilePage((p) => Math.min(mobileTotalPages, p + 1))}
              disabled={mobilePage === mobileTotalPages || mobileTotalPages === 0}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 text-gray-500 disabled:opacity-30 text-lg leading-none"
            >
              ›
            </button>
          </div>
        )}
      </div>

      <div className="hidden md:flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            차량 운행 관리
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            차량 예약 및 운행 일지를 관리합니다.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingLogId(null);
            setIsReserveModalOpen(true);
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition shadow-sm"
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
          차량 예약하기
        </button>
      </div>

      {(() => {
        const pcVehicle =
          vehicles.find((v) => v.id === pcSelectedVehicleId) ?? null;
        const pcFilteredLogs = pcSelectedVehicleId
          ? sortedLogs.filter((l) => l.resource_id === pcSelectedVehicleId)
          : sortedLogs;
        const pcTotalPages = Math.ceil(pcFilteredLogs.length / itemsPerPage);
        const pcCurrentLogs = pcFilteredLogs.slice(
          (currentPage - 1) * itemsPerPage,
          currentPage * itemsPerPage,
        );

        // 최근 특이사항 (이상 없음 제외, 최근 5건)
        const recentNotes = pcSelectedVehicleId
          ? logs
              .filter(
                (l) =>
                  l.resource_id === pcSelectedVehicleId &&
                  l.vehicle_status === "returned" &&
                  l.vehicle_condition &&
                  l.vehicle_condition !== "이상 없음",
              )
              .sort(
                (a, b) =>
                  new Date(b.end_at).getTime() - new Date(a.end_at).getTime(),
              )
              .slice(0, 5)
          : [];

        const getOilRemaining = (v: Vehicle) =>
          v.current_mileage != null
            ? (v.oil_changed_km ?? 0) + (v.oil_change_interval_km ?? 7000) - v.current_mileage
            : null;

        const getLastFuel = (vehicleId: number) => {
          const last = logs
            .filter(
              (l) =>
                l.resource_id === vehicleId &&
                l.vehicle_status === "returned" &&
                l.fuel_level_end != null,
            )
            .sort(
              (a, b) =>
                new Date(b.end_at).getTime() - new Date(a.end_at).getTime(),
            )[0];
          return last?.fuel_level_end ?? null;
        };

        const statusBadge = (status: VehicleLog["vehicle_status"]) => (
          <span
            className={`px-2 py-1 rounded text-xs font-bold ${status === "in_use" ? "bg-green-100 text-green-700" : status === "returned" ? "bg-gray-100 text-gray-500" : status === "noshow" ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-700"}`}
          >
            {status === "in_use"
              ? "운행중"
              : status === "returned"
                ? "반납"
                : status === "noshow"
                  ? "노쇼"
                  : "예약"}
          </span>
        );

        const colSpan = pcSelectedVehicleId ? 6 : 7;

        const LogTable = ({ rows }: { rows: VehicleLog[] }) => (
          <table className="min-w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3">상태</th>
                {!pcSelectedVehicleId && <th className="px-4 py-3">차량</th>}
                <th className="px-4 py-3">사용시간</th>
                <th className="px-4 py-3">운전자 / 부서</th>
                <th className="px-4 py-3">목적지 / 용도</th>
                <th className="px-4 py-3 text-right">주행거리</th>
                <th className="px-4 py-3 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-blue-50/40 transition cursor-pointer"
                  onClick={(e) =>
                    setLogPopover({ log, x: e.clientX, y: e.clientY })
                  }
                >
                  <td className="px-4 py-3">
                    {statusBadge(log.vehicle_status)}
                  </td>
                  {!pcSelectedVehicleId && (
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {log.resources?.name}
                    </td>
                  )}
                  <td className="px-4 py-3 text-gray-600">
                    <div>{format(new Date(log.start_at), "MM.dd HH:mm")}</div>
                    <div className="text-xs text-gray-400">
                      ~ {format(new Date(log.end_at), "MM.dd HH:mm")}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div>{log.driver_name}</div>
                    <div className="text-xs text-gray-400">
                      {log.department}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">
                      {log.destination}
                    </div>
                    <div className="text-xs text-gray-500 truncate max-w-[160px]">
                      {log.purpose}
                    </div>
                  </td>
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
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={colSpan}
                    className="px-4 py-10 text-center text-gray-400"
                  >
                    운행 기록이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        );

        const PcPagination = () => {
          const safeTotal = Math.max(1, pcTotalPages);
          return (
            <div className="flex justify-center py-3 border-t border-gray-200 shrink-0">
              <div className="flex gap-1 items-center">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 rounded border border-gray-300 text-gray-600 disabled:opacity-50 text-sm"
                >
                  이전
                </button>
                {buildPageWindow(currentPage, safeTotal).map((item, i) =>
                  item === "..." ? (
                    <span key={`ellipsis-${i}`} className="px-2 py-1 text-gray-400 text-sm">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setCurrentPage(item as number)}
                      className={`px-3 py-1 rounded border text-sm ${currentPage === item ? "bg-slate-800 text-white border-slate-800" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
                    >
                      {item}
                    </button>
                  )
                )}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(safeTotal, p + 1))}
                  disabled={currentPage >= safeTotal}
                  className="px-3 py-1 rounded border border-gray-300 text-gray-600 disabled:opacity-50 text-sm"
                >
                  다음
                </button>
              </div>
            </div>
          );
        };

        return (
          <div className="hidden md:flex h-[calc(100vh-190px)] gap-4">
            <div className="w-80 shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-3 border-b border-gray-100">
                <button
                  onClick={() => {
                    setPcSelectedVehicleId(null);
                    setCurrentPage(1);
                  }}
                  className={`w-full py-2.5 px-3 rounded-lg text-sm font-bold transition ${
                    pcSelectedVehicleId === null
                      ? "bg-slate-800 text-white shadow"
                      : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  전체 차량
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {vehicles.map((v) => {
                  const carImg = VEHICLE_IMAGES[v.name];
                  const isSelected = pcSelectedVehicleId === v.id;
                  const isInUse = logs.some(
                    (l) =>
                      l.resource_id === v.id && l.vehicle_status === "in_use",
                  );
                  return (
                    <button
                      key={v.id}
                      onClick={() => {
                        setPcSelectedVehicleId(v.id);
                        setCurrentPage(1);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-3.5 text-left transition border-b border-gray-100 ${isSelected ? "bg-blue-50" : "bg-white hover:bg-gray-50"}`}
                    >
                      {/* --- [수정됨] 통일된 사이즈의 리스트 차량 이미지 --- */}
                      <div className="w-20 h-14 shrink-0 flex items-center justify-center overflow-hidden">
                        {carImg ? (
                          <Image
                            src={carImg}
                            alt={v.name}
                            width={80}
                            height={56}
                            className={`w-full h-full object-contain transition-transform ${
                              // 차량마다 여백이 다르므로 시각적으로 비슷해 보이도록 배율(scale) 조정
                              v.name.includes("스타리아")
                                ? "scale-[1.3]"
                                : v.name.includes("쏘나타")
                                  ? "scale-[1.15]"
                                  : v.name.includes("카니발")
                                    ? "scale-[1.0]"
                                    : "scale-100" // 기본적으로 조금씩 키워서 여백을 줄임
                            }`}
                          />
                        ) : (
                          <svg
                            className="w-8 h-8 text-gray-300"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M8 17l1-4H6l1-4h10l1 4h-3l1 4M3 17h18M5 17v2h2v-2M17 17v2h2v-2"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-sm font-bold truncate ${isSelected ? "text-blue-700" : "text-gray-800"}`}
                        >
                          {v.name}
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                          {v.description}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {isInUse ? (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold block">
                            운행중
                          </span>
                        ) : v.is_rented ? (
                          <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold block">
                            대여중
                          </span>
                        ) : (
                          <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded font-bold block">
                            대기중
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden gap-4">
              {pcVehicle ? (
                <>
                  <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm shrink-0">
                    <div className="flex items-start gap-5 mb-4">
                      {/* --- [수정됨] 통일된 사이즈의 상세 정보 차량 이미지 --- */}
                      <div className="w-36 h-24 shrink-0 flex items-center justify-center overflow-hidden">
                        {VEHICLE_IMAGES[pcVehicle.name] ? (
                          <Image
                            src={VEHICLE_IMAGES[pcVehicle.name]}
                            alt={pcVehicle.name}
                            width={144}
                            height={86}
                            className={`w-full h-full object-contain transition-transform mb-2 pb-4 ${
                              pcVehicle.name.includes("스타리아")
                                ? "scale-[1.3]"
                                : pcVehicle.name.includes("쏘나타")
                                  ? "scale-[1.2]"
                                  : pcVehicle.name.includes("카니발")
                                    ? "scale-[1.0]"
                                    : "scale-100"
                            }`}
                          />
                        ) : (
                          <svg
                            className="w-12 h-12 text-gray-300"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M8 17l1-4H6l1-4h10l1 4h-3l1 4M3 17h18M5 17v2h2v-2M17 17v2h2v-2"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h2 className="text-xl font-bold text-gray-900">
                            {pcVehicle.name}
                          </h2>
                          {pcVehicle.is_rented && (
                            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                              대여중 · {pcVehicle.renter_name}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">
                          {pcVehicle.description}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleReserveWithCar(pcVehicle.id)}
                          disabled={!!pcVehicle.is_rented}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition ${pcVehicle.is_rented ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500 text-white"}`}
                        >
                          예약하기
                        </button>
                        <button
                          onClick={() => {
                            setSelectedVehicleMaintenance(pcVehicle);
                            setIsMaintenanceModalOpen(true);
                          }}
                          className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-bold transition"
                        >
                          정비
                        </button>
                        {/* {currentProfile?.is_vehicle_notify && (
                          <button
                            onClick={() => setIsVehicleManageModalOpen(true)}
                            className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-bold transition"
                          >
                            관리
                          </button>
                        )} */}
                        <button
                          onClick={() => handleOpenHistory(pcVehicle)}
                          className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-bold transition"
                        >
                          기록
                        </button>
                        <button
                          onClick={() => setScheduleVehicle(pcVehicle)}
                          className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-bold transition"
                        >
                          스케줄
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <div className="text-xs text-gray-400 mb-1">
                          누적 주행거리
                        </div>
                        <div className="text-lg font-bold text-gray-900">
                          {pcVehicle.current_mileage?.toLocaleString() ?? "-"}
                          <span className="text-xs font-normal text-gray-500 ml-0.5">
                            km
                          </span>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <div className="text-xs text-gray-400 mb-1">주유량</div>
                        {(() => {
                          const fuel = getLastFuel(pcVehicle.id);
                          const color =
                            fuel != null && fuel <= 25
                              ? "text-red-500"
                              : fuel != null && fuel <= 50
                                ? "text-amber-500"
                                : "text-emerald-600";
                          return (
                            <div className={`text-lg font-bold ${color}`}>
                              {fuel != null
                                ? fuel === 0
                                  ? "E"
                                  : fuel === 100
                                    ? "F"
                                    : `${fuel}%`
                                : "-"}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <div className="text-xs text-gray-400 mb-1">
                          보험 정보
                        </div>
                        <div className="text-xs font-medium text-gray-700 leading-snug space-y-0.5">
                          {pcVehicle.insurance_info &&
                            pcVehicle.insurance_info.split(/\s*\/\s*/).map((line, i) => (
                              <div key={i}>{line.trim()}</div>
                            ))}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <div className="text-xs text-gray-400 mb-1 flex items-center justify-between">
                          <span>엔진오일 교체</span>
                          <span className="text-gray-600 font-medium">{((pcVehicle.oil_change_interval_km ?? 7000) / 1000).toLocaleString()}천km 주기</span>
                        </div>
                        {(() => {
                          const rem = getOilRemaining(pcVehicle);
                          const overdue = rem != null && rem <= 0;
                          const soon = rem != null && rem > 0 && rem <= 1000;
                          const latestOilMaintPc = lastEngineOilDates[pcVehicle.id];
                          const pendingPc =
                            !!latestOilMaintPc &&
                            (!pcVehicle.oil_changed_date || latestOilMaintPc > pcVehicle.oil_changed_date);
                          const color = pendingPc || overdue ? "text-red-500" : soon ? "text-amber-500" : "text-gray-900";
                          return (
                            <div className="flex items-center justify-between gap-2">
                              <div className={`text-base font-bold ${color}`}>
                                {pendingPc
                                  ? "교체확인 필요"
                                  : rem != null
                                    ? rem <= 0
                                      ? `${Math.abs(rem).toLocaleString()} km 초과`
                                      : `${rem.toLocaleString()} km`
                                    : "-"}
                              </div>
                              {currentProfile?.is_vehicle_notify && (
                                <button
                                  onClick={() => handleOilChanged(pcVehicle)}
                                  className={`text-[11px] px-2 py-1 font-bold rounded-lg transition shrink-0 ${
                                    pendingPc
                                      ? "bg-red-500 hover:bg-red-400 text-white animate-pulse"
                                      : overdue
                                        ? "bg-red-500 hover:bg-red-400 text-white"
                                        : soon
                                          ? "bg-amber-500 hover:bg-amber-400 text-white"
                                          : "bg-gray-200 hover:bg-gray-300 text-gray-600"
                                  }`}
                                >
                                  {pendingPc ? "교체확인!" : "교체완료"}
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    {recentNotes.length > 0 && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setNotesExpanded((v) => !v)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-amber-100/60 transition cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                            <span className="text-xs font-bold text-amber-700">최근 특이사항</span>
                            <span className="text-xs text-amber-500">({recentNotes.length}건)</span>
                          </div>
                          <svg
                            className={`w-3.5 h-3.5 text-amber-500 transition-transform ${notesExpanded ? "rotate-180" : ""}`}
                            viewBox="0 0 20 20" fill="currentColor"
                          >
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                        {notesExpanded && (
                          <div className="px-4 pb-3 space-y-1.5 border-t border-amber-200">
                            {recentNotes.map((n) => (
                              <div key={n.id} className="flex gap-2 text-xs pt-1.5">
                                <span className="text-amber-500 font-mono shrink-0">
                                  {format(new Date(n.end_at), "M.d")}
                                </span>
                                <span className="text-gray-500 shrink-0">{n.driver_name}</span>
                                <span className="text-amber-800 flex-1">{n.vehicle_condition}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div className="p-3 border-b border-gray-200 bg-gray-50 flex gap-2 items-center shrink-0">
                      <div className="w-32 shrink-0">
                        <Select
                          value={statusFilter}
                          onChange={(v) => {
                            setStatusFilter(v);
                            setCurrentPage(1);
                          }}
                          options={[
                            { value: "all", label: "전체 상태" },
                            { value: "reserved", label: "예약중" },
                            { value: "in_use", label: "운행중" },
                            { value: "returned", label: "반납완료" },
                            { value: "noshow", label: "노쇼" },
                          ]}
                          className="w-full h-[36px] px-2 py-1 text-sm bg-white border border-gray-300 rounded-lg"
                        />
                      </div>
                      <input
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder="운전자 · 목적지 검색"
                        className="flex-1 h-[36px] px-3 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                      <button
                        onClick={() => { setMyReservationsOnly((v) => !v); setCurrentPage(1); }}
                        className={`px-3 py-1 rounded-lg text-sm font-bold border transition shrink-0 h-[36px] ${myReservationsOnly ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
                      >
                        내 예약
                      </button>
                      <button
                        onClick={() => {
                          const rows = pcFilteredLogs.map((l) => ({
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
                            시작: format(
                              new Date(l.start_at),
                              "yyyy-MM-dd HH:mm",
                            ),
                            종료: format(
                              new Date(l.end_at),
                              "yyyy-MM-dd HH:mm",
                            ),
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
                                .map(
                                  (v) => `"${String(v).replace(/"/g, '""')}"`,
                                )
                                .join(","),
                            ),
                          ].join("\n");
                          const blob = new Blob(["\uFEFF" + csv], {
                            type: "text/csv;charset=utf-8;",
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `운행일지_${pcVehicle.name}_${format(new Date(), "yyyyMMdd")}.csv`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-bold border border-gray-300 text-gray-600 hover:bg-gray-50 transition shrink-0 h-[36px]"
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
                        <span>엑셀</span>
                      </button>
                      <span className="text-xs text-gray-400 shrink-0">
                        {pcFilteredLogs.length}건
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      <LogTable rows={pcCurrentLogs} />
                    </div>
                    <PcPagination />
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-sm flex gap-2 items-center shrink-0 flex-wrap">
                    {/* 탭 토글 */}
                    <div className="flex gap-1 bg-gray-100 p-1 rounded-lg shrink-0">
                      <button
                        onClick={() => setAllViewMode("log")}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition ${allViewMode === "log" ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:bg-gray-100"}`}
                      >
                        운행기록
                      </button>
                      <button
                        onClick={() => setAllViewMode("schedule")}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition ${allViewMode === "schedule" ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:bg-gray-100"}`}
                      >
                        스케줄
                      </button>
                    </div>
                    {allViewMode === "log" && (
                      <>
                        <div className="w-32 shrink-0">
                          <Select
                            value={statusFilter}
                            onChange={(v) => {
                              setStatusFilter(v);
                              setCurrentPage(1);
                            }}
                            options={[
                              { value: "all", label: "전체 상태" },
                              { value: "reserved", label: "예약중" },
                              { value: "in_use", label: "운행중" },
                              { value: "returned", label: "반납완료" },
                              { value: "noshow", label: "노쇼" },
                            ]}
                            className="w-full h-[38px] px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg"
                          />
                        </div>
                        <input
                          value={searchTerm}
                          onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setCurrentPage(1);
                          }}
                          placeholder="차량 · 운전자 · 목적지 검색"
                          className="flex-1 h-[38px] px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        <button
                          onClick={() => { setMyReservationsOnly((v) => !v); setCurrentPage(1); }}
                          className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition shrink-0 h-[38px] ${myReservationsOnly ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
                        >
                          내 예약
                        </button>
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
                          시작: format(
                            new Date(l.start_at),
                            "yyyy-MM-dd HH:mm",
                          ),
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
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border border-gray-300 text-gray-600 hover:bg-gray-50 transition shrink-0 h-[38px]"
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
                      <span>엑셀</span>
                    </button>
                    </>
                  )}
                  </div>
                  {allViewMode === "log" ? (
                    <div className="flex-1 overflow-hidden flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm">
                      <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <LogTable rows={pcCurrentLogs} />
                      </div>
                      <PcPagination />
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      <ScheduleTab
                        vehicles={vehicles}
                        logs={sortedLogs}
                        onSelectLog={(log) => {
                          setSelectedLog(log as any);
                          setIsDetailModalOpen(true);
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* 차량별 스케줄 팝업 */}
      <Modal
        isOpen={!!scheduleVehicle}
        onClose={() => setScheduleVehicle(null)}
        title={scheduleVehicle ? `${scheduleVehicle.name} 스케줄` : "스케줄"}
        className="!max-w-4xl"
      >
        {scheduleVehicle && (
          <ScheduleTab
            vehicles={[scheduleVehicle]}
            logs={logs.filter((l) => l.resource_id === scheduleVehicle.id)}
            defaultView="month"
            onSelectLog={(log) => {
              setScheduleVehicle(null);
              setSelectedLog(log as any);
              setIsDetailModalOpen(true);
            }}
          />
        )}
      </Modal>

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
                className={`flex-1 py-2.5 text-white rounded-lg text-sm font-bold transition cursor-pointer ${rentalVehicle.is_rented ? "bg-orange-500 hover:bg-orange-600" : "bg-indigo-600 hover:bg-indigo-700"}`}
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
        initialValues={form}
        logs={logs}
        vehicles={vehicles}
        onReserve={handleReserve}
        handleRecurringReserve={handleRecurringReserve}
        staffList={staffList}
        isReserving={isReserving}
      />

      {/* DetailModal에 onEdit 속성을 넘겨줍니다 */}
      <DetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        selectedLog={selectedLog}
        currentUser={currentUser}
        currentUserName={currentProfile?.full_name ?? null}
        currentProfile={currentProfile}
        onRefresh={fetchData}
        onCancel={handleCancelReservation}
        onEdit={handleOpenEdit} // [신규] 수정 버튼 클릭 시 실행할 함수 전달
      />

      <MaintenanceModal
        isOpen={isMaintenanceModalOpen}
        onClose={() => setIsMaintenanceModalOpen(false)}
        vehicle={selectedVehicleMaintenance}
        onAdded={(vehicleName, type) => {
          // 정비 추가 후 차량 데이터 갱신 (엔진오일 날짜 포함)
          fetchData();
          // 차량 관리자에게 정비 이력 알림 발송
          const isOilChange =
            type === "engine_oil" || type === "엔진오일 및 오일필터";
          supabase
            .from("profiles")
            .select("id")
            .eq("is_vehicle_notify", true)
            .then(({ data: managers }) => {
              const ids = (managers ?? [])
                .map((m: any) => m.id as string)
                .filter((uid) => uid !== currentUser);
              if (ids.length > 0) {
                fetch("/api/push/send", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    userIds: ids,
                    title: isOilChange
                      ? "🛢️ 엔진오일 교체 확인 필요"
                      : "🔧 차량 정비 이력 등록",
                    body: isOilChange
                      ? `${vehicleName} 엔진오일이 교체됐습니다. 차량 관리에서 교체완료 버튼을 눌러주세요.`
                      : `${vehicleName}에 정비 이력이 등록되었습니다. (${type})`,
                    url: "/vehicle",
                  }),
                }).catch(() => {});
              }
            });
        }}
      />

      {/* 차량 관리 모달 (담당자 지정 / 정기검사 / 소모품) */}
      <Modal
        isOpen={isVehicleManageModalOpen}
        onClose={() => setIsVehicleManageModalOpen(false)}
        title="차량 관리"
        className="!max-w-4xl"
      >
        <VehicleManageTab
          vehicles={vehicles}
          consumables={consumables}
          isAdmin={!!currentProfile?.is_vehicle_notify}
          staffList={staffList}
          onRefresh={() => { fetchData(); }}
        />
      </Modal>
      <HistoryModal
        isHistoryModalOpen={isHistoryModalOpen}
        setIsHistoryModalOpen={setIsHistoryModalOpen}
        selectedVehicleHistory={selectedVehicleHistory}
        logs={logs}
        onOpenDetail={(log) => {
          setSelectedLog(log as VehicleLog);
          setIsDetailModalOpen(true);
        }}
      />

      {logPopover &&
        typeof window !== "undefined" &&
        createPortal(
          <>
            <div
              className={`fixed inset-0 ${isMobileView ? "bg-black/40" : ""}`}
              style={{ zIndex: 99998 }}
              onClick={() => setLogPopover(null)}
            />
            <div
              className={
                isMobileView
                  ? // 모바일: 하단 바텀시트
                    "fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl overflow-hidden border-t border-gray-100 animate-slideUp"
                  : // PC: 기존 플로팅 팝오버
                    "fixed bg-white rounded-2xl shadow-2xl w-[300px] overflow-hidden border border-gray-100"
              }
              style={
                isMobileView
                  ? { zIndex: 99999 }
                  : {
                      zIndex: 99999,
                      top: Math.max(16, Math.min(logPopover.y - 10, window.innerHeight - 440)),
                      left:
                        logPopover.x + 316 < window.innerWidth
                          ? logPopover.x + 8
                          : logPopover.x - 308,
                    }
              }
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
                    {/* 모바일 바텀시트 드래그 핸들 */}
                    {isMobileView && (
                      <div className="flex justify-center pt-3 pb-1">
                        <div className="w-10 h-1 rounded-full bg-gray-300" />
                      </div>
                    )}
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
                    <div className="px-5 py-4 space-y-2.5">
                      <InfoLine label="운행 시간">
                        {format(start, "MM.dd(EEE)", { locale: ko })}{" "}
                        {format(start, "HH:mm")} ~{" "}
                        {sameDay
                          ? format(end, "HH:mm")
                          : `${format(end, "MM.dd(EEE)", { locale: ko })} ${format(end, "HH:mm")}`}
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

/* ── 페이지네이션 윈도우 헬퍼 ────────────────────────────────────────
 * 현재 페이지 기준 앞뒤 2개 + 첫/마지막 페이지를 보여주고,
 * 사이에 빈 곳은 "..." 으로 채웁니다.
 * 예) 총 20페이지, 현재 10: [1, "...", 8, 9, 10, 11, 12, "...", 20]
 * ─────────────────────────────────────────────────────────────────── */
// delta: 현재 페이지 기준 앞뒤 몇 개 표시할지 (PC=2, 모바일=1)
function buildPageWindow(current: number, total: number, delta = 2): (number | "...")[] {
  const threshold = delta * 2 + 3; // 전체 표시 가능한 최소 페이지 수
  if (total <= threshold + 2) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const left  = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);
  const pages: (number | "...")[] = [1];

  if (left > 2)          pages.push("...");
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push("...");
  pages.push(total);

  return pages;
}
