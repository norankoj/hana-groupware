"use client";
import { useState, useEffect } from "react";

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 1. 이미 앱으로 설치되어 있는지 확인 (표준 + 아이폰 전용 속성 동시 체크)
    const isStandalone = window.matchMedia(
      "(display-mode: standalone)",
    ).matches;
    const isIosStandalone = (window.navigator as any).standalone === true;

    // 이미 설치된 앱으로 접속한 경우 배너를 띄우지 않음
    if (isStandalone || isIosStandalone) {
      return;
    }

    // 기기 판별
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    const isAndroidDevice = /android/.test(userAgent);

    if (isIosDevice) setIsIOS(true);
    if (isAndroidDevice) setIsAndroid(true);

    // 모바일 기기이면서 설치가 안 되어 있다면 무조건 배너 표시 (안드로이드, iOS 모두)
    if (
      (isIosDevice && !isIosStandalone) ||
      (isAndroidDevice && !isStandalone)
    ) {
      setIsVisible(true);
    }

    // 2. 안드로이드 자동 설치 이벤트 가로채기 (조건이 맞을 때만 브라우저가 발생시킴)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () =>
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        setIsVisible(false);
      }
    }
  };

  const handleClose = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[10000] bg-white border border-gray-200 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] rounded-2xl p-4 flex flex-col animate-fadeIn slide-up">
      <button
        onClick={handleClose}
        className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-gray-600 rounded-full transition"
        aria-label="닫기"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      <div className="flex items-center justify-between w-full pr-4">
        <div className="flex items-center gap-3">
          <img
            src="/images/icon-192x192.png"
            alt="앱 로고"
            className="w-11 h-11 rounded-xl object-cover shadow-[0_2px_10px_rgba(0,0,0,0.08)] shrink-0"
          />
          <div className="flex flex-col">
            <p className="text-sm font-bold text-gray-900 leading-tight">
              수원하나교회 그룹웨어
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              앱으로 설치하고 편하게 쓰세요!
            </p>
          </div>
        </div>

        {isIOS && (
          <div className="text-[10px] text-gray-500 text-right bg-gray-50 p-2 rounded-lg border border-gray-100 shrink-0">
            하단 <span className="font-bold text-blue-600">공유(↑)</span> 누르고
            <br />
            <span className="font-bold text-gray-800">홈 화면에 추가</span>
          </div>
        )}

        {/* 안드로이드일 때 분기 처리 */}
        {isAndroid && deferredPrompt && (
          <button
            onClick={handleInstallClick}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm transition shrink-0 active:scale-95"
          >
            설치
          </button>
        )}

        {/* 안드로이드인데 HTTP 환경이거나 개발 모드라서 설치 이벤트가 발생 안 한 경우 수동 가이드 제공 */}
        {isAndroid && !deferredPrompt && (
          <div className="text-[10px] text-gray-500 text-right bg-gray-50 p-2 rounded-lg border border-gray-100 shrink-0">
            우측 상단 <span className="font-bold text-gray-800">메뉴(⋮)</span>{" "}
            누르고
            <br />
            <span className="font-bold text-blue-600">홈 화면에 추가</span>
          </div>
        )}
      </div>
    </div>
  );
}
