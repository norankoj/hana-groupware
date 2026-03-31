// GET /api/calendar/list
// 현재 구글 계정의 모든 캘린더 목록 확인용 (관리자 설정 시 사용)
import { NextResponse } from "next/server";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN!;

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Access token 발급 실패");
  return data.access_token;
}

export async function GET() {
  try {
    const accessToken = await getAccessToken();
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await res.json();

    const calendars = (data.items ?? []).map((c: any) => ({
      id: c.id,
      name: c.summary,
      color: c.backgroundColor,
      accessRole: c.accessRole,
    }));

    // HTML로 보기 좋게 표시
    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>캘린더 목록</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    p { color: #666; font-size: 14px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f3f4f6; padding: 10px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
    td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; }
    .dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 12px; word-break: break-all; }
    .copy-btn { padding: 2px 8px; font-size: 11px; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer; background: white; }
    .copy-btn:hover { background: #f3f4f6; }
    .hint { margin-top: 32px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; font-size: 13px; }
    .hint code { background: #dbeafe; }
  </style>
</head>
<body>
  <h1>📅 내 구글 캘린더 목록</h1>
  <p>아래 캘린더 이름을 복사해서 <code>.env.local</code>의 <code>GOOGLE_CALENDAR_FILTER</code>에 쉼표로 구분해 붙여넣으세요.</p>
  <table>
    <thead>
      <tr>
        <th>캘린더 이름</th>
        <th>권한</th>
        <th>복사</th>
      </tr>
    </thead>
    <tbody>
      ${calendars
        .map(
          (c: any) => `
      <tr>
        <td>
          <span class="dot" style="background:${c.color}"></span>
          ${c.name}
        </td>
        <td style="color:#6b7280">${c.accessRole}</td>
        <td>
          <button class="copy-btn" onclick="navigator.clipboard.writeText('${c.name.replace(/'/g, "\\'")}');this.textContent='✅'">
            복사
          </button>
        </td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>

  <div class="hint">
    <strong>💡 .env.local 설정 예시</strong><br><br>
    <code>GOOGLE_CALENDAR_FILTER=고목사 공직스케줄,교회일정,청년 1부,행정실</code><br><br>
    ⚠️ 설정 후 개발 서버를 재시작해야 반영됩니다.
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
