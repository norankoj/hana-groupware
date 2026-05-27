"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Select from "@/components/Select";
import Modal from "@/components/Modal";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths, parseISO, isToday,
} from "date-fns";
import { ko } from "date-fns/locale";

type Props = { projectId: string; myUserId: string; isMember: boolean; isAdmin: boolean };

type Schedule = {
  id: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  description: string | null;
  location: string | null;
  category: string;
  responsible_name: string | null;
};

const CATEGORIES: Record<string, { label: string; color: string; dot: string }> = {
  arrival:   { label: "도착",   color: "bg-blue-100 text-blue-700",   dot: "bg-blue-500" },
  event:     { label: "행사",   color: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  meeting:   { label: "모임",   color: "bg-green-100 text-green-700",  dot: "bg-green-500" },
  departure: { label: "출발",   color: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  general:   { label: "일반",   color: "bg-gray-100 text-gray-600",    dot: "bg-gray-400" },
};

const EMPTY_FORM = {
  event_date: "", start_time: "", end_time: "", title: "", description: "",
  location: "", category: "general", responsible_name: "",
};

export default function ScheduleTab({ projectId, isMember, isAdmin }: Props) {
  const supabase = createClient();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Schedule | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calMonth, setCalMonth] = useState(new Date());
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from("project_schedules").select("*").eq("project_id", projectId).order("event_date").order("start_time");
    setSchedules((data || []) as Schedule[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetch(); }, [fetch]);

  const openCreate = (date?: string) => {
    setSelected(null);
    setForm(date ? { ...EMPTY_FORM, event_date: date } : EMPTY_FORM);
    setShowModal(true);
  };
  const openEdit = (s: Schedule) => {
    setSelected(s);
    setForm({
      event_date: s.event_date, start_time: s.start_time || "", end_time: s.end_time || "",
      title: s.title, description: s.description || "", location: s.location || "",
      category: s.category, responsible_name: s.responsible_name || "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.event_date) { toast.error("날짜와 제목을 입력하세요."); return; }
    setSaving(true);
    const payload = {
      ...form,
      start_time: form.start_time || null, end_time: form.end_time || null,
      description: form.description || null, location: form.location || null,
      responsible_name: form.responsible_name || null,
    };
    if (selected) {
      const { error } = await supabase.from("project_schedules").update(payload).eq("id", selected.id);
      if (error) { toast.error("수정 실패"); setSaving(false); return; }
      toast.success("수정되었습니다.");
    } else {
      const { error } = await supabase.from("project_schedules").insert({ ...payload, project_id: projectId });
      if (error) { toast.error("저장 실패"); setSaving(false); return; }
      toast.success("등록되었습니다.");
    }
    setShowModal(false);
    fetch();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await supabase.from("project_schedules").delete().eq("id", id);
    toast.success("삭제되었습니다.");
    fetch();
  };

  // 날짜별 그룹핑
  const grouped = schedules.reduce<Record<string, Schedule[]>>((acc, s) => {
    if (!acc[s.event_date]) acc[s.event_date] = [];
    acc[s.event_date].push(s);
    return acc;
  }, {});

  // 달력 날짜 계산
  const calDays = (() => {
    const ms = startOfMonth(calMonth);
    const me = endOfMonth(calMonth);
    const start = startOfWeek(ms, { weekStartsOn: 0 }); // 일요일 시작
    const end = endOfWeek(me, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  })();

  const calSelectedItems = calSelectedDate ? (grouped[calSelectedDate] ?? []) : [];

  if (loading) return <div className="text-center py-10 text-gray-400">로딩 중...</div>;

  return (
    <div>
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">전체 일정 {schedules.length}건</p>
        <div className="flex items-center gap-2">
          {/* 뷰 토글 */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 font-medium transition ${viewMode === "list" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >목록</button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 font-medium transition ${viewMode === "calendar" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >달력</button>
          </div>
          {isAdmin && (
            <button onClick={() => openCreate()} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              일정 추가
            </button>
          )}
        </div>
      </div>

      {schedules.length === 0 ? (
        <div className="text-center py-16 text-gray-400">등록된 일정이 없습니다.</div>
      ) : viewMode === "list" ? (
        /* ── 목록 뷰 ── */
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-bold text-gray-800">{date}</span>
                <span className="text-xs text-gray-400">{format(parseISO(date), "EEEE", { locale: ko })}</span>
              </div>
              <div className="space-y-2">
                {items.map((s) => {
                  const cat = CATEGORIES[s.category] ?? CATEGORIES.general;
                  return (
                    <div key={s.id} className={`bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-start gap-3 hover:shadow-sm transition ${isMember ? "cursor-pointer" : ""}`} onClick={() => isMember && openEdit(s)}>
                      <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5 ${cat.color}`}>{cat.label}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{s.title}</div>
                        <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-3">
                          {(s.start_time || s.end_time) && <span>{s.start_time?.slice(0,5)} {s.end_time ? `~ ${s.end_time.slice(0,5)}` : ""}</span>}
                          {s.location && <span>📍 {s.location}</span>}
                          {s.responsible_name && <span>👤 {s.responsible_name}</span>}
                        </div>
                        {s.description && <p className="text-xs text-gray-500 mt-1">{s.description}</p>}
                      </div>
                      {isAdmin && (
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                          className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50 transition shrink-0">삭제</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── 달력 뷰 ── */
        <div>
          {/* 월 네비게이션 */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => { setCalMonth(subMonths(calMonth, 1)); setCalSelectedDate(null); }}
              className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h3 className="font-bold text-gray-800 text-lg">
              {format(calMonth, "yyyy년 M월", { locale: ko })}
            </h3>
            <button onClick={() => { setCalMonth(addMonths(calMonth, 1)); setCalSelectedDate(null); }}
              className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          {/* 달력 그리드 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 border-b border-gray-200">
              {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
                <div key={d} className={`text-center text-xs font-semibold py-2 ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-500"}`}>{d}</div>
              ))}
            </div>
            {/* 날짜 셀 */}
            <div className="grid grid-cols-7">
              {calDays.map((day, i) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayEvents = grouped[dateStr] ?? [];
                const inMonth = isSameMonth(day, calMonth);
                const isSelected = calSelectedDate === dateStr;
                const todayFlag = isToday(day);
                const dayOfWeek = day.getDay();

                return (
                  <div
                    key={i}
                    onClick={() => {
                      setCalSelectedDate(isSelected ? null : dateStr);
                    }}
                    className={`min-h-[72px] p-1.5 border-b border-r border-gray-100 cursor-pointer transition
                      ${!inMonth ? "bg-gray-50" : "bg-white"}
                      ${isSelected ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : "hover:bg-gray-50"}
                    `}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full
                        ${!inMonth ? "text-gray-300" : todayFlag ? "bg-blue-600 text-white" : dayOfWeek === 0 ? "text-red-500" : dayOfWeek === 6 ? "text-blue-500" : "text-gray-700"}
                      `}>
                        {format(day, "d")}
                      </span>
                      {isAdmin && inMonth && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openCreate(dateStr); }}
                          className="text-gray-300 hover:text-blue-500 transition opacity-0 group-hover:opacity-100"
                          title="일정 추가"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        </button>
                      )}
                    </div>
                    {/* 이벤트 점 */}
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((s) => {
                        const cat = CATEGORIES[s.category] ?? CATEGORIES.general;
                        return (
                          <div key={s.id} className={`text-xs px-1 py-0.5 rounded truncate font-medium ${cat.color}`}>
                            {s.start_time ? `${s.start_time.slice(0,5)} ` : ""}{s.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-gray-400 px-1">+{dayEvents.length - 3}건</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 선택된 날짜의 일정 상세 */}
          {calSelectedDate && (
            <div className="mt-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-bold text-gray-800">{calSelectedDate}</span>
                <span className="text-xs text-gray-400">{format(parseISO(calSelectedDate), "EEEE", { locale: ko })}</span>
                {isAdmin && (
                  <button onClick={() => openCreate(calSelectedDate)} className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    이 날 일정 추가
                  </button>
                )}
              </div>
              {calSelectedItems.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">이 날 일정이 없습니다.</div>
              ) : (
                <div className="space-y-2">
                  {calSelectedItems.map((s) => {
                    const cat = CATEGORIES[s.category] ?? CATEGORIES.general;
                    return (
                      <div key={s.id} className={`bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-start gap-3 hover:shadow-sm transition ${isMember ? "cursor-pointer" : ""}`} onClick={() => isMember && openEdit(s)}>
                        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5 ${cat.color}`}>{cat.label}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900">{s.title}</div>
                          <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-3">
                            {(s.start_time || s.end_time) && <span>{s.start_time?.slice(0,5)} {s.end_time ? `~ ${s.end_time.slice(0,5)}` : ""}</span>}
                            {s.location && <span>📍 {s.location}</span>}
                            {s.responsible_name && <span>👤 {s.responsible_name}</span>}
                          </div>
                          {s.description && <p className="text-xs text-gray-500 mt-1">{s.description}</p>}
                        </div>
                        {isAdmin && (
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                            className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50 transition shrink-0">삭제</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 일정 등록/편집 모달 */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={selected ? "일정 수정" : "일정 추가"}
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "저장 중..." : "저장"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">날짜 *</label>
              <input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">구분</label>
              <Select
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
                options={Object.entries(CATEGORIES).map(([k, v]) => ({ value: k, label: v.label }))}
                className="w-full py-2 px-3 bg-white border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">시작 시간</label>
              <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">종료 시간</label>
              <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">제목 *</label>
            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">장소</label>
              <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">담당자</label>
              <input type="text" value={form.responsible_name} onChange={(e) => setForm({ ...form, responsible_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">내용</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          {isAdmin && selected && (
            <div className="pt-2 border-t border-gray-100">
              <button onClick={() => { setShowModal(false); handleDelete(selected.id); }} className="text-sm text-red-500 hover:text-red-700 transition">이 일정 삭제</button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
