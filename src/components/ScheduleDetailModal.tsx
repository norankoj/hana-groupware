"use client";

import Modal from "@/components/Modal";

type Attendee = { id: string; name: string };

type CalendarEvent = {
  id: string;
  type: "vacation" | "schedule";
  title: string;
  time_label: string;
  location?: string;
  attendees?: Attendee[];
  profiles: { full_name: string; position: string };
};

type ScheduleDetailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  event: CalendarEvent | null;
};

export default function ScheduleDetailModal({
  isOpen,
  onClose,
  event,
}: ScheduleDetailModalProps) {
  if (!event) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={event.type === "schedule" ? "사역 일정 상세" : "휴가 상세"}
      footer={
        <button
          onClick={onClose}
          className="w-full bg-gray-100 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-200 transition"
        >
          닫기
        </button>
      }
    >
      <div className="space-y-5 pt-2">
        <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
          <div>
            <h3 className="text-xl font-extrabold text-gray-900">
              {event.title}
            </h3>
            <p className="text-sm text-gray-500 font-medium mt-1">
              {event.time_label} {event.location && `· ${event.location}`}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <span className="text-sm font-bold text-gray-600 w-12 shrink-0 pt-0.5">
              등록자
            </span>
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
              <span className="text-sm font-bold text-gray-900">
                {event.profiles.full_name}
              </span>
            </div>
          </div>

          {event.type === "schedule" &&
            event.attendees &&
            event.attendees.length > 0 && (
              <div className="flex items-start gap-4 border-t border-gray-100 pt-4">
                <span className="text-sm font-bold text-gray-600 w-12 shrink-0 pt-2">
                  동행자
                </span>
                <div className="flex flex-wrap gap-2">
                  {event.attendees.map((a) => (
                    <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                      <span className="text-sm font-bold text-gray-700 pr-1">
                        {a.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      </div>
    </Modal>
  );
}
