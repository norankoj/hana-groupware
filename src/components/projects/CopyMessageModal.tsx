"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import toast from "react-hot-toast";

export type CopyTemplate = {
  key: string;       // 'ko' | 'en' | 'driver' 등 식별자
  label: string;     // 탭 라벨 (예: "한국어", "English")
  body: string;      // 메시지 본문 (편집 가능)
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  templates: CopyTemplate[];
  /** 모달 상단 안내 문구 (선택) */
  hint?: string;
};

/**
 * 안내문/메시지 복사용 모달.
 * - 탭 별로 다른 템플릿(한국어/영어/봉사자용 등) 제공
 * - 모달을 닫기 전까지 사용자의 편집 내용을 유지
 * - "복사" 버튼으로 클립보드 복사 + 토스트 알림
 */
export default function CopyMessageModal({
  isOpen,
  onClose,
  title,
  templates,
  hint,
}: Props) {
  const [activeKey, setActiveKey] = useState(templates[0]?.key ?? "");
  // 사용자 편집 내용 보관 (탭 전환 시에도 유지)
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // 모달이 새로 열릴 때마다 초기화
  useEffect(() => {
    if (isOpen) {
      const next: Record<string, string> = {};
      templates.forEach((t) => (next[t.key] = t.body));
      setDrafts(next);
      setActiveKey(templates[0]?.key ?? "");
    }
  }, [isOpen, templates]);

  const current = templates.find((t) => t.key === activeKey) ?? templates[0];
  const currentBody = drafts[activeKey] ?? current?.body ?? "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(currentBody);
      toast.success("복사되었습니다 — 카카오톡/이메일에 붙여넣으세요");
    } catch {
      toast.error("복사 실패. 텍스트를 직접 선택해 복사해 주세요.");
    }
  };

  const reset = () => {
    setDrafts((d) => ({ ...d, [activeKey]: current?.body ?? "" }));
    toast("템플릿을 초기화했습니다.", { icon: "↺" });
  };

  if (!current) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} bodyClassName="p-0">
      <div className="flex flex-col h-full">
        {hint && (
          <div className="px-4 py-2 text-xs text-blue-700 bg-blue-50 border-b border-blue-100">
            {hint}
          </div>
        )}

        {/* 탭 */}
        {templates.length > 1 && (
          <div className="flex border-b border-gray-200 bg-gray-50 shrink-0 overflow-x-auto">
            {templates.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveKey(t.key)}
                className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition ${
                  activeKey === t.key
                    ? "text-blue-600 border-b-2 border-blue-600 bg-white"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* 본문 편집 */}
        <div className="flex-1 min-h-0 p-4 flex flex-col gap-3">
          <textarea
            value={currentBody}
            onChange={(e) =>
              setDrafts((d) => ({ ...d, [activeKey]: e.target.value }))
            }
            className="flex-1 min-h-[280px] w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg font-mono leading-relaxed resize-none focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            placeholder="메시지를 편집하고 복사 버튼을 누르세요"
          />
          <p className="text-xs text-gray-400">
            ※ 보내기 전에 내용을 자유롭게 수정할 수 있어요. 모달을 닫으면 편집 내용은 사라집니다.
          </p>
        </div>

        {/* 액션 */}
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-2 shrink-0">
          <button
            onClick={reset}
            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded hover:bg-gray-200 transition"
          >
            ↺ 템플릿 초기화
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              닫기
            </button>
            <button
              onClick={copy}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              복사하기
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
