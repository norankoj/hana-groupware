"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { format } from "date-fns";
import { useCurrentMenu } from "@/components/ClientLayout";

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
  // ★ 'cancelled' 상태 추가됨
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

export default function VacationPage() {
  const supabase = createClient();
  const router = useRouter();
  const menu = useCurrentMenu();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [myRequests, setMyRequests] = useState<VacationRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<VacationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"calendar" | "approve">(
    "calendar",
  );

  const [date, setDate] = useState<Date>(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    type: "연차",
    start_date: "",
    end_date: "",
    reason: "",
  });

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

    // 내 신청 내역 (취소된 것도 포함해서 가져옴)
    const { data: myData } = await supabase
      .from("vacation_requests")
      .select(
        "*, profiles:user_id(full_name, position), approver:approver_id(full_name)",
      )
      .eq("user_id", authUser.id)
      .order("start_date", { ascending: false });
    if (myData) setMyRequests(myData as any);

    // 결재 대기 목록 (취소된 건 안 보이게)
    if (profile.is_approver) {
      const { data: allData } = await supabase
        .from("vacation_requests")
        .select(
          "*, profiles:user_id(full_name, team_id, position, used_leave_days)",
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (allData) {
        setPendingRequests(allData as any);
        if (allData.length > 0) setActiveTab("approve");
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 날짜 클릭 (중복 확인)
  const onDateClick = (value: Date) => {
    const selectedDate = format(value, "yyyy-MM-dd");
    const existingRequest = myRequests.find(
      (req) =>
        selectedDate >= req.start_date &&
        selectedDate <= req.end_date &&
        req.status !== "rejected" &&
        req.status !== "cancelled", // ★ 취소된 날짜는 다시 신청 가능하게 패스!
    );

    if (existingRequest) {
      const statusText =
        existingRequest.status === "approved" ? "승인 완료된" : "결재 대기중인";
      alert(
        `이미 ${statusText} 일정이 있습니다.\n(${existingRequest.type}: ${existingRequest.start_date})`,
      );
      return;
    }
    setFormData({
      ...formData,
      start_date: selectedDate,
      end_date: selectedDate,
      reason: "",
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm("휴가를 기안하시겠습니까?")) return;

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

    if (error) alert("실패: " + error.message);
    else {
      alert("결재 상신 완료!");
      setIsModalOpen(false);
      fetchData();
    }
  };

  const handleApproval = async (req: VacationRequest, isApproved: boolean) => {
    let rejectionReason = null;
    if (!isApproved) {
      rejectionReason = prompt("반려 사유를 입력해주세요:");
      if (!rejectionReason) return;
    } else {
      if (!confirm("승인하시겠습니까?")) return;
    }

    const { error } = await supabase
      .from("vacation_requests")
      .update({
        status: isApproved ? "approved" : "rejected",
        approver_id: user?.id,
        rejection_reason: rejectionReason,
      })
      .eq("id", req.id);

    if (error) {
      alert("오류: " + error.message);
      return;
    }

    if (isApproved && DEDUCTIBLE_TYPES.includes(req.type)) {
      const currentUsed = req.profiles.used_leave_days || 0;
      await supabase
        .from("profiles")
        .update({ used_leave_days: currentUsed + req.days_count })
        .eq("id", req.user_id);
    }
    fetchData();
  };

  // ★ 핵심 수정: 취소 시 삭제하지 않고 상태 변경 ('cancelled')
  const handleCancel = async (req: VacationRequest) => {
    if (
      !confirm("정말 취소하시겠습니까? (승인된 내역일 경우 연차가 복구됩니다)")
    )
      return;

    // 1. 연차 복구 로직 (승인됨 && 차감대상)
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

    // 2. 상태 변경 (삭제 X -> cancelled O)
    const { error } = await supabase
      .from("vacation_requests")
      .update({ status: "cancelled" }) // ★ 상태만 변경
      .eq("id", req.id);

    if (error) alert("취소 실패: " + error.message);
    else {
      alert("취소되었습니다.");
      fetchData();
    }
  };

  // 달력 점 표시 로직
  const tileContent = ({ date, view }: any) => {
    if (view === "month") {
      const dateStr = format(date, "yyyy-MM-dd");
      const hasEvent = myRequests.find(
        (req) =>
          dateStr >= req.start_date &&
          dateStr <= req.end_date &&
          req.status !== "cancelled", // ★ 달력에서는 취소된 것 숨김!
      );

      if (hasEvent) {
        let colorClass = "bg-yellow-400";
        if (hasEvent.status === "approved") colorClass = "bg-green-500";
        if (hasEvent.status === "rejected") colorClass = "bg-red-500";

        return (
          <div className="flex justify-center mt-1">
            <div className={`w-1.5 h-1.5 rounded-full ${colorClass}`}></div>
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
        .react-calendar {
          width: 100%;
          border: none;
          font-family: inherit;
        }
        .react-calendar__navigation {
          margin-bottom: 1rem;
        }
        .react-calendar__navigation button {
          min-width: 44px;
          background: none;
          font-size: 1.1rem;
          font-weight: bold;
        }
        .react-calendar__month-view__weekdays {
          text-align: center;
          text-transform: uppercase;
          font-weight: bold;
          font-size: 0.75em;
          color: #9ca3af;
          margin-bottom: 0.5rem;
        }
        .react-calendar__month-view__days__day--weekend {
          color: #ef4444;
        }
        .react-calendar__tile {
          padding: 1.5em 0.5em;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: start;
          height: 90px;
        }
        .react-calendar__tile:enabled:hover,
        .react-calendar__tile:enabled:focus {
          background-color: #eff6ff;
          border-radius: 8px;
          color: #2563eb;
        }
        .react-calendar__tile--now {
          background: #f3f4f6;
          border-radius: 8px;
          font-weight: bold;
          color: #1f2937;
        }
        .react-calendar__tile--active {
          background: #dbeafe !important;
          border-radius: 8px;
          color: #1e40af !important;
        }
      `}</style>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
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
            className={`pb-3 px-6 text-sm font-bold border-b-2 ${activeTab === "approve" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}
          >
            결재 대기함{" "}
            {pendingRequests.length > 0 && (
              <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs ml-1">
                {pendingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("calendar")}
            className={`pb-3 px-6 text-sm font-bold border-b-2 ${activeTab === "calendar" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}
          >
            내 일정 관리
          </button>
        </div>
      )}

      {activeTab === "approve" && user?.is_approver && (
        <div className="bg-white rounded-md shadow-sm border border-gray-200">
          {pendingRequests.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              대기 중인 문서가 없습니다.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-5 flex justify-between items-center hover:bg-gray-50"
                >
                  <div>
                    <span className="font-bold">{req.profiles.full_name}</span>{" "}
                    <span className="text-sm text-gray-500">
                      ({req.profiles.position})
                    </span>
                    <div className="text-sm text-blue-600 mt-1">
                      [{req.type}] {req.start_date} ~ {req.end_date}{" "}
                      <span className="text-gray-400 text-xs">
                        ({req.days_count}일)
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {req.reason}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproval(req, true)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                    >
                      승인
                    </button>
                    <button
                      onClick={() => handleApproval(req, false)}
                      className="px-3 py-1.5 border border-red-200 text-red-600 rounded text-sm hover:bg-red-50"
                    >
                      반려
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                승인됨
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                대기중
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>반려됨
              </div>
            </div>
          </div>

          <div className="w-full lg:w-80 h-fit space-y-4">
            <div className="bg-white rounded-md shadow-sm border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-500 uppercase mb-3">
                내 연차 현황
              </h3>
              <div className="flex items-end justify-between mb-2">
                <span className="text-3xl font-extrabold text-blue-600">
                  {(user?.total_leave_days || 0) - (user?.used_leave_days || 0)}
                </span>
                <span className="text-sm text-gray-400 mb-1">
                  / {user?.total_leave_days}일
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    (user?.used_leave_days || 0) /
                      (user?.total_leave_days || 1) >
                    0.8
                      ? "bg-red-500"
                      : "bg-blue-600"
                  }`}
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
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 font-bold text-gray-700">
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
                      className="p-4 hover:bg-gray-50 transition"
                    >
                      <div className="flex justify-between mb-1">
                        {/* ★ 뱃지 부분 수정: cancelled 추가 */}
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded ${
                            req.status === "approved"
                              ? "bg-green-100 text-green-700"
                              : req.status === "rejected"
                                ? "bg-red-100 text-red-700"
                                : req.status === "cancelled"
                                  ? "bg-gray-100 text-gray-500" // 취소 뱃지 (회색)
                                  : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {req.status === "approved"
                            ? "승인"
                            : req.status === "rejected"
                              ? "반려"
                              : req.status === "cancelled"
                                ? "취소됨"
                                : "대기"}
                        </span>
                        <span className="text-xs text-gray-400">
                          {req.created_at.split("T")[0]}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-gray-800 mb-0.5">
                        [{req.type}] {req.days_count}일
                      </div>
                      <div className="text-xs text-gray-500">
                        {req.start_date} ~ {req.end_date}
                      </div>

                      {/* 취소 버튼: 대기중 or 승인됨 (취소된 건은 버튼 안 보임) */}
                      {req.status !== "rejected" &&
                        req.status !== "cancelled" && (
                          <button
                            onClick={() => handleCancel(req)}
                            className="text-xs text-red-500 underline mt-2 hover:text-red-700"
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

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 m-4 relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              휴가 기안 작성
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  휴가 구분
                </label>
                <select
                  className="w-full p-2 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                >
                  <option>연차</option>
                  <option>오전반차</option>
                  <option>오후반차</option>
                  <option>경조사</option>
                  <option>병가</option>
                  <option>대체휴가</option>
                  <option>특별휴가</option>
                </select>
                {!DEDUCTIBLE_TYPES.includes(formData.type) && (
                  <p className="text-xs text-blue-600 mt-1">
                    * {formData.type}는 연차가 차감되지 않습니다.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                    시작일
                  </label>
                  <input
                    type="date"
                    required
                    className="w-full p-2 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.start_date}
                    onChange={(e) =>
                      setFormData({ ...formData, start_date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                    종료일
                  </label>
                  <input
                    type="date"
                    required
                    className="w-full p-2 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.end_date}
                    onChange={(e) =>
                      setFormData({ ...formData, end_date: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  사유
                </label>
                <textarea
                  required
                  rows={3}
                  className="w-full p-2 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="사유 입력"
                  value={formData.reason}
                  onChange={(e) =>
                    setFormData({ ...formData, reason: e.target.value })
                  }
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-md hover:bg-gray-200"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700"
                >
                  결재 상신
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
