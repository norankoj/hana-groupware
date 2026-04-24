"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";

type MaintenanceRecord = {
  id: number;
  resource_id: number;
  maintenance_date: string;
  type: string;
  description: string | null;
  mileage: number | null;
  shop: string | null;
  cost: number | null;
  created_at: string;
  profiles?: { full_name: string };
};

const TYPE_LABEL_MAP: Record<string, string> = {
  engine_oil: "엔진오일 및 오일필터",
  ac_filter: "에어컨 필터(항균필터)",
  wiper: "와이퍼 블레이드",
  drive_belt: "구동벨트",
  mission_oil: "미션 오일",
  battery: "배터리",
  warranty: "보증수리",
  brake_oil: "브레이크 오일",
  brake_pad: "브레이크 패드 및 디스크",
  accident: "사고수리",
  air_cleaner: "에어클리너 필터",
  coolant: "엔진부동액(냉각수)",
  fuel_filter: "연료필터",
  exterior_repair: "외장수리복원",
  general_repair: "일반수리",
  spark_plug: "점화플러그",
  timing_belt: "타이밍 벨트",
  tire: "타이어",
  tire_rotation: "타이어 위치",
  tire_puncture: "타이어펑크 수리",
  power_steering: "파워스티어링 오일",
  wheel_alignment: "휠 얼라이먼트",
  other: "기타",
};

const getBadgeColor = (type: string) => {
  if (["engine_oil", "mission_oil", "brake_oil", "power_steering"].includes(type))
    return "bg-yellow-100 text-yellow-700";
  if (["accident", "exterior_repair", "brake_pad"].includes(type))
    return "bg-red-100 text-red-700";
  if (["tire", "tire_rotation", "tire_puncture", "wheel_alignment"].includes(type))
    return "bg-blue-100 text-blue-700";
  if (["warranty", "general_repair"].includes(type))
    return "bg-green-100 text-green-700";
  if (["drive_belt", "timing_belt", "spark_plug", "coolant"].includes(type))
    return "bg-orange-100 text-orange-700";
  if (["ac_filter", "air_cleaner", "fuel_filter"].includes(type))
    return "bg-teal-100 text-teal-700";
  if (type === "battery") return "bg-purple-100 text-purple-700";
  return "bg-gray-100 text-gray-600";
};

function MaintenancePage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const vehicleId = Number(searchParams.get("vehicleId"));
  const vehicleName = searchParams.get("vehicleName") ?? "";

  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    if (!vehicleId) return;
    setLoading(true);
    const { data } = await supabase
      .from("maintenance_records")
      .select("*, profiles:created_by (full_name)")
      .eq("resource_id", vehicleId)
      .order("maintenance_date", { ascending: false });
    if (data) setRecords(data as MaintenanceRecord[]);
    setLoading(false);
  }, [vehicleId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleDelete = async (id: number) => {
    const { error } = await supabase
      .from("maintenance_records")
      .delete()
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("삭제되었습니다.");
    fetchRecords();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-1 rounded-lg hover:bg-gray-100 text-gray-500 transition"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-gray-900 truncate">정비 이력</h1>
          <p className="text-xs text-gray-400 truncate">{vehicleName}</p>
        </div>
        <button
          onClick={() =>
            router.push(
              `/vehicle/maintenance/add?vehicleId=${vehicleId}&vehicleName=${encodeURIComponent(vehicleName)}`,
            )
          }
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          정비 추가
        </button>
      </div>

      {/* 목록 */}
      <div className="flex-1 p-4 space-y-3">
        {loading ? (
          <p className="text-center text-gray-400 text-sm py-10">불러오는 중...</p>
        ) : records.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm">등록된 정비 이력이 없습니다.</p>
          </div>
        ) : (
          records.map((r) => (
            <div
              key={r.id}
              className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-gray-400 font-mono">{r.maintenance_date}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getBadgeColor(r.type)}`}>
                    {TYPE_LABEL_MAP[r.type] ?? r.type}
                  </span>
                  {r.mileage != null && (
                    <span className="text-xs text-gray-400 font-mono">
                      {r.mileage.toLocaleString()} km
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {(r.shop || r.cost != null) && (
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  {r.shop && (
                    <span className="flex items-center gap-1 text-xs text-gray-600 font-medium">
                      <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      {r.shop}
                    </span>
                  )}
                  {r.cost != null && (
                    <span className="flex items-center gap-1 text-xs font-bold text-blue-600">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {r.cost.toLocaleString()}원
                    </span>
                  )}
                </div>
              )}

              {r.description && (
                <p className="text-sm text-gray-700 break-words leading-relaxed mb-1">{r.description}</p>
              )}

              {r.profiles?.full_name && (
                <p className="text-xs text-gray-400">등록: {r.profiles.full_name}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function MaintenanceListPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-gray-400">로딩 중...</div>}>
      <MaintenancePage />
    </Suspense>
  );
}
