"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({
  isOpen,
  onClose,
}: ChangePasswordModalProps) {
  const supabase = createClient();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [isOpen]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6)
      return toast.error("새 비밀번호는 6자리 이상이어야 합니다.");
    if (newPassword !== confirmPassword)
      return toast.error("새 비밀번호가 일치하지 않습니다.");

    setLoading(true);
    try {
      // 현재 비밀번호 확인
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("사용자 정보를 찾을 수 없습니다.");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) {
        toast.error("현재 비밀번호가 올바르지 않습니다.");
        return;
      }

      // 새 비밀번호로 변경
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast.success("비밀번호가 변경되었습니다!");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "비밀번호 변경 실패");
    } finally {
      setLoading(false);
    }
  };

  const labelStyle = "block text-sm font-bold text-gray-700 mb-2";
  const inputStyle = `w-full px-4 py-3.5 rounded-xl text-base transition-all outline-none bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200`;

  const ModalContent = (
    <div className="space-y-6 pt-12 md:pt-2">
      <div className="text-center px-2 mb-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-50 mb-4">
          <span className="text-2xl">🔑</span>
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">비밀번호 변경</h3>
        <p className="text-sm text-gray-500 leading-relaxed">
          현재 비밀번호를 확인 후 새 비밀번호로 변경합니다.
        </p>
      </div>

      <form
        onSubmit={handleChangePassword}
        className="space-y-4 bg-gray-50/50 border border-gray-100 p-5 sm:p-6 rounded-2xl"
      >
        <div>
          <label className={labelStyle}>현재 비밀번호</label>
          <input
            type="password"
            className={inputStyle}
            style={{ colorScheme: "light" }}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="현재 비밀번호 입력"
            required
          />
        </div>
        <div>
          <label className={labelStyle}>새 비밀번호</label>
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
          <label className={labelStyle}>새 비밀번호 확인</label>
          <input
            type="password"
            className={inputStyle}
            style={{ colorScheme: "light" }}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="새 비밀번호 다시 입력"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading || !currentPassword || !newPassword || !confirmPassword}
          className="w-full py-4 bg-blue-600 text-white font-bold text-lg rounded-xl hover:bg-blue-700 transition shadow-lg mt-2 disabled:bg-gray-300"
        >
          {loading ? "변경 중..." : "비밀번호 변경"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 text-gray-400 font-medium hover:text-gray-600 transition text-sm"
        >
          취소
        </button>
      </form>
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

      {/* PC 뷰 */}
      <div className="hidden md:block">
        <Modal isOpen={isOpen} onClose={onClose} title="비밀번호 변경">
          {ModalContent}
        </Modal>
      </div>

      {/* 모바일 뷰 */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-[9999] bg-white flex flex-col animate-slideInRight overflow-hidden">
          <div className="bg-white px-5 py-5 flex items-center justify-between border-b border-gray-200 shrink-0 sticky top-0 z-10 shadow-sm">
            <h2 className="text-xl font-extrabold text-gray-900">비밀번호 변경</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition"
            >
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 sm:p-7 bg-white">
            {ModalContent}
          </div>
        </div>
      )}
    </>
  );
}
