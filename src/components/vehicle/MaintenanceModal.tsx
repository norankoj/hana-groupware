"use client";

import { useState, useEffect } from "react";
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
  created_at: string;
  profiles?: { full_name: string };
};

const TYPE_LABELS: Record<string, string> = {
  oil_change: "오일 교환",
  tire: "타이어",
  inspection: "정기점검",
  repair: "수리",
  other: "기타",
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
  const [form, setForm] = useState({
    maintenance_date: format(new Date(), "yyyy-MM-dd"),
    type: "oil_change",
    description: "",
    mileage: "" as number | "",
  });

  useEffect(() => {
    if (isOpen && vehicle) {
      fetchRecords();
      setShowForm(false);
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
    if (!form.maintenance_date || !form.type) {
      return toast.error("날짜와 유형을 입력해주세요.");
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("maintenance_records").insert({
      resource_id: vehicle.id,
      maintenance_date: form.maintenance_date,
      type: form.type,
      description: form.description || null,
      mileage: form.mileage !== "" ? Number(form.mileage) : null,
      created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("정비 이력이 등록되었습니다.");
    setForm({
      maintenance_date: format(new Date(), "yyyy-MM-dd"),
      type: "oil_change",
      description: "",
      mileage: "",
    });
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
      onClose={onClose}
      title={`정비 이력 — ${vehicle?.name ?? ""}`}
      footer={
        <div className="flex gap-2 w-full">
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold transition"
            >
              + 정비 추가
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-lg font-bold transition"
          >
            닫기
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* 등록 폼 */}
        {showForm && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
            <p className="text-sm font-bold text-blue-700">새 정비 이력 등록</p>
            <div className="grid grid-cols-2 gap-3 items-end">
              {/* 날짜 */}
              <div className="relative">
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  날짜
                </label>
                <div
                  onClick={() => setShowCalendar((v) => !v)}
                  className="h-[38px] flex items-center justify-left pl-4 cursor-pointer border border-gray-300 rounded-lg bg-white text-sm font-bold text-gray-900 select-none hover:bg-gray-50 transition"
                >
                  {form.maintenance_date}
                </div>
                {showCalendar && (
                  <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl p-2 animate-fadeIn">
                    <Calendar
                      onChange={(val) => {
                        if (val && !Array.isArray(val)) {
                          setForm((p) => ({
                            ...p,
                            maintenance_date: format(val, "yyyy-MM-dd"),
                          }));
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
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  유형
                </label>
                <Select
                  value={form.type}
                  onChange={(v) => setForm((p) => ({ ...p, type: v }))}
                  options={Object.entries(TYPE_LABELS).map(([k, v]) => ({
                    value: k,
                    label: v,
                  }))}
                  className="w-full h-[38px] px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">
                주행거리 (km, 선택)
              </label>
              <input
                type="number"
                placeholder="예: 54000"
                value={form.mileage}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    mileage:
                      e.target.value === "" ? "" : Number(e.target.value),
                  }))
                }
                className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">
                메모 (선택)
              </label>
              <textarea
                placeholder="교체 부품, 비용 등"
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
                className="w-full h-20 border border-gray-300 rounded-lg p-2 text-sm outline-none resize-none focus:ring-2 focus:ring-blue-400 bg-white"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-bold transition"
              >
                저장
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2 rounded-lg text-sm font-bold transition"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {/* 이력 목록 */}
        {loading ? (
          <p className="text-center text-gray-400 text-sm py-6">
            불러오는 중...
          </p>
        ) : records.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">
            등록된 정비 이력이 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {records.map((r) => (
              <li
                key={r.id}
                className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-start justify-between gap-3 hover:bg-white transition"
              >
                <div className="flex-1 min-w-0">
                  {/* 상단: 날짜 + 유형 뱃지 + 주행거리 */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-bold text-gray-400 font-mono">
                      {r.maintenance_date}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        r.type === "oil_change"
                          ? "bg-yellow-100 text-yellow-700"
                          : r.type === "tire"
                            ? "bg-blue-100 text-blue-700"
                            : r.type === "inspection"
                              ? "bg-green-100 text-green-700"
                              : r.type === "repair"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {TYPE_LABELS[r.type] ?? r.type}
                    </span>
                    {r.mileage != null && (
                      <span className="text-xs text-gray-400 font-mono">
                        {r.mileage.toLocaleString()} km
                      </span>
                    )}
                  </div>
                  {/* 메모 */}
                  {r.description && (
                    <p className="text-sm text-gray-700 break-words leading-relaxed">
                      {r.description}
                    </p>
                  )}
                  {/* 등록자 */}
                  {r.profiles?.full_name && (
                    <p className="text-xs text-gray-400 mt-1">
                      등록자: {r.profiles.full_name}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                  title="삭제"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
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
