"use client";

import { useEffect, useState } from "react";
import { requestPushPermission, isIOS, isStandalone } from "./PushSubscriber";
import toast from "react-hot-toast";

type BannerState =
  | "ios-install"    // iOS Safari: 홈 화면에 추가 안내
  | "ios-permission" // iOS PWA: 알림 허용 버튼
  | "need-permission"// Android/기타: 알림 허용 버튼
  | "none";          // 숨김

const DISMISSED_KEY = "push_banner_dismissed";

export default function PushPromptBanner() {
  const [state, setState] = useState<BannerState>("none");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 이미 닫은 적 있으면 표시 안 함
    if (localStorage.getItem(DISMISSED_KEY)) return;
    // 알림 이미 허용됨
    if (typeof Notification !== "undefined" && Notification.permission === "granted") return;
    // 알림 완전 차단됨 (설정에서 해제해야)
    if (typeof Notification !== "undefined" && Notification.permission === "denied") return;

    const ios = isIOS();
    const standalone = isStandalone();
    const hasPushManager = "PushManager" in window;

    if (ios && !standalone) {
      // iOS Safari 브라우저: 홈 화면 추가 안내
      setState("ios-install");
    } else if (ios && standalone && hasPushManager) {
      // iOS PWA: 알림 허용 버튼
      setState("ios-permission");
    } else if (!ios && hasPushManager && Notification.permission === "default") {
      // Android/기타: 알림 허용 버튼
      setState("need-permission");
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setState("none");
  };

  const handleEnable = async () => {
    setLoading(true);
    const result = await requestPushPermission();
    setLoading(false);
    if (result === "granted") {
      toast.success("🔔 알림이 활성화되었습니다!");
      setState("none");
    } else if (result === "denied") {
      toast.error("알림이 차단되었습니다. 브라우저 설정에서 허용해주세요.");
      dismiss();
    } else {
      toast.error("알림 설정 중 오류가 발생했습니다.");
    }
  };

  if (state === "none") return null;

  return (
    <div className="fixed bottom-20 left-0 right-0 z-[9998] px-4 sm:px-0 sm:bottom-6 flex justify-center pointer-events-none">
      <div className="bg-gray-900 text-white rounded-2xl shadow-2xl px-4 py-3.5 flex items-center gap-3 max-w-sm w-full pointer-events-auto">
        {/* 아이콘 */}
        <div className="shrink-0 w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center">
          {state === "ios-install" ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          )}
        </div>

        {/* 텍스트 */}
        <div className="flex-1 min-w-0">
          {state === "ios-install" && (
            <>
              <p className="text-sm font-bold leading-tight">아이폰 알림 받는 방법</p>
              <p className="text-xs text-gray-300 mt-0.5 leading-snug">
                Safari 하단 공유 버튼 → <span className="font-bold text-white">홈 화면에 추가</span> → 앱 아이콘으로 열기
              </p>
            </>
          )}
          {(state === "ios-permission" || state === "need-permission") && (
            <>
              <p className="text-sm font-bold leading-tight">알림을 허용하시겠어요?</p>
              <p className="text-xs text-gray-300 mt-0.5">차량 예약 등 중요 알림을 받을 수 있어요</p>
            </>
          )}
        </div>

        {/* 버튼 */}
        <div className="shrink-0 flex gap-1.5 items-center">
          {(state === "ios-permission" || state === "need-permission") && (
            <button
              onClick={handleEnable}
              disabled={loading}
              className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition disabled:opacity-60 cursor-pointer"
            >
              {loading ? "..." : "허용"}
            </button>
          )}
          <button
            onClick={dismiss}
            className="text-gray-400 hover:text-white p-1 rounded transition cursor-pointer"
            aria-label="닫기"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
