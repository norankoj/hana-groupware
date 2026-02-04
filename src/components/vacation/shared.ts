// src/components/vacation/shared.ts
import { format, eachDayOfInterval, getDay } from "date-fns";
import { HOLIDAYS } from "@/constants/holidays";

// --- 공통 상수 ---
export const DEDUCTIBLE_TYPES = ["연차", "오전반차", "오후반차"];

export const STATUS_OPTIONS = [
  { value: "all", label: "전체 상태" },
  { value: "pending", label: "대기중" },
  { value: "approved", label: "승인됨" },
  { value: "rejected", label: "반려됨" },
];

export const TYPE_OPTIONS = [
  { value: "all", label: "전체 종류" },
  { value: "연차", label: "연차" },
  { value: "오전반차", label: "오전반차" },
  { value: "오후반차", label: "오후반차" },
  { value: "경조사", label: "경조사" },
  { value: "병가", label: "병가" },
  { value: "특별휴가", label: "특별휴가" },
];

// --- 공통 스타일 ---
export const btnStyles = {
  save: "px-5 py-2.5 bg-[#2151EC] text-white font-medium rounded-lg hover:bg-[#1a43c9] transition text-sm shadow-md flex-1 sm:flex-none justify-center cursor-pointer",
  delete:
    "px-5 py-2.5 bg-[#EA5455] text-white font-medium rounded-lg hover:bg-[#d34647] transition text-sm shadow-md flex-1 sm:flex-none justify-center cursor-pointer",
  cancel:
    "px-5 py-2.5 bg-white border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition text-sm flex-1 sm:flex-none sm:min-w-[80px] justify-center cursor-pointer",
};

// --- 타입 정의 ---
export type VacationRequest = {
  id: number;
  user_id: string;
  type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  approved_at?: string; // 승인 일자
  rejected_at?: string; // 반려 일자
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

export type UserProfile = {
  id: string;
  full_name: string;
  role: string;
  position: string;
  is_approver: boolean;
  total_leave_days: number;
  used_leave_days: number;
};

// --- 공통 함수 ---
export const calculateChurchVacationDays = (
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
    const dayOfWeek = getDay(day);
    if (dayOfWeek === 6 || dayOfWeek === 1) return; // 토, 월 제외
    if (HOLIDAYS[dayStr]) return; // 공휴일 제외
    count++;
  });
  return count;
};
