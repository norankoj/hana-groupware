// POST /api/projects/create
// 프로젝트 생성 + 생성자를 admin으로 등록 (service_role로 RLS 우회)

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  // 1. 인증 확인
  const serverSupabase = await createServerClient();
  const { data: { user } } = await serverSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  // 2. 역할 확인 (admin, director만 생성 가능)
  const { data: profile } = await serverSupabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "director"].includes(profile.role)) {
    return NextResponse.json({ error: "프로젝트 생성 권한이 없습니다." }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, project_type, year, recurrence_years, status } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "프로젝트명을 입력하세요." }, { status: 400 });
  }

  // 3. service_role로 RLS 우회 후 프로젝트 생성
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: project, error: projError } = await admin
    .from("projects")
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      project_type: project_type || "general",
      year: year || null,
      recurrence_years: recurrence_years || null,
      status: status || "planning",
      created_by: user.id,
    })
    .select()
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: projError?.message ?? "프로젝트 생성 실패" }, { status: 500 });
  }

  // 4. 생성자를 admin으로 project_members에 등록
  const { error: memberError } = await admin
    .from("project_members")
    .insert({ project_id: project.id, user_id: user.id, role: "admin" });

  if (memberError) {
    // 프로젝트는 만들어졌으나 멤버 추가 실패 — 프로젝트 롤백
    await admin.from("projects").delete().eq("id", project.id);
    return NextResponse.json({ error: "담당자 등록 실패" }, { status: 500 });
  }

  return NextResponse.json({ project }, { status: 201 });
}
