"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import Modal from "@/components/Modal";
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
  created_by?: string;
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

// 구 enum 키 → 한글 레이블 변환 (기존 데이터 호환)
const TYPE_LABEL_MAP: Record<string, string> = Object.fromEntries(
  TYPE_OPTIONS.map(({ value, label }) => [value, label]),
);

const EMPTY_FORM = {
  maintenance_date: format(new Date(), "yyyy-MM-dd"),
  type: "",
  description: "",
  mileage: "" as number | "",
  shop: "",
  cost: "" as number | "",
};

interface MaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle | null;
  onAdded?: (vehicleName: string, type: string) => void;
}

export default function MaintenanceModal({
  isOpen,
  onClose,
  vehicle,
  onAdded,
}: MaintenanceModalProps) {
  const supabase = createClient();
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) =>
      setCurrentUserId(user?.id ?? null),
    );
  }, []);

  const resetForm = useCallback(() => {
    setForm({ ...EMPTY_FORM, maintenance_date: format(new Date(), "yyyy-MM-dd") });
  }, []);

  const handleClose = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  useEffect(() => {
    if (isOpen && vehicle) {
      fetchRecords();
      setShowForm(false);
      setEditingId(null);
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
    if (!form.maintenance_date || !form.type.trim())
      return toast.error("날짜와 유형을 입력해주세요.");

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("maintenance_records").insert({
      resource_id: vehicle.id,
      maintenance_date: form.maintenance_date,
      type: form.type.trim(),
      description: form.description || null,
      mileage: form.mileage !== "" ? Number(form.mileage) : null,
      shop: form.shop.trim() || null,
      cost: form.cost !== "" ? Number(form.cost) : null,
      created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("정비 이력이 등록되었습니다.");
    const addedType = form.type;
    resetForm();
    setShowForm(false);
    fetchRecords();
    onAdded?.(vehicle.name, addedType);
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    if (!editForm.maintenance_date || !editForm.type.trim())
      return toast.error("날짜와 유형을 입력해주세요.");

    const { error } = await supabase
      .from("maintenance_records")
      .update({
        maintenance_date: editForm.maintenance_date,
        type: editForm.type.trim(),
        description: editForm.description || null,
        mileage: editForm.mileage !== "" ? Number(editForm.mileage) : null,
        shop: editForm.shop.trim() || null,
        cost: editForm.cost !== "" ? Number(editForm.cost) : null,
      })
      .eq("id", editingId);

    if (error) return toast.error(error.message);
    toast.success("수정되었습니다.");
    setEditingId(null);
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

  // 공용 폼 필드 (등록 / 수정 모두 사용)
  const renderFormFields = (
    f: typeof EMPTY_FORM,
    setF: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>,
    listId: string,
  ) => (
    <div className="p-4 space-y-4">
      {/* 날짜 — 네이티브 date input (월 이동 내장) */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          날짜 <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={f.maintenance_date}
          onChange={(e) =>
            setF((p) => ({ ...p, maintenance_date: e.target.value }))
          }
          className="w-full px-3 py-2.5 border border-gray-200 rounded-sm text-sm bg-gray-50 focus:bg-white focus:border-gray-400 focus:ring-1 focus:ring-gray-300 outline-none transition font-mono text-gray-900"
        />
      </div>

      {/* 유형 — 자유 입력 + 자동완성 */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          유형 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          list={listId}
          placeholder="예: 엔진오일, 타이어, 배터리, 에어컨필터..."
          value={f.type}
          onChange={(e) => setF((p) => ({ ...p, type: e.target.value }))}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-sm text-sm bg-gray-50 focus:bg-white focus:border-gray-400 focus:ring-1 focus:ring-gray-300 outline-none transition"
        />
        <datalist id={listId}>
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.label} />
          ))}
        </datalist>
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
            value={f.shop}
            onChange={(e) => setF((p) => ({ ...p, shop: e.target.value }))}
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
            value={f.mileage}
            onChange={(e) =>
              setF((p) => ({
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
            value={f.cost}
            onChange={(e) =>
              setF((p) => ({
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
        {f.cost !== "" && Number(f.cost) > 0 && (
          <p className="text-xs text-blue-600 font-bold mt-1">
            {Number(f.cost).toLocaleString()}원
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
          value={f.description}
          onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-sm text-sm bg-gray-50 focus:bg-white focus:border-gray-400 focus:ring-1 focus:ring-gray-300 outline-none transition resize-none"
        />
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`정비 이력 — ${vehicle?.name ?? ""}`}
      footer={
        <div className="flex gap-2 w-full">
          {!showForm && !editingId && (
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
            <div className="px-4 py-2.5 flex items-center gap-2 border-b bg-blue-50 border-blue-100">
              <span className="w-1.5 h-4 rounded-full shrink-0 bg-blue-500" />
              <span className="text-sm font-bold text-blue-700">새 정비 이력 등록</span>
            </div>

            {renderFormFields(form, setForm, "maintenance-types-add")}

            <div className="px-4 pb-4 flex gap-2">
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
                className="bg-gray-50 border border-gray-100 rounded-sm overflow-hidden hover:bg-white transition"
              >
                {editingId === r.id ? (
                  /* ── 인라인 수정 폼 ── */
                  <>
                    <div className="px-4 py-2.5 flex items-center gap-2 border-b bg-amber-50 border-amber-100">
                      <span className="w-1.5 h-4 rounded-full shrink-0 bg-amber-500" />
                      <span className="text-sm font-bold text-amber-700">정비 이력 수정</span>
                    </div>
                    {renderFormFields(editForm, setEditForm, "maintenance-types-edit")}
                    <div className="px-4 pb-4 flex gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2.5 rounded-sm text-sm font-bold transition cursor-pointer"
                      >
                        취소
                      </button>
                      <button
                        onClick={handleUpdate}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-sm text-sm font-bold transition cursor-pointer"
                      >
                        저장
                      </button>
                    </div>
                  </>
                ) : (
                  /* ── 읽기 뷰 ── */
                  <div className="p-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* 날짜 + 유형 + 주행거리 */}
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-xs font-bold text-gray-400 font-mono">
                          {r.maintenance_date}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">
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

                    <div className="flex gap-1 shrink-0">
                      {r.created_by === currentUserId && (
                        <button
                          onClick={() => {
                            setEditForm({
                              maintenance_date: r.maintenance_date,
                              type: TYPE_LABEL_MAP[r.type] ?? r.type,
                              description: r.description || "",
                              mileage: r.mileage ?? "",
                              shop: r.shop || "",
                              cost: r.cost ?? "",
                            });
                            setShowForm(false);
                            setEditingId(r.id);
                          }}
                          className="p-1.5 text-gray-300 hover:text-amber-500 hover:bg-amber-50 rounded-sm transition"
                          title="수정"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-sm transition"
                        title="삭제"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
