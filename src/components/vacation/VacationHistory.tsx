"use client";

import { useState } from "react";
import { VacationRequest, UserProfile, DEDUCTIBLE_TYPES, VACATION_STATUS } from "./shared";
import {
  center,
  empty,
  sub,
  table,
  tdWide,
  thWide,
  thead,
  trHover,
} from "@/components/ui/table";

type HistoryFilter = "all" | "approved" | "pending" | "rejected";

const FILTER_OPTIONS: { value: HistoryFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "approved", label: "승인" },
  { value: "pending", label: "대기중" },
  { value: "rejected", label: "반려" },
];


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
    <div className="bg-white rounded-xl shadow-md border border-line overflow-hidden w-full animate-fadeIn flex flex-col h-[500px] sm:h-[650px]">
      {/* 1. 상단: 연도 선택 */}
      {/* 제목 줄은 흰 바탕 — 바로 아래 잔여 연차 띠가 색을 쓰므로 여기는 비워둔다 */}
      <div className="p-4 sm:p-6 border-b border-line-soft flex items-center justify-between bg-white">
        <h3 className="font-bold text-base sm:text-lg text-heading">
          연도별 내역
        </h3>
        <div className="flex items-center bg-white border border-line-strong rounded-lg shadow-sm">
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
      <div className="px-4 py-3 sm:px-6 sm:py-4 bg-primary-wash border-b border-primary-soft">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* 잔여 연차 강조 */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-extrabold text-primary">
                {remainingLeave}
              </div>
              <div className="text-xs text-primary-active font-medium mt-0.5">잔여 연차</div>
            </div>
            <div className="w-px h-10 bg-primary-soft hidden sm:block" />
            <div className="flex gap-4 text-sm text-gray-600">
              <div className="text-center">
                <div className="font-bold text-gray-800">{totalLeave}일</div>
                <div className="text-xs text-muted">총 연차</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-gray-800">{usedLeave}일</div>
                <div className="text-xs text-muted">사용</div>
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
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-white/60 px-3 py-2 rounded-lg border border-primary-soft text-xs sm:text-sm">
            <span className="text-muted">경조사 <span className="font-bold text-gray-700">{typeStats.congrats}일</span></span>
            <span className="w-px h-3 bg-gray-300 hidden sm:inline-block" />
            <span className="text-muted">병가 <span className="font-bold text-gray-700">{typeStats.sick}일</span></span>
            <span className="w-px h-3 bg-gray-300 hidden sm:inline-block" />
            <span className="text-muted">예비군 <span className="font-bold text-gray-700">{typeStats.reserve}일</span></span>
            <span className="w-px h-3 bg-gray-300 hidden sm:inline-block" />
            <span className="text-muted">특별 <span className="font-bold text-gray-700">{typeStats.special}일</span></span>
          </div>
        </div>

        {/* 잔여 연차 progress bar */}
        <div className="mt-3">
          <div className="w-full bg-primary-soft rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(
                  (remainingLeave / (totalLeave || 1)) * 100,
                  100,
                )}%`,
              }}
            />
          </div>
          <div className="mt-1 text-right text-xs text-primary-active font-medium">
            {totalLeave > 0
              ? `${Math.round((remainingLeave / totalLeave) * 100)}% 남음`
              : ""}
          </div>
        </div>
      </div>

      {/* 3. 상태 필터 탭 */}
      <div className="flex border-b border-line-soft bg-white px-4 shrink-0">
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
                  ? "border-primary text-primary font-bold"
                  : "border-transparent text-muted hover:text-gray-700"
              }`}
            >
              {opt.label}
              {count > 0 && (
                <span
                  className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                    filter === opt.value
                      ? "bg-primary-soft text-primary"
                      : "bg-gray-100 text-muted"
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
      <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar bg-table-header sm:bg-white p-4 sm:p-0">
        {/* 모바일 카드 뷰 */}
        <div className="block sm:hidden space-y-3">
          {filteredRequests.length === 0 ? (
            <div className="py-20 text-center text-gray-400">
              해당 내역이 없습니다.
            </div>
          ) : (
            filteredRequests.map((req) => {
              const badge = VACATION_STATUS[req.status] ?? {
                label: req.status,
                className: "bg-secondary-soft text-dark border-secondary/30",
              };
              return (
                <div
                  key={req.id}
                  className="bg-white border border-line rounded-xl p-4 shadow-sm"
                >
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-50">
                    <span
                      className={`${badge.className} border px-2 py-0.5 rounded text-xs font-bold`}
                    >
                      {req.type}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`${badge.className} border px-2 py-0.5 rounded text-xs font-bold`}
                      >
                        {badge.label}
                      </span>
                      {DEDUCTIBLE_TYPES.includes(req.type) && (
                        <span className="text-primary font-bold text-sm">
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
                      <div className="text-sm text-muted line-clamp-2">
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
          <table className={`min-w-full ${table}`}>
            <thead className={thead}>
              <tr>
                <th className={thWide}>날짜</th>
                <th className={thWide}>종류</th>
                <th className={thWide}>사유</th>
                <th className={`${thWide} ${center}`}>상태</th>
                <th className={`${thWide} ${center}`}>일수</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className={empty}>
                    해당 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => {
                  const badge = VACATION_STATUS[req.status] ?? {
                label: req.status,
                className: "bg-secondary-soft text-dark border-secondary/30",
              };
                  return (
                    <tr key={req.id} className={trHover}>
                      <td className={`${tdWide} font-mono text-muted whitespace-nowrap`}>
                        {req.start_date} ~ {req.end_date}
                      </td>
                      <td className={tdWide}>
                        <span className="bg-secondary-soft text-dark px-2 py-1 rounded text-xs font-medium border border-line">
                          {req.type}
                        </span>
                      </td>
                      <td className={`${tdWide} max-w-md`}>
                        <div className="truncate">{req.reason}</div>
                        {req.status === "rejected" && req.rejection_reason && (
                          <div className={`${sub} mt-0.5 truncate text-danger`}>
                            반려 사유: {req.rejection_reason}
                          </div>
                        )}
                      </td>
                      <td className={`${tdWide} ${center}`}>
                        <span
                          className={`${badge.className} border px-2 py-1 rounded text-xs font-bold whitespace-nowrap`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className={`${tdWide} ${center}`}>
                        {DEDUCTIBLE_TYPES.includes(req.type) ? (
                          <span className="font-mono font-bold text-primary">
                            {req.days_count}일
                          </span>
                        ) : (
                          <span className="text-xs text-disabled-text">차감없음</span>
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
