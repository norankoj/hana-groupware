// DELETE /api/vehicle/delete
// Body: { reservationId: number }
// 관리자 전용 — 운행중(in_use) 또는 반납완료(returned) 예약 삭제
// 삭제 후 resources.current_mileage 를 이전 반납 기록의 end_mileage로 복원
//
// ※ trigger_update_mileage 는 UPDATE에만 동작하므로 DELETE 후 수동 복원 필요
// ※ fuel_level 은 resources 테이블에 별도 컬럼이 없고, 차량 카드가 reservations의
//    최신 fuel_level_end를 직접 읽으므로 삭제 시 자동으로 이전 값이 반영됨

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    // ── 1. 인증 확인 ─────────────────────────────────────────────
    const serverSupabase = await createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    // ── 2. 관리자 권한 확인 ──────────────────────────────────────
    const { data: profile } = await serverSupabase
      .from("profiles")
      .select("is_approver, role")
      .eq("id", user.id)
      .single();

    if (!profile?.is_approver && profile?.role !== "admin") {
      return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
    }

    const { reservationId } = await req.json() as { reservationId: number };
    if (!reservationId) {
      return NextResponse.json({ error: "reservationId가 필요합니다." }, { status: 400 });
    }

    // ── 3. 삭제 대상 예약 조회 ──────────────────────────────────
    const { data: reservation } = await serverSupabase
      .from("reservations")
      .select("id, resource_id, vehicle_status, end_mileage, start_mileage")
      .eq("id", reservationId)
      .single();

    if (!reservation) {
      return NextResponse.json({ error: "예약을 찾을 수 없습니다." }, { status: 404 });
    }

    if (!["in_use", "returned"].includes(reservation.vehicle_status)) {
      return NextResponse.json(
        { error: "운행중 또는 반납완료 상태만 삭제할 수 있습니다." },
        { status: 400 }
      );
    }

    // ── 4. service_role 클라이언트 ──────────────────────────────
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── 5. 복원할 누적 주행거리 계산 ────────────────────────────
    // 같은 차량의 반납완료 기록 중, 삭제 대상을 제외한 가장 최근 end_mileage
    // id 내림차순(최근 생성순)으로 조회하여 가장 최신 반납 기록 사용
    const { data: prevReturned } = await adminSupabase
      .from("reservations")
      .select("end_mileage, start_mileage")
      .eq("resource_id", reservation.resource_id)
      .eq("vehicle_status", "returned")
      .neq("id", reservationId)
      .not("end_mileage", "is", null)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    // ── 6. 예약 레코드 삭제 ─────────────────────────────────────
    const { error: deleteError } = await adminSupabase
      .from("reservations")
      .delete()
      .eq("id", reservationId);

    if (deleteError) {
      console.error("[vehicle/delete] 삭제 오류:", deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // ── 7. resources.current_mileage 복원 ───────────────────────
    // 이전 반납 기록의 end_mileage → 없으면 start_mileage → 없으면 0
    const restoredMileage = prevReturned?.end_mileage ?? prevReturned?.start_mileage ?? 0;

    const { error: updateError } = await adminSupabase
      .from("resources")
      .update({ current_mileage: restoredMileage })
      .eq("id", reservation.resource_id);

    if (updateError) {
      console.error("[vehicle/delete] 주행거리 복원 오류:", updateError);
      return NextResponse.json({
        success: true,
        warning: "삭제는 완료됐지만 누적 주행거리 복원에 실패했습니다.",
      });
    }

    console.log(`[vehicle/delete] 예약 ${reservationId} 삭제 완료. current_mileage → ${restoredMileage} km`);
    return NextResponse.json({ success: true, restoredMileage });
  } catch (error: any) {
    console.error("[vehicle/delete] 오류:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
