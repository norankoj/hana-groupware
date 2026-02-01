// src/app/vacation/page.tsx
"use client";

import { useEffect, useState, Suspense, useMemo, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "@/styles/calendar.css";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
} from "date-fns";
import { useCurrentMenu } from "@/components/ClientLayout";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import { showConfirm } from "@/utils/alert";

import { HOLIDAYS } from "@/constants/holidays";

const DEDUCTIBLE_TYPES = ["연차", "오전반차", "오후반차"];

// 필터 옵션
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
  { value: "특별휴가", label: "특별휴가" },
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

const Skeleton = ({ className }: { className: string }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`}></div>
);

const btnStyles = {
  save: "px-5 py-2.5 bg-[#2151EC] text-white font-medium rounded-lg hover:bg-[#1a43c9] transition text-sm shadow-md flex-1 sm:flex-none justify-center cursor-pointer",
  delete:
    "px-5 py-2.5 bg-[#EA5455] text-white font-medium rounded-lg hover:bg-[#d34647] transition text-sm shadow-md flex-1 sm:flex-none justify-center cursor-pointer",
  cancel:
    "px-5 py-2.5 bg-white border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition text-sm flex-1 sm:flex-none sm:min-w-[80px] justify-center cursor-pointer",
};

// ★ 사역자 휴가 계산 함수 (토/월 제외 + 공휴일 제외)
const calculateChurchVacationDays = (
  startDate: string,
  endDate: string,
  type: string,
) => {
  if (!startDate || !endDate) return 0;

  if (type === "오전반차" || type === "오후반차") return 0.5;

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) return 0;

  const days = eachDayOfInterval({ start, end });
  let count = 0;

  days.forEach((day) => {
    const dayStr = format(day, "yyyy-MM-dd");
    const dayOfWeek = getDay(day); // 0:일, 1:월, ... 6:토

    // 1. 토요일(6), 월요일(1) 제외
    if (dayOfWeek === 6 || dayOfWeek === 1) return;

    // 2. 공휴일 제외 (추가된 로직)
    if (HOLIDAYS[dayStr]) return;

    count++;
  });

  return count;
};

function VacationContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const menu = useCurrentMenu();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [myRequests, setMyRequests] = useState<VacationRequest[]>([]);
  const [approvalList, setApprovalList] = useState<VacationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<
    "calendar" | "approve" | "history"
  >("calendar");
  const [calendarViewMode, setCalendarViewMode] = useState<"month" | "list">(
    "month",
  );

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [date, setDate] = useState<Date>(new Date());
  const [activeStartDate, setActiveStartDate] = useState<Date>(new Date());

  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    type: "연차",
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [calculatedDays, setCalculatedDays] = useState(0);

  // ★ [수정] 기간 선택용 달력 상태 (좌표 포함)
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0, width: 0 });
  const rangePickerRef = useRef<HTMLDivElement>(null);

  const [selectedRequest, setSelectedRequest] =
    useState<VacationRequest | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejectMode, setIsRejectMode] = useState(false);

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

  useEffect(() => {
    if (formData.start_date && formData.end_date) {
      const days = calculateChurchVacationDays(
        formData.start_date,
        formData.end_date,
        formData.type,
      );
      setCalculatedDays(days);
    } else {
      setCalculatedDays(0);
    }
  }, [formData.start_date, formData.end_date, formData.type]);

  const filteredApprovals = useMemo(() => {
    return approvalList.filter((req) => {
      const matchesStatus =
        filterStatus === "all" || req.status === filterStatus;
      const matchesType = filterType === "all" || req.type === filterType;
      const matchesName = req.profiles.full_name.includes(searchTerm);
      return matchesStatus && matchesType && matchesName;
    });
  }, [approvalList, filterStatus, filterType, searchTerm]);

  const handleRequestSubmit = async () => {
    if (!formData.start_date || !formData.end_date || !formData.reason)
      return toast.error("모든 항목을 입력해주세요.");

    // 일수 계산
    const daysCount = calculateChurchVacationDays(
      formData.start_date,
      formData.end_date,
      formData.type,
    );

    if (daysCount <= 0)
      return toast.error("유효하지 않은 기간이거나, 휴가 일수가 0일입니다.");

    // ★ [추가된 로직] 이미 신청된 기간과 겹치는지 확인 (중복 차단)
    const isOverlapping = myRequests.some((req) => {
      // 취소/반려된 건은 제외하고 체크
      if (req.status === "cancelled" || req.status === "rejected") return false;

      // 기간이 겹치는지 확인 (교차 검증)
      return (
        formData.start_date <= req.end_date &&
        formData.end_date >= req.start_date
      );
    });

    if (isOverlapping) {
      return toast.error(
        "이미 휴가가 신청된 날짜가 포함되어 있습니다.\n기간을 다시 확인해주세요.",
        { duration: 4000 },
      );
    }

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

    if (
      !(await showConfirm(
        "휴가를 기안하시겠습니까?",
        `총 ${daysCount}일이 차감됩니다.`,
      ))
    )
      return;

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

  const handleProcess = async (isApproved: boolean) => {
    if (!selectedRequest) return;
    if (!isApproved && !rejectReason.trim())
      return toast.error("반려 사유를 입력해주세요.");

    // 1. 이미 처리된 건인지 DB 재확인
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

    // 2. 휴가 요청 상태 업데이트 (승인/반려)
    const { error } = await supabase
      .from("vacation_requests")
      .update({
        status: isApproved ? "approved" : "rejected",
        approver_id: user?.id,
        rejection_reason: isApproved ? null : rejectReason,
      })
      .eq("id", selectedRequest.id);

    if (error) return toast.error("오류 발생: " + error.message);

    // 3. ★ [수정됨] 승인 시 연차 차감 로직 (최신 데이터 조회 후 업데이트)
    if (isApproved && DEDUCTIBLE_TYPES.includes(selectedRequest.type)) {
      // (1) 기안자의 '현재' 연차 사용량을 DB에서 새로 가져옵니다.
      const { data: requesterProfile } = await supabase
        .from("profiles")
        .select("used_leave_days")
        .eq("id", selectedRequest.user_id)
        .single();

      const currentUsed = requesterProfile?.used_leave_days || 0;

      // (2) 가져온 최신 값에 이번 신청 일수(days_count)를 더해서 업데이트합니다.
      await supabase
        .from("profiles")
        .update({ used_leave_days: currentUsed + selectedRequest.days_count })
        .eq("id", selectedRequest.user_id);
    }

    toast.success("처리되었습니다.");
    setIsDetailModalOpen(false);
    fetchData(); // 화면 새로고침
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
    const dayOfWeek = value.getDay(); // 0:일, 1:월, ... 6:토

    // 1. 월요일(1) 또는 토요일(6) 체크
    if (dayOfWeek === 1 || dayOfWeek === 6) {
      return toast("월요일과 토요일은 휴무일이라 신청할 수 없습니다.", {
        icon: "🙅‍♂️",
      });
    }

    // 2. 공휴일 체크
    if (HOLIDAYS[dateStr]) {
      return toast("공휴일에는 휴가를 신청할 수 없습니다.", { icon: "🙅‍♂️" });
    }

    // 3. 이미 신청한 내역 체크
    const existingReq = myRequests.find(
      (r) =>
        dateStr >= r.start_date &&
        dateStr <= r.end_date &&
        r.status !== "cancelled" &&
        r.status !== "rejected",
    );

    if (existingReq) {
      setSelectedRequest(existingReq);
      setIsDetailModalOpen(true);
      setIsRejectMode(false);
      return;
    }

    // 4. 새 기안 작성
    setFormData({
      ...formData,
      start_date: dateStr,
      end_date: dateStr,
      reason: "",
    });
    setIsRequestModalOpen(true);
  };

  // ★ 기간 선택 핸들러 (달력 팝업)
  const handleRangeChange = (value: any) => {
    if (Array.isArray(value)) {
      const [start, end] = value;
      setFormData({
        ...formData,
        start_date: format(start, "yyyy-MM-dd"),
        end_date: format(end, "yyyy-MM-dd"),
      });
      setShowRangePicker(false);
    } else {
      const dateStr = format(value, "yyyy-MM-dd");
      setFormData({
        ...formData,
        start_date: dateStr,
        end_date: dateStr,
      });
      if (["오전반차", "오후반차"].includes(formData.type)) {
        setShowRangePicker(false);
      }
    }
  };

  const openRangePicker = () => {
    if (rangePickerRef.current) {
      const rect = rangePickerRef.current.getBoundingClientRect();
      const calendarWidth = 350; // 달력의 대략적인 너비 (여유 있게 설정)
      const windowWidth = window.innerWidth;

      let leftPos = rect.left + window.scrollX;

      // 달력 오른쪽 끝이 화면을 넘어갈 경우 -> 화면 안쪽으로 당김 (여백 20px 확보)
      if (rect.left + calendarWidth > windowWidth) {
        leftPos = windowWidth - calendarWidth - 20;
      }

      // 왼쪽이 화면 밖으로 나갈 경우 -> 최소 10px 띄움
      if (leftPos < 10) leftPos = 10;

      setPickerPos({
        top: rect.bottom + window.scrollY + 5,
        left: leftPos,
        width: rect.width,
      });
      setShowRangePicker(true);
    }
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
      {/* 팝업 달력을 위한 포탈 스타일 (Backdrop) */}
      {showRangePicker && (
        <div
          className="fixed inset-0 z-[9998]"
          onClick={() => setShowRangePicker(false)}
        />
      )}

      {/* 팝업 달력 (Fixed Position) */}
      {showRangePicker && (
        <div
          className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-2xl p-3 range-calendar-wrapper animate-fadeIn"
          style={{
            top: pickerPos.top,
            left: pickerPos.left,
            maxWidth: "95vw", // ★ 화면 너비보다 커지지 않게 제한 추가
          }}
        >
          <Calendar
            onChange={handleRangeChange}
            selectRange={!["오전반차", "오후반차"].includes(formData.type)}
            value={
              formData.start_date && formData.end_date
                ? [new Date(formData.start_date), new Date(formData.end_date)]
                : null
            }
            formatDay={(locale, date) => format(date, "d")}
            calendarType="gregory"
            locale="ko-KR"
            minDate={new Date()}
          />
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          {menu?.name || "휴가/연차 관리"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          휴가 신청 및 승인 현황을 관리합니다.
        </p>
      </div>

      <div className="flex border-b border-gray-200 mb-6 w-full flex-shrink-0 overflow-x-auto">
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

          {activeTab === "calendar" && (
            <div className="flex flex-col lg:flex-row gap-6 h-full animate-fadeIn">
              <div className="lg:flex-[2] bg-white p-6 rounded-xl shadow-md border border-gray-200 h-[650px] w-full flex flex-col">
                {" "}
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() =>
                        setActiveStartDate(subMonths(activeStartDate, 1))
                      }
                      className="p-2 hover:bg-gray-100 rounded-full transition"
                    >
                      <svg
                        className="w-5 h-5 text-gray-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 19l-7-7 7-7"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() =>
                        setActiveStartDate(addMonths(activeStartDate, 1))
                      }
                      className="p-2 hover:bg-gray-100 rounded-full transition"
                    >
                      <svg
                        className="w-5 h-5 text-gray-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => {
                        const now = new Date();
                        setDate(now);
                        setActiveStartDate(now);
                      }}
                      className="px-3 py-1.5 text-sm font-bold bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition border border-blue-100"
                    >
                      오늘
                    </button>
                  </div>
                  <h2 className="text-xl font-bold text-gray-800 tracking-tight">
                    {format(activeStartDate, "yyyy년 M월")}
                  </h2>
                  <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button
                      onClick={() => setCalendarViewMode("month")}
                      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${calendarViewMode === "month" ? "bg-white text-blue-600 shadow-sm font-bold" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      달력
                    </button>
                    <button
                      onClick={() => setCalendarViewMode("list")}
                      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${calendarViewMode === "list" ? "bg-white text-blue-600 shadow-sm font-bold" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      리스트
                    </button>
                  </div>
                </div>
                {calendarViewMode === "month" ? (
                  <>
                    <div className="flex-1 overflow-hidden">
                      <Calendar
                        onChange={(v) => setDate(v as Date)}
                        value={date}
                        onClickDay={onDateClick}
                        activeStartDate={activeStartDate}
                        onActiveStartDateChange={({ activeStartDate }) =>
                          activeStartDate && setActiveStartDate(activeStartDate)
                        }
                        calendarType="gregory"
                        formatDay={(locale, date) => format(date, "d")}
                        prevLabel={null}
                        nextLabel={null}
                        prev2Label={null}
                        next2Label={null}
                        tileClassName={({ date, view }) => {
                          if (
                            view === "month" &&
                            HOLIDAYS[format(date, "yyyy-MM-dd")]
                          )
                            return "holiday-day";
                        }}
                        tileContent={({ date, view }) => {
                          if (view === "month") {
                            const dateStr = format(date, "yyyy-MM-dd");
                            const dayOfWeek = date.getDay();
                            const holiday = HOLIDAYS[dateStr];
                            const req = myRequests.find(
                              (r) =>
                                dateStr >= r.start_date &&
                                dateStr <= r.end_date &&
                                r.status !== "cancelled" &&
                                r.status !== "rejected",
                            );
                            const isExcluded =
                              holiday || dayOfWeek === 1 || dayOfWeek === 6;
                            return (
                              <div className="flex flex-col items-center w-full h-full pt-1">
                                {holiday && (
                                  <div className="text-[10px] text-red-500 font-medium truncate px-1 w-full text-center mt-0.5">
                                    {holiday}
                                  </div>
                                )}
                                {req &&
                                  !isExcluded &&
                                  (req.status === "approved" ? (
                                    <div className="w-full px-0.5 mt-0.5">
                                      <div className="text-[9px] bg-green-100 text-green-700 border border-green-200 rounded px-1 py-0.5 truncate text-center font-medium">
                                        {req.type}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-full px-0.5 mt-0.5">
                                      <div className="text-[9px] bg-yellow-50 text-yellow-700 border border-yellow-200 rounded px-1 py-0.5 truncate text-center font-medium">
                                        {req.type}[대기]
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            );
                          }
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="h-full overflow-y-auto divide-y divide-gray-100 custom-scrollbar pr-2">
                    {(() => {
                      const daysInMonth = eachDayOfInterval({
                        start: startOfMonth(activeStartDate),
                        end: endOfMonth(activeStartDate),
                      });

                      return daysInMonth.map((day) => {
                        const dateStr = format(day, "yyyy-MM-dd");
                        const dayNum = format(day, "d");
                        const dayLabel = format(day, "EEE");
                        const isWeekend =
                          day.getDay() === 0 || day.getDay() === 6;
                        const holiday = HOLIDAYS[dateStr];

                        // ★ 제외 날짜 조건 추가
                        const isExcluded =
                          holiday || day.getDay() === 1 || day.getDay() === 6;

                        const req = myRequests.find(
                          (r) =>
                            dateStr >= r.start_date &&
                            dateStr <= r.end_date &&
                            r.status !== "cancelled" &&
                            r.status !== "rejected",
                        );

                        return (
                          <div
                            key={dateStr}
                            className={`py-3 px-3 flex items-center justify-between transition-colors ${holiday ? "bg-red-50/50" : "hover:bg-gray-50"}`}
                          >
                            <div className="flex items-center gap-4 w-24">
                              <span
                                className={`text-lg font-bold ${isWeekend || holiday ? "text-red-500" : "text-gray-800"}`}
                              >
                                {dayNum}
                              </span>
                              <span
                                className={`text-xs uppercase font-medium ${isWeekend || holiday ? "text-red-400" : "text-gray-400"}`}
                              >
                                {dayLabel}
                              </span>
                            </div>
                            <div className="flex-1">
                              {holiday ? (
                                <div className="bg-red-100 text-red-600 text-xs font-bold px-3 py-1.5 rounded-md inline-block">
                                  🎉 {holiday}
                                </div>
                              ) : req &&
                                !isExcluded /* ★ 여기서 !isExcluded 체크 */ ? (
                                <div
                                  onClick={() => {
                                    setSelectedRequest(req);
                                    setIsDetailModalOpen(true);
                                    setIsRejectMode(false);
                                  }}
                                  className={`cursor-pointer px-3 py-1.5 rounded-md inline-flex items-center gap-2 text-xs font-bold shadow-sm transition-transform hover:scale-[1.02]
                                    ${req.status === "approved" ? "bg-green-100 text-green-700 border border-green-200" : "bg-yellow-50 text-yellow-700 border border-yellow-200"}
                                  `}
                                >
                                  {req.type}{" "}
                                  {req.status === "pending" && "[대기]"}
                                </div>
                              ) : (
                                <div className="h-1.5 w-1.5 rounded-full bg-gray-200"></div>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>

              <div
                className="lg:flex-1 w-full flex flex-col gap-6"
                style={{ height: "650px" }}
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
                        width: `${Math.min(
                          (((user?.total_leave_days || 0) -
                            (user?.used_leave_days || 0)) /
                            (user?.total_leave_days || 1)) *
                            100,
                          100,
                        )}%`,
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
                              req.status !== "cancelled" &&
                              (req.status === "pending" ||
                                (req.status === "approved" &&
                                  req.start_date >=
                                    format(new Date(), "yyyy-MM-dd"))) && (
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

          {activeTab === "history" && (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden w-full animate-fadeIn">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h3 className="font-bold text-lg text-gray-800">
                  연도별 승인 내역
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
              <div className="px-6 py-4 bg-blue-50 border-b border-blue-100 flex flex-wrap justify-end items-center gap-4 text-sm">
                {/* 기타 휴가 통계 (회색조 배경으로 구분) */}
                <div className="flex items-center gap-3 bg-white/60 px-3 py-1.5 rounded-lg border border-blue-100">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500 font-medium">경조사:</span>
                    <span className="text-gray-600 font-bold">
                      {myRequests
                        .filter(
                          (r) =>
                            r.start_date.startsWith(String(historyYear)) &&
                            r.status === "approved" &&
                            r.type === "경조사",
                        )
                        .reduce((acc, cur) => acc + cur.days_count, 0)}
                      일
                    </span>
                  </div>
                  <div className="w-px h-3 bg-gray-300"></div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500 font-medium">병가:</span>
                    <span className="text-gray-600 font-bold">
                      {myRequests
                        .filter(
                          (r) =>
                            r.start_date.startsWith(String(historyYear)) &&
                            r.status === "approved" &&
                            r.type === "병가",
                        )
                        .reduce((acc, cur) => acc + cur.days_count, 0)}
                      일
                    </span>
                  </div>
                  <div className="w-px h-3 bg-gray-300"></div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500 font-medium">특별휴가:</span>
                    <span className="text-gray-600 font-bold">
                      {myRequests
                        .filter(
                          (r) =>
                            r.start_date.startsWith(String(historyYear)) &&
                            r.status === "approved" &&
                            r.type === "특별휴가",
                        )
                        .reduce((acc, cur) => acc + cur.days_count, 0)}
                      일
                    </span>
                  </div>
                </div>

                <div className="flex items-center">
                  <span className="font-medium text-blue-800 mr-2">
                    {historyYear}년 총 사용 연차:
                  </span>
                  <span className="text-2xl font-extrabold text-blue-600">
                    {myRequests
                      .filter(
                        (r) =>
                          r.start_date.startsWith(String(historyYear)) &&
                          r.status === "approved" &&
                          DEDUCTIBLE_TYPES.includes(r.type),
                      )
                      .reduce((acc, cur) => acc + cur.days_count, 0)}
                  </span>
                  <span className="font-medium text-blue-800 ml-1">개</span>
                </div>
              </div>

              <div className="overflow-y-auto max-h-[600px]">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                        날짜
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                        종류
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                        사유
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                        차감일수
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {myRequests.filter(
                      (r) =>
                        r.start_date.startsWith(String(historyYear)) &&
                        r.status === "approved",
                    ).length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="py-20 text-center text-gray-400"
                        >
                          승인된 내역이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      myRequests
                        .filter(
                          (r) =>
                            r.start_date.startsWith(String(historyYear)) &&
                            r.status === "approved",
                        )
                        .map((req) => (
                          <tr
                            key={req.id}
                            className="hover:bg-gray-50 transition"
                          >
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {req.start_date} ~ {req.end_date}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-gray-800">
                              <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">
                                {req.type}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500 max-w-md truncate">
                              {req.reason}
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-bold text-blue-600">
                                {req.days_count}일
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

      {/* 모달들 */}
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

      {/* 기안 작성 모달 */}
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
        <div className="space-y-4">
          {" "}
          {/* height 제한 제거 */}
          <Select
            label="종류"
            value={formData.type}
            onChange={(v) => {
              const isHalf = ["오전반차", "오후반차"].includes(v);
              setFormData({
                ...formData,
                type: v,
                end_date: isHalf ? formData.start_date : formData.end_date,
              });
            }}
            options={[
              "연차",
              "오전반차",
              "오후반차",
              "경조사",
              "병가",
              "특별휴가",
            ]}
          />
          {/* ★ 기간 선택 (하나의 박스, 클릭 시 Fixed 달력 오픈) */}
          <div className="relative" ref={rangePickerRef}>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
              {["오전반차", "오후반차"].includes(formData.type)
                ? "날짜 선택"
                : "기간 선택"}
            </label>

            <button
              onClick={openRangePicker}
              className="w-full flex items-center justify-between p-2.5 border border-gray-300 rounded-md text-sm text-left hover:border-blue-500 focus:ring-2 focus:ring-blue-200 transition bg-white"
            >
              <span
                className={
                  formData.start_date
                    ? "text-gray-900 font-medium"
                    : "text-gray-400"
                }
              >
                {formData.start_date
                  ? ["오전반차", "오후반차"].includes(formData.type) ||
                    formData.start_date === formData.end_date
                    ? formData.start_date
                    : `${formData.start_date} ~ ${formData.end_date}`
                  : "날짜를 선택하세요"}
              </span>
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </button>
          </div>
          {/* 계산된 일수 표시 */}
          {calculatedDays > 0 && (
            <div className="bg-blue-50 text-blue-700 text-sm px-3 py-2 rounded font-bold text-right">
              총 {calculatedDays}일 사용 (토/월요일 제외됨)
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
