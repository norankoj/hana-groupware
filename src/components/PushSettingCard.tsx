// src/components/PushSettingCard.tsx
// 마이페이지의 알림 설정 — 언제든 본인이 알림을 켜고 상태를 확인할 수 있게 한다.
//
// 브라우저 규칙상 한 번 차단하면 코드로는 다시 물어볼 수 없어,
// 그때는 설정에서 푸는 방법을 안내한다.
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  isIOS,
  isStandalone,
  requestPushPermission,
} from "@/components/PushSubscriber";

const DISMISSED_KEY = "push_banner_dismissed";

type Status = "loading" | "granted" | "default" | "denied" | "unsupported";

export default function PushSettingCard() {
  const [status, setStatus] = useState<Status>("loading");
  const [working, setWorking] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);

  useEffect(() => {
    if (typeof Notification === "undefined" || !("PushManager" in window)) {
      // iOS 사파리 탭에서는 홈 화면에 추가해야 알림을 쓸 수 있다
      setNeedsInstall(isIOS() && !isStandalone());
      setStatus("unsupported");
      return;
    }
    setStatus(Notification.permission as Status);
  }, []);

  const handleEnable = async () => {
    setWorking(true);
    const result = await requestPushPermission();
    setWorking(false);

    if (result === "granted") {
      localStorage.removeItem(DISMISSED_KEY);
      setStatus("granted");
      toast.success("알림을 켰습니다.");
      return;
    }
    if (result === "denied") {
      setStatus("denied");
      toast.error("알림이 차단되어 있습니다. 브라우저 설정에서 풀어주세요.");
      return;
    }
    toast.error("알림을 켜지 못했습니다. 잠시 후 다시 시도해주세요.");
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">알림 설정</h2>
        <StatusBadge status={status} />
      </div>

      <div className="p-6 space-y-4">
        {status === "granted" && (
          <p className="text-sm leading-relaxed text-gray-600">
            이 기기로 알림을 받습니다.
          </p>
        )}

        {status === "default" && (
          <>
            <p className="text-sm leading-relaxed text-gray-600">
              아직 알림이 꺼져 있습니다. 켜두시면 나에게 온 알림을 이 기기로
              바로 받을 수 있습니다.
            </p>
            <button
              onClick={handleEnable}
              disabled={working}
              className="px-5 py-2.5 bg-[#2151EC] text-white font-bold rounded-lg hover:bg-[#1a43c9] transition text-sm shadow-md cursor-pointer disabled:opacity-60"
            >
              {working ? "설정 중..." : "알림 켜기"}
            </button>
          </>
        )}

        {status === "denied" && (
          <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-lg px-4 py-3 space-y-2">
            <p className="text-sm font-bold text-amber-900">
              이 기기에서 알림이 차단되어 있습니다
            </p>
            <p className="text-sm leading-relaxed text-amber-900">
              한 번 차단하면 앱에서 다시 물어볼 수 없어, 브라우저 설정에서 직접
              풀어주셔야 합니다.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-amber-900">
              <li>
                <b>PC 크롬·엣지</b> — 주소창 왼쪽 자물쇠 → 알림 → 허용
              </li>
              <li>
                <b>안드로이드</b> — 주소창 자물쇠 → 권한 → 알림 → 허용
              </li>
              <li>
                <b>아이폰</b> — 설정 → 알림 → 그룹웨어 → 알림 허용
              </li>
            </ul>
            <p className="text-sm text-amber-900">
              바꾸신 뒤 이 화면을 새로고침해주세요.
            </p>
          </div>
        )}

        {status === "unsupported" && (
          <p className="text-sm leading-relaxed text-gray-600">
            {needsInstall
              ? "아이폰은 홈 화면에 추가한 뒤 그 아이콘으로 열어야 알림을 받을 수 있습니다. 사파리 공유 버튼 → '홈 화면에 추가'를 눌러주세요."
              : "이 브라우저는 알림을 지원하지 않습니다. 크롬이나 엣지에서 열어주세요."}
          </p>
        )}

        {status === "loading" && (
          <p className="text-sm text-gray-400">확인 중...</p>
        )}
      </div>
    </div>
  );
}

const StatusBadge = ({ status }: { status: Status }) => {
  const map: Record<Status, { label: string; className: string }> = {
    loading: { label: "확인 중", className: "bg-gray-100 text-gray-500" },
    granted: { label: "켜짐", className: "bg-emerald-50 text-emerald-700" },
    default: { label: "꺼짐", className: "bg-gray-100 text-gray-600" },
    denied: { label: "차단됨", className: "bg-red-50 text-red-600" },
    unsupported: { label: "사용 불가", className: "bg-gray-100 text-gray-500" },
  };
  const { label, className } = map[status];
  return (
    <span
      className={`text-xs font-bold px-2.5 py-1 rounded border border-gray-200 ${className}`}
    >
      {label}
    </span>
  );
};
