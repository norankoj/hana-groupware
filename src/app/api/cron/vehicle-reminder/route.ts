// GET /api/cron/vehicle-reminder — 차량 반납 20분 전 알림
// Supabase pg_cron + pg_net 으로 5분마다 호출
import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient as createAdmin } from "@supabase/supabase-js";

export async function GET(request: Request) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL!}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  // 보안: CRON_SECRET 검증
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // reminder_at이 지났고 아직 발송 안 된 차량 예약 조회 (취소된 예약 제외)
  const { data: reservations } = await admin
    .from("reservations")
    .select("id, user_id, end_at, resources:resource_id(name, category)")
    .lte("reminder_at", new Date().toISOString())
    .eq("reminder_sent", false)
    .not("reminder_at", "is", null)
    .neq("vehicle_status", "cancelled");

  if (!reservations || reservations.length === 0) {
    return NextResponse.json({ sent: 0, message: "대상 없음" });
  }

  // 차량 예약만 필터
  const vehicleReservations = reservations.filter((r) => {
    const resource = Array.isArray(r.resources) ? r.resources[0] : r.resources;
    return (resource as any)?.category === "vehicle";
  });

  if (vehicleReservations.length === 0) {
    return NextResponse.json({ sent: 0, message: "차량 예약 없음" });
  }

  let totalSent = 0;

  for (const res of vehicleReservations) {
    const resource = Array.isArray(res.resources) ? res.resources[0] : res.resources;
    const vehicleName = (resource as any)?.name ?? "차량";
    const returnTime = new Date(res.end_at).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // 예약자의 push 구독 조회
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", res.user_id);

    if (subs && subs.length > 0) {
      const payload = JSON.stringify({
        title: "차량 반납 알림",
        body: `${vehicleName} 반납 시간이 20분 후(${returnTime})입니다.`,
        url: "/vehicle",
      });

      const results = await Promise.allSettled(
        subs.map((sub) =>
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          ),
        ),
      );

      totalSent += results.filter((r) => r.status === "fulfilled").length;
    }

    // 발송 여부와 관계없이 reminder_sent = true 로 마킹 (중복 방지)
    await admin
      .from("reservations")
      .update({ reminder_sent: true })
      .eq("id", res.id);
  }

  return NextResponse.json({ sent: totalSent });
}
