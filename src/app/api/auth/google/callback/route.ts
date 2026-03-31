// GET /api/auth/google/callback
// 구글 OAuth 콜백 — code를 받아 refresh_token 화면에 표시 (일회성 설정용)
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return new NextResponse(
      html("❌ 인증 거부됨", `<p>구글 인증이 취소되었습니다: <code>${error}</code></p>`),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (!code) {
    return new NextResponse(
      html("❌ 코드 없음", "<p>인증 코드가 없습니다. 다시 시도해주세요.</p>"),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  try {
    // code → access_token + refresh_token 교환
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: "http://localhost:3000/api/auth/google/callback",
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokens.refresh_token) {
      return new NextResponse(
        html(
          "⚠️ Refresh Token 없음",
          `<p>refresh_token이 없습니다. 아래 URL로 다시 시도해주세요:</p>
           <a href="/api/auth/google/authorize" style="color:blue">다시 인증하기</a>
           <pre>${JSON.stringify(tokens, null, 2)}</pre>`,
        ),
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    return new NextResponse(
      html(
        "✅ Refresh Token 발급 완료",
        `<p>아래 값을 복사해서 <code>.env.local</code>에 추가하세요:</p>
         <div style="background:#f0f4ff;padding:16px;border-radius:8px;margin:16px 0;">
           <code style="font-size:14px;word-break:break-all;">
             GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}
           </code>
         </div>
         <button onclick="navigator.clipboard.writeText('GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}');this.textContent='✅ 복사됨!'"
           style="padding:8px 20px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
           클립보드에 복사
         </button>
         <p style="margin-top:24px;color:#6b7280;font-size:13px;">
           ⚠️ 이 페이지를 닫은 후에는 다시 볼 수 없습니다. 반드시 복사해두세요!<br>
           저장 완료 후 개발 서버를 재시작해주세요.
         </p>`,
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  } catch (e: any) {
    return new NextResponse(
      html("❌ 오류 발생", `<pre>${e.message}</pre>`),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

function html(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 640px; margin: 60px auto; padding: 0 20px; color: #111; }
    h1 { font-size: 22px; margin-bottom: 16px; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
    pre { background: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${body}
</body>
</html>`;
}
