// POST /api/auth/complete-signup
// 회원가입 직후 호출: is_registered 업데이트 + 연차 데이터 profiles 동기화
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const { userId, phone } = await request.json();

    if (!userId || !phone) {
      return NextResponse.json(
        { error: "userId 또는 phone 누락" },
        { status: 400 },
      );
    }

    // 보안: 요청자의 JWT 검증 — 본인 가입만 처리 가능
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    const accessToken = authHeader.replace("Bearer ", "");

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 토큰으로 실제 사용자 확인
    const { data: { user: requestingUser }, error: authError } =
      await supabaseAdmin.auth.getUser(accessToken);

    if (authError || !requestingUser) {
      return NextResponse.json({ error: "유효하지 않은 인증입니다." }, { status: 401 });
    }

    // 요청 userId와 실제 인증된 userId가 일치해야 함
    if (requestingUser.id !== userId) {
      console.warn("[complete-signup] userId 불일치 — 잠재적 공격 시도:", {
        requestedUserId: userId,
        authenticatedUserId: requestingUser.id,
      });
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 1. allowed_users에서 연차·입사일·이전연차 데이터 조회
    const normalizedPhone = phone.replace(/-/g, "");
    const { data: allowedUser, error: allowedErr } = await supabaseAdmin
      .from("allowed_users")
      .select("id, total_leaves, used_leaves, used_leave_memo, join_date, previous_vacations")
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (allowedErr || !allowedUser) {
      console.error("[complete-signup] allowed_users 조회 실패:", allowedErr);
      return NextResponse.json(
        { error: "allowed_users 데이터를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // 2. allowed_users.is_registered = true 업데이트 (중복 가입 방지)
    const { error: regErr } = await supabaseAdmin
      .from("allowed_users")
      .update({ is_registered: true })
      .eq("phone", normalizedPhone);

    if (regErr) {
      console.error("[complete-signup] is_registered 업데이트 실패:", regErr);
    }

    // 3. Supabase 트리거가 profiles 행을 생성할 시간을 확보 (최대 2초 재시도)
    let profileUpdated = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, 500));

      const { error: profileErr } = await supabaseAdmin
        .from("profiles")
        .update({
          total_leave_days: allowedUser.total_leaves ?? 15,
          used_leave_days: allowedUser.used_leaves ?? 0,
          ...(allowedUser.used_leave_memo
            ? { used_leave_memo: allowedUser.used_leave_memo }
            : {}),
        })
        .eq("id", userId);

      if (!profileErr) {
        profileUpdated = true;
        break;
      }
      console.warn(
        `[complete-signup] profiles 업데이트 시도 ${attempt + 1} 실패:`,
        profileErr.message,
      );
    }

    if (!profileUpdated) {
      console.error(
        "[complete-signup] profiles 업데이트 실패 — 수동 확인 필요 userId:",
        userId,
      );
    }

    // 4. 이전 연차 사용 내역이 있으면 vacation_requests에 자동 insert
    let previousVacationsInserted = 0;
    const previousVacations = allowedUser.previous_vacations as
      | { type: string; start_date: string; end_date: string; days_count: number }[]
      | null;

    if (profileUpdated && previousVacations && previousVacations.length > 0) {
      const rows = previousVacations.map((vac) => ({
        user_id: userId,
        type: vac.type,
        start_date: vac.start_date,
        end_date: vac.end_date,
        days_count: vac.days_count,
        reason: "이전연차",
        status: "approved",
        approver_id: userId,
        approved_at: "2026-04-10T00:00:00+09:00",
      }));

      const { error: vacErr } = await supabaseAdmin
        .from("vacation_requests")
        .insert(rows);

      if (vacErr) {
        console.error("[complete-signup] 이전연차 insert 실패:", vacErr.message);
      } else {
        previousVacationsInserted = rows.length;
      }
    }

    return NextResponse.json({
      success: true,
      profileUpdated,
      totalLeaves: allowedUser.total_leaves,
      usedLeaves: allowedUser.used_leaves,
      previousVacationsInserted,
    });
  } catch (error: any) {
    console.error("[complete-signup] 서버 오류:", error);
    return NextResponse.json(
      { error: error.message ?? "서버 오류" },
      { status: 500 },
    );
  }
}
