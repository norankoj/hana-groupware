"use client";

import Link from "next/link";
import { format } from "date-fns";

type TodayReservation = {
  id: number;
  start_at: string;
  end_at: string;
  purpose: string;
  resources: { name: string; category: string };
  profiles: { full_name: string };
};

interface Props {
  title: string;
  href: string;
  reservations: TodayReservation[];
  emptyMessage: string;
  icon: React.ReactNode;
  emptyIcon: React.ReactNode;
}

export default function TodayReservationWidget({
  title,
  href,
  reservations,
  emptyMessage,
  icon,
  emptyIcon,
}: Props) {
  return (
    <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-col max-h-[300px] 2xl:max-h-[320px] min-h-[200px]">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <span className="p-2 bg-blue-50 rounded-lg text-blue-600">
            {icon}
          </span>
          {title}
        </h3>
        <Link
          href={href}
          className="text-sm text-gray-400 hover:text-blue-600 font-medium flex items-center gap-1 transition-colors"
        >
          전체보기
          <svg
            className="w-4 h-4"
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
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 max-h-[300px] 2xl:max-h-[320px] min-h-[150px]">
        {reservations.length > 0 ? (
          <ul className="space-y-3">
            {reservations.map((res) => (
              <li
                key={res.id}
                className="group p-3 rounded-xl border border-gray-100 bg-gray-50 hover:bg-blue-50 hover:border-blue-100 transition-all cursor-default"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0 mr-3">
                    <div className="font-bold text-gray-800 text-sm mb-0.5 truncate">
                      {res.resources.name}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {res.profiles?.full_name} · {res.purpose}
                    </div>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <span className="block font-bold text-blue-600 text-sm">
                      {format(new Date(res.start_at), "HH:mm")}
                    </span>
                    <span className="text-xs text-gray-400">
                      ~{format(new Date(res.end_at), "HH:mm")}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2 min-h-[150px]">
            {emptyIcon}
            <p className="text-sm">{emptyMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
