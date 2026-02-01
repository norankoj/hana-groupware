// src/app/vacation/page.tsx
"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { format } from "date-fns";
import { useCurrentMenu } from "@/components/ClientLayout";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import { showConfirm } from "@/utils/alert";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";

// --- [공휴일 데이터 (2025~2026)] ---
const HOLIDAYS: Record<string, string> = {
  // 2025년
  "2025-01-01": "신정",
  "2025-01-28": "설날 연휴",
  "2025-01-29": "설날",
  "2025-01-30": "설날 연휴",
  "2025-03-01": "삼일절",
  "2025-03-03": "대체공휴일",
  "2025-05-05": "어린이날",
  "2025-05-06": "부처님오신날",
  "2025-06-06": "현충일",
  "2025-08-15": "광복절",
  "2025-10-03": "개천절",
  "2025-10-05": "추석 연휴",
  "2025-10-06": "추석",
  "2025-10-07": "추석 연휴",
  "2025-10-08": "대체공휴일",
  "2025-10-09": "한글날",
  "2025-12-25": "성탄절",
  // 2026년
  "2026-01-01": "신정",
  "2026-02-16": "대체공휴일",
  "2026-02-17": "설날",
  "2026-02-18": "설날 연휴",
  "2026-03-01": "삼일절",
  "2026-03-02": "대체공휴일",
  "2026-05-05": "어린이날",
  "2026-05-06": "대체공휴일",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "대체공휴일",
  "2026-06-06": "현충일",
  "2026-08-15": "광복절",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
  "2026-10-03": "개천절",
  "2026-10-09": "한글날",
  "2026-12-25": "성탄절",
};

// 연차 차감 대상
const DEDUCTIBLE_TYPES = ["연차", "오전반차", "오후반차"];

// 필터 옵션 정의
const STATUS_OPTIONS = [
  { value: "all", label: "전체 상태" },
  { value: "pending", label: "대기중" },
  { value: "approved", label: "승인됨" },
  { value: "rejected", label: "반려됨" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "전체 종류" },
  { value: "연차", label: "연차" },
  { value: "오전반차", label: "오전반차" },
  { value: "오후반차", label: "오후반차" },
  { value: "경조사", label: "경조사" },
  { value: "병가", label: "병가" },
];

type VacationRequest = {
  id: number;
  user_id: string;
  type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  approver_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  profiles: {
    full_name: string;
    team_id: number;
    position: string;
    used_leave_days: number;
  };
  approver?: { full_name: string };
};

type UserProfile = {
  id: string;
  full_name: string;
  role: string;
  position: string;
  is_approver: boolean;
  total_leave_days: number;
  used_leave_days: number;
};

// 로딩 스켈레톤
const Skeleton = ({ className }: { className: string }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`}></div>
);

// 버튼 스타일
const btnStyles = {
  save: "px-5 py-2.5 bg-[#2151EC] text-white font-medium rounded-lg hover:bg-[#1a43c9] transition text-sm shadow-md flex-1 sm:flex-none justify-center cursor-pointer",
  delete:
    "px-5 py-2.5 bg-[#EA5455] text-white font-medium rounded-lg hover:bg-[#d34647] transition text-sm shadow-md flex-1 sm:flex-none justify-center cursor-pointer",
  cancel:
    "px-5 py-2.5 bg-white border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition text-sm flex-1 sm:flex-none sm:min-w-[80px] justify-center cursor-pointer",
};

const InfoRow = ({
  label,
  value,
  isLast = false,
}: {
  label: string;
  value: React.ReactNode;
  isLast?: boolean;
}) => (
  <div
    className={`flex border-b border-gray-200 ${isLast ? "border-b-0" : ""}`}
  >
    <div className="w-32 bg-gray-50 p-3 text-sm font-bold text-gray-600 flex items-center justify-center border-r border-gray-200">
      {label}
    </div>
    <div className="flex-1 bg-white p-3 text-sm text-gray-800 flex items-center whitespace-pre-wrap">
      {value}
    </div>
  </div>
);

function VacationContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const menu = useCurrentMenu();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [myRequests, setMyRequests] = useState<VacationRequest[]>([]);
  const [approvalList, setApprovalList] = useState<VacationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // 탭 상태: calendar(내 일정), approve(결재함), history(히스토리)
  const [activeTab, setActiveTab] = useState<
    "calendar" | "approve" | "history"
  >("calendar");

  // 필터 상태
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [date, setDate] = useState<Date>(new Date());
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    type: "연차",
    start_date: "",
    end_date: "",
    reason: "",
  });

  const [selectedRequest, setSelectedRequest] =
    useState<VacationRequest | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejectMode, setIsRejectMode] = useState(false);

  // 히스토리 연도
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear());

  const fetchData = async () => {
    setLoading(true);
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return router.push("/login");

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authUser.id)
      .single();
    setUser(profile);

    // URL 파라미터로 탭 전환 (결재권자만)
    if (searchParams.get("tab") === "approve" && profile.is_approver) {
      setActiveTab("approve");
    }

    const { data: myData } = await supabase
      .from("vacation_requests")
      .select(
        "*, profiles:user_id(full_name, position), approver:approver_id(full_name)",
      )
      .eq("user_id", authUser.id)
      .neq("status", "cancelled")
      .order("start_date", { ascending: false });
    if (myData) setMyRequests(myData as any);

    if (profile.is_approver) {
      const { data: allData } = await supabase
        .from("vacation_requests")
        .select(
          "*, profiles:user_id(full_name, team_id, position, used_leave_days), approver:approver_id(full_name)",
        )
        .neq("status", "cancelled")
        .order("created_at", { ascending: false });

      if (allData) {
        const sortedData = (allData as any).sort((a: any, b: any) => {
          if (a.status === "pending" && b.status !== "pending") return -1;
          if (a.status !== "pending" && b.status === "pending") return 1;
          return 0;
        });
        setApprovalList(sortedData);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // FullCalendar용 이벤트 데이터 변환
  const calendarEvents = useMemo(() => {
    const events: any[] = [];

    // 1. 공휴일 추가
    Object.entries(HOLIDAYS).forEach(([date, title]) => {
      events.push({
        title: title,
        start: date,
        allDay: true,
        display: "background",
        backgroundColor: "#fef2f2", // 연한 빨강 배경
        classNames: ["holiday-event-text"], // CSS에서 빨간색 처리
      });
    });

    // 2. 내 연차 신청 내역 추가
    myRequests.forEach((req) => {
      if (req.status === "cancelled" || req.status === "rejected") return;

      const isApproved = req.status === "approved";
      const statusText = isApproved ? "" : "[대기] ";

      events.push({
        id: String(req.id),
        title: `${statusText}${req.type}`,
        start: req.start_date,
        // FullCalendar end 날짜 특성 대응 (+1일)
        end: format(
          new Date(new Date(req.end_date).getTime() + 86400000),
          "yyyy-MM-dd",
        ),
        allDay: true,
        backgroundColor: isApproved ? "#dcfce7" : "#fef9c3",
        textColor: isApproved ? "#15803d" : "#a16207",
        extendedProps: { ...req },
      });
    });

    return events;
  }, [myRequests]);

  // --- [필터링 로직] ---
  const filteredApprovals = useMemo(() => {
    return approvalList.filter((req) => {
      const matchesStatus =
        filterStatus === "all" || req.status === filterStatus;
      const matchesType = filterType === "all" || req.type === filterType;
      const matchesName = req.profiles.full_name.includes(searchTerm);
      return matchesStatus && matchesType && matchesName;
    });
  }, [approvalList, filterStatus, filterType, searchTerm]);

  // --- [기안 작성 로직] ---
  const handleRequestSubmit = async () => {
    if (!formData.start_date || !formData.end_date || !formData.reason)
      return toast.error("모든 항목을 입력해주세요.");

    const start = new Date(formData.start_date);
    const end = new Date(formData.end_date);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const daysCount =
      formData.type === "오전반차" || formData.type === "오후반차"
        ? 0.5
        : diffDays;

    // ★ [연차 차단]
    if (DEDUCTIBLE_TYPES.includes(formData.type) && user) {
      const remaining = user.total_leave_days - user.used_leave_days;
      if (daysCount > remaining) {
        toast.error(
          `잔여 연차가 부족합니다!\n(남은 연차: ${remaining}일 / 신청: ${daysCount}일)`,
          { duration: 4000 },
        );
        return;
      }
    }

    if (!(await showConfirm("휴가를 기안하시겠습니까?"))) return;

    const { error } = await supabase.from("vacation_requests").insert({
      user_id: user?.id,
      type: formData.type,
      start_date: formData.start_date,
      end_date: formData.end_date,
      days_count: daysCount,
      reason: formData.reason,
    });

    if (error) toast.error("신청 실패: " + error.message);
    else {
      toast.success("결재 상신 완료!");
      setIsRequestModalOpen(false);
      fetchData();
    }
  };

  // --- [결재 처리 로직] ---
  const handleProcess = async (isApproved: boolean) => {
    if (!selectedRequest) return;
    if (!isApproved && !rejectReason.trim())
      return toast.error("반려 사유를 입력해주세요.");

    const { data: checkData } = await supabase
      .from("vacation_requests")
      .select("status, approver:approver_id(full_name)")
      .eq("id", selectedRequest.id)
      .single();
    if (checkData && checkData.status !== "pending") {
      toast.error("이미 처리된 문서입니다.");
      setIsDetailModalOpen(false);
      fetchData();
      return;
    }

    if (
      !(await showConfirm(
        isApproved ? "승인하시겠습니까?" : "반려하시겠습니까?",
      ))
    )
      return;

    const { error } = await supabase
      .from("vacation_requests")
      .update({
        status: isApproved ? "approved" : "rejected",
        approver_id: user?.id,
        rejection_reason: isApproved ? null : rejectReason,
      })
      .eq("id", selectedRequest.id);

    if (error) return toast.error("오류 발생: " + error.message);

    if (isApproved && DEDUCTIBLE_TYPES.includes(selectedRequest.type)) {
      const currentUsed = selectedRequest.profiles.used_leave_days || 0;
      await supabase
        .from("profiles")
        .update({ used_leave_days: currentUsed + selectedRequest.days_count })
        .eq("id", selectedRequest.user_id);
    }

    toast.success("처리되었습니다.");
    setIsDetailModalOpen(false);
    fetchData();
  };

  const handleCancel = async (req: VacationRequest) => {
    if (!(await showConfirm("정말 취소하시겠습니까?"))) return;
    try {
      if (req.status === "approved" && DEDUCTIBLE_TYPES.includes(req.type)) {
        const { data: myProfile } = await supabase
          .from("profiles")
          .select("used_leave_days")
          .eq("id", user?.id)
          .single();
        if (myProfile) {
          await supabase
            .from("profiles")
            .update({
              used_leave_days: myProfile.used_leave_days - req.days_count,
            })
            .eq("id", user?.id);
        }
      }
      await supabase
        .from("vacation_requests")
        .update({ status: "cancelled" })
        .eq("id", req.id);
      toast.success("취소되었습니다.");
      fetchData();
    } catch (e: any) {
      toast.error("취소 실패: " + e.message);
    }
  };

  const onDateClick = (value: Date) => {
    const dateStr = format(value, "yyyy-MM-dd");
    setFormData({
      ...formData,
      start_date: dateStr,
      end_date: dateStr,
      reason: "",
    });
    setIsRequestModalOpen(true);
  };

  const InfoRow = ({
    label,
    value,
    isLast,
  }: {
    label: string;
    value: React.ReactNode;
    isLast?: boolean;
  }) => (
    <div
      className={`flex border-b border-gray-200 ${isLast ? "border-b-0" : ""}`}
    >
      <div className="w-32 bg-gray-50 p-3 text-sm font-bold text-gray-600 flex items-center justify-center border-r border-gray-200">
        {label}
      </div>
      <div className="flex-1 bg-white p-3 text-sm text-gray-800 flex items-center whitespace-pre-wrap">
        {value}
      </div>{" "}
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col p-1">
      <style jsx global>{`
        .fc {
          font-family: "Pretendard Variable", Pretendard, sans-serif !important;
          --fc-border-color: transparent;
          font-size: 0.8rem; /* 전체적인 폰트 크기 축소 */
        }

        /* 헤더(타이틀 및 버튼) 크기 조절 */
        .fc .fc-toolbar-title {
          font-size: 1.1rem !important;
          font-weight: 700;
        }
        .fc .fc-button {
          padding: 4px 10px !important;
          font-size: 0.75rem !important;
        }

        /* 격자선 제거 */
        .fc-theme-standard td,
        .fc-theme-standard th,
        .fc-theme-standard .fc-scrollgrid {
          border: none !important;
        }

        /*  캘린더 내부 디자인: 숫자 중앙 정렬 및 진하게 */
        .fc .fc-daygrid-day-top {
          justify-content: center;
          padding-top: 10px;
        }

        /* 날짜 및 요일 스타일 */
        .fc .fc-col-header-cell-cushion {
          color: #6b7280;
          font-weight: 600;
          padding: 10px 0;
        }
        .fc .fc-daygrid-day-number {
          color: #1f2937 !important;
          padding: 8px !important;
          font-weight: 500;
        }

        .fc-daygrid-day:hover .fc-daygrid-day-number {
          color: #3b82f6 !important;
        }

        /* 토요일 파랑 / 일요일 빨강 */
        .fc-day-sat .fc-col-header-cell-cushion,
        .fc-day-sat .fc-daygrid-day-number {
          color: #2563eb !important;
        }
        .fc-day-sun .fc-col-header-cell-cushion,
        .fc-day-sun .fc-daygrid-day-number {
          color: #ef4444 !important;
        }

        /* 공휴일 텍스트 스타일 */
        .holiday-event-text {
          color: #ef4444 !important;
          font-style: normal !important;
          font-weight: 600;
          padding-left: 4px;
        }

        /* 마우스 인터랙션: 커서 및 하이라이트 */
        .fc-daygrid-day {
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .fc-daygrid-day:hover {
          background-color: #f0f9ff !important;
        } /* 연한 하늘색 하이라이트 */

        /* 오늘 날짜: 회색 배경 */
        .fc .fc-day-today {
          background-color: #f3f4f6 !important;
          border-radius: 4px;
        }

        .fc-event-title {
          font-weight: 600 !important;
          font-size: 0.75rem;
        }

        /* 이벤트 바 스타일 정리 */
        .fc-event {
          border: none !important;
          border-radius: 4px !important;
          padding: 1px 4px !important;
        }
      `}</style>
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          {menu?.name || "휴가/연차 관리"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          휴가 신청 및 승인 현황을 관리합니다.
        </p>
      </div>

      {/* 탭 메뉴 (무조건 렌더링되도록 수정) */}
      <div className="flex border-b border-gray-200 mb-6 w-full flex-shrink-0">
        {user?.is_approver && (
          <button
            onClick={() => setActiveTab("approve")}
            className={`pb-3 px-6 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeTab === "approve" ? "border-blue-600 text-blue-600 font-bold" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            결재함{" "}
            {approvalList.filter((r) => r.status === "pending").length > 0 && (
              <span className="ml-1 bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full text-xs font-bold">
                {approvalList.filter((r) => r.status === "pending").length}
              </span>
            )}
          </button>
        )}
        <button
          onClick={() => setActiveTab("calendar")}
          className={`pb-3 px-6 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeTab === "calendar" ? "border-blue-600 text-blue-600 font-bold" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          내 일정 관리
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`pb-3 px-6 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeTab === "history" ? "border-blue-600 text-blue-600 font-bold" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          내 연차 히스토리
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-96 md:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="flex-1 relative">
          {activeTab === "approve" && user?.is_approver && (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden flex flex-col h-[650px] animate-fadeIn">
              {/* 필터 검색바 (자연스러운 디자인) */}
              <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap gap-3 items-end">
                <div className="w-36">
                  <Select
                    value={filterStatus}
                    onChange={setFilterStatus}
                    options={STATUS_OPTIONS}
                  />
                </div>
                <div className="w-36">
                  <Select
                    value={filterType}
                    onChange={setFilterType}
                    options={TYPE_OPTIONS}
                  />
                </div>
                <div className="relative w-full sm:w-64 ml-auto">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="이름을 입력하세요"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full p-3 pl-10 bg-white border border-gray-300 rounded-lg outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-sm transition-all text-gray-900 placeholder-gray-400"
                    />
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                        기안자
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                        종류
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                        기간
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                        상태
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                        관리
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredApprovals.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-20 text-center text-gray-400"
                        >
                          조건에 맞는 문서가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredApprovals.map((req) => (
                        <tr
                          key={req.id}
                          className="hover:bg-blue-50/30 transition"
                        >
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-gray-900">
                              {req.profiles.full_name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {req.profiles.position}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                              {req.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {req.start_date} ~ {req.end_date}{" "}
                            <span className="text-xs text-gray-400">
                              ({req.days_count}일)
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2 py-1 rounded text-xs font-bold ${req.status === "approved" ? "bg-green-100 text-green-700" : req.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}
                            >
                              {req.status === "pending"
                                ? "대기중"
                                : req.status === "approved"
                                  ? "승인"
                                  : "반려"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => {
                                setSelectedRequest(req);
                                setIsDetailModalOpen(true);
                                setIsRejectMode(false);
                              }}
                              className="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded text-sm font-medium border border-blue-200 transition cursor-pointer"
                            >
                              {req.status === "pending"
                                ? "결재하기"
                                : "상세보기"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* 2. 내 일정 관리 (달력) 탭 */}
          {activeTab === "calendar" && (
            <div className="flex flex-col xl:flex-row gap-6 h-full animate-fadeIn">
              <div className="flex-1 bg-white p-6 rounded-xl shadow-md border border-gray-200 h-fit">
                <FullCalendar
                  plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
                  initialView="dayGridMonth"
                  locale="ko"
                  headerToolbar={{
                    left: "prev,next today",
                    center: "title",
                    right: "dayGridMonth,listMonth", // 이미지처럼 Month/List 기능 제공
                  }}
                  dayCellContent={(arg) => arg.dayNumberText.replace("일", "")}
                  buttonText={{
                    today: "오늘",
                    month: "달력",
                    list: "목록",
                  }}
                  events={calendarEvents}
                  dateClick={(info) => onDateClick(new Date(info.dateStr))}
                  eventClick={(info) => {
                    const req = info.event.extendedProps as VacationRequest;
                    if (req.id) {
                      setSelectedRequest(req);
                      setIsDetailModalOpen(true);
                    }
                  }}
                  height="650px"
                  fixedWeekCount={false}
                  dayMaxEvents={true}
                />
              </div>

              <div
                className="w-full xl:w-96 flex flex-col gap-6"
                style={{ height: "700px" }}
              >
                <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">
                    내 연차 현황 ({new Date().getFullYear()})
                  </h3>
                  <div className="flex items-end justify-between mb-2">
                    <span className="text-4xl font-extrabold text-blue-600">
                      {(user?.total_leave_days || 0) -
                        (user?.used_leave_days || 0)}
                    </span>
                    <span className="text-sm text-gray-400 mb-1 font-medium">
                      / {user?.total_leave_days}일
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-1000"
                      style={{
                        width: `${Math.min(((user?.used_leave_days || 0) / (user?.total_leave_days || 1)) * 100, 100)}%`,
                      }}
                    ></div>
                  </div>
                  <div className="mt-3 text-right text-xs text-gray-500 font-medium">
                    {user?.used_leave_days}일 사용함
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-md border border-gray-200 flex-1 overflow-hidden flex flex-col min-h-[300px]">
                  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 font-bold text-gray-700">
                    최근 신청 내역
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {myRequests.length === 0 ? (
                      <div className="text-center py-10 text-xs text-gray-400">
                        내역이 없습니다.
                      </div>
                    ) : (
                      myRequests.map((req) => (
                        <div
                          key={req.id}
                          onClick={() => {
                            setSelectedRequest(req);
                            setIsDetailModalOpen(true);
                            setIsRejectMode(false);
                          }}
                          className="bg-white border border-gray-100 p-3 rounded-lg hover:shadow-sm hover:border-blue-200 cursor-pointer transition group"
                        >
                          <div className="flex justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs font-medium px-2 py-0.5 rounded ${req.status === "approved" ? "bg-green-100 text-green-700" : req.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}
                              >
                                {req.status === "approved"
                                  ? "승인"
                                  : req.status === "rejected"
                                    ? "반려"
                                    : "대기"}
                              </span>
                              <div className="text-sm font-medium text-gray-800 mb-0.5">
                                [{req.type}] {req.days_count}일
                              </div>
                            </div>
                            {req.status !== "rejected" &&
                              req.status !== "cancelled" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCancel(req);
                                  }}
                                  className="mt-2 text-xs text-red-500 underline opacity-0 group-hover:opacity-100 transition"
                                >
                                  취소하기
                                </button>
                              )}
                          </div>

                          <div className="text-xs text-gray-500 mt-0.5">
                            {req.start_date} ~ {req.end_date}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. 내 연차 히스토리 탭 */}
          {activeTab === "history" && (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden max-w-4xl mx-auto animate-fadeIn">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h3 className="font-bold text-lg text-gray-800">
                  연도별 사용 내역
                </h3>
                <div className="flex items-center bg-white border border-gray-300 rounded-lg shadow-sm">
                  <button
                    onClick={() => setHistoryYear(historyYear - 1)}
                    className="px-3 py-1.5 hover:bg-gray-50 text-gray-600 border-r"
                  >
                    ◀
                  </button>
                  <span className="px-4 font-bold text-gray-800">
                    {historyYear}년
                  </span>
                  <button
                    onClick={() => setHistoryYear(historyYear + 1)}
                    className="px-3 py-1.5 hover:bg-gray-50 text-gray-600 border-l"
                  >
                    ▶
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 p-6 bg-blue-50/30 border-b border-gray-100">
                <div className="bg-white p-4 rounded-lg border border-gray-200 text-center shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">총 사용 일수</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {myRequests
                      .filter(
                        (r) =>
                          r.start_date.startsWith(String(historyYear)) &&
                          r.status === "approved" &&
                          DEDUCTIBLE_TYPES.includes(r.type),
                      )
                      .reduce((acc, cur) => acc + cur.days_count, 0)}
                    일
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200 text-center shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">승인 건수</div>
                  <div className="text-2xl font-bold text-green-600">
                    {
                      myRequests.filter(
                        (r) =>
                          r.start_date.startsWith(String(historyYear)) &&
                          r.status === "approved",
                      ).length
                    }
                    건
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200 text-center shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">반려 건수</div>
                  <div className="text-2xl font-bold text-red-500">
                    {
                      myRequests.filter(
                        (r) =>
                          r.start_date.startsWith(String(historyYear)) &&
                          r.status === "rejected",
                      ).length
                    }
                    건
                  </div>
                </div>
              </div>
              <div className="overflow-y-auto max-h-[500px]">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500">
                        날짜
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500">
                        종류
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500">
                        사유
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500">
                        상태
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {myRequests.filter((r) =>
                      r.start_date.startsWith(String(historyYear)),
                    ).length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="py-10 text-center text-gray-400"
                        >
                          기록이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      myRequests
                        .filter((r) =>
                          r.start_date.startsWith(String(historyYear)),
                        )
                        .map((req) => (
                          <tr key={req.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {req.start_date} ~ {req.end_date}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-gray-800">
                              {req.type} ({req.days_count}일)
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                              {req.reason}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`px-2 py-1 rounded text-xs font-bold ${req.status === "approved" ? "bg-green-100 text-green-700" : req.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}
                              >
                                {req.status === "pending"
                                  ? "대기"
                                  : req.status === "approved"
                                    ? "승인"
                                    : "반려"}
                              </span>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 모달들 (상세/작성) */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={
          selectedRequest?.status === "pending" ? "결재 처리" : "상세 내용"
        }
        footer={
          selectedRequest?.status === "pending" &&
          user?.is_approver &&
          selectedRequest.user_id !== user.id ? (
            !isRejectMode ? (
              <>
                <button
                  onClick={() => handleProcess(true)}
                  className={btnStyles.save}
                >
                  승인
                </button>
                <button
                  onClick={() => setIsRejectMode(true)}
                  className={btnStyles.delete}
                >
                  반려
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleProcess(false)}
                  className={btnStyles.delete}
                >
                  반려 확정
                </button>
                <button
                  onClick={() => {
                    setIsRejectMode(false);
                    setRejectReason("");
                  }}
                  className={btnStyles.cancel}
                >
                  취소
                </button>
              </>
            )
          ) : (
            <button
              onClick={() => setIsDetailModalOpen(false)}
              className={btnStyles.cancel}
            >
              닫기
            </button>
          )
        }
      >
        {selectedRequest && (
          <div className="space-y-4">
            <div className="border border-gray-200 overflow-hidden">
              <InfoRow
                label="기안자"
                value={`${selectedRequest.profiles.full_name} (${selectedRequest.profiles.position})`}
              />
              <InfoRow label="휴가 구분" value={selectedRequest.type} />
              <InfoRow
                label="기간"
                value={`${selectedRequest.start_date} ~ ${selectedRequest.end_date}`}
              />
              <InfoRow
                label="사용 일수"
                value={`${selectedRequest.days_count}일`}
              />
              <InfoRow
                label="신청 사유"
                value={selectedRequest.reason}
                isLast={selectedRequest.status === "pending" && !isRejectMode}
              />
            </div>

            {selectedRequest.status !== "pending" && (
              <div className="border border-gray-200 overflow-hidden">
                <InfoRow
                  label="결재 상태"
                  value={
                    <span
                      className={`font-bold ${selectedRequest.status === "approved" ? "text-green-600" : "text-red-600"}`}
                    >
                      {selectedRequest.status === "approved" ? "승인" : "반려"}
                    </span>
                  }
                />

                <InfoRow
                  label="결재자"
                  value={selectedRequest.approver?.full_name || "-"}
                  isLast={selectedRequest.status === "approved"}
                />
                {selectedRequest.status === "rejected" && (
                  <InfoRow
                    label="반려 사유"
                    value={selectedRequest.rejection_reason}
                    isLast={true}
                  />
                )}
              </div>
            )}

            {isRejectMode && (
              <div className="mt-4 animate-fadeIn">
                <label className="block text-sm font-medium text-red-600 mb-2">
                  반려 사유 입력
                </label>
                <textarea
                  className="w-full p-3 border border-red-200 rounded-md outline-none focus:ring-1 focus:ring-red-400 bg-red-50/50 text-sm font-normal text-gray-800 resize-none"
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

      <Modal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        title="휴가 기안 작성"
        footer={
          <>
            <button onClick={handleRequestSubmit} className={btnStyles.save}>
              상신하기
            </button>
            <button
              onClick={() => setIsRequestModalOpen(false)}
              className={btnStyles.cancel}
            >
              취소
            </button>
          </>
        }
      >
        <div className="space-y-4" style={{ height: 300 }}>
          <div>
            <Select
              label="휴가 구분"
              value={formData.type}
              onChange={(val) => {
                const isHalf = ["오전반차", "오후반차"].includes(val);
                setFormData({
                  ...formData,
                  type: val,
                  end_date: isHalf ? formData.start_date : formData.end_date,
                });
              }}
              options={[
                "연차",
                "오전반차",
                "오후반차",
                "경조사",
                "병가",
                "대체휴가",
                "특별휴가",
              ]}
            />
            {!DEDUCTIBLE_TYPES.includes(formData.type) && (
              <p className="text-xs text-blue-600 mt-1">
                * {formData.type}는 연차가 차감되지 않습니다.
              </p>
            )}
          </div>

          {["오전반차", "오후반차"].includes(formData.type) ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                날짜 (반차)
              </label>
              <input
                type="date"
                required
                className="w-full p-2.5 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 text-sm font-normal"
                value={formData.start_date}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    start_date: e.target.value,
                    end_date: e.target.value,
                  })
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                  시작일
                </label>
                <input
                  type="date"
                  required
                  className="w-full p-2.5 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 text-sm font-normal"
                  value={formData.start_date}
                  onChange={(e) =>
                    setFormData({ ...formData, start_date: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                  종료일
                </label>
                <input
                  type="date"
                  required
                  className="w-full p-2.5 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 text-sm font-normal"
                  value={formData.end_date}
                  onChange={(e) =>
                    setFormData({ ...formData, end_date: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
              사유
            </label>
            <textarea
              required
              rows={5}
              className="w-full p-2.5 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm font-normal"
              placeholder="사유 입력"
              value={formData.reason}
              onChange={(e) =>
                setFormData({ ...formData, reason: e.target.value })
              }
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function VacationPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">로딩 중...</div>}>
      <VacationContent />
    </Suspense>
  );
}
