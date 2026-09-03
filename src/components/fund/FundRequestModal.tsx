// src/components/fund/FundRequestModal.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import { AmountField } from "./FundFields";
import {
  BANK_OPTIONS,
  FUND_USAGE_ALLOWED,
  FUND_USAGE_DENIED,
  btnStyles,
  formatWon,
  inputClass,
  parseAmount,
  selectClass,
  type FundUser,
} from "./shared";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  user: FundUser;
  balance: number;
  onSubmitted: () => void;
};

// /api/upload 가 받아주는 형식과 맞춘다
const PROOF_ACCEPT =
  "image/*,application/pdf,.xlsx,.xls,.docx,.doc,.zip";

const EMPTY_FORM = {
  amount: "",
  purpose: "",
  bank_name: "",
  account_no: "",
  account_holder: "",
};

export default function FundRequestModal({
  isOpen,
  onClose,
  user,
  balance,
  onSubmitted,
}: Props) {
  const supabase = createClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setForm({ ...EMPTY_FORM, account_holder: user.full_name });
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [isOpen, user.full_name]);

  const amount = parseAmount(form.amount) ?? 0;
  const over = amount > balance;

  const handleSubmit = async () => {
    if (amount <= 0) return toast.error("금액을 입력해주세요.");
    if (over)
      return toast.error(
        `잔액(${formatWon(balance)}원)을 넘는 금액은 신청할 수 없습니다.`,
      );
    if (!form.purpose.trim()) return toast.error("요청내역을 입력해주세요.");
    if (!form.bank_name.trim() || !form.account_no.trim())
      return toast.error("받을 계좌를 입력해주세요.");

    setSaving(true);
    try {
      // 증빙자료 업로드 (선택, 여러 개) — 교회 NAS private 버킷의 fund/{user_id}/ 아래
      const proofFiles: { url: string; name: string }[] = [];
      for (const f of files) {
        const formData = new FormData();
        formData.append("file", f);
        formData.append("bucket", "private");
        formData.append("folder", `fund/${user.id}`);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (!res.ok)
          throw new Error(`${f.name} — ${json?.error ?? "업로드 실패"}`);
        proofFiles.push({ url: json.objectName, name: f.name });
      }

      const { error } = await supabase.from("fund_requests").insert({
        user_id: user.id,
        amount,
        purpose: form.purpose.trim(),
        bank_name: form.bank_name.trim(),
        account_no: form.account_no.trim(),
        account_holder: form.account_holder.trim() || null,
        proof_files: proofFiles,
        status: "pending",
      });
      if (error) throw error;

      toast.success("펀드 신청이 접수되었습니다.");
      onSubmitted();
    } catch (e: any) {
      toast.error("신청 실패: " + (e?.message ?? "알 수 없는 오류"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="펀드 사용 신청"
      footer={
        <div className="flex gap-2 w-full sm:w-auto sm:justify-end">
          <button onClick={onClose} className={btnStyles.cancel}>
            닫기
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className={btnStyles.save}
          >
            {saving ? "접수 중..." : "신청하기"}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* 잔액 안내 */}
        <div className="flex items-baseline justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <span className="text-sm font-medium text-gray-600">신청 가능 금액</span>
          <span className="text-lg font-bold text-gray-900 tabular-nums">
            {formatWon(balance)}원
          </span>
        </div>

        <Field label="금액" required>
          <AmountField
            value={form.amount}
            onChange={(v) => setForm({ ...form, amount: v })}
            placeholder="1,250,000"
          />
          {amount > 0 && (
            <p
              className={`mt-1.5 text-sm ${over ? "text-red-600 font-medium" : "text-gray-500"}`}
            >
              {over
                ? `잔액을 ${formatWon(amount - balance)}원 초과했습니다.`
                : `${formatWon(amount)}원`}
            </p>
          )}
        </Field>

        <Field label="요청내역" required>
          <textarea
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            rows={2}
            placeholder="예) 이집트·모로코 1진 비전트립 항공권"
            className={`${inputClass} resize-none`}
          />
          <p className="mt-1.5 text-sm text-gray-500">
            배우자·자녀가 사용하는 경우 여기에 함께 적어주세요.
          </p>
        </Field>

        <Field label="받을 계좌" required>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Select
              value={form.bank_name}
              onChange={(v) => setForm({ ...form, bank_name: v })}
              options={BANK_OPTIONS}
              placeholder="은행 선택"
              className={selectClass}
            />
            <input
              inputMode="numeric"
              value={form.account_no}
              onChange={(e) =>
                setForm({
                  ...form,
                  account_no: e.target.value.replace(/[^\d-]/g, ""),
                })
              }
              placeholder="계좌번호 (숫자, - 만)"
              className={`sm:col-span-2 ${inputClass}`}
            />
          </div>
          <input
            value={form.account_holder}
            onChange={(e) =>
              setForm({ ...form, account_holder: e.target.value })
            }
            placeholder="예금주"
            className={`mt-2 ${inputClass}`}
          />
        </Field>

        <Field label="증빙자료">
          <input
            ref={fileInputRef}
            type="file"
            accept={PROOF_ACCEPT}
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:text-xs file:font-bold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 file:cursor-pointer"
          />
          <p className="mt-1.5 text-sm text-gray-500">
            영수증·견적서 등 (선택). 여러 개 고를 수 있습니다. 사진·PDF·엑셀·워드,
            개당 10MB 이하.
          </p>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 text-sm bg-gray-50 border border-gray-200 rounded px-3 py-1.5"
                >
                  <span className="truncate text-gray-700">{f.name}</span>
                  <span className="shrink-0 text-xs text-gray-400 tabular-nums">
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Field>

        {/* 운영규정 안내 */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 text-base font-bold text-gray-800">
            해외사역매칭펀드 사용 안내
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-sm font-bold text-emerald-700 mb-1.5">
                사용 가능
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed text-gray-700">
                {FUND_USAGE_ALLOWED.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-bold text-red-600 mb-1.5">사용 불가</p>
              <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed text-gray-700">
                {FUND_USAGE_DENIED.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

const Field = ({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <div>
    <label className="block text-sm font-bold text-gray-700 mb-1.5">
      {label}
      {required && <span className="ml-1 text-red-500">*</span>}
    </label>
    {children}
  </div>
);
