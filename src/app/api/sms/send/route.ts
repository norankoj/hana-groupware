// src/app/api/sms/send/route.ts

import { NextResponse } from "next/server";
// import { SolapiMessageService } from "solapi"; // 잠시 주석
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const { phone } = await request.json();
  //   const code = Math.floor(100000 + Math.random() * 900000).toString();
  const code = "123456"; // 테스트용 고정 코드

  // 1. DB 저장은 그대로 진행
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

  // 2. [임시 수정] 솔라피 발송 대신 콘솔에 출력하기
  /* 솔라피 승인 전까지 주석 처리
  try {
    const messageService = new SolapiMessageService(...);
    await messageService.sendOne(...);
    return NextResponse.json({ success: true });
  } catch (e: any) { ... } 
  */

  // ★ 대신 여기에 인증번호를 찍어주세요!
  console.log("=========================================");
  console.log(`[TEST] ${phone} 으로 갈 인증번호: ${code}`);
  console.log("=========================================");

  // 무조건 성공했다고 뻥(?)치기
  return NextResponse.json({ success: true });
}
