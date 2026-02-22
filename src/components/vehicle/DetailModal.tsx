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
    <div className="flex-1 p-3 text-sm text-gray-800 flex items-center bg-white">
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
    parking: "교회 주차장",
    condition: "이상 없음",
  });

  const [dashImage, setDashImage] = useState<File | null>(null);
  const [dashPreview, setDashPreview] = useState<string | null>(null);
  const [exteriorFiles, setExteriorFiles] = useState<File[]>([]);
  const [exteriorPreviews, setExteriorPreviews] = useState<string[]>([]);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

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
        parking: "교회 주차장",
        condition: "이상 없음",
      });
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
      setExteriorFiles((prev) => [...prev, ...newFiles]);
      const newPreviews = newFiles.map((f) => URL.createObjectURL(f));
      setExteriorPreviews((prev) => [...prev, ...newPreviews]);
    }
  };

  const removeExterior = (index: number) => {
    setExteriorFiles((prev) => prev.filter((_, i) => i !== index));
    setExteriorPreviews((prev) => prev.filter((_, i) => i !== index));
  };

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

    // 유효성 검사 (계기판 & 외관 필수)
    if (action === "checkin") {
      if (checkinMileage === "")
        return toast.error("계기판 거리를 입력해주세요.");
      if (!dashImage) return toast.error("계기판 사진은 필수입니다.");
      if (exteriorFiles.length === 0)
        return toast.error("차량 외관 사진을 최소 1장 등록해주세요.");
    } else {
      if (checkoutForm.mileage === "")
        return toast.error("도착 거리를 입력해주세요.");
      if (!checkoutForm.parking)
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
        await supabase
          .from("resources")
          .update({ current_mileage: Number(checkoutForm.mileage) })
          .eq("id", selectedLog.resource_id);
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

  const isMyTurn =
    selectedLog?.user_id === currentUser &&
    selectedLog?.vehicle_status !== "returned";
  const actionType =
    selectedLog?.vehicle_status === "reserved" ? "checkin" : "checkout";

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
            {/* [수정] 닫기 버튼 옆에 액션 버튼 배치 */}
            {isMyTurn && (
              <button
                onClick={() => handleSubmit(actionType)}
                disabled={uploading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold shadow-md transition disabled:opacity-50"
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
          <div className="space-y-8 pb-4">
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
                    <div className="flex gap-2 overflow-x-auto py-1">
                      {[
                        selectedLog.checkin_photo_url,
                        ...(selectedLog.checkin_exterior_urls || []),
                      ].map(
                        (url, i) =>
                          url && (
                            <div
                              key={`in-${i}`}
                              className="w-20 h-20 shrink-0 rounded border border-gray-200 overflow-hidden cursor-pointer"
                              onClick={() => setZoomImage(url)}
                            >
                              <img
                                src={url}
                                className="w-full h-full object-cover"
                                alt="img"
                              />
                            </div>
                          ),
                      )}
                      <div className="w-px bg-gray-300 mx-1"></div>
                      {[
                        selectedLog.checkout_photo_url,
                        ...(selectedLog.checkout_exterior_urls || []),
                      ].map(
                        (url, i) =>
                          url && (
                            <div
                              key={`out-${i}`}
                              className="w-20 h-20 shrink-0 rounded border border-gray-200 overflow-hidden cursor-pointer"
                              onClick={() => setZoomImage(url)}
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

            {/* 3. 입력 폼 (운행 전/후) - 색상 제거, 깔끔한 스타일 */}
            {isMyTurn && (
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  {actionType === "checkin"
                    ? "차량 이용 시작"
                    : "차량 반납하기"}
                </h3>

                <div className="bg-white space-y-6">
                  {/* 주행거리 */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      {actionType === "checkin" ? "현재" : "도착"} 계기판 거리
                      (km)
                    </label>
                    <input
                      type="number"
                      className="w-full p-3 border border-gray-300 rounded-lg text-lg font-mono focus:ring-2 focus:ring-gray-400 outline-none placeholder:text-gray-300"
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

                  {/* 사진 업로드 UI */}
                  <div>
                    <div className="grid grid-cols-2 gap-4">
                      {/* 계기판 */}
                      <div>
                        <div className="text-xs font-bold text-gray-500 mb-2 flex justify-between">
                          <span>📸 계기판 (필수)</span>
                          {dashPreview && (
                            <button
                              onClick={() => {
                                setDashImage(null);
                                setDashPreview(null);
                              }}
                              className="text-red-500 hover:underline font-normal"
                            >
                              삭제
                            </button>
                          )}
                        </div>
                        <label
                          className={`aspect-video flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition relative overflow-hidden ${dashPreview ? "border-gray-400" : ""}`}
                        >
                          {dashPreview ? (
                            <img
                              src={dashPreview}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : (
                            <>
                              <span className="text-2xl text-gray-300">+</span>
                              <span className="text-xs text-gray-400 mt-1">
                                사진 등록
                              </span>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleDashChange}
                          />
                        </label>
                      </div>

                      {/* 외관 (다중) */}
                      <div>
                        <div className="text-xs font-bold text-gray-500 mb-2">
                          🚗 탑승 전/후 외관 (필수 권장)
                        </div>
                        <div className="flex gap-2 overflow-x-auto h-full items-start">
                          <label className="aspect-square h-[100px] flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition shrink-0">
                            <span className="text-2xl text-gray-300">+</span>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={handleExteriorChange}
                            />
                          </label>
                          {exteriorPreviews.map((src, idx) => (
                            <div
                              key={idx}
                              className="aspect-square h-[100px] relative rounded-lg overflow-hidden border border-gray-200 shrink-0 group"
                            >
                              <img
                                src={src}
                                className="w-full h-full object-cover"
                              />
                              <button
                                onClick={() => removeExterior(idx)}
                                className="absolute top-0 right-0 bg-black/50 text-white p-1 rounded-bl opacity-0 group-hover:opacity-100 transition"
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
                    <div className="space-y-4 pt-4 border-t border-gray-100">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="cleanup"
                          className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
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
                        <input
                          type="text"
                          placeholder="주차 위치 (예: 지하 2층 B열)"
                          className="w-full p-3 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-400"
                          value={checkoutForm.parking}
                          onChange={(e) =>
                            setCheckoutForm({
                              ...checkoutForm,
                              parking: e.target.value,
                            })
                          }
                        />
                        <input
                          type="text"
                          placeholder="차량 특이사항 (스크래치, 경고등 등)"
                          className="w-full p-3 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-400"
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
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {zoomImage && (
        <div
          className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out animate-fadeIn"
          onClick={() => setZoomImage(null)}
        >
          <img
            src={zoomImage}
            className="max-w-full max-h-[90vh] rounded shadow-2xl"
            alt="zoom"
          />
          <button className="absolute top-5 right-5 text-white bg-black/50 rounded-full p-2 hover:bg-black/80">
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
        </div>
      )}
    </>
  );
}
