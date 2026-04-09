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

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 1. allowed_users에서 연차·입사일 조회
    const { data: allowedUser, error: allowedErr } = await supabaseAdmin
      .from("allowed_users")
      .select("id, total_leaves, used_leaves, join_date")
      .eq("phone", phone)
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
      .eq("phone", phone);

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

    return NextResponse.json({
      success: true,
      profileUpdated,
      totalLeaves: allowedUser.total_leaves,
      usedLeaves: allowedUser.used_leaves,
    });
  } catch (error: any) {
    console.error("[complete-signup] 서버 오류:", error);
    return NextResponse.json(
      { error: error.message ?? "서버 오류" },
      { status: 500 },
    );
  }
}
