// src/components/fund/ConfirmModal.tsx
// 확인 · 사유 입력 공용 모달 (앱 공용 Modal 사용)
"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import toast from "react-hot-toast";
import { btnStyles, inputClass } from "./shared";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** 본문 설명 */
  children?: React.ReactNode;
  /** 값을 입력받을 때만 지정 — 없으면 단순 확인 모달 */
  inputLabel?: string;
  inputPlaceholder?: string;
  multiline?: boolean;
  confirmText?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: (value: string) => void;
};

export default function ConfirmModal({
  isOpen,
  onClose,
  title,
  children,
  inputLabel,
  inputPlaceholder,
  multiline = false,
  confirmText = "확인",
  danger = false,
  busy = false,
  onConfirm,
}: Props) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (isOpen) setValue("");
  }, [isOpen]);

  const handleConfirm = () => {
    if (inputLabel && !value.trim()) {
      return toast.error(`${inputLabel}을(를) 입력해주세요.`);
    }
    onConfirm(value.trim());
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className={btnStyles.cancel}>
            닫기
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className={danger ? btnStyles.delete : btnStyles.save}
          >
            {busy ? "처리 중..." : confirmText}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {children}
        {inputLabel && (
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">
              {inputLabel}
            </label>
            {multiline ? (
              <textarea
                autoFocus
                rows={3}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={inputPlaceholder}
                className={`${inputClass} resize-none`}
              />
            ) : (
              <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={inputPlaceholder}
                className={inputClass}
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** 모달 본문에서 쓰는 라벨-값 줄 */
export const ConfirmRow = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex gap-4 text-[15px] leading-relaxed">
    <span className="w-24 shrink-0 text-sm font-bold text-gray-500 pt-0.5">
      {label}
    </span>
    <span className="flex-1 text-gray-900 break-words">{value}</span>
  </div>
);
