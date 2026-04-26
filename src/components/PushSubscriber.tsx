"use client";

import { useEffect, useRef, useState } from "react";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

/** iOS 기기 여부 */
const isIOS = () =>
  typeof navigator !== "undefined" &&
  /iphone|ipad|ipod/i.test(navigator.userAgent);

/** iOS PWA(홈 화면에서 실행) 여부 */
const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true);

/** base64url → Uint8Array (applicationServerKey 변환) */
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/** 서버에 구독 정보 저장 */
async function saveSubscription(subscription: PushSubscription) {
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription }),
  });
}

/**
 * PushSubscriber
 * - PC / Android: 자동 구독 시도 (Permission 기본값이면 요청)
 * - iOS: 홈 화면 추가 여부 확인 후, 사용자 제스처 기반으로만 구독
 *   → isShowBanner state를 export해 배너 컴포넌트와 연동
 */
export default function PushSubscriber() {
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return;

    // iOS는 사용자 제스처(버튼 클릭)가 없으면 subscribe 불가 → 자동 시도 안 함
    if (isIOS()) return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
          });
        }
        await saveSubscription(sub);
      } catch {
        // 거부 시 조용히 무시
      }
    };

    if (Notification.permission === "granted") {
      register();
    } else {
      const timer = setTimeout(register, 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  return null;
}

/**
 * 사용자 제스처로 직접 구독 요청 (iOS PWA + 안드로이드 버튼용)
 * 반환: "granted" | "denied" | "error"
 */
export async function requestPushPermission(): Promise<"granted" | "denied" | "error"> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window))
      return "error";

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
      });
    }
    await saveSubscription(sub);
    return "granted";
  } catch {
    return "error";
  }
}

export { isIOS, isStandalone };
