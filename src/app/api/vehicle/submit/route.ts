// POST /api/vehicle/submit
// 차량 운행 시작(checkin) / 반납 완료(checkout) DB 저장
// 클라이언트 RLS를 우회하기 위해 service_role 사용

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    // ── 1. 요청자 인증 확인 ──────────────────────────────────────
    const serverSupabase = await createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { reservationId, updates } = body as {
      reservationId: number;
      updates: Record<string, unknown>;
    };

    if (!reservationId || !updates) {
      return NextResponse.json({ error: "reservationId, updates 필드가 필요합니다." }, { status: 400 });
    }

    // ── 2. 예약 소유자 또는 관리자인지 확인 ─────────────────────────
    const { data: reservation } = await serverSupabase
      .from("reservations")
      .select("id, user_id, vehicle_status, driver_name")
      .eq("id", reservationId)
      .single();

    if (!reservation) {
      return NextResponse.json({ error: "예약을 찾을 수 없습니다." }, { status: 404 });
    }

    const { data: profile } = await serverSupabase
      .from("profiles")
      .select("full_name, role, is_approver, is_vehicle_notify")
      .eq("id", user.id)
      .single();

    const isAdmin =
      profile?.role === "admin" ||
      profile?.is_approver === true ||
      profile?.is_vehicle_notify === true;
    const isOwner = reservation.user_id === user.id;
    // 체크인/체크아웃(vehicle_status 변경)은 운전자도 허용
    const isCheckinOrCheckout = "vehicle_status" in updates;
    const isDriver =
      isCheckinOrCheckout &&
      !!profile?.full_name &&
      reservation.driver_name === profile.full_name;

    if (!isOwner && !isDriver && !isAdmin) {
      return NextResponse.json({ error: "본인 예약 또는 관리자만 처리할 수 있습니다." }, { status: 403 });
    }

    // ── 3. service_role로 RLS 우회 업데이트 ─────────────────────────
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: saved, error } = await supabaseAdmin
      .from("reservations")
      .update(updates)
      .eq("id", reservationId)
      .select("id, vehicle_status");

    if (error) throw error;
    if (!saved || saved.length === 0) {
      return NextResponse.json({ error: "업데이트된 행이 없습니다." }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: saved[0] });
  } catch (error: any) {
    console.error("[vehicle/submit] 오류:", error);
    return NextResponse.json(
      { error: error.message || "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
