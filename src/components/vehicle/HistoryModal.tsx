import { format } from "date-fns";
import Modal from "@/components/Modal";
import { useState } from "react";
import toast from "react-hot-toast";
import { showConfirm } from "@/utils/alert";

type Vehicle = {
  id: number;
  name: string;
  description: string;
};

type VehicleLog = {
  id: number;
  resource_id: number;
  user_id: string;
  start_at: string;
  end_at: string;
  purpose: string;
  destination: string;
  driver_name: string;
  department?: string;
  start_mileage?: number;
  end_mileage?: number;
  vehicle_status: "reserved" | "in_use" | "returned";
  checkin_photo_url?: string;
  checkout_photo_url?: string;
  cleanup_status?: boolean;
  parking_location?: string;
  vehicle_condition?: string;
  profiles?: { full_name: string; position: string };
  resources?: { name: string; description: string };
};

export default function HistoryModal({
  isHistoryModalOpen,
  setIsHistoryModalOpen,
  selectedVehicleHistory,
  logs,
}: {
  isHistoryModalOpen: boolean;
  setIsHistoryModalOpen: (open: boolean) => void;
  selectedVehicleHistory: Vehicle | null;
  logs: VehicleLog[];
}) {
  return (
    <Modal
      isOpen={isHistoryModalOpen}
      onClose={() => setIsHistoryModalOpen(false)}
      title={`${selectedVehicleHistory?.name} 운행 기록`}
      footer={
        <button
          onClick={() => setIsHistoryModalOpen(false)}
          className="w-full bg-slate-100 py-3 rounded-lg font-bold text-slate-600"
        >
          닫기
        </button>
      }
    >
      <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-gray-500">일자</th>
              <th className="px-3 py-2 text-gray-500">운전자</th>
              <th className="px-3 py-2 text-gray-500">목적지</th>
              <th className="px-3 py-2 text-right text-gray-500">거리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs
              .filter(
                (log) =>
                  log.resource_id === selectedVehicleHistory?.id &&
                  log.vehicle_status === "returned", // 반납 완료된 기록만
              )
              .map((log) => (
                <tr key={log.id}>
                  <td className="px-3 py-2 text-gray-600">
                    {format(new Date(log.start_at), "MM.dd")}
                  </td>
                  <td className="px-3 py-2 font-bold text-gray-800">
                    {log.driver_name}
                  </td>
                  <td className="px-3 py-2 text-gray-600 truncate max-w-[100px]">
                    {log.destination}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-blue-600">
                    {log.end_mileage && log.start_mileage
                      ? `${(log.end_mileage - log.start_mileage).toLocaleString()}km`
                      : "-"}
                  </td>
                </tr>
              ))}
            {logs.filter(
              (l) =>
                l.resource_id === selectedVehicleHistory?.id &&
                l.vehicle_status === "returned",
            ).length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-4 text-gray-400">
                  운행 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
