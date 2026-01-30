// src/app/vacation/page.tsx
"use client";

import { useEffect, useState, Suspense } from "react";
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

// 연차 차감 대상
const DEDUCTIBLE_TYPES = ["연차", "오전반차", "오후반차"];

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

const btnStyles = {
  save: "px-5 py-2.5 bg-[#2151EC] text-white font-medium rounded-lg hover:bg-[#1a43c9] transition text-sm shadow-sm flex-1 sm:flex-none sm:min-w-[80px] justify-center",
  delete:
    "px-5 py-2.5 bg-[#EA5455] text-white font-medium rounded-lg hover:bg-[#d34647] transition text-sm shadow-sm flex-1 sm:flex-none sm:min-w-[80px] justify-center",
  cancel:
    "px-5 py-2.5 bg-white border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition text-sm flex-1 sm:flex-none sm:min-w-[80px] justify-center",
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

  // 탭 상태
  const [activeTab, setActiveTab] = useState<"calendar" | "approve">(
    "calendar",
  );

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

  const onDateClick = (value: Date) => {
    const selectedDate = format(value, "yyyy-MM-dd");
    const existingRequest = myRequests.find(
      (req) =>
        selectedDate >= req.start_date &&
        selectedDate <= req.end_date &&
        req.status !== "rejected" &&
        req.status !== "cancelled",
    );
    if (existingRequest) {
      const statusText =
        existingRequest.status === "approved" ? "승인 완료된" : "결재 대기중인";
      toast.error(
        `이미 ${statusText} 일정이 있습니다.\n(${existingRequest.type})`,
      );
      return;
    }
    setFormData({
      ...formData,
      start_date: selectedDate,
      end_date: selectedDate,
      reason: "",
    });
    setIsRequestModalOpen(true);
  };

  const handleRequestSubmit = async () => {
    if (!formData.start_date || !formData.end_date || !formData.reason) {
      toast.error("모든 항목을 입력해주세요.");
      return;
    }
    if (!(await showConfirm("휴가를 기안하시겠습니까?"))) return;

    const start = new Date(formData.start_date);
    const end = new Date(formData.end_date);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const daysCount =
      formData.type === "오전반차" || formData.type === "오후반차"
        ? 0.5
        : diffDays;

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
      toast.success("결재 상신이 완료되었습니다!");
      setIsRequestModalOpen(false);
      fetchData();
    }
  };

  const openDetailModal = (req: VacationRequest) => {
    setSelectedRequest(req);
    setIsRejectMode(false);
    setRejectReason(req.rejection_reason || "");
    setIsDetailModalOpen(true);
  };

  const handleProcess = async (isApproved: boolean) => {
    if (!selectedRequest) return;
    if (!isApproved && !rejectReason.trim()) {
      toast.error("반려 사유를 입력해주세요.");
      return;
    }

    // 1. 현재 DB 상태를 한 번 더 확인 (누가 먼저 결재했는지 체크)
    const { data: checkData } = await supabase
      .from("vacation_requests")
      .select("status, approver:approver_id(full_name)")
      .eq("id", selectedRequest.id)
      .single();

    // 2. 이미 처리가 끝난 문서라면 중단
    if (checkData && checkData.status !== "pending") {
      const approverInfo = checkData.approver as any;
      const processor = Array.isArray(approverInfo)
        ? approverInfo[0]?.full_name
        : approverInfo?.full_name || "다른 관리자";
      const statusText = checkData.status === "approved" ? "승인" : "반려";

      toast.error(
        `이미 ${processor}님에 의해 '${statusText}' 처리된 건입니다.\n목록을 갱신합니다.`,
        { duration: 4000 },
      );

      setIsDetailModalOpen(false);
      fetchData(); // 최신 상태로 새로고침
      return;
    }

    // 3. (정상 상태라면) 컨펌창 띄우기
    const message = isApproved ? "승인하시겠습니까?" : "반려하시겠습니까?";
    if (!(await showConfirm("결재 처리", message))) return;

    // 4. 업데이트 진행
    const { error } = await supabase
      .from("vacation_requests")
      .update({
        status: isApproved ? "approved" : "rejected",
        approver_id: user?.id,
        rejection_reason: isApproved ? null : rejectReason,
      })
      .eq("id", selectedRequest.id);

    if (error) {
      toast.error("오류 발생: " + error.message);
      return;
    }

    // 5. 승인 시 연차 차감 로직
    if (isApproved && DEDUCTIBLE_TYPES.includes(selectedRequest.type)) {
      const currentUsed = selectedRequest.profiles.used_leave_days || 0;
      await supabase
        .from("profiles")
        .update({ used_leave_days: currentUsed + selectedRequest.days_count })
        .eq("id", selectedRequest.user_id);
    }

    toast.success(isApproved ? "승인 처리되었습니다." : "반려 처리되었습니다.");
    setIsDetailModalOpen(false);
    fetchData();
  };

  const handleCancel = async (req: VacationRequest) => {
    if (!(await showConfirm("신청 취소", "정말 취소하시겠습니까?"))) return;

    setMyRequests((prev) => prev.filter((item) => item.id !== req.id));

    if (req.status === "approved" && DEDUCTIBLE_TYPES.includes(req.type)) {
      setUser((prev) =>
        prev
          ? {
              ...prev,
              used_leave_days: Math.max(
                0,
                prev.used_leave_days - req.days_count,
              ),
            }
          : null,
      );
    }

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

      const { data, error } = await supabase
        .from("vacation_requests")
        .update({ status: "cancelled" })
        .eq("id", req.id)
        .select();

      if (error || (data && data.length === 0)) {
        toast.error("취소 실패: 권한이 없거나 이미 처리되었습니다.");
        fetchData();
        return;
      }

      toast.success("신청이 취소되었습니다.");
      setMyRequests((prev) => prev.filter((item) => item.id !== req.id));
    } catch (error: any) {
      toast.error("취소 실패: " + error.message);
      fetchData();
    }
  };

  const tileContent = ({ date, view }: any) => {
    if (view === "month") {
      const dateStr = format(date, "yyyy-MM-dd");
      const req = myRequests.find(
        (req) =>
          dateStr >= req.start_date &&
          dateStr <= req.end_date &&
          req.status !== "cancelled",
      );
      if (req) {
        if (req.status === "approved")
          return (
            <div className="w-full flex justify-center mt-1 px-0.5">
              <div className="text-[10px] font-medium px-1.5 py-0.5 rounded border w-full text-center truncate bg-green-100 text-green-700 border-green-200">
                {req.type}
              </div>
            </div>
          );
        let dotColor = "bg-yellow-400";
        if (req.status === "rejected") dotColor = "bg-red-500";
        return (
          <div className="flex justify-center mt-2">
            <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></div>
          </div>
        );
      }
    }
  };

  if (loading)
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-600"></div>
      </div>
    );

  return (
    <div className="w-full h-full flex flex-col">
      <style jsx global>{`
        /* 1. 달력 전체 기본 글자색 검정으로 고정 */
        .react-calendar {
          width: 100%;
          border: none;
          font-family: inherit;
          color: #111827 !important; /* ★ 강제 적용 */
        }

        /* 2. 상단 네비게이션 (년/월, 화살표) 글자색 */
        .react-calendar__navigation button {
          min-width: 44px;
          background: none;
          font-size: 1.1rem;
          font-weight: 600;
          color: #111827 !important; /* ★ 강제 적용 */
        }
        .react-calendar__navigation button:disabled {
          background-color: #f3f4f6;
        }

        /* 3. 요일 표시 (월, 화, 수...) */
        .react-calendar__month-view__weekdays {
          text-align: center;
          text-transform: uppercase;
          font-weight: 500;
          font-size: 0.75em;
          color: #6b7280 !important; /* gray-500 */
          margin-bottom: 0.5rem;
          text-decoration: none; /* 밑줄 제거 */
        }
        /* 요일 밑줄 제거를 위한 추가 설정 */
        abbr[title] {
          text-decoration: none !important;
        }

        /* 4. 날짜 칸 기본 스타일 */
        .react-calendar__tile {
          padding: 1.5em 0.5em;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: start;
          height: 90px;
          color: #111827 !important; /* ★ 날짜 숫자 검정색 강제 */
        }

        /* 5. 주말(토,일)은 빨간색 */
        .react-calendar__month-view__days__day--weekend {
          color: #ef4444 !important;
        }

        /* 6. 이전/다음 달의 날짜는 연한 회색 */
        .react-calendar__month-view__days__day--neighboringMonth {
          color: #d1d5db !important; /* gray-300 */
        }

        /* 7. 마우스 올렸을 때 */
        .react-calendar__tile:enabled:hover,
        .react-calendar__tile:enabled:focus {
          background-color: #eff6ff;
          border-radius: 8px;
          color: #2563eb !important;
        }

        /* 8. 오늘 날짜 */
        .react-calendar__tile--now {
          background: #f3f4f6;
          border-radius: 8px;
          font-weight: 600;
          color: #1f2937 !important;
        }

        /* 9. 선택된 날짜 */
        .react-calendar__tile--active {
          background: #dbeafe !important;
          border-radius: 8px;
          color: #1e40af !important;
        }
      `}</style>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
          {menu?.name || "휴가/연차 관리"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          달력에서 날짜를 선택하여 휴가를 신청하세요.
        </p>
      </div>

      {user?.is_approver && (
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab("approve")}
            className={`pb-3 px-6 text-sm font-medium border-b-2 ${activeTab === "approve" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}
          >
            결재함{" "}
            {approvalList.filter((r) => r.status === "pending").length > 0 && (
              <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs ml-1 font-medium">
                {approvalList.filter((r) => r.status === "pending").length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("calendar")}
            className={`pb-3 px-6 text-sm font-medium border-b-2 ${activeTab === "calendar" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}
          >
            내 일정 관리
          </button>
        </div>
      )}

      {/* 결재함 (테이블) */}
      {activeTab === "approve" && user?.is_approver && (
        <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
          {approvalList.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              문서가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      기안자
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      휴가 구분
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      기간
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      상태
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      결재자
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      관리
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {approvalList.map((req) => (
                    <tr
                      key={req.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {req.profiles.full_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {req.profiles.position}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 inline-flex text-xs font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                          {req.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {req.start_date} ~ {req.end_date}{" "}
                        <span className="text-xs text-gray-400">
                          ({req.days_count}일)
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 inline-flex text-xs font-medium px-2 py-0.5 rounded ${req.status === "approved" ? "bg-green-100 text-green-700" : req.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}
                        >
                          {req.status === "pending"
                            ? "대기"
                            : req.status === "approved"
                              ? "승인"
                              : "반려"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {req.approver?.full_name || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => openDetailModal(req)}
                          className="text-blue-600 hover:text-blue-900 font-medium border border-blue-200 bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100 transition"
                        >
                          {req.status === "pending" ? "결재" : "상세"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 내 일정 관리 */}
      {(activeTab === "calendar" || !user?.is_approver) && (
        <div className="flex flex-col lg:flex-row gap-6 h-full">
          <div className="flex-1 bg-white p-6 rounded-md shadow-sm border border-gray-200 h-fit">
            <Calendar
              onChange={(v) => setDate(v as Date)}
              value={date}
              onClickDay={onDateClick}
              tileContent={tileContent}
              formatDay={(locale, date) => format(date, "d")}
              prevLabel={<span className="text-lg">‹</span>}
              nextLabel={<span className="text-lg">›</span>}
            />
            <div className="mt-4 flex gap-4 text-xs text-gray-500 justify-end">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>{" "}
                승인됨
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-400"></span>{" "}
                대기중
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500"></span> 반려됨
              </div>
            </div>
          </div>
          <div className="w-full lg:w-80 h-fit space-y-4">
            <div className="bg-white rounded-md shadow-sm border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-500 uppercase mb-3">
                내 연차 현황
              </h3>
              <div className="flex items-end justify-between mb-2">
                <span className="text-3xl font-bold text-blue-600">
                  {(user?.total_leave_days || 0) - (user?.used_leave_days || 0)}
                </span>
                <span className="text-sm text-gray-400 mb-1">
                  / {user?.total_leave_days}일
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${(user?.used_leave_days || 0) / (user?.total_leave_days || 1) > 0.8 ? "bg-red-500" : "bg-blue-600"}`}
                  style={{
                    width: `${Math.min(((user?.used_leave_days || 0) / (user?.total_leave_days || 1)) * 100, 100)}%`,
                  }}
                ></div>
              </div>
              <div className="mt-2 text-xs text-gray-400 text-right">
                {user?.used_leave_days}일 사용함
              </div>
            </div>
            <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 font-medium text-gray-700">
                최근 신청 내역
              </div>
              <div className="divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
                {myRequests.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-400">
                    내역이 없습니다.
                  </div>
                ) : (
                  myRequests.map((req) => (
                    <div
                      key={req.id}
                      className={`p-4 hover:bg-gray-50 transition cursor-pointer group`}
                      onClick={() => openDetailModal(req)}
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
                        <span className="text-xs text-gray-400">
                          {req.created_at.split("T")[0]}
                        </span>
                      </div>

                      <div className="text-xs text-gray-500 ml-1">
                        {req.start_date} ~ {req.end_date}
                      </div>
                      {req.status !== "rejected" &&
                        req.status !== "cancelled" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancel(req);
                            }}
                            className="text-xs text-red-500 underline mt-2 hover:text-red-700 font-medium"
                          >
                            {req.status === "approved"
                              ? "승인 취소 (연차복구)"
                              : "신청 취소"}
                          </button>
                        )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 결재/상세 모달 */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={
          selectedRequest?.status === "pending" ? "결재 처리" : "결재 상세 내역"
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
            <div className="border border-gray-200 rounded-lg overflow-hidden">
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
              <div className="border border-gray-200 rounded-lg overflow-hidden">
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
              저장
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
