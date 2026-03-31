// GET /api/auth/google/authorize
// 구글 OAuth 인증 URL 생성 → 일회성 Refresh Token 발급용
import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID 환경변수가 없습니다." },
      { status: 500 },
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "http://localhost:3000/api/auth/google/callback",
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    access_type: "offline",   // refresh_token 발급을 위해 필수
    prompt: "consent",        // 항상 refresh_token 새로 발급
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  return NextResponse.redirect(url);
}
