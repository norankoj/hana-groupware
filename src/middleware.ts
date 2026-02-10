// src/middleware.ts
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  // 1. [예외 처리] 로그인 없이 접근 가능한 경로 설정
  if (
    request.nextUrl.pathname.startsWith("/api/auth") ||
    request.nextUrl.pathname.startsWith("/api/sms") ||
    request.nextUrl.pathname === "/login"
  ) {
    return NextResponse.next();
  }

  // 2. Supabase 클라이언트 생성
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 3. 현재 로그인된 유저 정보 가져오기
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // [보안 규칙 A] 비로그인 상태 접근 차단
  if (!user && path !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // [보안 규칙 B] 로그인 상태에서 로그인 페이지 접근 시 메인으로 이동
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // ============================================================
  // [보안 규칙 C] ★ DB 기반 메뉴 권한 체크 (핵심 로직)
  // ============================================================
  if (user) {
    // (1) 현재 경로(path)가 'menus' 테이블에 관리되고 있는지 확인
    const { data: menuRule } = await supabase
      .from("menus")
      .select("roles") // 허용된 권한 목록 (예: ['admin', 'director'])
      .eq("path", path)
      .eq("is_active", true) // 활성화된 메뉴만 체크
      .single();

    // (2) 만약 DB에 등록된 메뉴라면? (등록 안 된 페이지는 통과됨)
    if (menuRule) {
      // 내 정보(role) 가져오기
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      // 내 role이 없으면 기본값 'member' (안전을 위해)
      const myRole = profile?.role || "member";

      // 허용된 권한 목록(roles 배열) 가져오기 (null이면 빈 배열)
      const allowedRoles: string[] = menuRule.roles || [];

      // ★ 내 권한이 허용 목록에 포함되어 있는지 확인
      if (!allowedRoles.includes(myRole)) {
        const url = request.nextUrl.clone();
        url.pathname = "/"; // 메인으로 튕겨냄
        url.searchParams.set("error", "unauthorized"); // "권한이 없습니다" 메시지용
        return NextResponse.redirect(url);
      }
    } else if (path.startsWith("/admin")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile?.role !== "admin") {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.searchParams.set("error", "unauthorized");
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
