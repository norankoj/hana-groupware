"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import type { CalendarEvent } from "@/components/dashboard/CalendarSection";
import { btnStyles } from "@/components/fund/shared";

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

  // 공용 버튼. 삭제는 옅은 빨강으로 왼쪽에 따로 두고, 닫기(중립) · 수정(주 동작) 순.
  // 예전엔 '닫기'가 파란 주 버튼이라 눈이 엉뚱한 곳으로 갔다.
  const footer = confirming ? (
    <div className="flex gap-2 w-full sm:w-auto sm:justify-end">
      <button
        onClick={() => setConfirming(false)}
        disabled={deleting}
        className={btnStyles.cancel}
      >
        취소
      </button>
      <button
        onClick={handleConfirmDelete}
        disabled={deleting}
        className={btnStyles.delete}
      >
        {deleting ? "삭제 중..." : "정말 삭제"}
      </button>
    </div>
  ) : canManage ? (
    <div className="flex gap-2 w-full">
      <button
        onClick={handleDeleteClick}
        className={`${btnStyles.dangerSoft} sm:mr-auto`}
      >
        삭제
      </button>
      <button onClick={onClose} className={btnStyles.cancel}>
        닫기
      </button>
      <button onClick={() => onEdit?.(event)} className={btnStyles.save}>
        수정
      </button>
    </div>
  ) : (
    <button onClick={onClose} className={btnStyles.cancel}>
      닫기
    </button>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={event.type === "schedule" ? "사역 일정 상세" : "휴가 상세"}
      size="sm"
      footer={footer}
    >
      <div className="space-y-5 pt-2">
        {confirming && (
          <div className="flex items-start gap-3 bg-danger-soft border border-danger/30 rounded-lg px-3 py-3">
            <span className="text-danger mt-0.5 shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </span>
            <p className="text-sm text-danger-active font-medium leading-relaxed">
              이 일정을 삭제하시겠습니까?<br />
              <span className="text-danger">삭제 후에는 복구할 수 없습니다.</span>
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 pb-4 border-b border-line-soft">
          <div>
            <h3 className="text-xl font-extrabold text-heading">{event.title}</h3>
            <p className="text-sm text-muted font-medium mt-1">
              {event.time_label}{event.location && ` · ${event.location}`}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <span className="text-sm font-bold text-gray-600 w-12 shrink-0 pt-0.5">등록자</span>
            <p className="text-sm text-gray-700">{event.profiles.full_name}</p>
          </div>

          {event.type === "vacation" && isApprover && event.reason && (
            <div className="flex items-start gap-4 border-t border-line-soft pt-4">
              <span className="text-sm font-bold text-gray-600 w-12 shrink-0 pt-0.5">사유</span>
              <p className="text-sm text-gray-700 leading-relaxed">{event.reason}</p>
            </div>
          )}

          {event.type === "schedule" && event.attendees && event.attendees.length > 0 && (
            <div className="flex items-start gap-4 border-t border-line-soft pt-4">
              <span className="text-sm font-bold text-gray-600 w-12 shrink-0 pt-0.5">동행자</span>
              <div className="flex flex-wrap gap-1.5">
                {event.attendees.map((a) => (
                  <span key={a.id} className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded-md">
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
