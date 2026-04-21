"use client";

import { useState } from "react";
import { VacationRequest, UserProfile, DEDUCTIBLE_TYPES } from "./shared";

type HistoryFilter = "all" | "approved" | "pending" | "rejected";

const FILTER_OPTIONS: { value: HistoryFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "approved", label: "승인" },
  { value: "pending", label: "대기중" },
  { value: "rejected", label: "반려" },
];

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  approved: { bg: "bg-green-100", text: "text-green-700", label: "승인" },
  pending: { bg: "bg-yellow-100", text: "text-yellow-700", label: "대기중" },
  rejected: { bg: "bg-red-100", text: "text-red-700", label: "반려" },
};

export default function VacationHistory({
  user,
  myRequests,
}: {
  user: UserProfile;
  myRequests: VacationRequest[];
}) {
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear());
  const [filter, setFilter] = useState<HistoryFilter>("all");

  const yearRequests = myRequests.filter((r) =>
    r.start_date.startsWith(String(historyYear)),
  );

  const approvedRequests = yearRequests.filter((r) => r.status === "approved");
  const filteredRequests =
    filter === "all"
      ? yearRequests
      : yearRequests.filter((r) => r.status === filter);

  // 통계: 승인된 내역 기준
  const totalUsed = approvedRequests
    .filter((r) => DEDUCTIBLE_TYPES.includes(r.type))
    .reduce((acc, cur) => acc + cur.days_count, 0);
  const typeStats = {
    congrats: approvedRequests
      .filter((r) => r.type === "경조사")
      .reduce((acc, cur) => acc + cur.days_count, 0),
    sick: approvedRequests
      .filter((r) => r.type === "병가")
      .reduce((acc, cur) => acc + cur.days_count, 0),
    reserve: approvedRequests
      .filter((r) => r.type === "예비군")
      .reduce((acc, cur) => acc + cur.days_count, 0),
    special: approvedRequests
      .filter((r) => r.type === "특별휴가")
      .reduce((acc, cur) => acc + cur.days_count, 0),
  };

  // 대기중 차감 예정 일수
  const pendingDays = yearRequests
    .filter((r) => r.status === "pending" && DEDUCTIBLE_TYPES.includes(r.type))
    .reduce((acc, cur) => acc + cur.days_count, 0);

  const totalLeave = user?.total_leave_days || 0;
  const usedLeave = user?.used_leave_days || 0;
  const remainingLeave = totalLeave - usedLeave;

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden w-full animate-fadeIn flex flex-col h-[500px] sm:h-[650px]">
      {/* 1. 상단: 연도 선택 */}
      <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <h3 className="font-bold text-base sm:text-lg text-gray-800">
          연도별 내역
        </h3>
        <div className="flex items-center bg-white border border-gray-300 rounded-lg shadow-sm">
          <button
            onClick={() => setHistoryYear(historyYear - 1)}
            className="px-3 py-1.5 hover:bg-gray-50 text-gray-600 border-r"
          >
            ◀
          </button>
          <span className="px-3 sm:px-4 font-bold text-gray-800 text-sm sm:text-base">
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

      {/* 2. 연차 잔여 현황 카드 */}
      <div className="px-4 py-3 sm:px-6 sm:py-4 bg-blue-50 border-b border-blue-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* 잔여 연차 강조 */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-extrabold text-blue-600">
                {remainingLeave}
              </div>
              <div className="text-xs text-blue-700 font-medium mt-0.5">잔여 연차</div>
            </div>
            <div className="w-px h-10 bg-blue-200 hidden sm:block" />
            <div className="flex gap-4 text-sm text-gray-600">
              <div className="text-center">
                <div className="font-bold text-gray-800">{totalLeave}일</div>
                <div className="text-xs text-gray-500">총 연차</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-gray-800">{usedLeave}일</div>
                <div className="text-xs text-gray-500">사용</div>
              </div>
              {pendingDays > 0 && (
                <div className="text-center">
                  <div className="font-bold text-yellow-600">{pendingDays}일</div>
                  <div className="text-xs text-yellow-600">승인 대기</div>
                </div>
              )}
            </div>
          </div>

          {/* 기타 휴가 통계 */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-white/60 px-3 py-2 rounded-lg border border-blue-100 text-xs sm:text-sm">
            <span className="text-gray-500">경조사 <span className="font-bold text-gray-700">{typeStats.congrats}일</span></span>
            <span className="w-px h-3 bg-gray-300 hidden sm:inline-block" />
            <span className="text-gray-500">병가 <span className="font-bold text-gray-700">{typeStats.sick}일</span></span>
            <span className="w-px h-3 bg-gray-300 hidden sm:inline-block" />
            <span className="text-gray-500">예비군 <span className="font-bold text-gray-700">{typeStats.reserve}일</span></span>
            <span className="w-px h-3 bg-gray-300 hidden sm:inline-block" />
            <span className="text-gray-500">특별 <span className="font-bold text-gray-700">{typeStats.special}일</span></span>
          </div>
        </div>

        {/* 잔여 연차 progress bar */}
        <div className="mt-3">
          <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(
                  (remainingLeave / (totalLeave || 1)) * 100,
                  100,
                )}%`,
              }}
            />
          </div>
          <div className="mt-1 text-right text-xs text-blue-700 font-medium">
            {totalLeave > 0
              ? `${Math.round((remainingLeave / totalLeave) * 100)}% 남음`
              : ""}
          </div>
        </div>
      </div>

      {/* 3. 상태 필터 탭 */}
      <div className="flex border-b border-gray-100 bg-white px-4 shrink-0">
        {FILTER_OPTIONS.map((opt) => {
          const count =
            opt.value === "all"
              ? yearRequests.length
              : yearRequests.filter((r) => r.status === opt.value).length;
          return (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`py-2.5 px-3 sm:px-4 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap ${
                filter === opt.value
                  ? "border-blue-600 text-blue-600 font-bold"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
              {count > 0 && (
                <span
                  className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                    filter === opt.value
                      ? "bg-blue-100 text-blue-600"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 4. 리스트 영역 (모바일: 카드 / PC: 테이블) */}
      <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar bg-gray-50 sm:bg-white p-4 sm:p-0">
        {/* 모바일 카드 뷰 */}
        <div className="block sm:hidden space-y-3">
          {filteredRequests.length === 0 ? (
            <div className="py-20 text-center text-gray-400">
              해당 내역이 없습니다.
            </div>
          ) : (
            filteredRequests.map((req) => {
              const badge = STATUS_BADGE[req.status] ?? {
                bg: "bg-gray-100",
                text: "text-gray-600",
                label: req.status,
              };
              return (
                <div
                  key={req.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                >
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-50">
                    <span
                      className={`${badge.bg} ${badge.text} px-2 py-0.5 rounded text-xs font-bold`}
                    >
                      {req.type}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`${badge.bg} ${badge.text} px-2 py-0.5 rounded text-xs font-bold`}
                      >
                        {badge.label}
                      </span>
                      {DEDUCTIBLE_TYPES.includes(req.type) && (
                        <span className="text-blue-600 font-bold text-sm">
                          -{req.days_count}일
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-400 w-8 mt-0.5">기간</span>
                      <div className="text-sm text-gray-700 font-medium">
                        {req.start_date} ~ {req.end_date}
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-400 w-8 mt-0.5">사유</span>
                      <div className="text-sm text-gray-500 line-clamp-2">
                        {req.reason}
                      </div>
                    </div>
                    {req.status === "rejected" && req.rejection_reason && (
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-red-400 w-8 mt-0.5">반려</span>
                        <div className="text-sm text-red-500">
                          {req.rejection_reason}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* PC 테이블 뷰 */}
        <div className="hidden sm:block h-full">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 shadow-sm">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                  날짜
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                  종류
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                  사유
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                  상태
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                  일수
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center text-gray-400">
                    해당 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => {
                  const badge = STATUS_BADGE[req.status] ?? {
                    bg: "bg-gray-100",
                    text: "text-gray-600",
                    label: req.status,
                  };
                  return (
                    <tr key={req.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                        {req.start_date} ~ {req.end_date}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-800">
                        <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs border border-gray-200">
                          {req.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-md">
                        <div className="truncate">{req.reason}</div>
                        {req.status === "rejected" && req.rejection_reason && (
                          <div className="text-xs text-red-500 mt-0.5 truncate">
                            반려 사유: {req.rejection_reason}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`${badge.bg} ${badge.text} px-2 py-1 rounded text-xs font-bold`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {DEDUCTIBLE_TYPES.includes(req.type) ? (
                          <span className="font-bold text-blue-600">
                            {req.days_count}일
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">차감없음</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
