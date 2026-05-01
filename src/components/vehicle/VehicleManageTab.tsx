"use client";

import { useState } from "react";
import Image from "next/image";
import { differenceInDays, format } from "date-fns";
import { ko } from "date-fns/locale";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";

const VEHICLE_IMAGES: Record<string, string> = {
  스타렉스: "/images/cars/starex.webp",
  스타리아: "/images/cars/staria.webp",
  스타리아HEV: "/images/cars/staria-hev.webp",
  마티즈: "/images/cars/matiz.webp",
  모닝: "/images/cars/morning.webp",
  쏘나타: "/images/cars/sonata.png",
  봉고트럭: "/images/cars/bongo.png",
  카니발: "/images/cars/carnival.png",
};

// 빠른 추가용 기본 소모품 목록
const PRESET_CONSUMABLES = [
  { name: "엔진오일", cycle_km: 10000 },
  { name: "타이어", cycle_km: 50000 },
  { name: "브레이크 디스크", cycle_km: 70000 },
  { name: "배터리", cycle_km: 60000 },
  { name: "에어필터", cycle_km: 20000 },
  { name: "에어컨 필터", cycle_km: 15000 },
];

export type VehicleForManage = {
  id: number;
  name: string;
  description: string;
  current_mileage: number;
  inspection_due_date?: string | null;
  inspection_cycle_month?: number | null;
};

export type Consumable = {
  id: number;
  resource_id: number;
  name: string;
  cycle_km: number;
  last_replaced_km: number;
};

interface Props {
  vehicles: VehicleForManage[];
  consumables: Consumable[];
  isAdmin: boolean;
  onRefresh: () => void;
}

export default function VehicleManageTab({
  vehicles,
  consumables,
  isAdmin,
  onRefresh,
}: Props) {
  const supabase = createClient();
  const [selectedId, setSelectedId] = useState<number>(vehicles[0]?.id ?? 0);
  const [editingInspection, setEditingInspection] = useState(false);
  const [inspectionDate, setInspectionDate] = useState("");
  const [addingConsumable, setAddingConsumable] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCycle, setNewCycle] = useState(10000);
  const [saving, setSaving] = useState(false);

  const vehicle = vehicles.find((v) => v.id === selectedId);
  const vConsumables = consumables.filter((c) => c.resource_id === selectedId);

  // ── 정기검사 D-day 계산 ──────────────────────────────────────────────────
  const daysLeft = vehicle?.inspection_due_date
    ? differenceInDays(new Date(vehicle.inspection_due_date), new Date())
    : null;

  const inspBadge =
    daysLeft === null
      ? { label: "미등록", cls: "bg-gray-100 text-gray-500" }
      : daysLeft < 0
        ? { label: `${Math.abs(daysLeft)}일 초과`, cls: "bg-red-100 text-red-600" }
        : daysLeft <= 30
          ? { label: `D-${daysLeft}`, cls: "bg-red-100 text-red-600" }
          : daysLeft <= 90
            ? { label: `D-${daysLeft}`, cls: "bg-amber-100 text-amber-600" }
            : { label: `D-${daysLeft}`, cls: "bg-green-100 text-green-700" };

  // ── 소모품 진행도 ────────────────────────────────────────────────────────
  const getBar = (c: Consumable) => {
    const km = vehicle?.current_mileage ?? 0;
    const used = Math.max(0, km - c.last_replaced_km);
    const pct = Math.min(100, (used / c.cycle_km) * 100);
    const remaining = c.last_replaced_km + c.cycle_km - km;
    const overdue = remaining <= 0;
    const soon = !overdue && remaining <= c.cycle_km * 0.15;
    return { pct, remaining, overdue, soon };
  };

  // ── 핸들러 ───────────────────────────────────────────────────────────────
  const saveInspection = async () => {
    if (!vehicle || !inspectionDate) return;
    setSaving(true);
    const { error } = await supabase
      .from("resources")
      .update({ inspection_due_date: inspectionDate })
      .eq("id", vehicle.id);
    if (error) toast.error(error.message);
    else {
      toast.success("정기검사 만료일이 저장되었습니다.");
      setEditingInspection(false);
      onRefresh();
    }
    setSaving(false);
  };

  const markReplaced = async (c: Consumable) => {
    const km = vehicle?.current_mileage ?? 0;
    setSaving(true);
    const { error } = await supabase
      .from("vehicle_consumables")
      .update({ last_replaced_km: km, updated_at: new Date().toISOString() })
      .eq("id", c.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`${c.name} 교체 완료로 기록했습니다. (${km.toLocaleString()} km)`);
      onRefresh();
    }
    setSaving(false);
  };

  const addConsumable = async (name: string, cycle: number) => {
    if (!vehicle) return;
    setSaving(true);
    const { error } = await supabase.from("vehicle_consumables").insert({
      resource_id: vehicle.id,
      name,
      cycle_km: cycle,
      last_replaced_km: vehicle.current_mileage,
    });
    if (error) toast.error(error.message);
    else {
      toast.success(`${name} 소모품이 추가되었습니다.`);
      setAddingConsumable(false);
      setNewName("");
      setNewCycle(10000);
      onRefresh();
    }
    setSaving(false);
  };

  const deleteConsumable = async (id: number, name: string) => {
    const { error } = await supabase
      .from("vehicle_consumables")
      .delete()
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(`${name}이(가) 삭제되었습니다.`);
      onRefresh();
    }
  };

  return (
    <div className="flex gap-5 min-h-[560px]">
      {/* ── 좌측: 차량 목록 패널 ── */}
      <div className="w-52 shrink-0 bg-white rounded-xl border border-gray-200 overflow-y-auto">
        {vehicles.map((v) => {
          const img = VEHICLE_IMAGES[v.name];
          const isSelected = v.id === selectedId;
          return (
            <button
              key={v.id}
              onClick={() => setSelectedId(v.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition text-left ${
                isSelected
                  ? "bg-blue-50 border-l-4 border-l-blue-500"
                  : "border-l-4 border-l-transparent"
              }`}
            >
              {img ? (
                <Image
                  src={img}
                  alt={v.name}
                  width={52}
                  height={32}
                  className="object-contain shrink-0"
                />
              ) : (
                <div className="w-[52px] h-8 bg-gray-100 rounded flex items-center justify-center text-[10px] text-gray-300 shrink-0 font-bold">
                  CAR
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-800 truncate">
                  {v.description}
                </p>
                <p className="text-[11px] text-gray-400 truncate">{v.name}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── 우측: 관리 패널 ── */}
      {vehicle ? (
        <div className="flex-1 space-y-4 overflow-y-auto">
          {/* 정기검사 카드 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-700">차량 정기 검사</h3>
              {isAdmin && !editingInspection && (
                <button
                  onClick={() => {
                    setInspectionDate(vehicle.inspection_due_date ?? "");
                    setEditingInspection(true);
                  }}
                  className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 transition"
                >
                  ✎ 수정
                </button>
              )}
            </div>

            {editingInspection ? (
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    정기검사 만료일
                  </label>
                  <input
                    type="date"
                    value={inspectionDate}
                    onChange={(e) => setInspectionDate(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 transition"
                  />
                </div>
                <div className="flex gap-2 self-end">
                  <button
                    onClick={saveInspection}
                    disabled={saving || !inspectionDate}
                    className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-500 transition disabled:opacity-50"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => setEditingInspection(false)}
                    className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 transition"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-28 shrink-0">
                      정기검사 만료일
                    </span>
                    <span className="text-sm font-semibold text-gray-800">
                      {vehicle.inspection_due_date
                        ? format(
                            new Date(vehicle.inspection_due_date),
                            "yyyy.MM.dd (EEE)",
                            { locale: ko },
                          )
                        : "—"}
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${inspBadge.cls}`}
                    >
                      {inspBadge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-28 shrink-0">
                      누적 주행거리
                    </span>
                    <span className="text-sm font-semibold text-gray-800">
                      {vehicle.current_mileage.toLocaleString()} km
                    </span>
                  </div>
                </div>
                {/* 검사 상태 안내 */}
                {daysLeft !== null && daysLeft <= 90 && (
                  <div
                    className={`text-xs px-4 py-2.5 rounded-xl leading-snug ${
                      daysLeft < 0
                        ? "bg-red-50 text-red-600 border border-red-100"
                        : daysLeft <= 30
                          ? "bg-amber-50 text-amber-700 border border-amber-100"
                          : "bg-blue-50 text-blue-700 border border-blue-100"
                    }`}
                  >
                    {daysLeft < 0 ? (
                      <>
                        <p className="font-bold">검사 만료됨</p>
                        <p className="mt-0.5 opacity-80">즉시 정기검사 예약이 필요합니다</p>
                      </>
                    ) : daysLeft <= 30 ? (
                      <>
                        <p className="font-bold">만료 {daysLeft}일 전 · 검사 예약 필요</p>
                        <p className="mt-0.5 opacity-80">
                          만료 30일 전 ~ 만료 후 30일까지 검사 가능
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-bold">만료 {daysLeft}일 전 · 검사 예약 가능</p>
                        <p className="mt-0.5 opacity-80">
                          만료 90일 전부터 검사 예약이 가능합니다
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 소모품 관리 카드 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-700">소모품 관리</h3>
              {isAdmin && (
                <button
                  onClick={() => setAddingConsumable((v) => !v)}
                  className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 transition"
                >
                  + 소모품 추가
                </button>
              )}
            </div>

            {/* 소모품 없을 때 — 프리셋 버튼 */}
            {vConsumables.length === 0 && !addingConsumable ? (
              <div className="py-6 text-center">
                <p className="text-sm text-gray-300 mb-4">
                  등록된 소모품이 없습니다
                </p>
                {isAdmin && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {PRESET_CONSUMABLES.map((d) => (
                      <button
                        key={d.name}
                        onClick={() => addConsumable(d.name, d.cycle_km)}
                        disabled={saving}
                        className="text-xs px-3 py-1.5 border border-dashed border-gray-300 text-gray-500 rounded-lg hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition disabled:opacity-50"
                      >
                        + {d.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {vConsumables.map((c) => {
                  const { pct, remaining, overdue, soon } = getBar(c);
                  const barColor = overdue
                    ? "bg-red-500"
                    : soon
                      ? "bg-amber-400"
                      : "bg-blue-500";
                  const remainText = overdue
                    ? `${Math.abs(remaining).toLocaleString()} km 초과`
                    : `${remaining.toLocaleString()} km 남음`;
                  const remainCls = overdue
                    ? "text-red-600 font-bold"
                    : soon
                      ? "text-amber-600 font-bold"
                      : "text-blue-600";

                  return (
                    <div key={c.id} className="group">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-semibold text-gray-800 truncate">
                            {c.name}
                          </span>
                          <span className="text-[11px] text-gray-400 shrink-0">
                            {c.cycle_km.toLocaleString()} km마다 교체
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs ${remainCls}`}>
                            {remainText}
                          </span>
                          {isAdmin && (
                            <div className="hidden group-hover:flex items-center gap-1">
                              <button
                                onClick={() => markReplaced(c)}
                                disabled={saving}
                                title="현재 주행거리 기준으로 교체 완료 처리"
                                className="text-[11px] px-2 py-0.5 bg-green-50 text-green-700 rounded hover:bg-green-100 transition disabled:opacity-50 whitespace-nowrap"
                              >
                                교체완료
                              </button>
                              <button
                                onClick={() => deleteConsumable(c.id, c.name)}
                                className="text-[11px] px-2 py-0.5 bg-red-50 text-red-500 rounded hover:bg-red-100 transition"
                              >
                                삭제
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* 진행바 */}
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-gray-400">
                          교체 후 {Math.max(0, (vehicle?.current_mileage ?? 0) - c.last_replaced_km).toLocaleString()} km 주행
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {Math.round(pct)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 소모품 직접 추가 폼 */}
            {addingConsumable && (
              <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200 space-y-3">
                <p className="text-xs font-bold text-gray-600">소모품 직접 추가</p>
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="text"
                    placeholder="소모품명 (예: 와이퍼)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newName.trim()) addConsumable(newName.trim(), newCycle);
                    }}
                    className="flex-1 min-w-[160px] px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-white transition"
                    autoFocus
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={newCycle}
                      onChange={(e) => setNewCycle(Number(e.target.value))}
                      min={1000}
                      step={1000}
                      className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-white transition"
                    />
                    <span className="text-xs text-gray-400 shrink-0">km마다</span>
                  </div>
                </div>
                {/* 프리셋 빠른 선택 */}
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_CONSUMABLES.filter(
                    (d) => !vConsumables.some((c) => c.name === d.name),
                  ).map((d) => (
                    <button
                      key={d.name}
                      onClick={() => addConsumable(d.name, d.cycle_km)}
                      disabled={saving}
                      className="text-[11px] px-2.5 py-1 bg-white border border-gray-200 text-gray-600 rounded-lg hover:border-blue-400 hover:text-blue-500 transition disabled:opacity-50"
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (newName.trim()) addConsumable(newName.trim(), newCycle);
                    }}
                    disabled={saving || !newName.trim()}
                    className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-500 disabled:opacity-50 transition"
                  >
                    추가
                  </button>
                  <button
                    onClick={() => {
                      setAddingConsumable(false);
                      setNewName("");
                    }}
                    className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 transition"
                  >
                    닫기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
          좌측에서 차량을 선택해주세요
        </div>
      )}
    </div>
  );
}
