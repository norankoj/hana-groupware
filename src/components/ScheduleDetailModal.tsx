"use client";

import { useState } from "react";
import Modal from "@/components/Modal";

type Attendee = { id: string; name: string };

type CalendarEvent = {
  id: string;
  original_id: number;
  type: "vacation" | "schedule";
  title: string;
  time_label: string;
  location?: string;
  attendees?: Attendee[];
  profiles: { full_name: string; position: string };
  user_id?: string;
};

type Profile = {
  id: string;
  role: string;
  position: string;
};

type ScheduleDetailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  event: CalendarEvent | null;
  profile?: Profile | null;
  onDelete?: (event: CalendarEvent) => Promise<void>;
};

export default function ScheduleDetailModal({
  isOpen,
  onClose,
  event,
  profile,
  onDelete,
}: ScheduleDetailModalProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!event) return null;

  const isAdmin = profile?.role === "admin" || profile?.role === "director";
  const isOwner = profile?.id === event.user_id;
  const canDelete = event.type === "schedule" && (isOwner || isAdmin);

  const handleDeleteClick = () => setConfirming(true);

  const handleConfirmDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    await onDelete(event);
    setDeleting(false);
    setConfirming(false);
  };

  const footer = (
    <div className="flex gap-2">
      {canDelete && !confirming && (
        <button
          onClick={handleDeleteClick}
          className="flex-1 bg-red-50 text-red-600 py-3 rounded-lg font-bold hover:bg-red-100 transition border border-red-100"
        >
          삭제
        </button>
      )}
      {confirming ? (
        <>
          <button
            onClick={() => setConfirming(false)}
            disabled={deleting}
            className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-200 transition"
          >
            취소
          </button>
          <button
            onClick={handleConfirmDelete}
            disabled={deleting}
            className="flex-1 bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 transition disabled:opacity-60"
          >
            {deleting ? "삭제 중..." : "삭제 확인"}
          </button>
        </>
      ) : (
        <button
          onClick={onClose}
          className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-lg font-bold hover:bg-gray-200 transition"
        >
          닫기
        </button>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={event.type === "schedule" ? "사역 일정 상세" : "휴가 상세"}
      footer={footer}
    >
      <div className="space-y-5 pt-2">
        {confirming && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 font-medium">
            이 일정을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.
          </div>
        )}

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
                    <div
                      key={a.id}
                      className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100"
                    >
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
