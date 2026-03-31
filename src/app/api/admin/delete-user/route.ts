// /api/admin/delete-user
// Supabase Auth 계정까지 완전 삭제 (service_role 사용)
// profiles 행은 auth.users CASCADE 또는 명시적 삭제로 처리
import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function DELETE(request: Request) {
  try {
    const { userId, userName } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId가 누락되었습니다." },
        { status: 400 },
      );
    }

    // ── 1. 요청자가 admin인지 검증 ──────────────────────────────
    const serverSupabase = await createServerClient();
    const {
      data: { user: caller },
    } = await serverSupabase.auth.getUser();

    if (!caller) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { data: callerProfile } = await serverSupabase
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (
      !callerProfile ||
      !["admin", "director"].includes(callerProfile.role)
    ) {
      return NextResponse.json(
        { error: "관리자 권한이 필요합니다." },
        { status: 403 },
      );
    }

    // ── 2. service_role 클라이언트로 Auth 계정 삭제 ───────────────
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 삭제 전 phone 번호 조회 (allowed_users.is_registered 초기화용)
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .maybeSingle();

    // profiles 먼저 명시적 삭제 (CASCADE가 없는 경우 대비)
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    // Auth 계정 삭제 (cascade 설정이 있으면 위 삭제는 중복이지만 무해함)
    const { error: authDeleteError } =
      await supabaseAdmin.auth.admin.deleteUser(userId);

    // allowed_users.is_registered = false 초기화 → 재가입 허용
    if (targetProfile?.phone) {
      await supabaseAdmin
        .from("allowed_users")
        .update({ is_registered: false })
        .eq("phone", targetProfile.phone);
    }

    if (authDeleteError) {
      // Auth 계정이 이미 없어도 profiles 삭제는 성공으로 처리
      if (!authDeleteError.message.includes("not found")) {
        throw authDeleteError;
      }
    }

    console.log(
      `[delete-user] '${userName ?? userId}' 계정 삭제 완료 (by ${caller.email})`,
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[delete-user] 오류:", error);
    return NextResponse.json(
      { error: error.message || "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
