// app/api/auth/issue-temp-password/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const { email, phone } = await request.json();

    if (!email || !phone) {
      return NextResponse.json(
        { error: "이메일 또는 전화번호 정보가 누락되었습니다." },
        { status: 400 },
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const normalizedPhone = phone.replace(/-/g, "");

    // 보안: 전화번호 + 이메일 조합이 실제 가입된 계정과 일치하는지 검증
    // (SMS 인증 완료 후 호출되므로, 두 값이 모두 맞아야 임시 비밀번호 발급)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (!profile) {
      // 존재 여부 노출 방지: 동일한 에러 메시지 반환
      return NextResponse.json(
        { error: "일치하는 계정을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // 10분 내 인증 요청 기록 확인 (재전송으로 여러 행이 생길 수 있으므로 limit(1) 사용)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentCodes } = await supabaseAdmin
      .from("verification_codes")
      .select("id")
      .eq("phone", normalizedPhone)
      .gte("created_at", tenMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(1);

    // verification_codes가 없으면 SMS 인증을 거치지 않은 것 — 차단
    if (!recentCodes || recentCodes.length === 0) {
      return NextResponse.json(
        { error: "휴대폰 인증을 먼저 완료해주세요." },
        { status: 403 },
      );
    }

    // 이메일로 auth 유저 검색
    const { data: users, error: listError } =
      await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;

    const targetUser = users.users.find((u) => u.email === email);
    if (!targetUser) {
      return NextResponse.json(
        { error: "일치하는 계정을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // 8자리 랜덤 임시 비밀번호 생성
    const tempPassword = Math.random().toString(36).slice(-8);

    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
        password: tempPassword,
      });

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, tempPassword });
  } catch (error: any) {
    console.error("임시 비밀번호 발급 에러:", error);
    return NextResponse.json(
      { error: error.message || "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
