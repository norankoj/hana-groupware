import { format } from "date-fns";
import Modal from "@/components/Modal";

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
  vehicle_status: "reserved" | "in_use" | "returned" | "noshow";
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
  // 해당 차량의 로그만 필터링 + 반납완료 된 것
  const vehicleLogs = logs.filter(
    (log) =>
      log.resource_id === selectedVehicleHistory?.id &&
      log.vehicle_status === "returned",
  );

  // 가장 최근 반납 운전자 (logs는 이미 최신순 정렬되어 있다고 가정)
  const lastDriver = vehicleLogs.length > 0 ? vehicleLogs[0] : null;

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
      <div className="space-y-4">
        {/* [Point 4] 전 운전자 확인 카드 */}
        {lastDriver ? (
          <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-orange-600 uppercase mb-1">
                최근 운전자
              </p>
              <h3 className="text-lg font-bold text-gray-800">
                {lastDriver.driver_name}{" "}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {format(new Date(lastDriver.end_at), "yyyy.MM.dd HH:mm")}{" "}
                반납완료
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-orange-600">
                {(lastDriver.end_mileage || 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-400">km</p>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 p-4 rounded-xl text-center text-sm text-gray-400">
            아직 반납된 운행 기록이 없습니다.
          </div>
        )}

        <div className="max-h-[50vh] overflow-y-auto custom-scrollbar border-t border-gray-100 pt-2">
          <table className="w-full text-sm text-left">
            <thead className="bg-white sticky top-0 border-b border-gray-200">
              <tr>
                <th className="px-2 py-2 text-gray-400 font-medium">일자</th>
                <th className="px-2 py-2 text-gray-400 font-medium">운전자</th>
                <th className="px-2 py-2 text-gray-400 font-medium">목적지</th>
                <th className="px-2 py-2 text-right text-gray-400 font-medium">
                  주행거리
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vehicleLogs.map((log) => (
                <tr key={log.id}>
                  <td className="px-2 py-3 text-gray-600">
                    {format(new Date(log.start_at), "MM.dd")}
                  </td>
                  <td className="px-2 py-3 font-bold text-gray-800">
                    {log.driver_name}
                  </td>
                  <td className="px-2 py-3 text-gray-600 truncate max-w-[80px]">
                    {log.destination}
                  </td>
                  <td className="px-2 py-3 text-right font-mono text-blue-600">
                    {log.end_mileage && log.start_mileage
                      ? `${(log.end_mileage - log.start_mileage).toLocaleString()}km`
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
