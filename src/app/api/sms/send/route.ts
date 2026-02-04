// src/app/api/sms/send/route.ts

import { NextResponse } from "next/server";
import { SolapiMessageService } from "solapi"; // 1. 주석 해제
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const { phone } = await request.json();
  // 인증번호 생성
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // 1. DB에 인증번호 저장 (기존 유지)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await supabase
    .from("verification_codes")
    .insert({ phone, code });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2. [실제 발송] 솔라피 문자 전송
  try {
    const messageService = new SolapiMessageService(
      process.env.SOLAPI_API_KEY!,
      process.env.SOLAPI_API_SECRET!,
    );

    const sendResponse = await messageService.sendOne({
      to: phone,
      from: process.env.SOLAPI_SENDER_PHONE || "01012345678",
      text: `[수원하나교회] 인증번호는 ${code} 입니다.`,
    });

    console.log("문자 발송 성공:", sendResponse);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("문자 발송 실패:", e);
    // 에러가 나면 어떤 에러인지 프론트로 전달
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
