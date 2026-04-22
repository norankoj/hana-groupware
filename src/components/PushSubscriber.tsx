"use client";

import { useEffect, useRef } from "react";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

export default function PushSubscriber() {
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;

        // 이미 구독 중이면 저장만 확인
        let subscription = await reg.pushManager.getSubscription();

        if (!subscription) {
          // 최초 구독 요청 (브라우저가 base64url 문자열 직접 수용)
          subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: PUBLIC_KEY,
          });
        }

        // 서버에 저장
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription }),
        });
      } catch {
        // 알림 거부 시 조용히 무시
      }
    };

    // 이미 허용됐으면 바로 등록, 아니면 5초 후 요청 (UX)
    if (Notification.permission === "granted") {
      register();
    } else {
      const timer = setTimeout(register, 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  return null;
}
