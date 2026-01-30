import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  // 1. [예외 처리] 인증번호 발송 API는 로그인이 없어도 접근 가능해야 함
  // (이 코드가 없으면 "로그인 안 했네?" 하고 307로 튕겨버립니다)
  if (request.nextUrl.pathname.startsWith("/api/auth/send-verification")) {
    return NextResponse.next();
  }

  // 2. 나머지 모든 경로는 기존처럼 세션 검사 및 갱신 실행
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 아래 경로를 제외한 모든 경로에서 미들웨어가 실행됩니다:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화 파일)
     * - favicon.ico (파비콘)
     * - 이미지 파일들 (svg, png, jpg 등)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
