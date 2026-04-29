import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
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
  const [popover, setPopover] = useState<{
    log: VehicleLog;
    x: number;
    y: number;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // 스크롤 또는 모달 닫힐 때 팝오버 닫기
  useEffect(() => {
    if (!isHistoryModalOpen) setPopover(null);
  }, [isHistoryModalOpen]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !popover) return;
    const close = () => setPopover(null);
    el.addEventListener("scroll", close);
    return () => el.removeEventListener("scroll", close);
  }, [popover]);

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

        <div
          ref={scrollRef}
          className="max-h-[50vh] overflow-y-auto custom-scrollbar border-t border-gray-100 pt-2"
        >
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
                <tr
                  key={log.id}
                  className="hover:bg-blue-50/50 cursor-pointer transition"
                  onClick={(e) =>
                    setPopover({ log, x: e.clientX, y: e.clientY })
                  }
                >
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

        {/* 운행 기록 상세 팝오버 */}
        {popover &&
          typeof window !== "undefined" &&
          createPortal(
            <>
              {/* 외부 클릭 → 닫기 */}
              <div
                className="fixed inset-0"
                style={{ zIndex: 99998 }}
                onClick={() => setPopover(null)}
              />

              {/* 팝오버 카드 */}
              <div
                className="fixed bg-white rounded-2xl shadow-2xl w-[290px] overflow-hidden border border-gray-100"
                style={{
                  zIndex: 99999,
                  top: Math.max(
                    16,
                    Math.min(popover.y - 10, window.innerHeight - 370),
                  ),
                  left:
                    popover.x + 306 < window.innerWidth
                      ? popover.x + 8
                      : popover.x - 298,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  const log = popover.log;
                  const start = new Date(log.start_at);
                  const end = new Date(log.end_at);
                  const sameDay =
                    format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");
                  const distance =
                    log.end_mileage && log.start_mileage
                      ? log.end_mileage - log.start_mileage
                      : null;

                  const Row = ({
                    label,
                    children,
                  }: {
                    label: string;
                    children: React.ReactNode;
                  }) => (
                    <div className="flex items-start gap-3">
                      <span className="text-xs text-gray-400 w-[52px] shrink-0 pt-0.5">
                        {label}
                      </span>
                      <span className="text-sm text-gray-800 font-medium leading-snug flex-1 min-w-0">
                        {children}
                      </span>
                    </div>
                  );

                  return (
                    <>
                      {/* 헤더 */}
                      <div className="px-5 py-4 flex items-start justify-between gap-3 bg-orange-50">
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-orange-500">
                            {format(start, "MM.dd (EEE)", { locale: ko })}
                          </span>
                          <p className="text-base font-extrabold text-gray-900 mt-0.5 leading-snug">
                            {log.driver_name}
                          </p>
                          {log.department && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {log.department}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => setPopover(null)}
                          className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full hover:bg-black/10 transition text-gray-500"
                        >
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
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>

                      {/* 본문 */}
                      <div className="px-5 py-4 space-y-2.5">
                        <Row label="운행 시간">
                          {format(start, "HH:mm")} ~{" "}
                          {sameDay
                            ? format(end, "HH:mm")
                            : format(end, "MM.dd HH:mm")}
                        </Row>

                        <Row label="목적지">
                          <span className="truncate block">{log.destination}</span>
                        </Row>

                        <Row label="운행 목적">
                          <span className="line-clamp-2">{log.purpose}</span>
                        </Row>

                        <div className="border-t border-gray-100 pt-1" />

                        <Row label="주행 거리">
                          {distance != null ? (
                            <>
                              <span className="font-bold text-blue-600">
                                {distance.toLocaleString()} km
                              </span>
                              {log.start_mileage && log.end_mileage && (
                                <span className="text-xs text-gray-400 block mt-0.5">
                                  {log.start_mileage.toLocaleString()} →{" "}
                                  {log.end_mileage.toLocaleString()} km
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-400">미기록</span>
                          )}
                        </Row>
                      </div>
                    </>
                  );
                })()}
              </div>
            </>,
            document.body,
          )}
      </div>
    </Modal>
  );
}
