import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js"; // ★ 변경됨

export async function POST(request: Request) {
  const { phone, code } = await request.json();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. DB에서 인증번호 조회 (관리자 권한)
  const { data: validCode } = await supabase
    .from("verification_codes")
    .select("*")
    .eq("phone", phone)
    .eq("code", code)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!validCode) {
    return NextResponse.json(
      { success: false, message: "인증번호가 틀렸거나 만료되었습니다." },
      { status: 400 },
    );
  }

  // 2. 인증 성공! (기존 회원 업데이트는 사용자 세션이 필요하므로 별도 처리 필요하지만,
  // 여기서는 회원가입 흐름이므로 성공 응답만 주면 됩니다.)

  return NextResponse.json({ success: true });
}
