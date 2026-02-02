"use client";

import { useState } from "react";
import { VacationRequest, UserProfile, DEDUCTIBLE_TYPES } from "./shared";

export default function VacationHistory({
  user,
  myRequests,
}: {
  user: UserProfile;
  myRequests: VacationRequest[];
}) {
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear());

  const yearRequests = myRequests.filter(
    (r) =>
      r.start_date.startsWith(String(historyYear)) && r.status === "approved",
  );

  // 통계 계산
  const totalUsed = yearRequests
    .filter((r) => DEDUCTIBLE_TYPES.includes(r.type))
    .reduce((acc, cur) => acc + cur.days_count, 0);
  const typeStats = {
    congrats: yearRequests
      .filter((r) => r.type === "경조사")
      .reduce((acc, cur) => acc + cur.days_count, 0),
    sick: yearRequests
      .filter((r) => r.type === "병가")
      .reduce((acc, cur) => acc + cur.days_count, 0),
    special: yearRequests
      .filter((r) => r.type === "특별휴가")
      .reduce((acc, cur) => acc + cur.days_count, 0),
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden w-full animate-fadeIn flex flex-col h-[500px] sm:h-[650px]">
      {/* 1. 상단: 연도 선택 */}
      <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <h3 className="font-bold text-base sm:text-lg text-gray-800">
          연도별 승인 내역
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

      {/* 2. 상단: 통계 요약 (반응형으로 줄바꿈 처리) */}
      <div className="px-4 py-3 sm:px-6 sm:py-4 bg-blue-50 border-b border-blue-100 flex flex-col sm:flex-row sm:justify-end sm:items-center gap-3 text-sm">
        {/* 기타 휴가 통계 */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-white/60 px-3 py-2 rounded-lg border border-blue-100 w-full sm:w-auto justify-center sm:justify-start">
          <div className="flex items-center gap-1">
            <span className="text-gray-500 font-medium text-xs sm:text-sm">
              경조사:
            </span>
            <span className="text-gray-600 font-bold text-xs sm:text-sm">
              {typeStats.congrats}일
            </span>
          </div>
          <div className="w-px h-3 bg-gray-300 hidden sm:block"></div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 font-medium text-xs sm:text-sm">
              병가:
            </span>
            <span className="text-gray-600 font-bold text-xs sm:text-sm">
              {typeStats.sick}일
            </span>
          </div>
          <div className="w-px h-3 bg-gray-300 hidden sm:block"></div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 font-medium text-xs sm:text-sm">
              특별:
            </span>
            <span className="text-gray-600 font-bold text-xs sm:text-sm">
              {typeStats.special}일
            </span>
          </div>
        </div>

        {/* 총 사용 연차 */}
        <div className="flex items-center justify-end">
          <span className="font-medium text-blue-800 mr-2 text-xs sm:text-sm">
            총 사용 연차:
          </span>
          <span className="text-xl sm:text-2xl font-extrabold text-blue-600">
            {totalUsed}
          </span>
          <span className="font-medium text-blue-800 ml-1 text-xs sm:text-sm">
            개
          </span>
        </div>
      </div>

      {/* 3. 리스트 영역 (모바일: 카드 / PC: 테이블) */}
      <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar bg-gray-50 sm:bg-white p-4 sm:p-0">
        {/* 3-1. 모바일 뷰 (Card Layout) - md:hidden */}
        <div className="block sm:hidden space-y-3">
          {yearRequests.length === 0 ? (
            <div className="py-20 text-center text-gray-400">
              승인된 내역이 없습니다.
            </div>
          ) : (
            yearRequests.map((req) => (
              <div
                key={req.id}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
              >
                <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-50">
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold">
                    {req.type}
                  </span>
                  <span className="text-blue-600 font-bold text-sm">
                    -{req.days_count}일
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-400 w-8 mt-0.5">
                      기간
                    </span>
                    <div className="text-sm text-gray-700 font-medium">
                      {req.start_date} ~ {req.end_date}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-400 w-8 mt-0.5">
                      사유
                    </span>
                    <div className="text-sm text-gray-500 line-clamp-2">
                      {req.reason}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 3-2. PC 뷰 (Table Layout) - hidden sm:block */}
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
                  차감일수
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {yearRequests.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-20 text-center text-gray-400">
                    승인된 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                yearRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
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
    </div>
  );
}
