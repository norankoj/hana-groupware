"use client";

import { useState, useMemo, useEffect, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/utils/supabase/client";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "@/styles/calendar.css";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import { showConfirm } from "@/utils/alert";
import { format, parseISO } from "date-fns";
import { HOLIDAYS } from "@/constants/holidays";
import {
  VacationRequest,
  UserProfile,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  DEDUCTIBLE_TYPES,
  btnStyles,
  calculateChurchVacationDays,
  VACATION_STATUS,
} from "./shared";
import { center, empty, sub, table, tdWide, thWide, thead, trHover } from "@/components/ui/table";
import { DetailRow, DetailTable } from "@/components/ui/DetailTable";

type StaffProfile = { id: string; full_name: string; position: string };

/* ── 대리 입력 모달 (별도 memo 컴포넌트 — 타이핑 시 부모 리렌더 차단) ── */
const ProxyModal = memo(function ProxyModal({
  isOpen,
  onClose,
  user,
  staffList,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  staffList: StaffProfile[];
  onSuccess: () => void;
}) {
  const staffInputRef = useRef<HTMLDivElement>(null);
  const calendarBtnRef = useRef<HTMLButtonElement>(null);

  const [proxySearch, setProxySearch] = useState("");
  const [showStaffList, setShowStaffList] = useState(false);
  const [showProxyCalendar, setShowProxyCalendar] = useState(false);
  const [calendarPos, setCalendarPos] = useState({ top: 0, left: 0, width: 320 });
  const [proxySaving, setProxySaving] = useState(false);
  const [proxyForm, setProxyForm] = useState({
    userId: "", userName: "", type: "연차",
    startDate: "", endDate: "", daysCount: 0, reason: "",
  });

  /* 모달 닫힐 때 상태 초기화 */
  useEffect(() => {
    if (!isOpen) {
      setProxyForm({ userId: "", userName: "", type: "연차", startDate: "", endDate: "", daysCount: 0, reason: "" });
      setProxySearch("");
      setShowStaffList(false);
      setShowProxyCalendar(false);
    }
  }, [isOpen]);

  /* 일수 자동계산 */
  useEffect(() => {
    if (proxyForm.startDate && proxyForm.endDate) {
      const days = calculateChurchVacationDays(proxyForm.startDate, proxyForm.endDate, proxyForm.type);
      setProxyForm((f) => ({ ...f, daysCount: days }));
    }
  }, [proxyForm.startDate, proxyForm.endDate, proxyForm.type]);

  const filteredStaff = useMemo(
    () => staffList.filter((s) => s.full_name.includes(proxySearch) || s.position.includes(proxySearch)),
    [staffList, proxySearch],
  );

  const openProxyCalendar = () => {
    if (!calendarBtnRef.current) return;
    const r = calendarBtnRef.current.getBoundingClientRect();
    const calH = 320;
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow >= calH ? r.bottom + 6 : Math.max(r.top - calH - 6, 8);
    setCalendarPos({
      top,
      left: Math.min(r.left, window.innerWidth - Math.max(r.width, 320) - 8),
      width: Math.max(r.width, 320),
    });
    setShowProxyCalendar(true);
  };

  const handleProxyRangeChange = (value: any) => {
    const isHalf = ["오전반차", "오후반차"].includes(proxyForm.type);
    if (isHalf || !Array.isArray(value)) {
      const d = format(Array.isArray(value) ? value[0] : value, "yyyy-MM-dd");
      setProxyForm((f) => ({ ...f, startDate: d, endDate: d }));
    } else {
      setProxyForm((f) => ({
        ...f,
        startDate: format(value[0], "yyyy-MM-dd"),
        endDate: format(value[1], "yyyy-MM-dd"),
      }));
    }
    setShowProxyCalendar(false);
  };

  const handleProxySubmit = async () => {
    if (!proxyForm.userId) return toast.error("직원을 선택해주세요.");
    if (!proxyForm.startDate || !proxyForm.endDate) return toast.error("날짜를 선택해주세요.");
    if (proxyForm.daysCount <= 0) return toast.error("사용 일수가 0입니다. 날짜를 확인해주세요.");
    if (!proxyForm.reason.trim()) return toast.error("사유를 입력해주세요.");
    if (!(await showConfirm("대리 입력 후 즉시 승인 처리됩니다.\n계속하시겠습니까?"))) return;

    setProxySaving(true);
    try {
      const res = await fetch("/api/vacation/proxy-insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: proxyForm.userId,
          type: proxyForm.type,
          startDate: proxyForm.startDate,
          endDate: proxyForm.endDate,
          daysCount: proxyForm.daysCount,
          reason: proxyForm.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "서버 오류");

      toast.success("대리 입력 및 승인이 완료되었습니다.");
      onClose();
      onSuccess();
    } catch (e: any) {
      toast.error("오류 발생: " + e.message);
    } finally {
      setProxySaving(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="연차 대리 입력"
        className="min-h-[580px]"
        footer={
          <div className="flex gap-2 w-full justify-end">
            <button onClick={onClose} className={btnStyles.cancel}>취소</button>
            <button onClick={handleProxySubmit} disabled={proxySaving} className={btnStyles.save}>
              {proxySaving ? "처리 중..." : "승인 완료로 저장"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted bg-primary-wash border border-primary-soft rounded-lg px-4 py-2.5">
            결재권자가 직원 대신 입력하며 <span className="font-bold text-primary">즉시 승인</span> 처리됩니다.
          </p>

          {/* 직원 검색 콤보박스 */}
          <div ref={staffInputRef} className="relative">
            <label className="block text-xs font-medium text-muted uppercase mb-1">선택 <span className="text-red-500">*</span></label>
            {proxyForm.userId ? (
              <div className="flex items-center gap-2 p-2.5 border border-primary rounded-md bg-primary-wash">
                <div className="w-6 h-6 rounded-full bg-primary-soft text-primary-active flex items-center justify-center text-xs font-bold shrink-0">
                  {proxyForm.userName.slice(0, 1)}
                </div>
                <span className="text-sm font-bold text-gray-800 flex-1">{proxyForm.userName}</span>
                <button
                  onClick={() => { setProxyForm((f) => ({ ...f, userId: "", userName: "" })); setProxySearch(""); }}
                  className="text-gray-400 hover:text-red-500 transition"
                >
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="이름으로 검색..."
                  value={proxySearch}
                  onChange={(e) => { setProxySearch(e.target.value); setShowStaffList(true); }}
                  onFocus={() => setShowStaffList(true)}
                  onBlur={() => setTimeout(() => setShowStaffList(false), 150)}
                  className="w-full p-2.5 pl-9 border border-line-strong rounded-md text-sm outline-none focus:ring-2 focus:ring-primary-soft focus:border-primary transition bg-white"
                />
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {showStaffList && filteredStaff.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-line rounded-lg shadow-lg z-50 max-h-44 overflow-y-auto">
                    {filteredStaff.map((s) => (
                      <button
                        key={s.id}
                        onMouseDown={() => {
                          setProxyForm((f) => ({ ...f, userId: s.id, userName: s.full_name }));
                          setProxySearch("");
                          setShowStaffList(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-primary-wash text-left transition"
                      >
                        <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">
                          {s.full_name.slice(0, 1)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-800">{s.full_name}</div>
                          <div className="text-xs text-gray-400">{s.position}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 휴가 종류 */}
          <Select
            label="종류"
            value={proxyForm.type}
            onChange={(v) => {
              const isHalf = ["오전반차", "오후반차"].includes(v);
              setProxyForm((f) => ({ ...f, type: v, endDate: isHalf ? f.startDate : f.endDate }));
            }}
            options={["연차", "오전반차", "오후반차", "경조사", "병가", "예비군", "특별휴가", "비전트립 A", "비전트립 B"]}
          />

          {/* 종류별 차감 안내 */}
          {(() => {
            const deductionInfo: Record<string, { color: string; text: string }> = {
              연차:     { color: "bg-red-50 text-red-600 border-red-100",     text: "연차 1일/일 차감" },
              오전반차: { color: "bg-red-50 text-red-600 border-red-100",     text: "연차 0.5일 차감" },
              오후반차: { color: "bg-red-50 text-red-600 border-red-100",     text: "연차 0.5일 차감" },
              "비전트립 A":{ color: "bg-green-50 text-green-700 border-green-100", text: "연차 차감 없음" },
              "비전트립 B":{ color: "bg-orange-50 text-orange-600 border-orange-100", text: "연차 0.5일/일 차감" },
              경조사:   { color: "bg-green-50 text-green-700 border-green-100", text: "연차 차감 없음" },
              병가:     { color: "bg-green-50 text-green-700 border-green-100", text: "연차 차감 없음" },
              예비군:   { color: "bg-green-50 text-green-700 border-green-100", text: "연차 차감 없음" },
              특별휴가: { color: "bg-green-50 text-green-700 border-green-100", text: "연차 차감 없음" },
            };
            const info = deductionInfo[proxyForm.type];
            if (!info) return null;
            return (
              <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium ${info.color}`}>
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {info.text}
              </div>
            );
          })()}

          {/* 날짜 선택 버튼 */}
          <div className="relative">
            <label className="block text-xs font-medium text-muted uppercase mb-1">
              {["오전반차", "오후반차"].includes(proxyForm.type) ? "날짜 선택" : "기간 선택"}
            </label>
            <button
              ref={calendarBtnRef}
              onClick={openProxyCalendar}
              className="w-full flex items-center justify-between p-2.5 border border-line-strong rounded-md text-sm text-left hover:border-primary focus:ring-2 focus:ring-primary-soft transition bg-white"
            >
              <span className={proxyForm.startDate ? "text-heading font-medium" : "text-gray-400"}>
                {proxyForm.startDate
                  ? (["오전반차", "오후반차"].includes(proxyForm.type) || proxyForm.startDate === proxyForm.endDate
                    ? proxyForm.startDate
                    : `${proxyForm.startDate} ~ ${proxyForm.endDate}`)
                  : "날짜를 선택하세요"}
              </span>
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          </div>

          {/* 자동계산 일수 표시 */}
          {proxyForm.daysCount > 0 && (
            <div className="bg-primary-wash text-primary-active text-sm px-3 py-2 rounded font-bold text-right">
              {proxyForm.type === "비전트립 B"
                ? `총 ${proxyForm.daysCount}일 차감 (0.5일/일 × 근무일수)`
                : DEDUCTIBLE_TYPES.includes(proxyForm.type)
                  ? `총 ${proxyForm.daysCount}일 사용 (토/월요일 제외됨)`
                  : `총 ${proxyForm.daysCount}일 (연차 차감 없음)`}
            </div>
          )}

          {/* 사유 */}
          <div>
            <label className="block text-xs font-medium text-muted uppercase mb-1">사유 <span className="text-red-500">*</span></label>
            <textarea
              rows={3}
              placeholder="사유 입력"
              value={proxyForm.reason}
              onChange={(e) => setProxyForm((f) => ({ ...f, reason: e.target.value }))}
              className="w-full p-2.5 border border-line-strong rounded-md outline-none focus:ring-2 focus:ring-primary resize-none text-sm font-normal"
            />
          </div>
        </div>
      </Modal>

      {/* 달력 팝업 포탈 */}
      {showProxyCalendar && typeof window !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[10000]" onClick={() => setShowProxyCalendar(false)} />
          <div
            className="fixed z-[10001] bg-white border border-line rounded-xl shadow-2xl p-3 range-calendar-wrapper animate-fadeIn"
            style={{ top: calendarPos.top, left: calendarPos.left, width: calendarPos.width, maxWidth: "90vw" }}
          >
            <Calendar
              onChange={handleProxyRangeChange}
              selectRange={!["오전반차", "오후반차"].includes(proxyForm.type)}
              value={
                proxyForm.startDate && proxyForm.endDate
                  ? [new Date(proxyForm.startDate), new Date(proxyForm.endDate)]
                  : null
              }
              formatDay={(_, date) => format(date, "d")}
              calendarType="gregory"
              locale="ko-KR"
              tileClassName={({ date, view }) => {
                if (view !== "month") return null;
                const d = format(date, "yyyy-MM-dd");
                return HOLIDAYS[d] ? "holiday-day" : null;
              }}
              tileDisabled={({ date, view }) => {
                if (view !== "month") return false;
                const d = format(date, "yyyy-MM-dd");
                return !!HOLIDAYS[d] || date.getDay() === 1 || date.getDay() === 6;
              }}
            />
          </div>
        </>,
        document.body,
      )}
    </>
  );
});



export default function VacationApprove({
  user,
  approvalList,
  onRefresh,
}: {
  user: UserProfile;
  approvalList: VacationRequest[];
  onRefresh: () => void;
}) {
  const supabase = createClient();

  /* ── 필터 ─────────────────────────────────────── */
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  /* ── 결재 상세 모달 ───────────────────────────── */
  const [selectedRequest, setSelectedRequest] = useState<VacationRequest | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejectMode, setIsRejectMode] = useState(false);

  /* ── 대리 입력 ────────────────────────────────── */
  const [isProxyOpen, setIsProxyOpen] = useState(false);
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);

  /* 직원 목록 로드 */
  useEffect(() => {
    if (!user?.is_approver) return;
    supabase
      .from("profiles")
      .select("id, full_name, position")
      .neq("id", user.id)
      .order("full_name")
      .then(({ data }) => { if (data) setStaffList(data); });
  }, [user?.id]);

  /* ── 결재 처리 ────────────────────────────────── */
  const filteredApprovals = useMemo(() => {
    return approvalList.filter((req) => {
      const matchesStatus = filterStatus === "all" || req.status === filterStatus;
      const matchesType = filterType === "all" || req.type === filterType;
      const matchesName = req.profiles.full_name.includes(searchTerm);
      return matchesStatus && matchesType && matchesName;
    });
  }, [approvalList, filterStatus, filterType, searchTerm]);

  const handleProcess = async (isApproved: boolean) => {
    if (!selectedRequest) return;
    if (!isApproved && !rejectReason.trim()) return toast.error("반려 사유를 입력해주세요.");
    if (!(await showConfirm(isApproved ? "승인하시겠습니까?" : "반려하시겠습니까?"))) return;

    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("vacation_requests")
      .update({
        status: isApproved ? "approved" : "rejected",
        approver_id: user?.id,
        rejection_reason: isApproved ? null : rejectReason,
        approved_at: isApproved ? now : null,
        rejected_at: isApproved ? null : now,
      })
      .eq("id", selectedRequest.id)
      .eq("status", "pending")
      .select()
      .single();

    if (!updated) { toast.error("이미 처리된 문서입니다."); setIsDetailModalOpen(false); onRefresh(); return; }
    if (error) return toast.error("오류 발생: " + error.message);

    if (isApproved && DEDUCTIBLE_TYPES.includes(selectedRequest.type)) {
      await supabase.rpc("increment_used_leave_days", { target_user_id: selectedRequest.user_id, days: selectedRequest.days_count });
    }
    // 신청자에게 푸시 알림
    fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userIds: [selectedRequest.user_id],
        title: isApproved ? "휴가 승인" : "휴가 반려",
        body: isApproved
          ? `${selectedRequest.type} 신청이 승인되었습니다.`
          : `${selectedRequest.type} 신청이 반려되었습니다. 사유: ${rejectReason}`,
        url: "/vacation",
      }),
    }).catch(() => {});
    toast.success("처리되었습니다.");
    setIsDetailModalOpen(false);
    onRefresh();
  };

  const handleCancel = async () => {
    if (!selectedRequest) return;
    if (!(await showConfirm("승인을 취소하시겠습니까?\n사용 일수가 다시 차감 해제됩니다."))) return;
    const { error } = await supabase
      .from("vacation_requests")
      .update({ status: "cancelled", approver_id: null, approved_at: null })
      .eq("id", selectedRequest.id)
      .eq("status", "approved");
    if (error) return toast.error("오류 발생: " + error.message);
    if (DEDUCTIBLE_TYPES.includes(selectedRequest.type)) {
      await supabase.rpc("increment_used_leave_days", { target_user_id: selectedRequest.user_id, days: -selectedRequest.days_count });
    }
    toast.success("승인이 취소되었습니다.");
    setIsDetailModalOpen(false);
    onRefresh();
  };

  /* ── 렌더 ─────────────────────────────────────── */
  return (
    <>
      <div className="bg-white rounded-xl shadow-md border border-line overflow-hidden flex flex-col h-[500px] sm:h-[650px] animate-fadeIn">

        {/* 필터 영역 */}
        <div className="p-4 border-b border-line-soft bg-table-header flex flex-wrap gap-2 items-center">
          {/* 왼쪽: 상태 + 종류 필터 */}
          <div className="w-36">
            <Select
              className="w-full h-[42px] px-3 py-2 text-sm bg-white border border-line-strong rounded-lg"
              value={filterStatus}
              onChange={setFilterStatus}
              options={STATUS_OPTIONS}
            />
          </div>
          <div className="w-36">
            <Select
              className="w-full h-[42px] px-3 py-2 text-sm bg-white border border-line-strong rounded-lg"
              value={filterType}
              onChange={setFilterType}
              options={TYPE_OPTIONS}
            />
          </div>

          {/* 오른쪽: 검색 + 대리 입력 */}
          <div className="flex gap-2 ml-auto items-center">
            <div className="relative">
              <input
                type="text"
                placeholder="이름 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-44 sm:w-56 h-[40px] pl-9 pr-3 bg-white border border-line-strong rounded-lg outline-none focus:border-primary text-sm"
              />
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <button
              onClick={() => setIsProxyOpen(true)}
              className="h-[40px] px-4 bg-primary hover:bg-primary-active text-white text-sm font-bold rounded-lg transition whitespace-nowrap shadow-sm"
            >
              + 대리 입력
            </button>
          </div>
        </div>

        {/* 리스트 영역 */}
        <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar bg-table-header sm:bg-white p-4 sm:p-0">
          {/* 모바일 */}
          <div className="block sm:hidden space-y-3">
            {filteredApprovals.length === 0 ? (
              <div className={empty}>조건에 맞는 문서가 없습니다.</div>
            ) : filteredApprovals.map((req) => (
              <div key={req.id} className="bg-white border border-line rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-start mb-3 border-b border-gray-50 pb-3">
                  <div>
                    <div className="text-base font-bold text-heading">{req.profiles.full_name}</div>
                    <div className="text-xs text-muted">{req.profiles.position}</div>
                  </div>
                  <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-bold ${(VACATION_STATUS[req.status] ?? VACATION_STATUS.pending).className}`}>
                    {(VACATION_STATUS[req.status] ?? VACATION_STATUS.pending).label}
                  </span>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-8">종류</span>
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-secondary-soft text-dark border border-secondary/30">{req.type}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-400 w-8 mt-0.5">기간</span>
                    <div className="text-sm text-gray-700">{req.start_date} ~ {req.end_date}<span className="text-xs text-gray-400 ml-1">({req.days_count}일)</span></div>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedRequest(req); setIsDetailModalOpen(true); setIsRejectMode(false); }}
                  className="w-full text-primary bg-primary-wash py-2.5 rounded-lg text-sm font-bold border border-primary-soft hover:bg-primary-soft transition active:scale-[0.98]"
                >
                  {req.status === "pending" ? "결재하기" : "상세보기"}
                </button>
              </div>
            ))}
          </div>

          {/* PC 테이블 */}
          <div className="hidden sm:block h-full">
            <table className={`min-w-full ${table}`}>
              <thead className={thead}>
                <tr>
                  {/* 글자는 왼쪽, 상태·관리는 가운데 */}
                  {(
                    [
                      ["기안자", ""],
                      ["종류", ""],
                      ["기간", ""],
                      ["상태", center],
                      ["결재자", ""],
                      ["관리", center],
                    ] as const
                  ).map(([h, align]) => (
                    <th key={h} scope="col" className={`${thWide} ${align}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white">
                {filteredApprovals.length === 0 ? (
                  <tr><td colSpan={6} className={empty}>조건에 맞는 문서가 없습니다.</td></tr>
                ) : filteredApprovals.map((req) => (
                  <tr
                    key={req.id}
                    // 줄 어디를 눌러도 결재 화면이 열린다
                    onClick={() => { setSelectedRequest(req); setIsDetailModalOpen(true); setIsRejectMode(false); }}
                    className={`${trHover} cursor-pointer`}
                  >
                    <td className={tdWide}>
                      <div className="font-bold">{req.profiles.full_name}</div>
                      <div className={sub}>{req.profiles.position}</div>
                    </td>
                    <td className={tdWide}>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-secondary-soft text-dark border border-secondary/30">{req.type}</span>
                    </td>
                    <td className={`${tdWide} whitespace-nowrap`}>
                      <span className="font-mono text-[13px] tabular-nums">{req.start_date} ~ {req.end_date}</span>
                      <span className={`${sub} ml-1`}>({req.days_count}일)</span>
                    </td>
                    <td className={`${tdWide} ${center}`}>
                      <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-bold ${(VACATION_STATUS[req.status] ?? VACATION_STATUS.pending).className}`}>
                        {(VACATION_STATUS[req.status] ?? VACATION_STATUS.pending).label}
                      </span>
                    </td>
                    <td className={`${tdWide} text-muted`}>{req.approver?.full_name || "-"}</td>
                    <td className={`${tdWide} ${center}`}>
                      {/* 대기중은 할 일이라 채운 버튼, 나머지는 보기만 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedRequest(req); setIsDetailModalOpen(true); setIsRejectMode(false); }}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                          req.status === "pending"
                            ? "bg-primary text-white hover:bg-primary-active"
                            : "border border-line-strong bg-white text-dark hover:bg-secondary-soft"
                        }`}
                      >
                        {req.status === "pending" ? "결재하기" : "상세보기"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── 대리 입력 모달 ─────────────────────────── */}
      <ProxyModal
        isOpen={isProxyOpen}
        onClose={() => setIsProxyOpen(false)}
        user={user}
        staffList={staffList}
        onSuccess={onRefresh}
      />

      {/* ── 결재 상세 모달 ─────────────────────────── */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={selectedRequest?.status === "pending" ? "결재 처리" : "상세 내용"}
        footer={
          <div className="flex gap-2 w-full">
            {selectedRequest?.status === "pending" && user?.is_approver && selectedRequest.user_id !== user.id ? (
              !isRejectMode ? (
                <>
                  <button onClick={() => setIsRejectMode(true)} className={`${btnStyles.dangerSoft} sm:mr-auto`}>반려</button>
                  <button onClick={() => setIsDetailModalOpen(false)} className={btnStyles.cancel}>닫기</button>
                  <button onClick={() => handleProcess(true)} className={btnStyles.save}>승인</button>
                </>
              ) : (
                <>
                  <button onClick={() => { setIsRejectMode(false); setRejectReason(""); }} className={`${btnStyles.cancel} sm:ml-auto`}>취소</button>
                  <button onClick={() => handleProcess(false)} className={btnStyles.delete}>반려 확정</button>
                </>
              )
            ) : selectedRequest?.status === "approved" && user?.is_approver ? (
              <>
                <button onClick={handleCancel} className={`${btnStyles.dangerSoft} sm:mr-auto`}>승인 취소</button>
                <button onClick={() => setIsDetailModalOpen(false)} className={btnStyles.cancel}>닫기</button>
              </>
            ) : (
              <button onClick={() => setIsDetailModalOpen(false)} className={`${btnStyles.cancel} sm:ml-auto`}>닫기</button>
            )}
          </div>
        }
      >
        {selectedRequest && (
          <div className="space-y-6">
            <div className={`flex flex-col items-center justify-center p-5 rounded-xl border ${selectedRequest.status === "approved" ? "bg-success-soft border-success/30 text-success-active" : selectedRequest.status === "rejected" ? "bg-danger-soft border-danger/30 text-danger-active" : "bg-warning-soft border-warning/30 text-warning-active"}`}>
              <h3 className="text-xl font-bold">
                {selectedRequest.status === "approved" ? "승인되었습니다" : selectedRequest.status === "rejected" ? "반려되었습니다" : "결재 대기중입니다"}
              </h3>
              <div className="mt-3 flex flex-col items-center gap-1 text-sm opacity-80">
                {selectedRequest.status === "approved" && selectedRequest.approved_at ? (
                  <span className="font-medium font-mono">승인일: {format(parseISO(selectedRequest.approved_at), "yyyy-MM-dd HH:mm")}</span>
                ) : selectedRequest.status === "rejected" && selectedRequest.rejected_at ? (
                  <span className="font-medium font-mono">반려일: {format(parseISO(selectedRequest.rejected_at), "yyyy-MM-dd HH:mm")}</span>
                ) : (
                  <span className="font-medium font-mono">신청일: {selectedRequest.created_at ? format(parseISO(selectedRequest.created_at), "yyyy-MM-dd HH:mm") : "-"}</span>
                )}
              </div>
            </div>

            {/* 공용 상세 표 — 내 연차 상세 · 운행 상세와 같은 모양 (선 두 겹 없음) */}
            <DetailTable>
              <DetailRow label="기안자">
                <span className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary-soft text-primary flex items-center justify-center text-xs font-bold">
                    {selectedRequest.profiles.full_name.slice(0, 1)}
                  </span>
                  {selectedRequest.profiles.full_name}
                  <span className="text-muted text-xs">({selectedRequest.profiles.position})</span>
                </span>
              </DetailRow>
              {selectedRequest.status !== "pending" && (
                <DetailRow label="신청일">
                  <span className="font-mono">
                    {selectedRequest.created_at ? format(parseISO(selectedRequest.created_at), "yyyy-MM-dd HH:mm") : "-"}
                  </span>
                </DetailRow>
              )}
              <DetailRow label="휴가 구분">{selectedRequest.type}</DetailRow>
              <DetailRow label="기간">
                <span className="font-mono">{selectedRequest.start_date} ~ {selectedRequest.end_date}</span>
              </DetailRow>
              <DetailRow label="사용 일수">{selectedRequest.days_count}일</DetailRow>
              <DetailRow label="신청 사유" top>
                <span className="whitespace-pre-wrap">{selectedRequest.reason}</span>
              </DetailRow>
              {selectedRequest.status !== "pending" && (
                <DetailRow label="결재자">
                  {selectedRequest.approver ? (
                    <span className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-secondary-soft text-dark flex items-center justify-center text-xs font-bold">
                        {selectedRequest.approver.full_name.slice(0, 1)}
                      </span>
                      {selectedRequest.approver.full_name}
                    </span>
                  ) : "-"}
                </DetailRow>
              )}
              {selectedRequest.status === "rejected" && (
                <DetailRow label={<span className="text-danger-active">반려 사유</span>} top>
                  <span className="text-danger-active font-medium whitespace-pre-wrap">{selectedRequest.rejection_reason}</span>
                </DetailRow>
              )}
            </DetailTable>

            {isRejectMode && (
              <div className="mt-4 animate-fadeIn">
                <label className="block text-sm font-bold text-danger-active mb-1.5">반려 사유 입력</label>
                <textarea
                  className="w-full px-3.5 py-2.5 border border-danger/40 rounded-lg outline-none focus:border-danger focus:ring-2 focus:ring-danger-soft bg-white text-sm text-heading placeholder:text-muted resize-none"
                  rows={3}
                  placeholder="반려 사유를 입력하세요."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  autoFocus
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
