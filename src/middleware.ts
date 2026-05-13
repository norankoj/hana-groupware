// src/middleware.ts
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  // 1. [예외 처리] 로그인 없이 접근 가능한 경로 설정
  if (
    request.nextUrl.pathname.startsWith("/api/auth") ||
    request.nextUrl.pathname.startsWith("/api/sms") ||
    request.nextUrl.pathname.startsWith("/api/cron") ||
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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 3. 현재 로그인된 유저 정보 가져오기
  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error) user = data.user;
  } catch {
    // Supabase 일시 장애 시 — 세션 쿠키가 있으면 통과, 없으면 로그인 페이지로
    const hasSession = request.cookies.has("sb-access-token") ||
      [...request.cookies.getAll().map((c) => c.name)].some((n) => n.startsWith("sb-"));
    if (!hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return response;
  }

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
  // [보안 규칙 C] DB 기반 메뉴 권한 체크
  // profile + menu 쿼리를 병렬로 실행해 지연 최소화
  // ============================================================
  if (user) {
    const isAdminPath = path.startsWith("/admin");

    // menu 규칙과 내 role을 동시에 조회
    // menus: maybeSingle() — 해당 path 메뉴가 없으면 null (single()은 없을 때 406 반환)
    const [{ data: menuRule }, { data: profile }] = await Promise.all([
      supabase
        .from("menus")
        .select("roles")
        .eq("path", path)
        .eq("is_active", true)
        .maybeSingle(),
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    ]);

    const myRole = profile?.role || "member";

    // vehicle_manager: 메인 페이지 접근 시 /vehicle로 리다이렉트
    if (myRole === "vehicle_manager" && path === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/vehicle";
      return NextResponse.redirect(url);
    }

    // vehicle_manager: /vehicle 하위 경로 + /api/* 허용 (그 외 차단)
    if (myRole === "vehicle_manager" && !path.startsWith("/vehicle") && !path.startsWith("/api") && path !== "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/vehicle";
      return NextResponse.redirect(url);
    }

    if (menuRule) {
      // DB에 등록된 메뉴: 허용 역할 목록 검사 (vehicle_manager는 별도 처리했으므로 제외)
      const allowedRoles: string[] = menuRule.roles || [];
      if (!allowedRoles.includes(myRole) && path !== "/" && myRole !== "vehicle_manager") {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.searchParams.set("error", "unauthorized");
        return NextResponse.redirect(url);
      }
    } else if (isAdminPath && myRole !== "admin") {
      // DB 미등록 admin 경로: admin 역할만 허용
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.searchParams.set("error", "unauthorized");
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
