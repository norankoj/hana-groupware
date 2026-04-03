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

  const { phone } = await request.json();

  // 전화번호 형식 검증 (숫자 10-11자리)
  if (!phone || !/^\d{10,11}$/.test(phone.replace(/-/g, ""))) {
    return NextResponse.json({ error: "올바른 전화번호를 입력해주세요." }, { status: 400 });
  }
  const normalizedPhone = phone.replace(/-/g, "");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 보안: 허용된 전화번호(allowed_users)이고 미등록 상태인지 확인
  const { data: allowedUser } = await supabase
    .from("allowed_users")
    .select("id, is_registered")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (!allowedUser) {
    // 보안상 존재 여부를 노출하지 않고 동일한 메시지 반환
    return NextResponse.json({ error: "인증번호를 발송할 수 없는 번호입니다." }, { status: 403 });
  }

  if (allowedUser.is_registered) {
    return NextResponse.json({ error: "이미 가입된 전화번호입니다." }, { status: 409 });
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
