// POST /api/push/send — 내부용 푸시 발송 유틸
// body: { userIds?: string[], toAll?: boolean, title: string, body: string, url?: string }
import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient as createAdmin } from "@supabase/supabase-js";

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function POST(request: Request) {
  try {
    const { userIds, toAll, title, body, url } = await request.json();

    const admin = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 구독 목록 조회
    let query = admin.from("push_subscriptions").select("endpoint, p256dh, auth");
    if (!toAll && userIds?.length) {
      query = query.in("user_id", userIds);
    }
    const { data: subs } = await query;
    if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 });

    const payload = JSON.stringify({ title, body, url: url ?? "/" });

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        ),
      ),
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    // 만료된 구독 정리 (410 Gone)
    const expiredEndpoints = subs
      .filter((_, i) => {
        const r = results[i];
        return r.status === "rejected" && (r as PromiseRejectedResult).reason?.statusCode === 410;
      })
      .map((s) => s.endpoint);

    if (expiredEndpoints.length > 0) {
      await admin.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
    }

    return NextResponse.json({ sent, failed });
  } catch (e: any) {
    console.error("[push/send]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
