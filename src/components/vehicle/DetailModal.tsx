"use client";
import { useState, useEffect } from "react";
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

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLog: VehicleLog | null;
  currentUser: string | null;
  currentProfile?: { is_approver: boolean; role: string } | null;
  onRefresh: () => void;
  onCancel?: (id: number) => void;
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
    className={`flex border-b border-gray-200 ${isLast ? "border-b-0" : ""}`}
  >
    <div className="w-32 sm:w-36 bg-gray-50 p-4 sm:p-5 text-sm font-bold text-gray-600 flex items-center shrink-0 border-r border-gray-200">
      {label}
    </div>
    <div className="flex-1 p-4 sm:p-5 text-sm text-gray-800 flex items-center bg-white min-w-0 break-keep leading-relaxed">
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
  currentProfile,
  onRefresh,
  onCancel,
}: DetailModalProps) {
  const supabase = createClient();
  const [uploading, setUploading] = useState(false);

  const [checkinMileage, setCheckinMileage] = useState<number | "">("");
  const [checkinFuel, setCheckinFuel] = useState<number>(100);
  const [checkoutForm, setCheckoutForm] = useState({
    mileage: "" as number | "",
    cleanup: true,
    parking: "",
    condition: "이상 없음",
    fuel: 100,
    incidentType: null as string | null,
  });
  const [showExtendForm, setShowExtendForm] = useState(false);
  const [extendDate, setExtendDate] = useState("");
  const [extendTime, setExtendTime] = useState("");
  const [showExtendCalendar, setShowExtendCalendar] = useState(false);

  const [dashImage, setDashImage] = useState<File | null>(null);
  const [dashPreview, setDashPreview] = useState<string | null>(null);
  const [exteriorFiles, setExteriorFiles] = useState<File[]>([]);
  const [exteriorPreviews, setExteriorPreviews] = useState<string[]>([]);

  const [zoomImages, setZoomImages] = useState<string[]>([]);
  const [zoomIndex, setZoomIndex] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      setDashImage(null);
      setDashPreview(null);
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
      setShowExtendForm(false);
      setExtendDate("");
      setExtendTime("");
      setShowExtendCalendar(false);
      setZoomImages([]);
      setZoomIndex(0);
    }
  }, [isOpen]);

  const handleDashChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setDashImage(file);
      setDashPreview(URL.createObjectURL(file));
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
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.8,
      maxWidthOrHeight: 1280,
      useWebWorker: true,
      initialQuality: 0.8,
    });
    const folder = String(selectedLog?.id ?? "vehicle");
    const formData = new FormData();
    formData.append("file", compressed, file.name || "photo.jpg");
    formData.append("bucket", "vehicle");
    formData.append("folder", folder);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "사진 업로드 실패");
    }
    const { url } = await res.json();
    return url;
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
    const { error } = await supabase
      .from("reservations")
      .update({ end_at: newEndAt.toISOString() })
      .eq("id", selectedLog.id);
    if (error) return toast.error(error.message);
    toast.success("반납 시간이 연장되었습니다.");
    setShowExtendForm(false);
    onRefresh();
    onClose();
  };

  const handleSubmit = async (action: "checkin" | "checkout") => {
    if (!selectedLog) return;

    if (action === "checkin") {
      if (String(checkinMileage).trim() === "")
        return toast.error("계기판 거리를 입력해주세요.");
      if (!dashImage) return toast.error("계기판 사진은 필수입니다.");
      if (exteriorFiles.length === 0)
        return toast.error("차량 외관 사진을 최소 1장 등록해주세요.");
    } else {
      if (String(checkoutForm.mileage).trim() === "")
        return toast.error("도착 거리를 입력해주세요.");
      if (
        selectedLog.start_mileage !== null &&
        selectedLog.start_mileage !== undefined &&
        Number(checkoutForm.mileage) <= selectedLog.start_mileage
      )
        return toast.error(
          `도착 거리(${checkoutForm.mileage}km)는 출발 거리(${selectedLog.start_mileage}km)보다 커야 합니다.`,
        );
      if (String(checkoutForm.parking).trim() === "")
        return toast.error("주차 위치를 입력해주세요.");
      if (!dashImage) return toast.error("계기판 사진은 필수입니다.");
      if (exteriorFiles.length === 0)
        return toast.error("차량 외관 사진을 최소 1장 등록해주세요.");
    }

    const ok = await showConfirm(
      action === "checkin" ? "운행을 시작하시겠습니까?" : "반납을 완료하시겠습니까?",
    );
    if (!ok) return;

    setUploading(true);
    try {
      const allFiles = [dashImage!, ...exteriorFiles];
      const allUrls = await Promise.all(allFiles.map((f) => compressAndUpload(f)));
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
      }

      const { error } = await supabase
        .from("reservations")
        .update(updates)
        .eq("id", selectedLog.id);
      if (error) throw error;

      // resources.current_mileage 업데이트는 DB 트리거(trigger_update_mileage)가 처리
      if (action === "checkin") {
        toast.success("🚗 차량 운행이 시작되었습니다!", { duration: 4000 });
      } else {
        toast.success("✅ 차량 반납이 완료되었습니다!", { duration: 4000 });
      }
      onRefresh();
      onClose();
    } catch (e: any) {
      toast.error("오류 발생: " + e.message);
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
    ].filter(Boolean).map((u) => toProxyUrl(u as string));

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
  const isMyTurn =
    (selectedLog?.user_id === currentUser || isAdmin) &&
    selectedLog?.vehicle_status !== "returned" &&
    selectedLog?.vehicle_status !== "noshow";
  const actionType =
    selectedLog?.vehicle_status === "reserved" ? "checkin" : "checkout";

  const isFormValid =
    actionType === "checkin"
      ? String(checkinMileage).trim() !== "" &&
        dashImage !== null &&
        exteriorFiles.length > 0
      : String(checkoutForm.mileage).trim() !== "" &&
        String(checkoutForm.parking).trim() !== "" &&
        dashImage !== null &&
        exteriorFiles.length > 0;

  const ModalContent = (
    <div className="space-y-8 pb-4">
      {/* 1. 차량 정보 */}
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
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
        <InfoRow label="운전자">
          <span className="font-medium">{selectedLog?.driver_name}</span>
          <span className="text-gray-400 text-xs ml-2">
            ({selectedLog?.department})
          </span>
        </InfoRow>
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
        <div>
          <h3 className="text-lg font-bold text-gray-800 border-l-4 border-gray-800 pl-3 mb-4">
            운행 결과
          </h3>
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
            <InfoRow label="주행 거리">
              {selectedLog.start_mileage?.toLocaleString()} km →{" "}
              <span className="font-bold text-blue-600 ml-2 text-base">
                {selectedLog.end_mileage?.toLocaleString()} km
              </span>
              <span className="ml-2 text-sm text-gray-400">
                (
                {(
                  selectedLog.end_mileage! - selectedLog.start_mileage!
                ).toLocaleString()}{" "}
                km 주행)
              </span>
            </InfoRow>
            <InfoRow label="주차 위치">{selectedLog.parking_location}</InfoRow>
            <InfoRow label="연료 상태">
              <div className="flex items-center gap-3">
                {selectedLog.fuel_level_start != null && (
                  <span className="text-sm">
                    출발{" "}
                    <span className="font-bold text-blue-600">
                      {selectedLog.fuel_level_start}%
                    </span>
                  </span>
                )}
                {selectedLog.fuel_level_start != null &&
                  selectedLog.fuel_level_end != null && (
                    <span className="text-gray-400">→</span>
                  )}
                {selectedLog.fuel_level_end != null && (
                  <span className="text-sm">
                    도착{" "}
                    <span
                      className={`font-bold ${selectedLog.fuel_level_end < 30 ? "text-red-500" : "text-green-600"}`}
                    >
                      {selectedLog.fuel_level_end}%
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
                {[selectedLog.checkin_photo_url, ...(selectedLog.checkin_exterior_urls || [])].filter(Boolean).length > 0
                  ? [selectedLog.checkin_photo_url, ...(selectedLog.checkin_exterior_urls || [])].map((url, i) =>
                      url && (
                        <div key={`checkin-${i}`} className="w-[80px] h-[80px] shrink-0 rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:opacity-80 transition shadow-sm" onClick={() => openZoom(toProxyUrl(url))}>
                          <img src={toProxyUrl(url)} className="w-full h-full object-cover" alt="운행 전 사진" />
                        </div>
                      )
                    )
                  : <p className="text-sm text-gray-400">없음</p>
                }
              </div>
            </InfoRow>
            <InfoRow label="운행 후" isLast>
              <div className="flex flex-wrap gap-2 py-1">
                {[selectedLog.checkout_photo_url, ...(selectedLog.checkout_exterior_urls || [])].filter(Boolean).length > 0
                  ? [selectedLog.checkout_photo_url, ...(selectedLog.checkout_exterior_urls || [])].map((url, i) =>
                      url && (
                        <div key={`checkout-${i}`} className="w-[80px] h-[80px] shrink-0 rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:opacity-80 transition shadow-sm" onClick={() => openZoom(toProxyUrl(url))}>
                          <img src={toProxyUrl(url)} className="w-full h-full object-cover" alt="운행 후 사진" />
                        </div>
                      )
                    )
                  : <p className="text-sm text-gray-400">없음</p>
                }
              </div>
            </InfoRow>
          </div>
        </div>
      )}

      {/* 3. 입력 폼 (운행 전/후) */}
      {isMyTurn && (
        <div className="pt-4">
          <h3 className="text-lg font-bold text-gray-800 mb-4">
            {actionType === "checkin" ? (
              <span className="px-3 py-1 rounded bg-green-50 w-max text-lg font-bold text-green-600">
                이용 시작
              </span>
            ) : (
              <span className="px-3 py-1 rounded bg-red-50 w-max text-lg font-bold text-red-600">
                반납하기
              </span>
            )}
          </h3>

          <div
            className={`bg-white border rounded-2xl p-5 sm:p-7 space-y-8 shadow-sm ${
              actionType === "checkin" ? "border-green-200" : "border-red-200"
            }`}
          >
            {/* 주행거리 */}
            <div>
              <label className="block text-base font-bold text-gray-800 mb-3">
                {actionType === "checkin" ? "출발 전" : "도착 후"} 계기판 거리
                (km) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                className="w-full p-4 border border-gray-300 rounded-xl text-xl font-mono focus:ring-2 focus:ring-gray-400 outline-none placeholder:text-gray-300 transition"
                placeholder={
                  actionType === "checkin"
                    ? "예: 54000"
                    : `출발: ${selectedLog?.start_mileage?.toLocaleString()}`
                }
                onChange={(e) =>
                  actionType === "checkin"
                    ? setCheckinMileage(Number(e.target.value))
                    : setCheckoutForm({
                        ...checkoutForm,
                        mileage: Number(e.target.value),
                      })
                }
              />
            </div>

            {/* 연료 */}
            <div>
              <label className="block text-base font-bold text-gray-800 mb-3">
                {actionType === "checkin" ? "출발 연료" : "도착 연료"}
              </label>
              <div className="flex flex-wrap gap-2">
                {[100, 90, 80, 70, 60, 50, 40, 30, 20, 10].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() =>
                      actionType === "checkin"
                        ? setCheckinFuel(v)
                        : setCheckoutForm((p) => ({ ...p, fuel: v }))
                    }
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition ${
                      (actionType === "checkin" ? checkinFuel : checkoutForm.fuel) === v
                        ? v <= 30
                          ? "bg-red-500 text-white border-red-500"
                          : "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {v}%
                  </button>
                ))}
              </div>
            </div>

            {/* 첨부파일 영역 */}
            <div>
              <div className="flex justify-between items-end mb-3">
                <label className="block text-base font-bold text-gray-800">
                  사진 등록 <span className="text-blue-600">*</span>
                </label>
                <span className="text-sm text-gray-500">
                  계기판 1장, 외관 최대 10장
                </span>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-6">
                {/* 계기판 */}
                <div>
                  <p className="text-sm font-bold text-gray-700 mb-3">
                    계기판 (필수)
                  </p>
                  <div className="flex gap-3">
                    {!dashPreview ? (
                      <label className="w-[100px] h-[100px] flex flex-col items-center justify-center bg-white border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-100 transition shadow-sm">
                        <svg
                          className="w-8 h-8 text-gray-400 mb-1"
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
                        <span className="text-xs text-gray-500 font-medium">
                          0/1
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleDashChange}
                        />
                      </label>
                    ) : (
                      <div className="w-[100px] h-[100px] relative rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                        <img
                          src={dashPreview!}
                          className="w-full h-full object-cover"
                          alt="계기판 사진 미리보기"
                        />
                        <button
                          onClick={() => {
                            setDashImage(null);
                            setDashPreview(null);
                          }}
                          className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80 transition"
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
                </div>

                {/* 외관 */}
                <div>
                  <p className="text-sm font-bold text-gray-700 mb-3">
                    차량 외관 (필수 권장)
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {exteriorFiles.length < 10 && (
                      <label className="w-[100px] h-[100px] flex flex-col items-center justify-center bg-white border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-100 transition shadow-sm shrink-0">
                        <svg
                          className="w-8 h-8 text-blue-400 mb-1"
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
                        <span className="text-xs text-blue-500 font-bold">
                          {exteriorFiles.length}/10
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
                        className="w-[100px] h-[100px] relative rounded-xl overflow-hidden border border-gray-200 shadow-sm shrink-0 group"
                      >
                        <img
                          src={src}
                          className="w-full h-full object-cover"
                          alt="외관 사진 미리보기"
                        />
                        <button
                          onClick={() => removeExterior(idx)}
                          className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition"
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
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 반납 추가 정보 */}
            {actionType === "checkout" && (
              <div className="space-y-5 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="cleanup"
                    className="w-6 h-6 text-blue-600 rounded focus:ring-blue-500 border-gray-300 cursor-pointer"
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
                    className="text-base font-bold text-gray-800 cursor-pointer select-none"
                  >
                    차량 내부 쓰레기 정리를 완료했습니다.
                  </label>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      주차 위치 <span className="text-blue-600">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="예: 교육관"
                      className="w-full p-4 border border-gray-300 rounded-xl text-base outline-none focus:ring-2 focus:ring-gray-400 transition bg-white"
                      value={checkoutForm.parking}
                      onChange={(e) =>
                        setCheckoutForm({
                          ...checkoutForm,
                          parking: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      차량 특이사항 (선택)
                    </label>
                    <textarea
                      placeholder="스크래치, 경고등, 기타 이상 사항 등"
                      rows={3}
                      className="w-full p-4 border border-gray-300 rounded-xl text-base outline-none focus:ring-2 focus:ring-gray-400 transition bg-white resize-none"
                      value={checkoutForm.condition}
                      onChange={(e) =>
                        setCheckoutForm({
                          ...checkoutForm,
                          condition: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                {/* 사고/이상 유형 */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
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
                            incidentType:
                              p.incidentType === key ? null : key,
                          }))
                        }
                        className={`px-4 py-2 rounded-full text-sm border font-bold transition ${
                          checkoutForm.incidentType === key
                            ? "bg-red-500 text-white border-red-500"
                            : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                        }`}
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
      )}
    </div>
  );

  const ModalFooter = (
    <div className="flex flex-col gap-2 w-full">
      {/* 예약 연장 폼 */}
      {showExtendForm && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 space-y-2">
          <span className="text-sm font-bold text-yellow-700 block">
            연장 반납 시간 설정
          </span>
          <div className="flex gap-2 items-start">
            {/* 날짜 — 달력 팝업 */}
            <div className="relative flex-1">
              <div
                onClick={() => setShowExtendCalendar((v) => !v)}
                className="cursor-pointer border border-gray-300 rounded-lg p-2 text-sm bg-white text-center font-bold focus:ring-2 focus:ring-yellow-400 select-none"
              >
                {extendDate || "날짜 선택"}
              </div>
              {showExtendCalendar && (
                <div className="absolute bottom-full left-0 z-50 mb-1 bg-white border border-gray-200 rounded-xl shadow-2xl p-2 animate-fadeIn">
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
              className="w-28 border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-yellow-400 bg-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExtend}
              className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-sm font-bold transition"
            >
              확인
            </button>
            <button
              onClick={() => {
                setShowExtendForm(false);
                setShowExtendCalendar(false);
              }}
              className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-bold transition"
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

      <div className="flex gap-3 w-full">
        {!isMyTurn && (
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-4 rounded-xl text-lg font-bold transition"
          >
            닫기
          </button>
        )}
        {isMyTurn && actionType === "checkin" && onCancel && (
          <button
            onClick={() => onCancel(selectedLog!.id)}
            className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 py-4 rounded-xl text-lg font-bold transition border border-red-200"
          >
            예약 취소
          </button>
        )}
        {isMyTurn && actionType === "checkout" && !showExtendForm && (
          <button
            onClick={() => {
              const end = new Date(selectedLog!.end_at);
              setExtendDate(end.toISOString().slice(0, 10));
              setExtendTime(end.toISOString().slice(11, 16));
              setShowExtendForm(true);
            }}
            className="flex-1 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 py-4 rounded-xl text-lg font-bold transition border border-yellow-200"
          >
            시간 연장
          </button>
        )}
        {isMyTurn && (
          <button
            onClick={() => handleSubmit(actionType)}
            disabled={uploading || !isFormValid}
            className={`flex-1 text-white py-4 rounded-xl text-lg font-bold shadow-md transition ${
              uploading || !isFormValid
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {uploading
              ? "처리 중..."
              : actionType === "checkin"
                ? "운행 시작 완료"
                : "반납 완료"}
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
          <div className="bg-white rounded-2xl px-10 py-8 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-800 font-bold text-base">사진 업로드 중...</p>
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

      {/* --- PC 뷰 (일반 모달) --- */}
      <div className="hidden md:block">
        <Modal
          isOpen={isOpen}
          onClose={onClose}
          title="운행 상세 정보"
          footer={ModalFooter}
        >
          {ModalContent}
        </Modal>
      </div>

      {/* --- 모바일 뷰 (새 페이지로 이동하는 것처럼 렌더링) --- */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-[9999] bg-white flex flex-col animate-slideInRight overflow-hidden">
          {/* 모바일 헤더 */}
          <div className="bg-white px-5 py-5 flex items-center justify-between border-b border-gray-200 shrink-0 sticky top-0 z-10 shadow-sm">
            <h2 className="text-xl font-extrabold text-gray-900">
              운행 상세 정보
            </h2>
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
