"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import { showConfirm } from "@/utils/alert";
import imageCompression from "browser-image-compression";

// --- [이미지 설정] 차량별 이미지 매핑 ---
// public/images/cars 폴더 안에 해당 이미지들을 넣어주세요.
// 이미지가 없으면 기본값(빈칸)으로 나옵니다.
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
  description: string; // 차량번호
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
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });
      const fileName = `${selectedLog.id}_${action}_${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("vehicle-photos")
        .upload(fileName, compressedFile);
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("vehicle-photos").getPublicUrl(fileName);

      const updates: any = {};
      if (action === "checkin") {
        updates.vehicle_status = "in_use";
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

      if (action === "checkout") {
        await supabase
          .from("resources")
          .update({ current_mileage: Number(checkoutForm.mileage) })
          .eq("id", selectedLog.resource_id);
      }

      toast.success(action === "checkin" ? "운행 시작!" : "운행 종료!");
      setIsDetailModalOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
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
          {/* 플러스 아이콘 */}
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
          const carImage = VEHICLE_IMAGES[v.name]; // 차량 이미지 가져오기

          return (
            <div
              key={v.id}
              className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between h-44 relative overflow-hidden group hover:border-blue-300 transition"
            >
              <div
                className={`absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-xs font-bold z-10 ${currentUsage ? "bg-green-100 text-green-700 animate-pulse" : "bg-gray-100 text-gray-500"}`}
              >
                {currentUsage ? "운행중" : "대기중"}
              </div>

              <div className="z-10">
                <h3 className="text-lg font-bold text-gray-900">{v.name}</h3>
                <p className="text-sm text-gray-500 font-mono tracking-tight">
                  {v.description}
                </p>
              </div>

              {/* ★ 2. 차량 이미지 (있을 경우만 표시) */}
              {carImage ? (
                <img
                  src={carImage}
                  alt={v.name}
                  className={`absolute h-auto object-contain opacity-90 transition-transform duration-300
    ${
      v.name.includes("스타리아")
        ? // ★ 수정됨: 기본 1.25배 -> 호버 시 1.35배로 커지게 설정 (group-hover:scale-[1.35])
          "w-32 -right-8 -bottom-0 scale-125 origin-bottom-right group-hover:scale-[1.35]"
        : v.name.includes("쏘나타")
          ? // 쏘나타는 기본 크기 -> 호버 시 1.1배
            "w-34 -right-2 -bottom-1 group-hover:scale-110"
          : // 나머지는 기본 크기 -> 호버 시 1.1배
            "w-32 -right-2 bottom-1 group-hover:scale-110"
    }
  `}
                />
              ) : (
                // 이미지가 없을 때 보여줄 기본 아이콘
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">
                시작일
              </label>
              <input
                type="date"
                className="w-full border p-2 rounded-lg border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
                value={form.start_date}
                onChange={(e) =>
                  setForm({ ...form, start_date: e.target.value })
                }
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
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">
                종료일
              </label>
              <input
                type="date"
                className="w-full border p-2 rounded-lg  border-gray-300 text-gray-900 outline-none focus:border-blue-500 bg-white"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
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
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </div>
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
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="운행 일지 상세"
        footer={
          <button
            onClick={() => setIsDetailModalOpen(false)}
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
                        <>
                          <svg
                            className="animate-spin h-4 w-4 text-white"
                            xmlns="http://www.w3.org/2000/svg"
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
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          업로드 중...
                        </>
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
                        <>
                          <svg
                            className="animate-spin h-4 w-4 text-white"
                            xmlns="http://www.w3.org/2000/svg"
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
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          업로드 중...
                        </>
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

            {/* 4. 인증 사진 갤러리 */}
            {(selectedLog.checkin_photo_url ||
              selectedLog.checkout_photo_url) && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                {selectedLog.checkin_photo_url && (
                  <div
                    className="relative aspect-video bg-slate-900 rounded-lg overflow-hidden border border-slate-200 group cursor-pointer"
                    onClick={() => window.open(selectedLog.checkin_photo_url)}
                  >
                    <img
                      src={selectedLog.checkin_photo_url}
                      className="object-cover w-full h-full opacity-80 group-hover:opacity-100 transition duration-300"
                      alt="출발 사진"
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/20">
                      <svg
                        className="w-8 h-8 text-white drop-shadow-lg"
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
                    onClick={() => window.open(selectedLog.checkout_photo_url)}
                  >
                    <img
                      src={selectedLog.checkout_photo_url}
                      className="object-cover w-full h-full opacity-80 group-hover:opacity-100 transition duration-300"
                      alt="도착 사진"
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/20">
                      <svg
                        className="w-8 h-8 text-white drop-shadow-lg"
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
    </div>
  );
}
