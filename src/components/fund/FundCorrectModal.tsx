// src/components/fund/FundCorrectModal.tsx
// 원장 정정 — 취소만 하거나, 올바른 금액으로 고치거나
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import { ConfirmRow } from "./ConfirmModal";
import { AmountField } from "./FundFields";
import {
  ENTRY_TYPE_LABEL,
  btnStyles,
  formatWon,
  inputClass,
  parseAmount,
  type FundLedger,
} from "./shared";

type Props = {
  target: FundLedger | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string, newAmount: number | null) => void;
};

export default function FundCorrectModal({
  target,
  busy,
  onClose,
  onConfirm,
}: Props) {
  const [mode, setMode] = useState<"cancel" | "fix">("cancel");
  const [reason, setReason] = useState("");
  const [newAmount, setNewAmount] = useState("");

  useEffect(() => {
    if (target) {
      setMode("cancel");
      setReason("");
      setNewAmount("");
    }
  }, [target]);

  const parsed = parseAmount(newAmount);

  const handleConfirm = () => {
    if (!reason.trim()) return toast.error("정정 사유를 입력해주세요.");
    if (mode === "fix") {
      if (!parsed || parsed <= 0)
        return toast.error("올바른 금액을 입력해주세요.");
      if (target && parsed === target.amount)
        return toast.error("원래 금액과 같습니다.");
    }
    onConfirm(reason.trim(), mode === "fix" ? parsed : null);
  };

  return (
    <Modal
      isOpen={!!target}
      onClose={onClose}
      title="내역 정정"
      footer={
        <>
          <button onClick={onClose} className={btnStyles.cancel}>
            닫기
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className={btnStyles.delete}
          >
            {busy ? "처리 중..." : mode === "fix" ? "금액 고치기" : "취소 처리"}
          </button>
        </>
      }
    >
      {target && (
        <div className="space-y-5">
          {/* 원래 내역 */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-2 bg-gray-50/60">
            <p className="text-sm font-bold text-gray-700 mb-1">원래 내역</p>
            <ConfirmRow
              label="사역자"
              value={target.profiles?.full_name ?? "-"}
            />
            <ConfirmRow
              label="구분"
              value={ENTRY_TYPE_LABEL[target.entry_type]}
            />
            <ConfirmRow
              label="금액"
              value={
                <b className="tabular-nums">{formatWon(target.amount)}원</b>
              }
            />
            <ConfirmRow label="내용" value={target.description || "-"} />
            <ConfirmRow label="일자" value={target.entry_date} />
          </div>

          {/* 어떻게 정정할지 */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">정정 방법</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <ModeButton
                active={mode === "cancel"}
                onClick={() => setMode("cancel")}
                title="이 내역 취소"
                desc="잘못 넣은 줄을 없던 일로 만듭니다"
              />
              <ModeButton
                active={mode === "fix"}
                onClick={() => setMode("fix")}
                title="금액 고치기"
                desc="취소하고 올바른 금액으로 다시 넣습니다"
              />
            </div>
          </div>

          {mode === "fix" && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                올바른 금액
              </label>
              <AmountField
                value={newAmount}
                onChange={setNewAmount}
                placeholder={formatWon(target.amount)}
              />
              {parsed !== null && parsed > 0 && (
                <p className="mt-1.5 text-sm text-gray-600">
                  {formatWon(target.amount)}원 →{" "}
                  <b className="text-gray-900">{formatWon(parsed)}원</b>{" "}
                  <span
                    className={
                      parsed > target.amount ? "text-blue-600" : "text-red-600"
                    }
                  >
                    ({parsed > target.amount ? "+" : "−"}
                    {formatWon(Math.abs(parsed - target.amount))})
                  </span>
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">
              정정 사유
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예) 금액 오기입"
              className={inputClass}
            />
          </div>

          <p className="text-sm leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            통장처럼 기록은 지우지 않습니다.
            {mode === "fix" ? (
              <>
                {" "}
                원래 줄을 상쇄하는 <b>−{formatWon(target.amount)}원</b> 줄과,
                {parsed ? (
                  <>
                    {" "}
                    올바른 <b>{formatWon(parsed)}원</b> 줄이
                  </>
                ) : (
                  " 올바른 금액 줄이"
                )}{" "}
                함께 추가됩니다.
              </>
            ) : (
              <>
                {" "}
                원래 줄을 상쇄하는 <b>−{formatWon(target.amount)}원</b> 줄이
                추가되어 합계에서 빠집니다.
              </>
            )}
          </p>
        </div>
      )}
    </Modal>
  );
}

const ModeButton = ({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex-1 text-left border rounded-lg px-4 py-3 transition cursor-pointer ${
      active
        ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
        : "border-gray-200 hover:bg-gray-50"
    }`}
  >
    <span className="block text-sm font-bold text-gray-800">{title}</span>
    <span className="block mt-0.5 text-xs text-gray-500">{desc}</span>
  </button>
);
