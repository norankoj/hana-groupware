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

  const now = new Date().toISOString();

  // reminder_at이 지났고 아직 발송 안 된 차량 예약 조회
  // (취소/반납완료/노쇼 등 이미 종료된 예약은 알림 대상 아님 — 반납 후에도 알림 오던 버그 수정)
  // end_at > now 조건: 사후 입력·노쇼 복구 등 reminder_at이 과거인 예약에
  // "20분 후 반납" 알림이 즉시 오발송되는 것 방지
  const { data: reservations } = await admin
    .from("reservations")
    .select("id, user_id, end_at, resources:resource_id(name, category)")
    .lte("reminder_at", now)
    .gt("end_at", now)
    .eq("reminder_sent", false)
    .not("reminder_at", "is", null)
    .in("vehicle_status", ["reserved", "in_use"]);

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
  let totalFailed = 0;
  let failedMarks = 0;
  const expiredEndpoints: string[] = [];

  for (const res of vehicleReservations) {
    const resource = Array.isArray(res.resources) ? res.resources[0] : res.resources;
    const vehicleName = (resource as any)?.name ?? "차량";
    // 서버 TZ가 UTC라 timeZone 명시 필수 (없으면 9시간 어긋난 시간이 문구에 찍힘)
    const returnTime = new Date(res.end_at).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Seoul",
    });

    // 발송 전에 먼저 마킹 — 마킹이 실패한 채로 발송하면
    // 5분 뒤 크론이 같은 예약을 다시 집어 중복 알림이 계속 나간다.
    // (실패 시 이번 회차는 건너뜀. 어차피 아래 발송은 재시도하지 않는 best-effort)
    const { error: markError } = await admin
      .from("reservations")
      .update({ reminder_sent: true })
      .eq("id", res.id);

    if (markError) {
      console.error("[cron/vehicle-reminder] reminder_sent 마킹 실패", res.id, markError);
      failedMarks++;
      continue;
    }

    // 예약자의 push 구독 조회
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", res.user_id);

    if (!subs || subs.length === 0) continue;

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
    totalFailed += results.filter((r) => r.status === "rejected").length;

    // 만료된 구독(410 Gone) 수집 — 루프 종료 후 한 번에 삭제
    subs.forEach((sub, i) => {
      const r = results[i];
      if (
        r.status === "rejected" &&
        (r as PromiseRejectedResult).reason?.statusCode === 410
      ) {
        expiredEndpoints.push(sub.endpoint);
      }
    });
  }

  if (expiredEndpoints.length > 0) {
    await admin.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
  }

  return NextResponse.json({
    sent: totalSent,
    failed: totalFailed,
    expired: expiredEndpoints.length,
    failedMarks,
  });
}
