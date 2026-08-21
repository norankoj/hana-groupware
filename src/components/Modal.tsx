"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  size?: "sm" | "md";
};

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className = "",
  bodyClassName = "",
  size = "md",
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const isSm = size === "sm";

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <div className={`bg-white w-full overflow-hidden flex flex-col border-0 sm:border border-gray-200 rounded-t-2xl sm:rounded-t-sm ${
        isSm
          ? "sm:rounded-sm sm:max-w-[400px] h-auto sm:h-auto sm:max-h-[90vh]"
          : "sm:rounded-sm sm:max-w-[600px] h-[92dvh] sm:h-auto sm:max-h-[90vh]"
      } ${className}`}>
        <div className={`border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0 ${isSm ? "px-4 py-3" : "px-6 py-4"}`}>
          <h2 className={`font-bold text-gray-900 tracking-tight ${isSm ? "text-base" : "text-lg"}`}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded hover:bg-gray-200 bg-transparent"
            style={{ padding: isSm ? "2px" : "4px" }}
          >
            <svg
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              style={{ width: isSm ? "16px" : "20px", height: isSm ? "16px" : "20px" }}
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
        <div className={`flex-1 min-h-0 overflow-y-auto ${bodyClassName || (isSm ? "p-4" : "p-6")}`}>{children}</div>

        {/* 푸터 */}
        {footer && (
          <div className={`border-t border-gray-200 bg-gray-50/50 flex justify-end gap-3 shrink-0 ${isSm ? "px-4 py-3" : "px-6 py-4"}`}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
