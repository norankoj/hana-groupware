"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import type { CalendarEvent } from "@/components/dashboard/CalendarSection";

type Profile = {
  id: string;
  role: string;
  position: string;
  is_approver?: boolean;
};

type ScheduleDetailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  event: CalendarEvent | null;
  profile?: Profile | null;
  onDelete?: (event: CalendarEvent) => Promise<void>;
  onEdit?: (event: CalendarEvent) => void;
};

export default function ScheduleDetailModal({
  isOpen,
  onClose,
  event,
  profile,
  onDelete,
  onEdit,
}: ScheduleDetailModalProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!event) return null;

  const isAdmin = profile?.role === "admin" || profile?.role === "director" || profile?.role === "pastor";
  const isApprover = profile?.is_approver === true || isAdmin;
  const isOwner = profile?.id === event.user_id;
  const canManage = event.type === "schedule" && (isOwner || isAdmin);

  const handleDeleteClick = () => setConfirming(true);

  const handleConfirmDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    await onDelete(event);
    setDeleting(false);
    setConfirming(false);
  };

  const footer = confirming ? (
    <div className="flex gap-2 w-full">
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
        className="flex-1 bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 transition disabled:opacity-60 shadow-sm"
      >
        {deleting ? "삭제 중..." : "정말 삭제"}
      </button>
    </div>
  ) : (
    <div className="flex gap-2 w-full">
      {canManage && (
        <>
          {/* 수정 버튼 */}
          <button
            onClick={() => onEdit?.(event)}
            className="flex-1 bg-blue-50 text-blue-600 py-3 rounded-lg font-bold hover:bg-blue-100 transition border border-blue-100"
          >
            수정
          </button>
          {/* 삭제 버튼 */}
          <button
            onClick={handleDeleteClick}
            className="flex-1 bg-gray-100 text-red-500 py-3 rounded-lg font-bold hover:bg-red-50 transition"
          >
            삭제
          </button>
        </>
      )}
      <button
        onClick={onClose}
        className={`py-3 rounded-lg font-bold hover:bg-blue-700 transition shadow-sm bg-blue-600 text-white ${canManage ? "flex-1" : "flex-1"}`}
      >
        닫기
      </button>
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
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3.5">
            <span className="text-red-500 mt-0.5 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </span>
            <p className="text-sm text-red-700 font-medium leading-relaxed">
              이 일정을 삭제하시겠습니까?<br />
              <span className="text-red-500">삭제 후에는 복구할 수 없습니다.</span>
            </p>
          </div>
        )}

        <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
          <div>
            <h3 className="text-xl font-extrabold text-gray-900">{event.title}</h3>
            <p className="text-sm text-gray-500 font-medium mt-1">
              {event.time_label} {event.location && `· ${event.location}`}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <span className="text-sm font-bold text-gray-600 w-12 shrink-0 pt-0.5">등록자</span>
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
              <span className="text-sm font-bold text-gray-900">{event.profiles.full_name}</span>
            </div>
          </div>

          {/* 휴가 사유 — 결재권한자만 표시 */}
          {event.type === "vacation" && isApprover && event.reason && (
            <div className="flex items-start gap-4 border-t border-gray-100 pt-4">
              <span className="text-sm font-bold text-gray-600 w-12 shrink-0 pt-0.5">사유</span>
              <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 px-3 py-2 rounded-lg border border-gray-100 flex-1">
                {event.reason}
              </p>
            </div>
          )}

          {event.type === "schedule" &&
            event.attendees &&
            event.attendees.length > 0 && (
              <div className="flex items-start gap-4 border-t border-gray-100 pt-4">
                <span className="text-sm font-bold text-gray-600 w-12 shrink-0 pt-2">동행자</span>
                <div className="flex flex-wrap gap-2">
                  {event.attendees.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100"
                    >
                      <span className="text-sm font-bold text-gray-700 pr-1">{a.name}</span>
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
