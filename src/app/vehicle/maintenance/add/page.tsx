"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import Select from "@/components/Select";
import toast from "react-hot-toast";
import { createClient } from "@/utils/supabase/client";

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

const EMPTY_FORM = {
  maintenance_date: format(new Date(), "yyyy-MM-dd"),
  type: "engine_oil",
  description: "",
  mileage: "" as number | "",
  shop: "",
  cost: "" as number | "",
};

function AddMaintenancePage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const vehicleId = Number(searchParams.get("vehicleId"));
  const vehicleName = searchParams.get("vehicleName") ?? "";

  const [form, setForm] = useState(EMPTY_FORM);
  const [showCalendar, setShowCalendar] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.maintenance_date || !form.type)
      return toast.error("날짜와 유형을 입력해주세요.");

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("maintenance_records").insert({
      resource_id: vehicleId,
      maintenance_date: form.maintenance_date,
      type: form.type,
      description: form.description || null,
      mileage: form.mileage !== "" ? Number(form.mileage) : null,
      shop: form.shop.trim() || null,
      cost: form.cost !== "" ? Number(form.cost) : null,
      created_by: user?.id,
    });
    setSaving(false);

    if (error) return toast.error(error.message);
    toast.success("정비 이력이 등록되었습니다.");
    router.back();
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
          <h1 className="text-base font-bold text-gray-900">정비 추가</h1>
          <p className="text-xs text-gray-400 truncate">{vehicleName}</p>
        </div>
      </div>

      {/* 폼 */}
      <div className="flex-1 p-4 space-y-4">
        {/* 날짜 */}
        <div className="relative">
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            날짜 <span className="text-red-500">*</span>
          </label>
          <div
            onClick={() => setShowCalendar((v) => !v)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white cursor-pointer select-none font-mono text-gray-900"
          >
            {form.maintenance_date}
          </div>
          {showCalendar && (
            <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl p-2">
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
            className="w-full h-[46px] px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl"
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
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none transition"
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
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none transition font-mono"
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
              className="w-full px-3 py-2.5 pr-8 border border-gray-200 rounded-xl text-sm bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none transition font-mono"
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
            rows={4}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none transition resize-none"
          />
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className="p-4 bg-white border-t border-gray-200 flex gap-3">
        <button
          onClick={() => router.back()}
          className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition"
        >
          취소
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-bold transition"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

export default function AddMaintenancePageWrapper() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-gray-400">로딩 중...</div>}>
      <AddMaintenancePage />
    </Suspense>
  );
}
