// src/app/api/sms/send/route.ts

import { NextResponse } from "next/server";
import { SolapiMessageService } from "solapi";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  // 환경변수 검증
  if (!process.env.SOLAPI_API_KEY || !process.env.SOLAPI_API_SECRET) {
    console.error("[sms/send] SOLAPI 환경변수 누락");
    return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
  }
  if (!process.env.SOLAPI_SENDER_PHONE) {
    console.error("[sms/send] SOLAPI_SENDER_PHONE 환경변수 누락");
    return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
  }

  // purpose: 'signup' | 'forgot' | 'change-password'
  const { phone, purpose = "signup" } = await request.json();

  // 전화번호 형식 검증 (숫자 10-11자리)
  if (!phone || !/^\d{10,11}$/.test(phone.replace(/-/g, ""))) {
    return NextResponse.json({ error: "올바른 전화번호를 입력해주세요." }, { status: 400 });
  }
  const normalizedPhone = phone.replace(/-/g, "");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 보안: purpose별 검증 분기
  if (purpose === "signup") {
    // 회원가입: allowed_users에 존재하고 미등록 상태여야 함
    const { data: allowedUser } = await supabase
      .from("allowed_users")
      .select("id, is_registered")
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (!allowedUser) {
      return NextResponse.json({ error: "인증번호를 발송할 수 없는 번호입니다." }, { status: 403 });
    }
    if (allowedUser.is_registered) {
      return NextResponse.json({ error: "이미 가입된 전화번호입니다." }, { status: 409 });
    }
  } else {
    // 비밀번호 찾기 / 비밀번호 변경: 이미 가입된 사용자여야 함
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: "등록되지 않은 전화번호입니다." }, { status: 403 });
    }
  }

  // 속도 제한: 60초 내 재발송 방지
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const { data: recentCode } = await supabase
    .from("verification_codes")
    .select("id, created_at")
    .eq("phone", normalizedPhone)
    .gte("created_at", oneMinuteAgo)
    .maybeSingle();

  if (recentCode) {
    return NextResponse.json(
      { error: "인증번호는 60초에 한 번만 요청할 수 있습니다." },
      { status: 429 },
    );
  }

  // 인증번호 생성
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // DB에 저장
  const { error: insertError } = await supabase
    .from("verification_codes")
    .insert({ phone: normalizedPhone, code });

  if (insertError) {
    console.error("[sms/send] DB insert 실패:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // 솔라피 문자 발송
  try {
    const messageService = new SolapiMessageService(
      process.env.SOLAPI_API_KEY,
      process.env.SOLAPI_API_SECRET,
    );

    await messageService.sendOne({
      to: normalizedPhone,
      from: process.env.SOLAPI_SENDER_PHONE,
      text: `[수원하나교회] 인증번호는 ${code} 입니다.`,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[sms/send] 문자 발송 실패:", e);
    return NextResponse.json({ error: "문자 발송에 실패했습니다." }, { status: 500 });
  }
}
