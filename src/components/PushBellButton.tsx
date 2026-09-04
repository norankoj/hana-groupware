// src/components/PushBellButton.tsx
// 헤더의 알림 종 — 지금 켜져 있는지 보여주고, 눌러서 바로 켜고 끌 수 있다.
//
// '끄기'는 이 기기의 구독을 해제하는 것이다. 브라우저 권한 자체는 그대로 두므로
// 다시 켤 때 허용 창이 뜨지 않는다.
// 브라우저에서 아예 차단(denied)한 경우는 코드로 되돌릴 수 없어 안내만 한다.
"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  isIOS,
  isStandalone,
  requestPushPermission,
} from "@/components/PushSubscriber";

const DISMISSED_KEY = "push_banner_dismissed";

type Perm = "loading" | "granted" | "default" | "denied" | "unsupported";

export default function PushBellButton() {
  const [perm, setPerm] = useState<Perm>("loading");
  const [subscribed, setSubscribed] = useState(false);
  const [working, setWorking] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 권한 + 이 기기의 구독 여부를 함께 확인한다
  useEffect(() => {
    const check = async () => {
      if (
        typeof Notification === "undefined" ||
        !("PushManager" in window) ||
        !("serviceWorker" in navigator)
      ) {
        setPerm("unsupported");
        return;
      }
      setPerm(Notification.permission as Perm);

      if (Notification.permission === "granted") {
        try {
          const reg = await navigator.serviceWorker.ready;
          setSubscribed(!!(await reg.pushManager.getSubscription()));
        } catch {
          setSubscribed(false);
        }
      }
    };
    check();
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const turnOn = async () => {
    setWorking(true);
    const result = await requestPushPermission();
    setWorking(false);

    if (result === "granted") {
      localStorage.removeItem(DISMISSED_KEY);
      setPerm("granted");
      setSubscribed(true);
      toast.success("알림을 켰습니다.");
      return;
    }
    if (result === "denied") {
      setPerm("denied");
      return; // 해제 방법은 아래에서 보여준다
    }
    toast.error("알림을 켜지 못했습니다. 잠시 후 다시 시도해주세요.");
  };

  const turnOff = async () => {
    setWorking(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      if (sub) {
        // 서버 목록에서 먼저 지운다 — 여기서 실패하면 계속 알림이 오므로
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success("이 기기에서 알림을 껐습니다.");
    } catch {
      toast.error("알림을 끄지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setWorking(false);
    }
  };

  if (perm === "loading") return null;

  const on = perm === "granted" && subscribed;
  const canToggle = perm === "granted" || perm === "default";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={on ? "알림 켜짐" : "알림 꺼짐"}
        aria-label={on ? "알림 켜짐" : "알림 꺼짐"}
        className="relative w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition cursor-pointer"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
          {!on && (
            <path strokeLinecap="round" strokeWidth={1.8} d="M4 4l16 16" />
          )}
        </svg>
        {!on && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-72 bg-white rounded-xl shadow-xl border border-gray-100 p-4 animate-fadeIn z-50 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-gray-900">알림</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {on ? "이 기기로 받는 중" : "이 기기에서 꺼짐"}
              </p>
            </div>

            {canToggle && (
              <button
                onClick={on ? turnOff : turnOn}
                disabled={working}
                role="switch"
                aria-checked={on}
                aria-label="알림 켜고 끄기"
                className={`relative w-12 h-7 rounded-full transition cursor-pointer disabled:opacity-50 ${
                  on ? "bg-[#2151EC]" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${
                    on ? "left-6" : "left-1"
                  }`}
                />
              </button>
            )}
          </div>

          {perm === "granted" && !subscribed && (
            <p className="text-sm leading-relaxed text-gray-600">
              다시 켜면 허용 창 없이 바로 받을 수 있습니다.
            </p>
          )}

          {perm === "default" && (
            <p className="text-sm leading-relaxed text-gray-600">
              켜면 브라우저가 알림 허용을 한 번 물어봅니다.
            </p>
          )}

          {perm === "denied" && (
            <>
              <p className="text-sm leading-relaxed text-gray-600">
                브라우저에서 이 사이트의 알림을 차단해 두셨습니다. 앱에서 다시
                물어볼 수 없어 설정에서 직접 풀어주셔야 합니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
                <li>
                  <b>PC</b> — 주소창 왼쪽 자물쇠 → 알림 → 허용
                </li>
                <li>
                  <b>안드로이드</b> — 자물쇠 → 권한 → 알림 → 허용
                </li>
                <li>
                  <b>아이폰</b> — 설정 → 알림 → 그룹웨어 → 허용
                </li>
              </ul>
              <p className="text-xs text-gray-400">
                바꾸신 뒤 새로고침하면 반영됩니다.
              </p>
            </>
          )}

          {perm === "unsupported" && (
            <p className="text-sm leading-relaxed text-gray-600">
              {isIOS() && !isStandalone()
                ? "아이폰은 홈 화면에 추가한 뒤 그 아이콘으로 열어야 알림을 받을 수 있습니다."
                : "이 브라우저는 알림을 지원하지 않습니다."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
