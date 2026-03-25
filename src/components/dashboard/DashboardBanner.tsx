"use client";

import Link from "next/link";

type Profile = {
  id: string;
  full_name: string;
  position: string;
  team_id: number;
  role: string;
  status: string;
  is_approver?: boolean;
};

interface Props {
  profile: Profile;
  pendingCount: number;
  myPendingCount: number;
  canViewCalendar: boolean;
  parkingText: string;
}

export default function DashboardBanner({
  profile,
  pendingCount,
  myPendingCount,
  canViewCalendar,
  parkingText,
}: Props) {
  return (
    <section className="flex flex-col xl:flex-row gap-6">
      <Link
        href="/mypage"
        className="flex-1 bg-gradient-to-r from-blue-700 to-blue-600 rounded-2xl p-8 text-white shadow-md relative overflow-hidden min-h-[160px] flex flex-col justify-center"
      >
        <div className="relative z-10">
          <h2 className="text-3xl font-bold mb-2">
            안녕하세요, {profile.full_name}님!
          </h2>
          <p className="text-blue-100 font-medium opacity-90 flex items-center gap-2">
            <span className="bg-white/20 px-2 py-0.5 rounded text-sm">
              Today
            </span>
            {parkingText} 🚗
          </p>
        </div>
        <div className="absolute right-0 top-0 h-full w-1/3 opacity-10 pointer-events-none">
          <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <path
              fill="#FFFFFF"
              d="M44.7,-76.4C58.9,-69.2,71.8,-59.1,81.6,-46.6C91.4,-34.1,98.1,-19.2,95.8,-4.9C93.5,9.4,82.2,23.1,71.6,35.2C61,47.3,51.1,57.8,39.6,66.1C28.1,74.4,15,80.5,1.5,77.9C-12,75.3,-25.9,64,-38.3,53.8C-50.7,43.6,-61.6,34.5,-69.4,22.7C-77.2,10.9,-81.9,-3.6,-78.3,-17C-74.7,-30.4,-62.8,-42.7,-50.2,-50.7C-37.6,-58.7,-24.3,-62.4,-10.5,-64.1C3.3,-65.8,17.1,-65.5,30.5,-75.2L44.7,-76.4Z"
              transform="translate(100 100)"
            />
          </svg>
        </div>
      </Link>

      <div className="flex flex-col sm:flex-row gap-6 w-full xl:w-auto">
        {profile.is_approver && (
          <Link
            href="/vacation?tab=approve"
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer relative overflow-hidden group w-full sm:w-64 flex flex-col justify-between min-h-[160px]"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-1">
                  결재 대기
                </p>
                <h3 className="text-3xl font-extrabold text-gray-900">
                  {pendingCount}{" "}
                  <span className="text-sm font-normal text-gray-400">건</span>
                </h3>
              </div>
              <div
                className={`p-3 rounded-lg ${pendingCount > 0 ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-300"}`}
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
            </div>
            <div className="mt-4 text-xs font-medium text-red-500 flex items-center gap-1">
              {pendingCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              )}{" "}
              승인이 필요합니다
            </div>
          </Link>
        )}

        {canViewCalendar && (
          <Link
            href="/vacation"
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer relative overflow-hidden group w-full sm:w-64 flex flex-col justify-between min-h-[160px]"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-1">
                  내 결재 진행
                </p>
                <h3 className="text-3xl font-extrabold text-gray-900">
                  {myPendingCount}{" "}
                  <span className="text-sm font-normal text-gray-400">건</span>
                </h3>
              </div>
              <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
            <div className="mt-4 text-xs font-medium text-blue-600">
              처리 결과를 기다리고 있어요
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
