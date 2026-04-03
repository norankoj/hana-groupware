"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Modal from "@/components/Modal"; // 기존 프로젝트에 있는 Modal 컴포넌트

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({
  isOpen,
  onClose,
}: ChangePasswordModalProps) {
  const supabase = createClient();

  // --- 상태 관리 ---
  const [phone, setPhone] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [timeLeft, setTimeLeft] = useState(180);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isVerificationStarted, setIsVerificationStarted] = useState(false);
  const [loading, setLoading] = useState(false);

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      setPhone("");
      setIsVerificationStarted(false);
      setVerifyCode("");
      setIsCodeSent(false);
      setIsVerified(false);
      setTimeLeft(180);
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [isOpen]);

  // 타이머 로직
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isCodeSent && !isVerified && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isCodeSent, isVerified, timeLeft]);

  // --- 함수들 ---
  const handleSendCode = async () => {
    if (!phone || phone.length < 10)
      return toast.error("휴대폰 번호를 정확히 입력해주세요.");
    const cleanPhone = phone.replace(/-/g, "");

    setLoading(true);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone, purpose: "change-password" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "발송 실패");

      toast.success("인증번호가 발송되었습니다.");
      setIsCodeSent(true);
      setTimeLeft(180);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verifyCode) return toast.error("인증번호를 입력해주세요.");
    const cleanPhone = phone.replace(/-/g, "");

    setLoading(true);
    try {
      const res = await fetch("/api/sms/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone, code: verifyCode }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "인증 실패");

      toast.success("본인인증 성공!");
      setIsVerified(true);
      setIsCodeSent(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isVerified) return toast.error("먼저 본인인증을 완료해주세요.");
    if (newPassword.length < 6)
      return toast.error("비밀번호는 6자리 이상이어야 합니다.");
    if (newPassword !== confirmPassword)
      return toast.error("비밀번호가 일치하지 않습니다.");

    setLoading(true);
    // 로그인된 상태이므로 updateUser를 사용해 비밀번호를 덮어씌웁니다.
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      toast.error("비밀번호 변경 실패: " + error.message);
    } else {
      toast.success("비밀번호가 성공적으로 변경되었습니다! 🎉");
      onClose(); // 성공 시 모달 닫기
    }
    setLoading(false);
  };

  // --- 헬퍼 및 스타일 ---
  const formatPhone = (val: string) => {
    const raw = val.replace(/[^0-9]/g, "");
    if (raw.length < 4) return raw;
    if (raw.length < 8) return `${raw.slice(0, 3)}-${raw.slice(3)}`;
    return `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 11)}`;
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const labelStyle = "block text-sm font-bold text-gray-700 mb-2";
  const inputStyle = `w-full px-4 py-3.5 rounded-xl text-base transition-all outline-none bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200`;

  // --- 렌더링될 내용 (PC/모바일 공통) ---
  const ModalContent = (
    <div className="space-y-6 pt-12 md:pt-2">
      <div className="text-center px-2 mb-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-50 mb-4">
          {isVerified ? (
            <span className="text-2xl">🔑</span>
          ) : (
            <span className="text-2xl">📱</span>
          )}
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          {isVerified ? "새 비밀번호 설정" : "본인인증을 진행해 주세요"}
        </h3>
        <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">
          {isVerified
            ? "새롭게 사용할 안전한 비밀번호를 입력해 주세요."
            : "안전한 비밀번호 변경을 위해 가입 시 등록한\n휴대폰 번호로 본인 확인을 진행합니다."}
        </p>
      </div>

      {!isVerified ? (
        // --- 1. 본인인증 전 ---
        !isVerificationStarted ? (
          <div className="animate-fadeIn flex flex-col items-center py-4">
            <button
              type="button"
              onClick={() => setIsVerificationStarted(true)}
              className="w-full sm:w-3/4 py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 transition shadow-md active:scale-[0.98]"
            >
              휴대폰 번호로 본인인증
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 text-sm font-medium text-gray-400 hover:text-gray-600 transition"
            >
              다음에 변경하기
            </button>
          </div>
        ) : (
          <div className="animate-fadeIn space-y-5 bg-gray-50/50 border border-gray-100 p-5 sm:p-6 rounded-2xl relative">
            <button
              type="button"
              onClick={() => setIsVerificationStarted(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            </button>

            <div className="pt-2">
              <label className={labelStyle}>등록된 휴대폰 번호</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputStyle}
                  style={{ colorScheme: "light" }}
                  value={phone}
                  placeholder="010-1234-5678"
                  maxLength={13}
                  disabled={isCodeSent}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                />
                {!isCodeSent ? (
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={loading || phone.length < 12}
                    className="px-5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 whitespace-nowrap shadow-sm transition-colors"
                  >
                    인증요청
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCodeSent(false);
                      setVerifyCode("");
                    }}
                    className="px-5 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 whitespace-nowrap"
                  >
                    재입력
                  </button>
                )}
              </div>
            </div>

            {isCodeSent && (
              <div className="animate-slideDown space-y-3">
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`${inputStyle} pr-24 tracking-widest font-bold text-lg`}
                    style={{ colorScheme: "light" }}
                    value={verifyCode}
                    placeholder="인증번호 6자리"
                    maxLength={6}
                    onChange={(e) =>
                      setVerifyCode(e.target.value.replace(/[^0-9]/g, ""))
                    }
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                    <span className="text-red-500 font-bold font-mono text-sm">
                      {formatTime(timeLeft)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleVerifyCode}
                  disabled={loading || verifyCode.length < 6}
                  className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 shadow-sm transition-colors"
                >
                  인증번호 확인
                </button>
              </div>
            )}
          </div>
        )
      ) : (
        // --- 3. 인증 완료 후 (새 비밀번호 폼) ---
        <form
          onSubmit={handleChangePassword}
          className="space-y-5 animate-fadeIn bg-gray-50/50 border border-gray-100 p-5 sm:p-6 rounded-2xl"
        >
          <div>
            <label className={labelStyle}>새로운 비밀번호</label>
            <input
              type="password"
              className={inputStyle}
              style={{ colorScheme: "light" }}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="6자리 이상 입력"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className={labelStyle}>새로운 비밀번호 확인</label>
            <input
              type="password"
              className={inputStyle}
              style={{ colorScheme: "light" }}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호 다시 입력"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || !newPassword || !confirmPassword}
            className="w-full py-4 bg-blue-600 text-white font-bold text-lg rounded-xl hover:bg-blue-700 transition shadow-lg mt-4 disabled:bg-gray-300"
          >
            {loading ? "변경 중..." : "비밀번호 변경 완료"}
          </button>
        </form>
      )}
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slideInRight {
          animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* --- PC 뷰 (일반 모달) --- */}
      <div className="hidden md:block">
        <Modal isOpen={isOpen} onClose={onClose} title="비밀번호 변경">
          {ModalContent}
        </Modal>
      </div>

      {/* --- 모바일 뷰 (새 페이지로 이동하는 것처럼 렌더링) --- */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-[9999] bg-white flex flex-col animate-slideInRight overflow-hidden">
          {/* 모바일 헤더 */}
          <div className="bg-white px-5 py-5 flex items-center justify-between border-b border-gray-200 shrink-0 sticky top-0 z-10 shadow-sm">
            <h2 className="text-xl font-extrabold text-gray-900">
              비밀번호 변경
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition"
            >
              <svg
                className="w-7 h-7"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* 모바일 콘텐츠 영역 */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-7 bg-white">
            {ModalContent}
          </div>
        </div>
      )}
    </>
  );
}
