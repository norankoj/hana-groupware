// app/api/auth/issue-temp-password/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "이메일 정보가 누락되었습니다." },
        { status: 400 },
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 1. 이메일로 해당 유저 검색
    const { data: users, error: listError } =
      await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;

    const targetUser = users.users.find((u) => u.email === email);
    if (!targetUser) {
      return NextResponse.json(
        { error: "해당 계정을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // 2. 8자리의 랜덤 임시 비밀번호 생성 (예: a7b3k9p2)
    const tempPassword = Math.random().toString(36).slice(-8);

    // 3. 생성된 임시 비밀번호로 DB 강제 업데이트
    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
        password: tempPassword,
      });

    if (updateError) throw updateError;

    // 4. 성공 시 프론트엔드에 임시 비밀번호 전달
    return NextResponse.json({ success: true, tempPassword });
  } catch (error: any) {
    console.error("임시 비밀번호 발급 에러:", error);
    return NextResponse.json(
      { error: error.message || "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
