/// <reference lib="webworker" />
export {};

const sw = self as unknown as ServiceWorkerGlobalScope;

// Push 이벤트 수신 → 알림 표시
sw.addEventListener("push", (event) => {
  const pushEvent = event as PushEvent;
  if (!pushEvent.data) return;

  const data = pushEvent.data.json() as {
    title: string;
    body: string;
    url?: string;
    icon?: string;
  };

  pushEvent.waitUntil(
    sw.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon ?? "/images/icon-192x192.png",
      badge: "/images/icon-192x192.png",
      data: { url: data.url ?? "/" },
    }),
  );
});

// 알림 클릭 → 해당 페이지로 이동
sw.addEventListener("notificationclick", (event) => {
  const clickEvent = event as NotificationEvent;
  clickEvent.notification.close();
  const url = (clickEvent.notification.data?.url as string) ?? "/";
  clickEvent.waitUntil(
    sw.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const existing = clientList.find((c) => c.url === url && "focus" in c);
        if (existing) return (existing as WindowClient).focus();
        return sw.clients.openWindow(url);
      }),
  );
});
