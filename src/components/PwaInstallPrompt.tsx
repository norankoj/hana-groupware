"use client";
import { useState, useEffect } from "react";

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 1. 이미 앱으로 설치되어 있는지 확인 (독립 실행 모드)
    const isAppInstalled = window.matchMedia(
      "(display-mode: standalone)",
    ).matches;
    setIsStandalone(isAppInstalled);

    if (isAppInstalled) return; // 이미 설치된 경우 배너 띄우지 않음

    // 2. 안드로이드(Chrome) 웹앱 설치 이벤트 가로채기
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault(); // 기본 브라우저 설치 팝업 막기
      setDeferredPrompt(e); // 이벤트 저장
      setIsVisible(true); // 커스텀 배너 띄우기
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 3. 아이폰(iOS) 감지
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);

    if (isIosDevice && !isAppInstalled) {
      setIsIOS(true);
      setIsVisible(true);
    }

    return () =>
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // 저장해둔 설치 팝업 띄우기
      deferredPrompt.prompt();
      // 유저가 설치를 눌렀는지 취소했는지 결과 확인
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        setIsVisible(false);
      }
    }
  };

  // 닫기 버튼 누르면 하루동안 안 보이게 하는 등의 로직을 추가할 수도 있습니다.
  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[10000] bg-white border border-gray-200 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] rounded-2xl p-4 flex items-center justify-between animate-fadeIn slide-up">
      <div className="flex items-center gap-3">
        {/* 앱 아이콘 - 실제 로고 이미지로 변경하셔도 됩니다 */}
        <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center font-black text-xl shadow-inner shrink-0">
          앱
        </div>
        <div className="flex flex-col">
          <p className="text-sm font-bold text-gray-900 leading-tight">
            우리 교회 예약 시스템
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            앱으로 설치하고 편하게 쓰세요!
          </p>
        </div>
      </div>

      {isIOS ? (
        // iOS 안내 문구 (애플은 공유버튼 -> 홈 화면 추가로만 가능)
        <div className="text-[10px] text-gray-500 text-right bg-gray-50 p-2 rounded-lg border border-gray-100 shrink-0">
          하단 <span className="font-bold text-blue-600">공유(↑)</span> 버튼
          누르고
          <br />
          <span className="font-bold text-gray-800">홈 화면에 추가</span> 터치
        </div>
      ) : (
        // 안드로이드 설치 버튼
        <button
          onClick={handleInstallClick}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md transition shrink-0 active:scale-95"
        >
          설치
        </button>
      )}
    </div>
  );
}
