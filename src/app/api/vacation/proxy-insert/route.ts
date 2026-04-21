// POST /api/vacation/proxy-insert
// 결재권자가 직원 대신 휴가를 입력하고 즉시 승인 처리 (RLS 우회를 위해 서비스 롤 사용)
import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

const DEDUCTIBLE_TYPES = ["연차", "오전반차", "오후반차", "비전트립"];

export async function POST(request: Request) {
  try {
    // 1. 요청자 세션 확인 (결재권자 여부 검증)
    const supabaseUser = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    // 2. 결재권자 여부 확인
    const { data: profile } = await supabaseUser
      .from("profiles")
      .select("is_approver")
      .eq("id", user.id)
      .single();

    if (!profile?.is_approver) {
      return NextResponse.json(
        { error: "결재권자만 대리 입력할 수 있습니다." },
        { status: 403 },
      );
    }

    const { userId, type, startDate, endDate, daysCount, reason } =
      await request.json();

    if (!userId || !type || !startDate || !endDate || !daysCount || !reason) {
      return NextResponse.json(
        { error: "필수 항목이 누락되었습니다." },
        { status: 400 },
      );
    }

    // 3. 서비스 롤로 INSERT (RLS 우회)
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error: insertError } = await supabaseAdmin
      .from("vacation_requests")
      .insert({
        user_id: userId,
        type,
        start_date: startDate,
        end_date: endDate,
        days_count: daysCount,
        reason,
        status: "approved",
        approver_id: user.id,
        approved_at: new Date().toISOString(),
      });

    if (insertError) throw insertError;

    // 4. 연차 차감 대상 타입이면 used_leave_days 증가
    if (DEDUCTIBLE_TYPES.includes(type)) {
      const { error: rpcError } = await supabaseAdmin.rpc(
        "increment_used_leave_days",
        {
          target_user_id: userId,
          days: daysCount,
        },
      );
      if (rpcError) throw rpcError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[proxy-insert] 오류:", error);
    return NextResponse.json(
      { error: error.message ?? "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
