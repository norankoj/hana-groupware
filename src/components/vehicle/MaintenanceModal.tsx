"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import toast from "react-hot-toast";
import { createClient } from "@/utils/supabase/client";

type Vehicle = {
  id: number;
  name: string;
  description: string;
};

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

const TYPE_OPTIONS = [
  { value: "engine_oil",      label: "엔진오일 및 오일필터" },
  { value: "ac_filter",       label: "에어컨 필터(항균필터)" },
  { value: "wiper",           label: "와이퍼 블레이드" },
  { value: "drive_belt",      label: "구동벨트" },
  { value: "mission_oil",     label: "미션 오일" },
  { value: "battery",         label: "배터리" },
  { value: "warranty",        label: "보증수리" },
  { value: "brake_oil",       label: "브레이크 오일" },
  { value: "brake_pad",       label: "브레이크 패드 및 디스크" },
  { value: "accident",        label: "사고수리" },
  { value: "air_cleaner",     label: "에어클리너 필터" },
  { value: "coolant",         label: "엔진부동액(냉각수)" },
  { value: "fuel_filter",     label: "연료필터" },
  { value: "exterior_repair", label: "외장수리복원" },
  { value: "general_repair",  label: "일반수리" },
  { value: "spark_plug",      label: "점화플러그" },
  { value: "timing_belt",     label: "타이밍 벨트" },
  { value: "tire",            label: "타이어" },
  { value: "tire_rotation",   label: "타이어 위치" },
  { value: "tire_puncture",   label: "타이어펑크 수리" },
  { value: "power_steering",  label: "파워스티어링 오일" },
  { value: "wheel_alignment", label: "휠 얼라이먼트" },
  { value: "other",           label: "기타" },
];

const TYPE_LABEL_MAP: Record<string, string> = Object.fromEntries(
  TYPE_OPTIONS.map(({ value, label }) => [value, label]),
);

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

const EMPTY_FORM = {
  maintenance_date: format(new Date(), "yyyy-MM-dd"),
  type: "engine_oil",
  description: "",
  mileage: "" as number | "",
  shop: "",
  cost: "" as number | "",
};

interface MaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle | null;
}

export default function MaintenanceModal({
  isOpen,
  onClose,
  vehicle,
}: MaintenanceModalProps) {
  const supabase = createClient();
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const resetForm = useCallback(() => {
    setForm({ ...EMPTY_FORM, maintenance_date: format(new Date(), "yyyy-MM-dd") });
    setShowCalendar(false);
  }, []);

  const handleClose = useCallback(() => {
    setShowForm(false);
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  useEffect(() => {
    if (isOpen && vehicle) {
      fetchRecords();
      setShowForm(false);
      resetForm();
    }
  }, [isOpen, vehicle]);

  const fetchRecords = async () => {
    if (!vehicle) return;
    setLoading(true);
    const { data } = await supabase
      .from("maintenance_records")
      .select("*, profiles:created_by (full_name)")
      .eq("resource_id", vehicle.id)
      .order("maintenance_date", { ascending: false });
    if (data) setRecords(data as MaintenanceRecord[]);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!vehicle) return;
    if (!form.maintenance_date || !form.type)
      return toast.error("날짜와 유형을 입력해주세요.");

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("maintenance_records").insert({
      resource_id: vehicle.id,
      maintenance_date: form.maintenance_date,
      type: form.type,
      description: form.description || null,
      mileage: form.mileage !== "" ? Number(form.mileage) : null,
      shop: form.shop.trim() || null,
      cost: form.cost !== "" ? Number(form.cost) : null,
      created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("정비 이력이 등록되었습니다.");
    resetForm();
    setShowForm(false);
    fetchRecords();
  };

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
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`정비 이력 — ${vehicle?.name ?? ""}`}
      footer={
        <div className="flex gap-2 w-full">
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-sm font-bold transition cursor-pointer"
            >
              + 정비 추가
            </button>
          )}
          <button
            onClick={handleClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-sm font-bold transition cursor-pointer"
          >
            닫기
          </button>
        </div>
      }
    >
      <div className="space-y-4">

        {/* ── 등록 폼 ── */}
        {showForm && (
          <div className="bg-white border border-blue-200 rounded-sm overflow-hidden">
            {/* 헤더 */}
            <div className="px-4 py-2.5 flex items-center gap-2 border-b bg-blue-50 border-blue-100">
              <span className="w-1.5 h-4 rounded-full shrink-0 bg-blue-500" />
              <span className="text-sm font-bold text-blue-700">새 정비 이력 등록</span>
            </div>

            <div className="p-4 space-y-4">
              {/* 날짜 */}
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  날짜 <span className="text-red-500">*</span>
                </label>
                <div
                  onClick={() => setShowCalendar((v) => !v)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-sm text-sm bg-gray-50 hover:bg-white cursor-pointer select-none font-mono text-gray-900 transition"
                >
                  {form.maintenance_date}
                </div>
                {showCalendar && (
                  <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl p-2 animate-fadeIn">
                    <Calendar
                      onChange={(val) => {
                        if (val && !Array.isArray(val)) {
                          setForm((p) => ({ ...p, maintenance_date: format(val, "yyyy-MM-dd") }));
                          setShowCalendar(false);
                        }
                      }}
                      value={new Date(form.maintenance_date)}
                      formatDay={(locale, date) => format(date, "d")}
                      calendarType="gregory"
                      locale="ko-KR"
                    />
                  </div>
                )}
              </div>

              {/* 유형 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  유형 <span className="text-red-500">*</span>
                </label>
                <Select
                  value={form.type}
                  onChange={(v) => setForm((p) => ({ ...p, type: v }))}
                  options={TYPE_OPTIONS}
                  className="w-full h-[42px] px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-sm"
                />
              </div>

              {/* 정비소 + 주행거리 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    정비소 <span className="text-gray-400 font-normal text-xs">(선택)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="예: SK네트웍스"
                    value={form.shop}
                    onChange={(e) => setForm((p) => ({ ...p, shop: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-sm text-sm bg-gray-50 focus:bg-white focus:border-gray-400 focus:ring-1 focus:ring-gray-300 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    주행거리 <span className="text-gray-400 font-normal text-xs">(km)</span>
                  </label>
                  <input
                    type="number"
                    placeholder="예: 54000"
                    value={form.mileage}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        mileage: e.target.value === "" ? "" : Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-sm text-sm bg-gray-50 focus:bg-white focus:border-gray-400 focus:ring-1 focus:ring-gray-300 outline-none transition font-mono"
                  />
                </div>
              </div>

              {/* 수리 비용 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  수리 비용 <span className="text-gray-400 font-normal text-xs">(선택)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="예: 150000"
                    value={form.cost}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        cost: e.target.value === "" ? "" : Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2.5 pr-8 border border-gray-200 rounded-sm text-sm bg-gray-50 focus:bg-white focus:border-gray-400 focus:ring-1 focus:ring-gray-300 outline-none transition font-mono"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold pointer-events-none">
                    원
                  </span>
                </div>
                {form.cost !== "" && Number(form.cost) > 0 && (
                  <p className="text-xs text-blue-600 font-bold mt-1">
                    {Number(form.cost).toLocaleString()}원
                  </p>
                )}
              </div>

              {/* 메모 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  메모 <span className="text-gray-400 font-normal text-xs">(선택)</span>
                </label>
                <textarea
                  placeholder="교체 부품, 특이사항 등"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-sm text-sm bg-gray-50 focus:bg-white focus:border-gray-400 focus:ring-1 focus:ring-gray-300 outline-none transition resize-none"
                />
              </div>

              {/* 저장 / 취소 */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setShowForm(false); resetForm(); }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2.5 rounded-sm text-sm font-bold transition cursor-pointer"
                >
                  취소
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-sm text-sm font-bold transition cursor-pointer"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 이력 목록 ── */}
        {loading ? (
          <p className="text-center text-gray-400 text-sm py-6">불러오는 중...</p>
        ) : records.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">
            등록된 정비 이력이 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {records.map((r) => (
              <li
                key={r.id}
                className="bg-gray-50 border border-gray-100 rounded-sm p-3 flex items-start justify-between gap-3 hover:bg-white transition"
              >
                <div className="flex-1 min-w-0">
                  {/* 날짜 + 유형 + 주행거리 */}
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-xs font-bold text-gray-400 font-mono">
                      {r.maintenance_date}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getBadgeColor(r.type)}`}>
                      {TYPE_LABEL_MAP[r.type] ?? r.type}
                    </span>
                    {r.mileage != null && (
                      <span className="text-xs text-gray-400 font-mono">
                        {r.mileage.toLocaleString()} km
                      </span>
                    )}
                  </div>

                  {/* 정비소 + 비용 */}
                  {(r.shop || r.cost != null) && (
                    <div className="flex items-center gap-3 mb-1.5 flex-wrap">
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

                  {/* 메모 */}
                  {r.description && (
                    <p className="text-sm text-gray-700 break-words leading-relaxed">
                      {r.description}
                    </p>
                  )}

                  {/* 등록자 */}
                  {r.profiles?.full_name && (
                    <p className="text-xs text-gray-400 mt-1">
                      등록: {r.profiles.full_name}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleDelete(r.id)}
                  className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-sm transition"
                  title="삭제"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
