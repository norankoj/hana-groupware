import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const serverSupabase = await createServerClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { data: profile } = await serverSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = profile?.role === "admin";

    const body = await req.json() as {
      reservationId?: string | number;
      groupId?: string;
      cancelAll?: boolean;
    };

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    if (body.cancelAll && body.groupId) {
      // 정기 예약 전체 취소 — 관리자이거나 본인 예약인지 확인
      const { data: sample } = await adminSupabase
        .from("reservations")
        .select("user_id")
        .eq("group_id", body.groupId)
        .limit(1)
        .single();

      if (!isAdmin && sample?.user_id !== user.id) {
        return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
      }

      const { error } = await adminSupabase
        .from("reservations")
        .update({ status: "cancelled" })
        .eq("group_id", body.groupId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (body.reservationId) {
      // 단건 취소 — 관리자이거나 본인 예약인지 확인
      const { data: rsv } = await adminSupabase
        .from("reservations")
        .select("user_id")
        .eq("id", body.reservationId)
        .single();

      if (!isAdmin && rsv?.user_id !== user.id) {
        return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
      }

      const { error } = await adminSupabase
        .from("reservations")
        .update({ status: "cancelled" })
        .eq("id", body.reservationId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  } catch (error: any) {
    console.error("[reservation/cancel] 오류:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
