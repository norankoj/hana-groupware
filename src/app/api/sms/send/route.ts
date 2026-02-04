import { NextResponse } from "next/server";
import { SolapiMessageService } from "solapi";
import { createClient } from "@supabase/supabase-js"; // ★ 변경됨: 패키지 직접 사용

export async function POST(request: Request) {
  const { phone } = await request.json();

  // 1. 6자리 인증번호 생성
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // 2. DB에 인증번호 저장 (관리자 권한으로 프리패스!)
  // ★ 변경됨: Service Role Key 사용
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await supabase
    .from("verification_codes")
    .insert({ phone, code });

  if (error) {
    console.error("DB Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 3. 솔라피로 문자 발송
  try {
    const messageService = new SolapiMessageService(
      process.env.SOLAPI_API_KEY!,
      process.env.SOLAPI_API_SECRET!,
    );

    await messageService.sendOne({
      to: phone,
      from: process.env.SOLAPI_SENDER_PHONE!,
      text: `[우리교회 그룹웨어] 인증번호는 [${code}] 입니다.`,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("SMS Error:", e);
    return NextResponse.json({ error: "문자 발송 실패" }, { status: 500 });
  }
}
