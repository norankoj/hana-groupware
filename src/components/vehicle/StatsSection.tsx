"use client";

import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ko } from "date-fns/locale";
import Select from "@/components/Select";

type VehicleLog = {
  id: number;
  resource_id: number;
  start_at: string;
  end_at: string;
  vehicle_status: string;
  start_mileage?: number;
  end_mileage?: number;
  driver_name: string;
  department?: string;
  destination: string;
  resources?: { name: string };
};

type Vehicle = {
  id: number;
  name: string;
};

interface StatsSectionProps {
  logs: VehicleLog[];
  vehicles: Vehicle[];
}

export default function StatsSection({ logs, vehicles }: StatsSectionProps) {
  const [selectedMonth, setSelectedMonth] = useState(
    format(new Date(), "yyyy-MM"),
  );

  const monthLogs = useMemo(() => {
    const start = startOfMonth(new Date(`${selectedMonth}-01`));
    const end = endOfMonth(start);
    return logs.filter((l) => {
      const d = new Date(l.start_at);
      return d >= start && d <= end && l.vehicle_status === "returned";
    });
  }, [logs, selectedMonth]);

  const vehicleStats = useMemo(() => {
    const map: Record<
      number,
      { name: string; count: number; totalKm: number; drivers: Set<string> }
    > = {};
    vehicles.forEach((v) => {
      map[v.id] = { name: v.name, count: 0, totalKm: 0, drivers: new Set() };
    });
    monthLogs.forEach((l) => {
      if (!map[l.resource_id]) return;
      map[l.resource_id].count++;
      map[l.resource_id].drivers.add(l.driver_name);
      if (l.start_mileage != null && l.end_mileage != null) {
        map[l.resource_id].totalKm += l.end_mileage - l.start_mileage;
      }
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [monthLogs, vehicles]);

  const totalKm = vehicleStats.reduce((s, v) => s + v.totalKm, 0);
  const totalCount = vehicleStats.reduce((s, v) => s + v.count, 0);

  const recentMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return format(d, "yyyy-MM");
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
      {/* 월 선택 */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-bold text-gray-600 shrink-0">
          월 선택
        </label>
        <div className="w-40">
          <Select
            value={selectedMonth}
            onChange={setSelectedMonth}
            options={recentMonths.map((m) => ({
              value: m,
              label: format(new Date(`${m}-01`), "yyyy년 M월", { locale: ko }),
            }))}
            className="w-full h-[42px] px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg"
          />
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "총 운행 횟수", value: `${totalCount}회` },
          { label: "총 주행 거리", value: `${totalKm.toLocaleString()} km` },
          {
            label: "평균 주행 거리",
            value:
              totalCount > 0
                ? `${Math.round(totalKm / totalCount).toLocaleString()} km`
                : "-",
          },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="bg-blue-50 rounded-xl p-4 text-center border border-blue-100"
          >
            <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
            <p className="text-xl font-extrabold text-blue-700">{value}</p>
          </div>
        ))}
      </div>

      {/* 차량별 통계 */}
      <div>
        <h3 className="text-sm font-bold text-gray-700 mb-3">차량별 현황</h3>
        {vehicleStats.every((v) => v.count === 0) ? (
          <p className="text-center text-gray-400 text-sm py-6">
            해당 월 운행 기록이 없습니다.
          </p>
        ) : (
          <div className="space-y-3">
            {vehicleStats.map((stat) => {
              const barWidth =
                totalCount > 0 ? (stat.count / totalCount) * 100 : 0;
              return (
                <div key={stat.name} className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-700 w-20 shrink-0 truncate">
                    {stat.name}
                  </span>
                  <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <div className="text-right text-xs w-32 shrink-0">
                    <span className="font-bold text-gray-800">
                      {stat.count}회
                    </span>
                    {stat.totalKm > 0 && (
                      <span className="text-gray-400 ml-2">
                        {stat.totalKm.toLocaleString()} km
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 운행 목록 */}
      {monthLogs.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3">
            운행 내역 ({monthLogs.length}건)
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500">
                  <th className="pb-2 pr-4">날짜</th>
                  <th className="pb-2 pr-4">차량</th>
                  <th className="pb-2 pr-4">운전자</th>
                  <th className="pb-2 pr-4">목적지</th>
                  <th className="pb-2 text-right">주행거리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {monthLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50 transition">
                    <td className="py-2 pr-4 text-gray-500 font-mono text-xs">
                      {format(new Date(l.start_at), "MM.dd")}
                    </td>
                    <td className="py-2 pr-4 font-medium text-gray-800">
                      {l.resources?.name}
                    </td>
                    <td className="py-2 pr-4 text-gray-600">{l.driver_name}</td>
                    <td className="py-2 pr-4 text-gray-600 max-w-[120px] truncate">
                      {l.destination}
                    </td>
                    <td className="py-2 text-right font-mono font-bold text-gray-800">
                      {l.start_mileage != null && l.end_mileage != null
                        ? `${(l.end_mileage - l.start_mileage).toLocaleString()} km`
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
