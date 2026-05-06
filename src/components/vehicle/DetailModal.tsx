"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { format } from "date-fns";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import Modal from "@/components/Modal";
import toast from "react-hot-toast";
import { createClient } from "@/utils/supabase/client";
import imageCompression from "browser-image-compression";
import { showConfirm } from "@/utils/alert";
import { toProxyUrl } from "@/utils/minio-url";

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

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLog: VehicleLog | null;
  currentUser: string | null;
  currentUserName?: string | null;
  currentProfile?: { is_approver: boolean; role: string } | null;
  onRefresh: () => void;
  onCancel?: (id: number) => void;
  onEdit?: (log: VehicleLog) => void; // [신규] 수정 버튼 클릭 시 실행할 함수
}

const InfoRow = ({
  label,
  children,
  isLast = false,
}: {
  label: string;
  children: React.ReactNode;
  isLast?: boolean;
}) => (
  <div
    className={`flex border-b border-gray-100 ${isLast ? "border-b-0" : ""}`}
  >
    <div className="w-24 sm:w-28 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-800 flex items-center shrink-0 border-r border-gray-100">
      {label}
    </div>
    <div className="flex-1 px-3 py-2.5 text-sm text-gray-800 flex items-center bg-white min-w-0 break-keep leading-relaxed">
      {children}
    </div>
  </div>
);

const INSURANCE_MOCK = "김건웅 간사 010-2344-2859";

export default function DetailModal({
  isOpen,
  onClose,
  selectedLog,
  currentUser,
  currentUserName,
  currentProfile,
  onRefresh,
  onCancel,
  onEdit, // 추가됨
}: DetailModalProps) {
  const supabase = createClient();
  const [uploading, setUploading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [checkinMileage, setCheckinMileage] = useState<number | "">("");
  const [checkinFuel, setCheckinFuel] = useState<number>(100);

  // 연료 게이지 칸 수 (DB resources.fuel_segments 에서 로드)
  const [fuelSegments, setFuelSegments] = useState(8);
  const [showFuelSettings, setShowFuelSettings] = useState(false);

  // fuelSegments 에 따른 동적 스냅/눈금 계산
  const SNAP_POINTS =
    fuelSegments === 10
      ? Array.from({ length: 21 }, (_, i) => i * 5) // 5% 단위 스냅 (10칸 경계 + 중간)
      : [
          ...new Set([
            ...Array.from({ length: 21 }, (_, i) => i * 5),
            12,
            37,
            62,
            87,
          ]),
        ].sort((a, b) => a - b);

  const TICK_MARKS =
    fuelSegments === 10
      ? [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      : [0, 12, 25, 37, 50, 62, 75, 87, 100];

  const LARGE_TICKS =
    fuelSegments === 10 ? new Set([0, 50, 100]) : new Set([0, 25, 50, 75, 100]);

  const fuelLabel = (v: number | undefined | null) => {
    if (v == null) return null;
    if (v === 0) return "E";
    if (v === 100) return "F";
    return `${v}%`;
  };
  const [checkoutForm, setCheckoutForm] = useState({
    mileage: "" as number | "",
    cleanup: true,
    parking: "",
    condition: "이상 없음",
    fuel: 100,
    incidentType: null as string | null,
  });
  // 반납 시 운행시작 정보 수정
  const [showCheckinEdit, setShowCheckinEdit] = useState(false);
  const [editCheckinMileage, setEditCheckinMileage] = useState<number | "">("");
  const [editCheckinFuel, setEditCheckinFuel] = useState<number | null>(null);
  const [editCheckinPhoto, setEditCheckinPhoto] = useState<File | null>(null);
  const [editCheckinPhotoPreview, setEditCheckinPhotoPreview] = useState<
    string | null
  >(null);

  const [showExtendForm, setShowExtendForm] = useState(false);
  const [extendDate, setExtendDate] = useState("");
  const [extendTime, setExtendTime] = useState("");
  const [showExtendCalendar, setShowExtendCalendar] = useState(false);

  const [dashImage, setDashImage] = useState<File | null>(null);
  const [dashPreview, setDashPreview] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [exteriorFiles, setExteriorFiles] = useState<File[]>([]);
  const [exteriorPreviews, setExteriorPreviews] = useState<string[]>([]);

  const [zoomImages, setZoomImages] = useState<string[]>([]);
  const [zoomIndex, setZoomIndex] = useState<number>(0);

  // 노쇼 복구 후 로컬에서만 status를 "reserved"로 표시 (autoExpireReservations 재실행 방지)
  const [restoredAsReserved, setRestoredAsReserved] = useState(false);

  // 관리자 운행결과 수정 모드
  const [adminResultEdit, setAdminResultEdit] = useState(false);
  const [adminFields, setAdminFields] = useState({
    start_mileage: "" as number | "",
    end_mileage: "" as number | "",
    fuel_level_start: null as number | null,
    fuel_level_end: null as number | null,
    parking_location: "",
    cleanup_status: true,
    vehicle_condition: "이상 없음",
    incident_type: null as string | null,
  });
  const [adminSaving, setAdminSaving] = useState(false);

  // 이전 탑승자 메모
  const [prevNote, setPrevNote] = useState<{
    driver: string;
    note: string;
    date: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDashImage(null);
      setDashPreview(null);
      setOcrLoading(false);
      setExteriorFiles([]);
      setExteriorPreviews([]);
      setCheckinMileage("");
      setCheckinFuel(100);
      setCheckoutForm({
        mileage: "",
        cleanup: true,
        parking: "",
        condition: "이상 없음",
        fuel: 100,
        incidentType: null,
      });
      setAdminResultEdit(false);
      setShowCheckinEdit(false);
      setEditCheckinMileage("");
      setEditCheckinFuel(null);
      setEditCheckinPhoto(null);
      setEditCheckinPhotoPreview(null);
      setFuelSegments(selectedLog?.resources?.fuel_segments ?? 8);
      setShowFuelSettings(false);
      setShowExtendForm(false);
      setExtendDate("");
      setExtendTime("");
      setShowExtendCalendar(false);
      setZoomImages([]);
      setZoomIndex(0);
      setRestoredAsReserved(false);
      setPrevNote(null);

      // 이용시작(reserved) 시 — 해당 차량의 가장 최근 반납 기록에서 메모 조회
      if (
        selectedLog?.vehicle_status === "reserved" &&
        selectedLog?.resource_id
      ) {
        supabase
          .from("reservations")
          .select("vehicle_condition, driver_name, end_at")
          .eq("resource_id", selectedLog.resource_id)
          .eq("vehicle_status", "returned")
          .order("end_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => {
            if (
              data?.vehicle_condition &&
              data.vehicle_condition !== "이상 없음"
            ) {
              setPrevNote({
                driver: data.driver_name,
                note: data.vehicle_condition,
                date: data.end_at,
              });
            }
          });
      }
    }
  }, [isOpen]);

  const handleDashChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setDashImage(file);
      setDashPreview(URL.createObjectURL(file));

      // TODO: 계기판 OCR — API 키 설정 후 아래 주석 해제
      // setOcrLoading(true);
      // try {
      //   const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1280, useWebWorker: true });
      //   const formData = new FormData();
      //   formData.append("image", compressed);
      //   const res = await fetch("/api/vehicle/ocr-mileage", { method: "POST", body: formData });
      //   const json = await res.json();
      //   const mileage: number | null = json.mileage ?? null;
      //   const fuel: number | null = json.fuel ?? null;
      //   const isCheckin = restoredAsReserved || selectedLog?.vehicle_status === "reserved";
      //   if (mileage != null) {
      //     if (isCheckin) setCheckinMileage(mileage);
      //     else setCheckoutForm((prev) => ({ ...prev, mileage }));
      //   }
      //   if (fuel != null) {
      //     if (isCheckin) setCheckinFuel(fuel);
      //     else setCheckoutForm((prev) => ({ ...prev, fuel }));
      //   }
      //   if (mileage != null || fuel != null) {
      //     const parts = [];
      //     if (mileage != null) parts.push(`${mileage.toLocaleString()} km`);
      //     if (fuel != null) parts.push(`연료 ${fuel === 0 ? "E" : fuel === 100 ? "F" : fuel + "%"}`);
      //     toast.success(`🔢 인식 완료: ${parts.join(" · ")}`, { duration: 3000 });
      //   } else {
      //     toast("계기판 숫자를 인식하지 못했습니다. 직접 입력해주세요.", { icon: "📷", duration: 3000 });
      //   }
      // } catch {
      //   // OCR 실패 — 수동 입력 가능
      // } finally {
      //   setOcrLoading(false);
      // }
    }
  };

  // 운행시작 사진 재촬영 (반납 시 수정)
  const handleEditCheckinPhotoChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setEditCheckinPhoto(file);
      setEditCheckinPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleExteriorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      if (exteriorFiles.length + newFiles.length > 10) {
        toast.error("외관 사진은 최대 10장까지만 등록 가능합니다.");
        return;
      }
      setExteriorFiles((prev) => [...prev, ...newFiles]);
      const newPreviews = newFiles.map((f) => URL.createObjectURL(f));
      setExteriorPreviews((prev) => [...prev, ...newPreviews]);
    }
  };

  const removeExterior = (index: number) => {
    setExteriorFiles((prev) => prev.filter((_, i) => i !== index));
    setExteriorPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const compressAndUpload = async (file: File): Promise<string> => {
    let compressed: File = file;
    try {
      compressed = await imageCompression(file, {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
        initialQuality: 0.8,
      });
    } catch {
      // 압축 실패 시 원본 파일로 업로드 진행
    }
    const folder = String(selectedLog?.id ?? "vehicle");
    const formData = new FormData();
    formData.append("file", compressed, file.name || "photo.jpg");
    formData.append("bucket", "vehicle");
    formData.append("folder", folder);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const errMsg = body?.error || `사진 업로드 실패 (${res.status})`;
      throw new Error(errMsg);
    }
    const body = await res.json();
    if (!body?.url) throw new Error("업로드 응답에 URL이 없습니다");
    return body.url as string;
  };

  const handleExtend = async () => {
    if (!selectedLog || !extendDate || !extendTime) {
      return toast.error("연장 날짜와 시간을 입력해주세요.");
    }
    const newEndAt = new Date(`${extendDate}T${extendTime}`);
    const currentEndAt = new Date(selectedLog.end_at);
    if (newEndAt <= currentEndAt) {
      return toast.error("연장 시간은 현재 반납 예정 시간보다 늦어야 합니다.");
    }
    const ok = await showConfirm(
      `반납 시간을 ${extendDate} ${extendTime}으로 연장하시겠습니까?`,
    );
    if (!ok) return;
    const res = await fetch("/api/vehicle/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: selectedLog.id,
        updates: { end_at: newEndAt.toISOString() },
      }),
    });
    const result = await res.json();
    if (!res.ok) return toast.error(result.error || "연장 실패");
    toast.success("반납 시간이 연장되었습니다.");
    setShowExtendForm(false);
    onRefresh();
    onClose();
  };

  const handleRestoreNoshow = async () => {
    if (!selectedLog) return;
    const ok = await showConfirm(
      "노쇼 복구",
      "노쇼 상태를 '예약됨'으로 복구하시겠습니까?\n복구 후 바로 운행 시작 입력이 가능합니다.",
    );
    if (!ok) return;
    const { error } = await supabase
      .from("reservations")
      .update({ vehicle_status: "reserved" })
      .eq("id", selectedLog.id);
    if (error) {
      toast.error("복구 실패: " + error.message);
    } else {
      // 모달을 닫지 않고 로컬 상태만 변경 —
      // onRefresh()를 호출하면 autoExpireReservations()가 즉시 재실행되어
      // end_at이 오래된 예약은 다시 noshow로 돌아가는 문제가 있음
      setRestoredAsReserved(true);
      toast.success("복구 완료! 아래에서 운행 시작을 입력해주세요.");
    }
  };

  const saveFuelSegments = async (segments: number) => {
    setFuelSegments(segments);
    setShowFuelSettings(false);
    if (!selectedLog?.resource_id) return;
    const { error } = await supabase
      .from("resources")
      .update({ fuel_segments: segments })
      .eq("id", selectedLog.resource_id);
    if (error) toast.error("설정 저장 실패");
  };

  const handleSubmit = async (action: "checkin" | "checkout") => {
    if (!selectedLog) return;

    if (action === "checkin") {
      if (String(checkinMileage).trim() === "")
        return toast.error("계기판 거리를 입력해주세요.");
      if (!dashImage) return toast.error("계기판 사진은 필수입니다.");
      if (!isApprover && exteriorFiles.length < 4)
        return toast.error("차량 외관 사진을 최소 4장 등록해주세요.");
    } else {
      if (String(checkoutForm.mileage).trim() === "")
        return toast.error("도착 거리를 입력해주세요.");
      const effectiveStart =
        editCheckinMileage !== ""
          ? Number(editCheckinMileage)
          : selectedLog.start_mileage;
      // 거리가 입력된 경우에만 대소 검증
      if (
        String(checkoutForm.mileage).trim() !== "" &&
        effectiveStart !== null &&
        effectiveStart !== undefined &&
        Number(checkoutForm.mileage) <= effectiveStart
      )
        return toast.error(
          `도착 거리(${checkoutForm.mileage}km)는 출발 거리(${effectiveStart}km)보다 커야 합니다.`,
        );
      if (!isApprover && String(checkoutForm.parking).trim() === "")
        return toast.error("주차 위치를 입력해주세요.");
      if (!dashImage) return toast.error("계기판 사진은 필수입니다.");
      if (!isApprover && exteriorFiles.length < 4)
        return toast.error("차량 외관 사진을 최소 4장 등록해주세요.");
    }

    const ok = await showConfirm(
      action === "checkin"
        ? "운행을 시작하시겠습니까?"
        : "반납을 완료하시겠습니까?",
    );
    if (!ok) return;

    setUploading(true);
    try {
      const allFiles = [dashImage!, ...exteriorFiles];
      const allUrls = await Promise.all(
        allFiles.map((f) => compressAndUpload(f)),
      );
      const [dashUrl, ...extUrls] = allUrls;

      const updates: any = {};
      if (action === "checkin") {
        updates.vehicle_status = "in_use";
        updates.checkin_photo_url = dashUrl;
        updates.checkin_exterior_urls = extUrls;
        updates.start_mileage = Number(checkinMileage);
        updates.fuel_level_start = checkinFuel;
      } else {
        updates.vehicle_status = "returned";
        updates.checkout_photo_url = dashUrl;
        updates.checkout_exterior_urls = extUrls;
        updates.end_mileage = Number(checkoutForm.mileage);
        updates.cleanup_status = checkoutForm.cleanup;
        updates.parking_location = checkoutForm.parking;
        updates.vehicle_condition = checkoutForm.condition;
        updates.fuel_level_end = checkoutForm.fuel;
        if (checkoutForm.incidentType) {
          updates.incident_type = checkoutForm.incidentType;
        }
        // 운행시작 정보 수정 반영
        if (editCheckinMileage !== "") {
          updates.start_mileage = Number(editCheckinMileage);
        }
        if (editCheckinFuel !== null) {
          updates.fuel_level_start = editCheckinFuel;
        }
        // 운행시작 사진 수정 반영
        if (editCheckinPhoto) {
          const editPhotoUrl = await compressAndUpload(editCheckinPhoto);
          updates.checkin_photo_url = editPhotoUrl;
        }
      }

      // 서버 API 경유: 클라이언트 RLS 우회 (service_role 사용)
      const res = await fetch("/api/vehicle/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: selectedLog.id, updates }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || `저장 실패 (${res.status})`);
      }

      // resources.current_mileage 업데이트는 DB 트리거(trigger_update_mileage)가 처리
      if (action === "checkin") {
        toast.success("🚗 차량 운행이 시작되었습니다!", { duration: 4000 });
      } else {
        toast.success("✅ 차량 반납이 완료되었습니다!", { duration: 4000 });
      }
      onRefresh();
      onClose();
    } catch (e: any) {
      const msg = e?.message || e?.toString?.() || "알 수 없는 오류";
      toast.error("오류 발생: " + msg);
    } finally {
      setUploading(false);
    }
  };

  const openZoom = (url: string) => {
    const allImages = [
      selectedLog?.checkin_photo_url,
      ...(selectedLog?.checkin_exterior_urls || []),
      selectedLog?.checkout_photo_url,
      ...(selectedLog?.checkout_exterior_urls || []),
    ]
      .filter(Boolean)
      .map((u) => toProxyUrl(u as string));

    setZoomImages(allImages);
    setZoomIndex(allImages.indexOf(url));
  };

  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomIndex((prev) => (prev > 0 ? prev - 1 : zoomImages.length - 1));
  };
  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomIndex((prev) => (prev < zoomImages.length - 1 ? prev + 1 : 0));
  };

  const renderTextWithPhoneIcon = (text: string) => {
    if (!text) return null;
    const phoneRegex = /(\d{2,4}-\d{3,4}-\d{4}|\d{4}-\d{4,5})/g;

    return text.split("\n").map((line, lineIndex) => {
      const parts = line.split(phoneRegex);
      return (
        <div key={lineIndex} className="leading-relaxed">
          {parts.map((part, partIndex) => {
            if (part.match(phoneRegex)) {
              return (
                <a
                  key={partIndex}
                  href={`tel:${part.replace(/-/g, "")}`} // 전화 걸기 링크 (하이픈 제거)
                  className="inline-flex items-center gap-1 text-blue-600 font-bold hover:text-blue-800 transition bg-blue-50 px-1.5 py-0.5 rounded-md ml-0.5"
                >
                  {part}
                  {/* 📞 전화기 아이콘 */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-3.5 h-3.5"
                  >
                    <path
                      fillRule="evenodd"
                      d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                </a>
              );
            }
            return <span key={partIndex}>{part}</span>;
          })}
        </div>
      );
    });
  };

  const isAdmin =
    currentProfile?.is_approver === true || currentProfile?.role === "admin";

  // 노쇼 복구 후에는 로컬에서 "reserved"로 취급
  const effectiveStatus = restoredAsReserved
    ? "reserved"
    : selectedLog?.vehicle_status;

  // 예약자(user_id) 또는 운전자(driver_name === 현재 유저 이름) 또는 관리자
  const isDriver =
    !!currentUserName && selectedLog?.driver_name === currentUserName;
  const isMyTurn =
    (selectedLog?.user_id === currentUser || isDriver || isAdmin) &&
    effectiveStatus !== "returned" &&
    effectiveStatus !== "noshow";
  const actionType = effectiveStatus === "reserved" ? "checkin" : "checkout";

  const isApprover = currentProfile?.is_approver === true;

  // 공통 필수: 사진 + 주행거리 / 결재권자: 외관사진 선택, 일반: 외관 4장 + 주차위치 필수
  const isFormValid =
    actionType === "checkin"
      ? dashImage !== null &&
        String(checkinMileage).trim() !== "" &&
        (isApprover || exteriorFiles.length >= 4)
      : dashImage !== null &&
        String(checkoutForm.mileage).trim() !== "" &&
        (isApprover || (String(checkoutForm.parking).trim() !== "" && exteriorFiles.length >= 4));

  const ActionSection = isMyTurn ? (
    <div
      className={`bg-white border rounded-sm overflow-hidden ${actionType === "checkin" ? "border-green-200" : "border-red-200"}`}
    >
      {/* 상단 헤더 바 */}
      <div
        className={`px-4 py-2.5 flex items-center gap-2 border-b ${actionType === "checkin" ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}
      >
        <span
          className={`w-1.5 h-4 rounded-full shrink-0 ${actionType === "checkin" ? "bg-green-500" : "bg-red-500"}`}
        />
        <span
          className={`text-sm font-bold ${actionType === "checkin" ? "text-green-700" : "text-red-700"}`}
        >
          {actionType === "checkin" ? "이용 시작" : "반납하기"}
        </span>
      </div>

      <div className="p-4 space-y-5">
        {/* ─── 계기판 사진 업로드 ──────────────────────────── */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">
            계기판 사진 <span className="text-red-500">*</span>
            <span className="text-xs font-normal text-gray-400 ml-2">
              촬영 후 직접 입력해주세요
            </span>
          </p>
          {!dashPreview ? (
            <label className="flex flex-col items-center justify-center h-44 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-100 transition active:bg-gray-200">
              <svg
                className="w-12 h-12 text-gray-300 mb-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span className="text-gray-600 font-bold text-base">
                탭하여 계기판 촬영
              </span>
              <span className="text-xs text-gray-400 mt-1.5">
                촬영 후 아래에 직접 입력해주세요
              </span>
              <input
                type="file"
                accept="image/*"
                capture={undefined}
                className="hidden"
                onChange={handleDashChange}
              />
            </label>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-gray-200">
              <img
                src={dashPreview}
                className="w-full h-44 object-cover"
                alt="계기판"
              />
              {ocrLoading && (
                <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-3">
                  <svg
                    className="w-9 h-9 text-white animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
                    />
                  </svg>
                  <span className="text-white text-sm font-bold">
                    계기판 인식 중...
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setDashImage(null);
                  setDashPreview(null);
                  setCheckinMileage("");
                  setCheckoutForm((p) => ({ ...p, mileage: "" }));
                }}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80 transition"
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
          )}
        </div>

        {/* 이전 탑승자 메모 (이용시작 시에만 표시) */}
        {actionType === "checkin" && prevNote && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
            <div className="shrink-0 mt-0.5">
              <svg
                className="w-4 h-4 text-amber-500"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-700 mb-1">
                이전 탑승자 메모 · {prevNote.driver} (
                {format(new Date(prevNote.date), "M.d")})
              </p>
              <p className="text-sm text-amber-800 leading-relaxed whitespace-pre-wrap break-words">
                {prevNote.note}
              </p>
            </div>
          </div>
        )}

        {/* ─── 계기판 거리 ──────────────────────────────────── */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            {actionType === "checkin" ? "출발 전" : "도착 후"} 계기판 거리 (km)
            <span className="text-red-500 ml-0.5">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              value={
                actionType === "checkin" ? checkinMileage : checkoutForm.mileage
              }
              className={`w-full px-3 py-2.5 border rounded-sm text-base font-mono bg-gray-50 focus:bg-white focus:border-gray-400 focus:ring-1 focus:ring-gray-300 outline-none placeholder:text-gray-300 transition ${
                ocrLoading ? "border-blue-300 bg-blue-50/30" : "border-gray-200"
              }`}
              placeholder={
                ocrLoading
                  ? "계기판 인식 중..."
                  : actionType === "checkin"
                    ? "예: 54000"
                    : `출발: ${selectedLog?.start_mileage?.toLocaleString()}`
              }
              onChange={(e) =>
                actionType === "checkin"
                  ? setCheckinMileage(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  : setCheckoutForm({
                      ...checkoutForm,
                      mileage:
                        e.target.value === "" ? "" : Number(e.target.value),
                    })
              }
            />
            {ocrLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <svg
                  className="w-4 h-4 text-blue-500 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
                  />
                </svg>
                <span className="text-xs text-blue-500 font-medium">
                  인식 중
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 연료 게이지 — 슬라이더 */}
        {(() => {
          const currentFuel =
            actionType === "checkin" ? checkinFuel : checkoutForm.fuel;
          const setFuel = (v: number) =>
            actionType === "checkin"
              ? setCheckinFuel(v)
              : setCheckoutForm((p) => ({ ...p, fuel: v }));

          const isLow = currentFuel <= (fuelSegments === 10 ? 10 : 12);
          const isWarn = currentFuel <= (fuelSegments === 10 ? 20 : 25);
          const fillColor = isLow
            ? "bg-red-400"
            : isWarn
              ? "bg-amber-400"
              : "bg-sky-400";
          const thumbRing = isLow
            ? "ring-red-300"
            : isWarn
              ? "ring-amber-300"
              : "ring-sky-300";
          const valueColor = isLow
            ? "text-red-500"
            : isWarn
              ? "text-amber-500"
              : "text-sky-600";

          const displayLabel = fuelLabel(currentFuel)!;

          const snapFromPointer = (clientX: number, rect: DOMRect) => {
            const pct = Math.max(
              0,
              Math.min(1, (clientX - rect.left) / rect.width),
            );
            const raw = Math.round(pct * 100);
            return SNAP_POINTS.reduce((a, b) =>
              Math.abs(b - raw) < Math.abs(a - raw) ? b : a,
            );
          };

          return (
            <div>
              {/* 레이블 + 칸 수 설정 버튼 */}
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-semibold text-gray-700">
                  {actionType === "checkin" ? "출발 연료" : "도착 연료"}
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowFuelSettings((v) => !v)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 transition cursor-pointer"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    {fuelSegments}칸
                  </button>
                  {showFuelSettings && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-1.5 flex gap-1">
                      {[8, 10].map((seg) => (
                        <button
                          key={seg}
                          type="button"
                          onClick={() => saveFuelSegments(seg)}
                          className={`px-3 py-1.5 rounded text-xs font-bold transition cursor-pointer ${
                            fuelSegments === seg
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          {seg}칸
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-5 pt-3 pb-4 select-none">
                {/* 현재값 표시 */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-gray-400 font-medium">
                    연료 게이지
                  </span>
                  <span className={`text-sm font-bold ${valueColor}`}>
                    {displayLabel}
                  </span>
                </div>

                {/* 드래그 가능한 슬라이더 */}
                <div
                  className="relative h-8 flex items-center cursor-pointer touch-none"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setFuel(
                      snapFromPointer(
                        e.clientX,
                        e.currentTarget.getBoundingClientRect(),
                      ),
                    );
                  }}
                  onPointerMove={(e) => {
                    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                    setFuel(
                      snapFromPointer(
                        e.clientX,
                        e.currentTarget.getBoundingClientRect(),
                      ),
                    );
                  }}
                >
                  {/* 배경 트랙 */}
                  <div className="absolute inset-x-0 h-1.5 bg-gray-100 rounded-full" />
                  {/* 채움 */}
                  <div
                    className={`absolute left-0 h-1.5 rounded-full transition-[width] duration-75 ${fillColor}`}
                    style={{ width: `${currentFuel}%` }}
                  />
                  {/* 썸 — 타원 */}
                  <div
                    className={`absolute h-5 w-10 bg-gradient-to-b from-white to-gray-50 rounded-full shadow-md ring-2 pointer-events-none transition-[left] duration-75 ${thumbRing}`}
                    style={{
                      left: `clamp(0px, calc(${currentFuel}% - 20px), calc(100% - 40px))`,
                    }}
                  />
                </div>

                {/* 눈금 (TICK_MARKS 기준 — overflow:visible로 E/F 클립 방지) */}
                <div
                  className="relative mt-0.5 h-6"
                  style={{ overflow: "visible" }}
                >
                  {TICK_MARKS.map((v) => {
                    const isLarge = LARGE_TICKS.has(v);
                    return (
                      <div
                        key={v}
                        className="absolute flex flex-col items-center cursor-pointer"
                        style={{ left: `${v}%`, transform: "translateX(-50%)" }}
                        onClick={() => setFuel(v)}
                      >
                        <div
                          className={`rounded-full ${
                            isLarge
                              ? "w-0.5 h-3 bg-gray-400"
                              : "w-px h-2 bg-gray-200"
                          }`}
                        />
                        {(v === 0 || v === 100) && (
                          <span className="text-[10px] font-bold text-gray-400 mt-0.5">
                            {v === 0 ? "E" : "F"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ─── 외관 사진 ──────────────────────────────────── */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="text-sm font-semibold text-gray-700">
              차량 외관 사진
              {isApprover ? (
                <span className="text-gray-400 text-xs font-normal ml-1">
                  (선택)
                </span>
              ) : (
                <span className="text-red-500 ml-0.5">*</span>
              )}
            </label>
            <span className="text-xs text-gray-400">
              {isApprover ? "선택 사항" : "4장 이상 필수"}
            </span>
          </div>
          {!isApprover && (
            <p className="text-[11px] font-bold text-red-500 mb-3">
              ※ 차량 대각선 방향으로 최소 4장 이상 찍어주세요
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {exteriorFiles.length < 10 && (
              <label className="w-[88px] h-[88px] flex flex-col items-center justify-center bg-gray-50 border border-dashed border-gray-300 rounded-sm cursor-pointer hover:bg-gray-100 transition shrink-0">
                <svg
                  className="w-6 h-6 text-blue-400 mb-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span
                  className={`text-xs font-bold ${isApprover ? "text-gray-400" : exteriorFiles.length < 4 ? "text-red-500" : "text-green-500"}`}
                >
                  {isApprover
                    ? exteriorFiles.length > 0
                      ? `${exteriorFiles.length}장`
                      : "추가"
                    : exteriorFiles.length < 4
                      ? `${exteriorFiles.length}/4`
                      : `${exteriorFiles.length}장`}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleExteriorChange}
                />
              </label>
            )}
            {exteriorPreviews.map((src, idx) => (
              <div
                key={idx}
                className="w-[88px] h-[88px] relative rounded-sm overflow-hidden border border-gray-200 shrink-0"
              >
                <img
                  src={src}
                  className="w-full h-full object-cover"
                  alt="외관"
                />
                <button
                  onClick={() => removeExterior(idx)}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition"
                >
                  <svg
                    className="w-3.5 h-3.5"
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
            ))}
          </div>
        </div>

        {/* 반납 추가 정보 */}
        {actionType === "checkout" && (
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                id="cleanup"
                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300 cursor-pointer"
                checked={checkoutForm.cleanup}
                onChange={(e) =>
                  setCheckoutForm({
                    ...checkoutForm,
                    cleanup: e.target.checked,
                  })
                }
              />
              <label
                htmlFor="cleanup"
                className="text-sm font-semibold text-gray-700 cursor-pointer select-none"
              >
                차량 내부 쓰레기 정리를 완료했습니다.
              </label>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                주차 위치 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="예: 교육관"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-sm text-sm bg-gray-50 focus:bg-white focus:border-gray-400 focus:ring-1 focus:ring-gray-300 outline-none transition"
                value={checkoutForm.parking}
                onChange={(e) =>
                  setCheckoutForm({ ...checkoutForm, parking: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                차량 특이사항 (선택)
              </label>
              <textarea
                placeholder="스크래치, 경고등, 기타 이상 사항 등"
                rows={3}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-sm text-sm bg-gray-50 focus:bg-white focus:border-gray-400 focus:ring-1 focus:ring-gray-300 outline-none transition resize-none"
                value={checkoutForm.condition}
                onChange={(e) =>
                  setCheckoutForm({
                    ...checkoutForm,
                    condition: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                이상 유형 (해당 시 선택)
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "accident", label: "사고" },
                  { key: "breakdown", label: "고장" },
                  { key: "scratch", label: "흠집" },
                  { key: "other", label: "기타" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setCheckoutForm((p) => ({
                        ...p,
                        incidentType: p.incidentType === key ? null : key,
                      }))
                    }
                    className={`px-3 py-1.5 rounded-sm text-sm font-semibold border transition cursor-pointer ${checkoutForm.incidentType === key ? "bg-red-500 text-white border-red-500 hover:bg-red-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 hover:border-gray-300"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  // 반납 시 — 이용시작 정보 수정 카드 (반납하기 위에 표시)
  const CheckinEditCard =
    isMyTurn && actionType === "checkout" ? (
      <div className="bg-white border border-green-200 rounded-sm overflow-hidden">
        {/* 헤더 — 탭하면 펼침 */}
        <button
          type="button"
          onClick={() => setShowCheckinEdit((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-green-50 hover:bg-green-100 transition text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-4 rounded-full bg-green-500 shrink-0" />
            <span className="text-sm font-bold text-green-700">
              이용 시작 정보
            </span>
            <span className="text-xs text-gray-400 truncate">
              {editCheckinMileage !== ""
                ? `${Number(editCheckinMileage).toLocaleString()} km`
                : selectedLog?.start_mileage != null
                  ? `${selectedLog.start_mileage.toLocaleString()} km`
                  : "미입력"}
              {" · "}연료{" "}
              {fuelLabel(
                editCheckinFuel !== null
                  ? editCheckinFuel
                  : (selectedLog?.fuel_level_start ?? 100),
              )}
            </span>
            {(editCheckinMileage !== "" ||
              editCheckinFuel !== null ||
              editCheckinPhoto) && (
              <span className="text-[10px] text-orange-500 font-bold shrink-0">
                (수정됨)
              </span>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${showCheckinEdit ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {/* 펼쳐진 내용 */}
        {showCheckinEdit && (
          <div className="p-4 space-y-4 border-t border-green-100">
            {/* 출발 계기판 사진 */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">
                출발 계기판 사진
                <span className="text-xs font-normal text-gray-400 ml-1">
                  (수정 시 재촬영)
                </span>
              </p>
              {(() => {
                const preview =
                  editCheckinPhotoPreview ||
                  (selectedLog?.checkin_photo_url
                    ? toProxyUrl(selectedLog.checkin_photo_url)
                    : null);
                if (preview) {
                  return (
                    <div className="relative rounded-xl overflow-hidden border border-gray-200">
                      <img
                        src={preview}
                        className="w-full h-36 object-cover"
                        alt="출발 계기판"
                      />
                      <label className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/60 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-black/80 transition">
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        재촬영
                        <input
                          type="file"
                          accept="image/*"
                          capture={undefined}
                          className="hidden"
                          onChange={handleEditCheckinPhotoChange}
                        />
                      </label>
                      {editCheckinPhotoPreview && (
                        <span className="absolute top-2 left-2 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                          수정됨
                        </span>
                      )}
                    </div>
                  );
                } else {
                  return (
                    <label className="flex flex-col items-center justify-center h-28 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-100 transition">
                      <svg
                        className="w-8 h-8 text-gray-300 mb-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      <span className="text-sm text-gray-500 font-medium">
                        출발 계기판 사진 촬영
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        capture={undefined}
                        className="hidden"
                        onChange={handleEditCheckinPhotoChange}
                      />
                    </label>
                  );
                }
              })()}
            </div>

            {/* 출발 계기판 거리 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                출발 계기판 거리 (km)
              </label>
              <input
                type="number"
                value={editCheckinMileage}
                onChange={(e) =>
                  setEditCheckinMileage(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                placeholder={
                  selectedLog?.start_mileage != null
                    ? `현재: ${selectedLog.start_mileage.toLocaleString()}`
                    : "km 입력"
                }
                className="w-full px-3 py-2.5 border border-gray-200 rounded-sm text-sm font-mono bg-gray-50 focus:bg-white focus:border-green-400 outline-none transition"
              />
            </div>

            {/* 출발 연료 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                출발 연료
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[0, 12, 25, 37, 50, 62, 75, 87, 100].map((v) => {
                  const cur =
                    editCheckinFuel !== null
                      ? editCheckinFuel
                      : (selectedLog?.fuel_level_start ?? 100);
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setEditCheckinFuel(v)}
                      className={`px-2.5 py-1.5 rounded text-xs font-bold border transition ${
                        cur === v
                          ? "bg-green-500 text-white border-green-500"
                          : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      {v === 0 ? "E" : v === 100 ? "F" : `${v}%`}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    ) : null;

  const ModalContent = (
    <div className="space-y-8 pb-4">
      {/* 이용시작 정보 수정 카드 (반납 시 반납하기 위에 표시) */}
      {CheckinEditCard}

      {/* 이용시작 / 반납하기 */}
      {ActionSection}

      {/* 상세 정보 */}
      <div className="border border-gray-200 rounded-sm overflow-hidden bg-white">
        <div className="px-4 py-2.5 flex items-center gap-2 border-b border-gray-100 bg-gray-50">
          <span className="w-1.5 h-4 rounded-full shrink-0 bg-gray-400" />
          <span className="text-sm font-bold text-gray-600">상세 정보</span>
        </div>
        <InfoRow label="차량 정보">
          <span className="font-bold text-gray-900 mr-2 text-base">
            {selectedLog?.resources?.name}
          </span>
          <span className="text-gray-500">
            ({selectedLog?.resources?.description})
          </span>
        </InfoRow>
        <InfoRow label="보험 정보">
          <div className="space-y-1.5 w-full">
            {selectedLog?.resources?.insurance_info &&
              renderTextWithPhoneIcon(selectedLog.resources.insurance_info)}
            {renderTextWithPhoneIcon(INSURANCE_MOCK)}
          </div>
        </InfoRow>
        {selectedLog?.profiles?.full_name && (
          <InfoRow label="예약자">
            <span className="font-medium">
              {selectedLog.profiles.full_name}
            </span>
          </InfoRow>
        )}
        <InfoRow label="운전자">
          <span className="font-medium">{selectedLog?.driver_name}</span>
        </InfoRow>
        {selectedLog?.department && (
          <InfoRow label="사용부서">
            <span>{selectedLog.department}</span>
          </InfoRow>
        )}
        <InfoRow label="운행 시간">
          {selectedLog &&
            format(new Date(selectedLog.start_at), "yyyy-MM-dd HH:mm")}{" "}
          ~ {selectedLog && format(new Date(selectedLog.end_at), "HH:mm")}
        </InfoRow>
        <InfoRow label="목적지">{selectedLog?.destination}</InfoRow>
        <InfoRow label="운행 목적" isLast>
          {selectedLog?.purpose}
        </InfoRow>
      </div>

      {/* 2. 운행 결과 (반납 완료 시) */}
      {selectedLog?.vehicle_status === "returned" && (
        <div className="border border-gray-200 rounded-sm overflow-hidden bg-white">
          <div className="px-4 py-2.5 flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-4 rounded-full shrink-0 bg-gray-400" />
              <span className="text-sm font-bold text-gray-600">운행 결과</span>
            </div>
            {isAdmin && !adminResultEdit && (
              <button
                onClick={() => {
                  setAdminFields({
                    start_mileage: selectedLog.start_mileage ?? "",
                    end_mileage: selectedLog.end_mileage ?? "",
                    fuel_level_start: selectedLog.fuel_level_start ?? null,
                    fuel_level_end: selectedLog.fuel_level_end ?? null,
                    parking_location: selectedLog.parking_location ?? "",
                    cleanup_status: selectedLog.cleanup_status ?? true,
                    vehicle_condition:
                      selectedLog.vehicle_condition ?? "이상 없음",
                    incident_type: selectedLog.incident_type ?? null,
                  });
                  setAdminResultEdit(true);
                }}
                className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                수정
              </button>
            )}
            {isAdmin && adminResultEdit && (
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (
                      !(await (async () => {
                        const m = "운행 결과를 수정하시겠습니까?";
                        return window.confirm(m);
                      })())
                    )
                      return;
                    setAdminSaving(true);
                    try {
                      const res = await fetch("/api/vehicle/submit", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          reservationId: selectedLog.id,
                          updates: {
                            start_mileage:
                              adminFields.start_mileage === ""
                                ? null
                                : Number(adminFields.start_mileage),
                            end_mileage:
                              adminFields.end_mileage === ""
                                ? null
                                : Number(adminFields.end_mileage),
                            fuel_level_start: adminFields.fuel_level_start,
                            fuel_level_end: adminFields.fuel_level_end,
                            parking_location: adminFields.parking_location,
                            cleanup_status: adminFields.cleanup_status,
                            vehicle_condition: adminFields.vehicle_condition,
                            incident_type: adminFields.incident_type,
                          },
                        }),
                      });
                      const json = await res.json();
                      if (!res.ok) {
                        toast.error(json.error || "수정 실패");
                        return;
                      }
                      toast.success("운행 결과가 수정되었습니다.");
                      setAdminResultEdit(false);
                      onRefresh();
                    } finally {
                      setAdminSaving(false);
                    }
                  }}
                  disabled={adminSaving}
                  className="text-xs text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded font-bold disabled:opacity-60"
                >
                  {adminSaving ? "저장 중..." : "저장"}
                </button>
                <button
                  onClick={() => setAdminResultEdit(false)}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded font-bold"
                >
                  취소
                </button>
              </div>
            )}
          </div>

          {/* 읽기 모드 */}
          {
            !adminResultEdit && (
              <>
                <InfoRow label="주행 거리">
                  {selectedLog.start_mileage?.toLocaleString()} km →{" "}
                  <span className="font-bold text-blue-600 ml-2 text-base">
                    {selectedLog.end_mileage?.toLocaleString()} km
                  </span>
                  <span className="ml-2 text-base text-gray-400">
                    (
                    {(
                      selectedLog.end_mileage! - selectedLog.start_mileage!
                    ).toLocaleString()}{" "}
                    km 주행)
                  </span>
                </InfoRow>
                <InfoRow label="주차 위치">
                  {selectedLog.parking_location}
                </InfoRow>
                <InfoRow label="연료 상태">
                  <div className="flex items-center gap-3">
                    {selectedLog.fuel_level_start != null && (
                      <span className="text-base">
                        출발{" "}
                        <span className="font-bold text-blue-600">
                          {fuelLabel(selectedLog.fuel_level_start)}
                        </span>
                      </span>
                    )}
                    {selectedLog.fuel_level_start != null &&
                      selectedLog.fuel_level_end != null && (
                        <span className="text-gray-400">→</span>
                      )}
                    {selectedLog.fuel_level_end != null && (
                      <span className="text-base">
                        도착{" "}
                        <span
                          className={`font-bold ${selectedLog.fuel_level_end <= 25 ? "text-red-500" : "text-green-600"}`}
                        >
                          {fuelLabel(selectedLog.fuel_level_end)}
                        </span>
                      </span>
                    )}
                    {selectedLog.fuel_level_start == null &&
                      selectedLog.fuel_level_end == null && (
                        <span className="text-gray-400 text-sm">미기록</span>
                      )}
                  </div>
                </InfoRow>
                <InfoRow label="차량 상태">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
                    <span
                      className={`px-3 py-1 rounded w-max text-xs font-bold ${selectedLog.cleanup_status ? "bg-gray-100 text-gray-700" : "bg-red-50 text-red-600"}`}
                    >
                      {selectedLog.cleanup_status ? "청소 완료" : "청소 미흡"}
                    </span>
                    {selectedLog.incident_type && (
                      <span className="px-3 py-1 rounded text-xs font-bold bg-red-100 text-red-600">
                        {selectedLog.incident_type === "accident"
                          ? "사고"
                          : selectedLog.incident_type === "breakdown"
                            ? "고장"
                            : selectedLog.incident_type === "scratch"
                              ? "흠집"
                              : "기타"}
                      </span>
                    )}
                    <span className="text-gray-800">
                      {selectedLog.vehicle_condition || "특이사항 없음"}
                    </span>
                  </div>
                </InfoRow>
                <InfoRow label="운행 전">
                  <div className="flex flex-wrap gap-2 py-1">
                    {[
                      selectedLog.checkin_photo_url,
                      ...(selectedLog.checkin_exterior_urls || []),
                    ].filter(Boolean).length > 0 ? (
                      [
                        selectedLog.checkin_photo_url,
                        ...(selectedLog.checkin_exterior_urls || []),
                      ].map(
                        (url, i) =>
                          url && (
                            <div
                              key={`checkin-${i}`}
                              className="w-[80px] h-[80px] shrink-0 rounded-sm border border-gray-200 overflow-hidden cursor-pointer hover:opacity-80 transition"
                              onClick={() => openZoom(toProxyUrl(url))}
                            >
                              <img
                                src={toProxyUrl(url)}
                                className="w-full h-full object-cover"
                                alt="운행 전 사진"
                                onError={(e) => {
                                  const t = e.currentTarget;
                                  t.style.display = "none";
                                  const parent = t.parentElement;
                                  if (
                                    parent &&
                                    !parent.querySelector(".img-error")
                                  ) {
                                    const div = document.createElement("div");
                                    div.className =
                                      "img-error w-full h-full flex flex-col items-center justify-center bg-gray-100 text-gray-400 text-[10px] gap-1";
                                    div.innerHTML =
                                      '<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg><span>로드 실패</span>';
                                    parent.appendChild(div);
                                  }
                                }}
                              />
                            </div>
                          ),
                      )
                    ) : (
                      <p className="text-sm text-gray-400">없음</p>
                    )}
                  </div>
                </InfoRow>
                <InfoRow label="운행 후" isLast>
                  <div className="flex flex-wrap gap-2 py-1">
                    {[
                      selectedLog.checkout_photo_url,
                      ...(selectedLog.checkout_exterior_urls || []),
                    ].filter(Boolean).length > 0 ? (
                      [
                        selectedLog.checkout_photo_url,
                        ...(selectedLog.checkout_exterior_urls || []),
                      ].map(
                        (url, i) =>
                          url && (
                            <div
                              key={`checkout-${i}`}
                              className="w-[80px] h-[80px] shrink-0 rounded-sm border border-gray-200 overflow-hidden cursor-pointer hover:opacity-80 transition"
                              onClick={() => openZoom(toProxyUrl(url))}
                            >
                              <img
                                src={toProxyUrl(url)}
                                className="w-full h-full object-cover"
                                alt="운행 후 사진"
                                onError={(e) => {
                                  const t = e.currentTarget;
                                  t.style.display = "none";
                                  const parent = t.parentElement;
                                  if (
                                    parent &&
                                    !parent.querySelector(".img-error")
                                  ) {
                                    const div = document.createElement("div");
                                    div.className =
                                      "img-error w-full h-full flex flex-col items-center justify-center bg-gray-100 text-gray-400 text-[10px] gap-1";
                                    div.innerHTML =
                                      '<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg><span>로드 실패</span>';
                                    parent.appendChild(div);
                                  }
                                }}
                              />
                            </div>
                          ),
                      )
                    ) : (
                      <p className="text-sm text-gray-400">없음</p>
                    )}
                  </div>
                </InfoRow>
              </>
            ) /* !adminResultEdit 읽기 모드 끝 */
          }

          {/* 관리자 편집 모드 */}
          {adminResultEdit && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    출발 거리 (km)
                  </label>
                  <input
                    type="number"
                    value={adminFields.start_mileage}
                    onChange={(e) =>
                      setAdminFields((p) => ({
                        ...p,
                        start_mileage:
                          e.target.value === "" ? "" : Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono outline-none focus:border-blue-400"
                    placeholder="출발 거리"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    도착 거리 (km)
                  </label>
                  <input
                    type="number"
                    value={adminFields.end_mileage}
                    onChange={(e) =>
                      setAdminFields((p) => ({
                        ...p,
                        end_mileage:
                          e.target.value === "" ? "" : Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono outline-none focus:border-blue-400"
                    placeholder="도착 거리"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    출발 연료 (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={adminFields.fuel_level_start ?? ""}
                    onChange={(e) =>
                      setAdminFields((p) => ({
                        ...p,
                        fuel_level_start:
                          e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono outline-none focus:border-blue-400"
                    placeholder="0~100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    도착 연료 (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={adminFields.fuel_level_end ?? ""}
                    onChange={(e) =>
                      setAdminFields((p) => ({
                        ...p,
                        fuel_level_end:
                          e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono outline-none focus:border-blue-400"
                    placeholder="0~100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  주차 위치
                </label>
                <input
                  type="text"
                  value={adminFields.parking_location}
                  onChange={(e) =>
                    setAdminFields((p) => ({
                      ...p,
                      parking_location: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-400"
                  placeholder="주차 위치 입력"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="text-xs font-bold text-gray-500">
                  청소 상태
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setAdminFields((p) => ({
                      ...p,
                      cleanup_status: !p.cleanup_status,
                    }))
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${adminFields.cleanup_status ? "bg-gray-100 text-gray-700 border-gray-300" : "bg-red-50 text-red-600 border-red-200"}`}
                >
                  {adminFields.cleanup_status ? "청소 완료" : "청소 미흡"}
                </button>
                <label className="text-xs font-bold text-gray-500 ml-2">
                  사고/이상
                </label>
                <select
                  value={adminFields.incident_type ?? ""}
                  onChange={(e) =>
                    setAdminFields((p) => ({
                      ...p,
                      incident_type: e.target.value || null,
                    }))
                  }
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs outline-none focus:border-blue-400"
                >
                  <option value="">없음</option>
                  <option value="accident">사고</option>
                  <option value="breakdown">고장</option>
                  <option value="scratch">흠집</option>
                  <option value="other">기타</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  특이사항
                </label>
                <textarea
                  value={adminFields.vehicle_condition}
                  onChange={(e) =>
                    setAdminFields((p) => ({
                      ...p,
                      vehicle_condition: e.target.value,
                    }))
                  }
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-400 resize-none"
                  placeholder="특이사항 입력"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const ModalFooter = (
    <div className="flex flex-col gap-2 w-full">
      {/* 예약 연장 폼 */}
      {showExtendForm && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-sm p-3 space-y-2">
          <span className="text-sm font-bold text-yellow-700 block">
            연장 반납 시간 설정
          </span>
          <div className="flex gap-2 items-start">
            {/* 날짜 — 달력 팝업 */}
            <div className="relative flex-1">
              <div
                onClick={() => setShowExtendCalendar((v) => !v)}
                className="cursor-pointer border border-gray-300 rounded-sm p-2 text-sm bg-white text-center font-bold focus:ring-2 focus:ring-yellow-400 select-none"
              >
                {extendDate || "날짜 선택"}
              </div>
              {showExtendCalendar && (
                <div className="absolute bottom-full left-0 z-50 mb-1 bg-white border border-gray-200 rounded-sm shadow-2xl p-2 animate-fadeIn">
                  <Calendar
                    onChange={(val) => {
                      if (val && !Array.isArray(val)) {
                        setExtendDate(format(val, "yyyy-MM-dd"));
                        setShowExtendCalendar(false);
                      }
                    }}
                    value={extendDate ? new Date(extendDate) : new Date()}
                    minDate={
                      selectedLog ? new Date(selectedLog.end_at) : new Date()
                    }
                    formatDay={(locale, date) => format(date, "d")}
                    calendarType="gregory"
                    locale="ko-KR"
                  />
                </div>
              )}
            </div>
            {/* 시간 */}
            <input
              type="time"
              value={extendTime}
              onChange={(e) => setExtendTime(e.target.value)}
              className="w-28 border border-gray-300 rounded-sm p-2 text-sm outline-none focus:ring-2 focus:ring-yellow-400 bg-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExtend}
              className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-sm text-sm font-bold transition"
            >
              확인
            </button>
            <button
              onClick={() => {
                setShowExtendForm(false);
                setShowExtendCalendar(false);
              }}
              className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-sm text-sm font-bold transition"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 관리자 강제 반납 안내 */}
      {isAdmin && selectedLog?.user_id !== currentUser && isMyTurn && (
        <p className="text-xs text-center text-orange-500 font-bold">
          ⚠️ 관리자 강제 처리 모드
        </p>
      )}

      {/* ─── 버튼 영역 ─── */}
      <div className="flex gap-3 w-full">
        {!isMyTurn && (
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 py-4 rounded-sm text-lg font-bold transition cursor-pointer"
          >
            닫기
          </button>
        )}

        {/* 본인 또는 관리자 — 노쇼 복구 */}
        {(isAdmin || selectedLog?.user_id === currentUser) &&
          effectiveStatus === "noshow" && (
            <button
              onClick={handleRestoreNoshow}
              className="flex-1 bg-orange-50 hover:bg-orange-100 active:bg-orange-200 text-orange-600 py-4 rounded-sm text-lg font-bold transition cursor-pointer border border-orange-200"
            >
              노쇼 복구
            </button>
          )}

        {/* 예약 취소 및 예약 수정 버튼 */}
        {isMyTurn && actionType === "checkin" && (
          <>
            {onCancel && (
              <button
                onClick={() => onCancel(selectedLog!.id)}
                className="flex-1 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600 py-4 rounded-sm text-lg font-bold transition cursor-pointer border border-red-200"
              >
                예약 취소
              </button>
            )}
            {onEdit && (
              <button
                onClick={() => onEdit(selectedLog!)}
                className="flex-1 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-600 py-4 rounded-sm text-lg font-bold transition cursor-pointer border border-blue-200"
              >
                예약 수정
              </button>
            )}
          </>
        )}

        {isMyTurn && actionType === "checkout" && !showExtendForm && (
          <button
            onClick={() => {
              const end = new Date(selectedLog!.end_at);
              setExtendDate(end.toISOString().slice(0, 10));
              setExtendTime(end.toISOString().slice(11, 16));
              setShowExtendForm(true);
            }}
            className="flex-1 bg-yellow-50 hover:bg-yellow-100 active:bg-yellow-200 text-yellow-700 py-4 rounded-sm text-lg font-bold transition cursor-pointer border border-yellow-200"
          >
            시간 연장
          </button>
        )}

        {/* 제출 버튼 */}
        {isMyTurn && (
          <button
            onClick={() => handleSubmit(actionType)}
            disabled={uploading || !isFormValid}
            className={`flex-1 text-white py-4 rounded-sm text-lg font-bold transition ${
              uploading || !isFormValid
                ? "bg-gray-300 cursor-not-allowed"
                : actionType === "checkin"
                  ? "bg-green-500 hover:bg-green-600 active:bg-green-700 cursor-pointer"
                  : "bg-red-600 hover:bg-red-700 active:bg-red-800 cursor-pointer"
            }`}
          >
            {ocrLoading
              ? "인식 중..."
              : uploading
                ? "처리 중..."
                : actionType === "checkin"
                  ? "운행 시작"
                  : "반납 완료"}
          </button>
        )}

        {/* 관리자 전용 수정 버튼 (반납 완료 상태) */}
        {isAdmin && selectedLog?.vehicle_status === "returned" && onEdit && (
          <button
            onClick={() => onEdit(selectedLog!)}
            className="w-full flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-gray-600 py-3 rounded-sm text-sm font-bold transition cursor-pointer border border-gray-200"
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
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            관리자 수정
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* 업로드 로딩 오버레이 */}
      {uploading && (
        <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-black/60">
          <div className="bg-white rounded-sm px-10 py-8 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-800 font-bold text-base">
              사진 업로드 중...
            </p>
            <p className="text-gray-400 text-sm">잠시만 기다려 주세요</p>
          </div>
        </div>
      )}

      {/* 슬라이드 애니메이션 스타일 */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slideInRight {
          animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* --- PC 뷰 (일반 모달) — createPortal이 body에 직접 붙으므로 isMobile로 조건 제어 --- */}
      <Modal
        isOpen={isOpen && !isMobile}
        onClose={onClose}
        title="운행 상세 정보"
        footer={ModalFooter}
      >
        {ModalContent}
      </Modal>

      {/* --- 모바일 뷰 (전체화면 슬라이드) --- */}
      {isOpen && isMobile && (
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col animate-slideInRight overflow-hidden">
          {/* 모바일 헤더 */}
          <div className="bg-white px-5 py-5 flex items-center justify-between border-b border-gray-200 shrink-0 sticky top-0 z-10">
            <h2 className="text-lg font-bold text-gray-900">운행 상세 정보</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition"
            >
              <svg
                className="w-7 h-7"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* 모바일 콘텐츠 영역 (패딩 및 여백 확대) */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-7 custom-scrollbar bg-gray-50 pb-32">
            {ModalContent}
          </div>

          {/* 모바일 하단 고정 버튼 영역 */}
          <div className="bg-white p-5 border-t border-gray-200 shrink-0 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] pb-safe absolute bottom-0 w-full z-20">
            {ModalFooter}
          </div>
        </div>
      )}

      {/* --- 이미지 확대 갤러리 (가장 최상위 Z-index) --- */}
      {zoomImages.length > 0 && (
        <div
          className="fixed inset-0 z-[10000] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out animate-fadeIn"
          onClick={() => setZoomImages([])}
        >
          {zoomImages.length > 1 && (
            <button
              onClick={handlePrevImage}
              className="absolute left-2 md:left-5 text-white bg-black/50 rounded-full p-3 md:p-4 hover:bg-black/80 z-10 transition cursor-pointer"
            >
              <svg
                className="w-8 h-8 md:w-10 md:h-10"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          )}

          <img
            src={zoomImages[zoomIndex]}
            className="max-w-full max-h-[90vh] rounded shadow-2xl object-contain cursor-default"
            alt="zoom"
            onClick={(e) => e.stopPropagation()}
          />

          {zoomImages.length > 1 && (
            <button
              onClick={handleNextImage}
              className="absolute right-2 md:right-5 text-white bg-black/50 rounded-full p-3 md:p-4 hover:bg-black/80 z-10 transition cursor-pointer"
            >
              <svg
                className="w-8 h-8 md:w-10 md:h-10"
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
          )}

          <button className="absolute top-6 right-6 text-white bg-black/50 rounded-full p-2.5 hover:bg-black/80 z-10 cursor-pointer">
            <svg
              className="w-8 h-8"
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

          {zoomImages.length > 1 && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white bg-black/60 px-5 py-2 rounded-full text-base font-bold tracking-widest z-10">
              {zoomIndex + 1} / {zoomImages.length}
            </div>
          )}
        </div>
      )}
    </>
  );
}
