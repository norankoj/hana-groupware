"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import ScheduleTab from "@/components/vehicle/ScheduleTab";
import DetailModal from "@/components/vehicle/DetailModal";
import toast from "react-hot-toast";

type Vehicle = {
  id: number;
  name: string;
  description: string;
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

export default function VehicleSchedulePage() {
  const router = useRouter();
  const supabase = createClient();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [logs, setLogs] = useState<VehicleLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentProfile, setCurrentProfile] = useState<{
    is_approver: boolean;
    role: string;
    is_vehicle_notify?: boolean;
  } | null>(null);

  const [selectedLog, setSelectedLog] = useState<VehicleLog | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 사용자 정보
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser(user.id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, is_approver, role, is_vehicle_notify")
          .eq("id", user.id)
          .single();
        if (profile) {
          setCurrentUserName(profile.full_name);
          setCurrentProfile({
            is_approver: profile.is_approver || false,
            role: profile.role || "user",
            is_vehicle_notify: profile.is_vehicle_notify || false,
          });
        }
      }

      // 차량 목록
      const { data: vData } = await supabase
        .from("resources")
        .select("id, name, description")
        .eq("category", "vehicle")
        .eq("is_active", true)
        .order("id");

      if (vData) setVehicles(vData as Vehicle[]);

      // 예약/운행 로그 (취소 제외)
      const { data: lData, error: lError } = await supabase
        .from("reservations")
        .select(
          `*, profiles:user_id (full_name, position), resources:resource_id (name, description, insurance_info, fuel_segments)`,
        )
        .in("resource_id", vData?.map((v) => v.id) ?? [])
        .neq("vehicle_status", "cancelled")
        .order("start_at", { ascending: false });

      if (lError) toast.error("데이터를 불러오지 못했습니다.");
      if (lData) setLogs(lData as VehicleLog[]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition"
          >
            <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-base font-bold text-gray-900 flex-1">차량 스케줄</h1>
          <button
            onClick={fetchData}
            className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition text-gray-500"
            title="새로고침"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </header>

      {/* 본문 */}
      <main className="flex-1 p-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
            <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-sm font-medium">불러오는 중...</span>
          </div>
        ) : (
          <ScheduleTab
            vehicles={vehicles}
            logs={logs}
            onSelectLog={(log) => {
              setSelectedLog(log as VehicleLog);
              setIsDetailModalOpen(true);
            }}
            defaultView="week"
            weekLayout="vehicle-rows"
          />
        )}
      </main>

      {/* 운행 상세 모달 */}
      <DetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        selectedLog={selectedLog}
        currentUser={currentUser}
        currentUserName={currentUserName}
        currentProfile={currentProfile}
        onRefresh={fetchData}
      />
    </div>
  );
}
