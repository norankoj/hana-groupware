"use client";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import Modal from "@/components/Modal";
import toast from "react-hot-toast";
import { createClient } from "@/utils/supabase/client";
import imageCompression from "browser-image-compression";

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
  checkin_exterior_urls?: string[];
  checkout_exterior_urls?: string[];
  cleanup_status?: boolean;
  parking_location?: string;
  vehicle_condition?: string;
  profiles?: { full_name: string; position: string };
  resources?: { name: string; description: string; insurance_info?: string };
};

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLog: VehicleLog | null;
  currentUser: string | null;
  onRefresh: () => void;
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
    <div className="w-32 bg-gray-50 p-3 text-sm font-bold text-gray-600 flex items-center shrink-0 border-r border-gray-200">
      {label}
    </div>
    <div className="flex-1 p-3 text-sm text-gray-800 flex items-center bg-white min-w-0 break-keep">
      {children}
    </div>
  </div>
);

const INSURANCE_MOCK =
  "KB손해보험 (1544-0114) / 만 26세 이상 / 자차부담금 5만원";

export default function DetailModal({
  isOpen,
  onClose,
  selectedLog,
  currentUser,
  onRefresh,
}: DetailModalProps) {
  const supabase = createClient();
  const [uploading, setUploading] = useState(false);

  const [checkinMileage, setCheckinMileage] = useState<number | "">("");
  const [checkoutForm, setCheckoutForm] = useState({
    mileage: "" as number | "",
    cleanup: true,
    parking: "",
    condition: "이상 없음",
  });

  const [dashImage, setDashImage] = useState<File | null>(null);
  const [dashPreview, setDashPreview] = useState<string | null>(null);
  const [exteriorFiles, setExteriorFiles] = useState<File[]>([]);
  const [exteriorPreviews, setExteriorPreviews] = useState<string[]>([]);

  // 줌 이미지 배열 및 인덱스 관리 (갤러리용)
  const [zoomImages, setZoomImages] = useState<string[]>([]);
  const [zoomIndex, setZoomIndex] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      setDashImage(null);
      setDashPreview(null);
      setExteriorFiles([]);
      setExteriorPreviews([]);
      setCheckinMileage("");
      setCheckoutForm({
        mileage: "",
        cleanup: true,
        parking: "",
        condition: "이상 없음",
      });
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

  // 용량 압축 업로드 로직 (유지)
  const uploadFile = async (file: File, prefix: string) => {
    const compressed = await imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
    });
    const fileName = `${prefix}_${selectedLog?.id}_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    const { error } = await supabase.storage
      .from("vehicle-photos")
      .upload(fileName, compressed);
    if (error) throw error;
    const { data } = supabase.storage
      .from("vehicle-photos")
      .getPublicUrl(fileName);
    return data.publicUrl;
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
      if (String(checkoutForm.parking).trim() === "")
        return toast.error("주차 위치를 입력해주세요.");
      if (!dashImage) return toast.error("계기판 사진은 필수입니다.");
      if (exteriorFiles.length === 0)
        return toast.error("차량 외관 사진을 최소 1장 등록해주세요.");
    }

    if (
      !confirm(
        `${action === "checkin" ? "운행을 시작" : "반납을 완료"}하시겠습니까?`,
      )
    )
      return;

    setUploading(true);
    try {
      const dashUrl = await uploadFile(dashImage!, `${action}_dash`);
      const extUrls = await Promise.all(
        exteriorFiles.map((f, i) => uploadFile(f, `${action}_ext_${i}`)),
      );

      const updates: any = {};
      if (action === "checkin") {
        updates.vehicle_status = "in_use";
        updates.checkin_photo_url = dashUrl;
        updates.checkin_exterior_urls = extUrls;
        updates.start_mileage = Number(checkinMileage);
      } else {
        updates.vehicle_status = "returned";
        updates.checkout_photo_url = dashUrl;
        updates.checkout_exterior_urls = extUrls;
        updates.end_mileage = Number(checkoutForm.mileage);
        updates.cleanup_status = checkoutForm.cleanup;
        updates.parking_location = checkoutForm.parking;
        updates.vehicle_condition = checkoutForm.condition;
      }

      const { error } = await supabase
        .from("reservations")
        .update(updates)
        .eq("id", selectedLog.id);

      if (error) throw error;

      if (action === "checkout") {
        const { error: resourceErr } = await supabase
          .from("resources")
          .update({ current_mileage: Number(checkoutForm.mileage) })
          .eq("id", selectedLog.resource_id);

        if (resourceErr) {
          console.error("차량 누적 거리 업데이트 에러:", resourceErr);
          toast.error(
            "운행 일지는 기록되었으나 차량 주행거리 갱신에 실패했습니다.",
          );
        }
      }

      toast.success("처리되었습니다.");
      onRefresh();
      onClose();
    } catch (e: any) {
      toast.error("오류 발생: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  // 갤러리 띄우기 함수
  const openZoom = (url: string) => {
    const allImages = [
      selectedLog?.checkin_photo_url,
      ...(selectedLog?.checkin_exterior_urls || []),
      selectedLog?.checkout_photo_url,
      ...(selectedLog?.checkout_exterior_urls || []),
    ].filter(Boolean) as string[];

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

  const isMyTurn =
    selectedLog?.user_id === currentUser &&
    selectedLog?.vehicle_status !== "returned";
  const actionType =
    selectedLog?.vehicle_status === "reserved" ? "checkin" : "checkout";

  // 필수값 검증 (버튼 활성화)
  const isFormValid =
    actionType === "checkin"
      ? String(checkinMileage).trim() !== "" &&
        dashImage !== null &&
        exteriorFiles.length > 0
      : String(checkoutForm.mileage).trim() !== "" &&
        String(checkoutForm.parking).trim() !== "" &&
        dashImage !== null &&
        exteriorFiles.length > 0;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="운행 상세 정보"
        footer={
          <div className="flex gap-2 w-full">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-lg font-bold transition"
            >
              닫기
            </button>
            {isMyTurn && (
              <button
                onClick={() => handleSubmit(actionType)}
                disabled={uploading || !isFormValid}
                className={`flex-1 text-white py-3 rounded-lg font-bold shadow-md transition ${uploading || !isFormValid ? "bg-gray-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}
              >
                {uploading
                  ? "처리 중..."
                  : actionType === "checkin"
                    ? "운행 시작 완료"
                    : "반납 완료"}
              </button>
            )}
          </div>
        }
      >
        {selectedLog && (
          <div className="space-y-6 pb-2">
            {/* 1. 차량 정보 */}
            <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              <InfoRow label="차량 정보">
                <span className="font-bold text-gray-900 mr-2">
                  {selectedLog.resources?.name}
                </span>
                <span className="text-gray-500">
                  ({selectedLog.resources?.description})
                </span>
              </InfoRow>
              <InfoRow label="보험 정보">
                {selectedLog.resources?.insurance_info || INSURANCE_MOCK}
              </InfoRow>
              <InfoRow label="운전자">
                {selectedLog.driver_name}{" "}
                <span className="text-gray-400 text-xs ml-1">
                  ({selectedLog.department})
                </span>
              </InfoRow>
              <InfoRow label="운행 시간">
                {format(new Date(selectedLog.start_at), "yyyy-MM-dd HH:mm")} ~{" "}
                {format(new Date(selectedLog.end_at), "HH:mm")}
              </InfoRow>
              <InfoRow label="목적지">{selectedLog.destination}</InfoRow>
              <InfoRow label="운행 목적" isLast>
                {selectedLog.purpose}
              </InfoRow>
            </div>

            {/* 2. 운행 결과 (반납 완료 시) */}
            {selectedLog.vehicle_status === "returned" && (
              <div>
                <h3 className="text-lg font-bold text-gray-800 border-l-4 border-gray-800 pl-3 mb-3">
                  운행 결과
                </h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                  <InfoRow label="주행 거리">
                    {selectedLog.start_mileage?.toLocaleString()} km →{" "}
                    <span className="font-bold text-blue-600 ml-1">
                      {selectedLog.end_mileage?.toLocaleString()} km
                    </span>
                    <span className="ml-2 text-xs text-gray-400">
                      {" "}
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
                  <InfoRow label="차량 상태">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${selectedLog.cleanup_status ? "bg-gray-100 text-gray-700" : "bg-red-50 text-red-600"}`}
                      >
                        {selectedLog.cleanup_status ? "청소 완료" : "청소 미흡"}
                      </span>
                      <span>
                        {selectedLog.vehicle_condition || "특이사항 없음"}
                      </span>
                    </div>
                  </InfoRow>
                  <InfoRow label="인증 사진" isLast>
                    <div className="flex flex-wrap gap-2 py-1">
                      {[
                        selectedLog.checkin_photo_url,
                        ...(selectedLog.checkin_exterior_urls || []),
                        selectedLog.checkout_photo_url,
                        ...(selectedLog.checkout_exterior_urls || []),
                      ].map(
                        (url, i) =>
                          url && (
                            <div
                              key={`img-${i}`}
                              className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-lg border border-gray-200 overflow-hidden cursor-pointer hover:opacity-80 transition"
                              onClick={() => openZoom(url)}
                            >
                              <img
                                src={url}
                                className="w-full h-full object-cover"
                                alt="img"
                              />
                            </div>
                          ),
                      )}
                    </div>
                  </InfoRow>
                </div>
              </div>
            )}

            {/* 3. 입력 폼 (운행 전/후) */}
            {isMyTurn && (
              <div className="pt-2 border-t border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  {actionType === "checkin"
                    ? "차량 이용 시작"
                    : "차량 반납하기"}
                </h3>

                <div className="space-y-6">
                  {/* 주행거리 */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      {actionType === "checkin" ? "출발 전" : "도착 후"} 계기판
                      거리 (km) <span className="text-blue-600">*</span>
                    </label>
                    <input
                      type="number"
                      className="w-full p-3 border border-gray-300 rounded-lg text-lg font-mono focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder:text-gray-300 transition"
                      placeholder={
                        actionType === "checkin"
                          ? "예: 54000"
                          : `출발: ${selectedLog.start_mileage?.toLocaleString()}`
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

                  {/* 첨부파일 영역 */}
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <label className="block text-sm font-bold text-gray-800">
                        사진 등록 <span className="text-blue-600">*</span>
                      </label>
                      <span className="text-xs text-gray-500">
                        계기판 1장, 외관 최대 10장
                      </span>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-5">
                      {/* 계기판 */}
                      <div>
                        <p className="text-xs font-bold text-gray-600 mb-2">
                          계기판 (필수)
                        </p>
                        <div className="flex gap-2">
                          {!dashPreview ? (
                            <label className="w-20 h-20 flex flex-col items-center justify-center bg-white border border-gray-300 rounded-xl cursor-pointer hover:bg-gray-50 transition shadow-sm">
                              <svg
                                className="w-6 h-6 text-gray-400 mb-1"
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
                              <span className="text-[10px] text-gray-500 font-medium">
                                0/1
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={handleDashChange}
                              />
                            </label>
                          ) : (
                            <div className="w-20 h-20 relative rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                              <img
                                src={dashPreview}
                                className="w-full h-full object-cover"
                              />
                              <button
                                onClick={() => {
                                  setDashImage(null);
                                  setDashPreview(null);
                                }}
                                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition"
                              >
                                <svg
                                  className="w-3 h-3"
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

                      {/* 외관 (다중) */}
                      <div>
                        <p className="text-xs font-bold text-gray-600 mb-2">
                          차량 외관 (필수 권장)
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {exteriorFiles.length < 10 && (
                            <label className="w-20 h-20 flex flex-col items-center justify-center bg-white border border-gray-300 rounded-xl cursor-pointer hover:bg-gray-50 transition shadow-sm shrink-0">
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
                              <span className="text-[10px] text-blue-500 font-bold">
                                {exteriorFiles.length}/10
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                multiple
                                className="hidden"
                                onChange={handleExteriorChange}
                              />
                            </label>
                          )}
                          {exteriorPreviews.map((src, idx) => (
                            <div
                              key={idx}
                              className="w-20 h-20 relative rounded-xl overflow-hidden border border-gray-200 shadow-sm shrink-0 group"
                            >
                              <img
                                src={src}
                                className="w-full h-full object-cover"
                              />
                              <button
                                onClick={() => removeExterior(idx)}
                                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-100 transition"
                              >
                                <svg
                                  className="w-3 h-3"
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
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center gap-3">
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
                          className="text-sm font-bold text-gray-700 cursor-pointer"
                        >
                          차량 내부 쓰레기 정리를 완료했습니다.
                        </label>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-600 mb-1">
                            주차 위치 <span className="text-blue-600">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="예: 지하 2층 B열"
                            className="w-full p-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition"
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
                          <label className="block text-xs font-bold text-gray-600 mb-1">
                            차량 특이사항 (선택)
                          </label>
                          <input
                            type="text"
                            placeholder="스크래치, 경고등 등"
                            className="w-full p-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition"
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
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 갤러리 (슬라이더) 모달 */}
      {zoomImages.length > 0 && (
        <div
          className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out animate-fadeIn"
          onClick={() => setZoomImages([])}
        >
          {zoomImages.length > 1 && (
            <button
              onClick={handlePrevImage}
              className="absolute left-2 md:left-5 text-white bg-black/50 rounded-full p-2 md:p-3 hover:bg-black/80 z-10 transition cursor-pointer"
            >
              <svg
                className="w-6 h-6 md:w-8 md:h-8"
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
              className="absolute right-2 md:right-5 text-white bg-black/50 rounded-full p-2 md:p-3 hover:bg-black/80 z-10 transition cursor-pointer"
            >
              <svg
                className="w-6 h-6 md:w-8 md:h-8"
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

          <button className="absolute top-5 right-5 text-white bg-black/50 rounded-full p-2 hover:bg-black/80 z-10 cursor-pointer">
            <svg
              className="w-6 h-6"
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
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white bg-black/60 px-4 py-1.5 rounded-full text-sm font-bold tracking-widest z-10">
              {zoomIndex + 1} / {zoomImages.length}
            </div>
          )}
        </div>
      )}
    </>
  );
}
