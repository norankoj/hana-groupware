"use client";
import { useState } from "react";
import { format } from "date-fns";
import Modal from "@/components/Modal";
import toast from "react-hot-toast";
import { createClient } from "@/utils/supabase/client";
import imageCompression from "browser-image-compression";

// 타입 정의 (기존 유지)
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

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLog: VehicleLog | null;
  currentUser: string | null;
  onRefresh: () => void;
}

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

  // [신규] 이미지 확대 보기 상태 관리
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  // --- 운행 시작/종료 ---
  const handleVehicleAction = async (
    action: "checkin" | "checkout",
    file: File,
  ) => {
    if (!selectedLog) return;

    if (action === "checkin" && checkinMileage === "")
      return toast.error("출발 누적거리를 입력해주세요.");
    if (action === "checkout") {
      if (checkoutForm.mileage === "")
        return toast.error("도착 누적거리를 입력해주세요.");
      if (!checkoutForm.parking)
        return toast.error("주차 위치를 입력해주세요.");
    }

    setUploading(true);
    try {
      // 1. 이미지 압축 (기존 설정 유지: 1MB 이하, FHD 해상도)
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });

      const fileName = `${selectedLog.id}_${action}_${Date.now()}.jpg`;

      // 2. 스토리지 업로드
      const { error: uploadError } = await supabase.storage
        .from("vehicle-photos")
        .upload(fileName, compressedFile);
      if (uploadError) throw uploadError;

      // 3. 이미지 URL 가져오기
      const {
        data: { publicUrl },
      } = supabase.storage.from("vehicle-photos").getPublicUrl(fileName);

      // 4. DB 업데이트
      const updates: any = {};
      if (action === "checkin") {
        updates.vehicle_status = "in_use"; // 사진을 올리는 순간이 실제 운행 시작입니다.
        updates.checkin_photo_url = publicUrl;
        updates.start_mileage = Number(checkinMileage);
      } else {
        updates.vehicle_status = "returned";
        updates.checkout_photo_url = publicUrl;
        updates.end_mileage = Number(checkoutForm.mileage);
        updates.cleanup_status = checkoutForm.cleanup;
        updates.parking_location = checkoutForm.parking;
        updates.vehicle_condition = checkoutForm.condition;
      }

      const { error: dbError } = await supabase
        .from("reservations")
        .update(updates)
        .eq("id", selectedLog.id);
      if (dbError) throw dbError;

      // 반납 시 차량 누적 주행거리 업데이트
      if (action === "checkout") {
        await supabase
          .from("resources")
          .update({ current_mileage: Number(checkoutForm.mileage) })
          .eq("id", selectedLog.resource_id);
      }

      toast.success(action === "checkin" ? "운행 시작!" : "운행 종료!");
      onRefresh();
      onClose();
    } catch (e: any) {
      toast.error("업로드 실패: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => onClose()}
        title="운행 일지 상세"
        footer={
          <button
            onClick={() => onClose()}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-lg font-bold transition"
          >
            닫기
          </button>
        }
      >
        {selectedLog && (
          <div className="space-y-6">
            {/* 1. 기본 정보 (카드 형태) */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-slate-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  기본 정보
                </span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    selectedLog.vehicle_status === "in_use"
                      ? "bg-green-100 text-green-700"
                      : selectedLog.vehicle_status === "returned"
                        ? "bg-slate-200 text-slate-600"
                        : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {selectedLog.vehicle_status === "in_use"
                    ? "운행중"
                    : selectedLog.vehicle_status === "returned"
                      ? "반납완료"
                      : "예약중"}
                </span>
              </div>
              <div className="p-4 space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 w-20">차량</span>
                  <span className="font-medium text-slate-900 text-right flex-1">
                    {selectedLog.resources?.name}{" "}
                    <span className="text-slate-400 text-xs">
                      ({selectedLog.resources?.description})
                    </span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 w-20">운전자</span>
                  <span className="font-medium text-slate-900 text-right flex-1">
                    {selectedLog.driver_name}{" "}
                    <span className="text-slate-400 text-xs">
                      ({selectedLog.department})
                    </span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 w-20">목적지</span>
                  <span className="font-medium text-slate-900 text-right flex-1">
                    {selectedLog.destination}
                  </span>
                </div>
                <div className="flex justify-between items-start pt-2 border-t border-slate-100 mt-2">
                  <span className="text-slate-500 w-20 mt-0.5">일시</span>
                  <div className="text-right">
                    <div className="font-bold text-slate-800">
                      {format(new Date(selectedLog.start_at), "MM.dd HH:mm")}
                    </div>
                    <div className="text-xs text-slate-400">
                      ~ {format(new Date(selectedLog.end_at), "MM.dd HH:mm")}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. 운행 결과 (반납 완료 시) */}
            {selectedLog.vehicle_status === "returned" && (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                  <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-green-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    운행 결과
                  </span>
                </div>
                <div className="p-4 space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">주행거리</span>
                    <span className="font-bold text-blue-600 text-base">
                      {(
                        selectedLog.end_mileage! - selectedLog.start_mileage!
                      ).toLocaleString()}{" "}
                      <span className="text-sm font-normal text-slate-500">
                        km
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">정리상태</span>
                    <span
                      className={`font-bold ${selectedLog.cleanup_status ? "text-green-600" : "text-red-500"}`}
                    >
                      {selectedLog.cleanup_status ? "양호" : "미흡"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">주차위치</span>
                    <span className="font-medium text-slate-900">
                      {selectedLog.parking_location}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-slate-500 block mb-1 text-xs">
                      차량 상태 메모
                    </span>
                    <div className="bg-slate-50 p-2 rounded text-slate-700 text-xs min-h-[40px]">
                      {selectedLog.vehicle_condition || "특이사항 없음"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. 액션 영역 (운행 시작/종료) */}
            {selectedLog.user_id === currentUser && (
              <div className="space-y-4">
                {/* A. 운행 시작 */}
                {selectedLog.vehicle_status === "reserved" && (
                  <div className="border-2 border-blue-100 bg-blue-50/50 p-5 rounded-xl">
                    <div className="flex items-center gap-2 mb-4 text-blue-800 font-bold">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                        />
                      </svg>
                      운행 시작 (Check-in)
                    </div>
                    <div className="mb-4">
                      <label className="block text-xs text-blue-600 font-bold mb-1">
                        현재 계기판 거리 (km)
                      </label>
                      <input
                        type="number"
                        placeholder="예: 54000"
                        className="w-full p-3 border border-blue-200 rounded-lg font-mono text-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        onChange={(e) =>
                          setCheckinMileage(Number(e.target.value))
                        }
                      />
                    </div>
                    <label
                      className={`w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3.5 rounded-lg font-bold text-sm cursor-pointer transition shadow-md hover:bg-blue-700 active:scale-[0.98] ${uploading ? "opacity-70 cursor-wait" : ""}`}
                    >
                      {uploading ? (
                        <>업로드 중...</>
                      ) : (
                        <>
                          <svg
                            className="w-5 h-5"
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
                          차량 촬영 및 운행 시작
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        disabled={uploading}
                        onChange={(e) =>
                          e.target.files?.[0] &&
                          handleVehicleAction("checkin", e.target.files[0])
                        }
                      />
                    </label>
                  </div>
                )}

                {/* B. 운행 종료 */}
                {selectedLog.vehicle_status === "in_use" && (
                  <div className="border-2 border-green-100 bg-green-50/50 p-5 rounded-xl">
                    <div className="flex items-center gap-2 mb-4 text-green-800 font-bold">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      운행 종료 (Check-out)
                    </div>

                    <div className="space-y-4 mb-5">
                      <div>
                        <label className="block text-xs text-green-700 font-bold mb-1">
                          도착 계기판 거리 (km)
                        </label>
                        <input
                          type="number"
                          placeholder={`출발: ${selectedLog.start_mileage?.toLocaleString()}`}
                          className="w-full p-3 border border-green-200 rounded-lg font-mono text-lg focus:ring-2 focus:ring-green-500 outline-none"
                          onChange={(e) =>
                            setCheckoutForm({
                              ...checkoutForm,
                              mileage: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-green-100 shadow-sm">
                        <span className="text-sm font-bold text-slate-700">
                          내부 정리 및 쓰레기 청소
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checkoutForm.cleanup}
                            onChange={(e) =>
                              setCheckoutForm({
                                ...checkoutForm,
                                cleanup: e.target.checked,
                              })
                            }
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                        </label>
                      </div>
                      <div>
                        <label className="block text-xs text-green-700 font-bold mb-1">
                          주차 위치
                        </label>
                        <input
                          type="text"
                          value={checkoutForm.parking}
                          onChange={(e) =>
                            setCheckoutForm({
                              ...checkoutForm,
                              parking: e.target.value,
                            })
                          }
                          className="w-full p-3 border border-green-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-green-700 font-bold mb-1">
                          차량 이상 유무 (스크래치 등)
                        </label>
                        <textarea
                          value={checkoutForm.condition}
                          onChange={(e) =>
                            setCheckoutForm({
                              ...checkoutForm,
                              condition: e.target.value,
                            })
                          }
                          className="w-full p-3 border border-green-200 rounded-lg h-20 text-sm resize-none focus:ring-2 focus:ring-green-500 outline-none"
                        />
                      </div>
                    </div>

                    <label
                      className={`w-full flex items-center justify-center gap-2 bg-green-600 text-white py-3.5 rounded-lg font-bold text-sm cursor-pointer transition shadow-md hover:bg-green-700 active:scale-[0.98] ${uploading ? "opacity-70 cursor-wait" : ""}`}
                    >
                      {uploading ? (
                        <>업로드 중...</>
                      ) : (
                        <>
                          <svg
                            className="w-5 h-5"
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
                          차량 촬영 및 운행 종료
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        disabled={uploading}
                        onChange={(e) =>
                          e.target.files?.[0] &&
                          handleVehicleAction("checkout", e.target.files[0])
                        }
                      />
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* 4. 인증 사진 갤러리 (확대 기능 추가됨) */}
            {(selectedLog.checkin_photo_url ||
              selectedLog.checkout_photo_url) && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                {selectedLog.checkin_photo_url && (
                  <div
                    className="relative aspect-video bg-slate-900 rounded-lg overflow-hidden border border-slate-200 group cursor-pointer"
                    onClick={() => setZoomImage(selectedLog.checkin_photo_url!)}
                  >
                    <img
                      src={selectedLog.checkin_photo_url}
                      className="object-cover w-full h-full opacity-90 group-hover:opacity-100 group-hover:scale-105 transition duration-500"
                      alt="출발 사진"
                    />
                    {/* 호버 시 돋보기 아이콘 */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-8 w-8 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                        />
                      </svg>
                    </div>
                    <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur-sm">
                      출발 ({selectedLog.start_mileage?.toLocaleString()}km)
                    </span>
                  </div>
                )}
                {selectedLog.checkout_photo_url && (
                  <div
                    className="relative aspect-video bg-slate-900 rounded-lg overflow-hidden border border-slate-200 group cursor-pointer"
                    onClick={() =>
                      setZoomImage(selectedLog.checkout_photo_url!)
                    }
                  >
                    <img
                      src={selectedLog.checkout_photo_url}
                      className="object-cover w-full h-full opacity-90 group-hover:opacity-100 group-hover:scale-105 transition duration-500"
                      alt="도착 사진"
                    />
                    {/* 호버 시 돋보기 아이콘 */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-8 w-8 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                        />
                      </svg>
                    </div>
                    <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur-sm">
                      도착 ({selectedLog.end_mileage?.toLocaleString()}km)
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* [신규] 이미지 확대 모달 (라이트박스) */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setZoomImage(null)} // 배경 클릭 시 닫기
        >
          <div className="relative max-w-4xl w-full max-h-screen">
            <img
              src={zoomImage}
              alt="확대 이미지"
              className="w-full h-auto max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
            <button
              onClick={() => setZoomImage(null)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 transition"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
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
        </div>
      )}
    </>
  );
}
