// GET /api/calendar
// 구글 캘린더 API — 서비스 계정으로 인증 (만료 없음)
import { NextResponse } from "next/server";
import { createSign } from "crypto";

export const revalidate = 300; // 5분 캐시

// 표시할 캘린더 이름 목록 (| 구분, 미설정 시 전체 표시)
// 예: GOOGLE_CALENDAR_FILTER=고목사 공적스케쥴|교회일정|사역,훈련,참조
// ※ 캘린더 이름 자체에 쉼표가 포함될 수 있으므로 | 를 구분자로 사용
const CALENDAR_FILTER = process.env.GOOGLE_CALENDAR_FILTER
  ? process.env.GOOGLE_CALENDAR_FILTER.split("|").map((s) => s.trim())
  : [];

/** 서비스 계정 JWT → Access Token 발급 (만료 없음) */
async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!;
  // Vercel 환경변수에서 \n 이스케이프된 경우 복원
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header  = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: email,
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const b64 = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signingInput = `${b64(header)}.${b64(payload)}`;

  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(privateKey, "base64url");

  const jwt = `${signingInput}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token)
    throw new Error("서비스 계정 토큰 발급 실패: " + JSON.stringify(data));
  return data.access_token;
}

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;       // ISO string
  end: string;         // ISO string
  isAllDay: boolean;
  calendarName: string;
  calendarColor: string;
  location?: string;
  description?: string;
};

export async function GET() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    return NextResponse.json(
      { error: "구글 서비스 계정 환경변수가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  try {
    const accessToken = await getAccessToken();
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // ① 내 캘린더 목록 전체 조회
    const listRes = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50",
      { headers: authHeader },
    );
    const listData = await listRes.json();
    const calendars: { id: string; summary: string; backgroundColor: string; accessRole: string }[] =
      listData.items ?? [];

    // ② KST 기준 올해 1월 1일 ~ 12월 31일 전체 범위
    // Vercel 서버는 UTC이므로 KST(+9) 오프셋 직접 계산
    const KST = 9 * 60 * 60 * 1000;
    const nowKST = new Date(Date.now() + KST);
    const y = nowKST.getUTCFullYear();
    // 올해 1월 1일 00:00 KST → UTC
    const timeMin = new Date(Date.UTC(y, 0, 1) - KST).toISOString();
    // 내년 1월 1일 00:00 KST → UTC (= 올해 12월 31일 자정 이후)
    const timeMax = new Date(Date.UTC(y + 1, 0, 1) - KST).toISOString();

    // ③ 각 캘린더별 이벤트 병렬 조회 (읽기 권한 있는 것 + 필터 적용)
    const eventFetches = calendars
      .filter((cal) => {
        if (cal.accessRole === "freeBusyReader") return false;
        // GOOGLE_CALENDAR_FILTER 설정 시 해당 캘린더만 표시
        if (CALENDAR_FILTER.length > 0)
          return CALENDAR_FILTER.includes(cal.summary);
        return true;
      })
      .map(async (cal) => {
        const params = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "500",
        });
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
          { headers: authHeader },
        ).catch(() => null);

        if (!res?.ok) return [];

        const data = await res.json();
        return (data.items ?? []).map((ev: any) => ({
          id: ev.id,
          title: ev.summary ?? "(제목 없음)",
          start: ev.start?.dateTime ?? ev.start?.date ?? "",
          end: ev.end?.dateTime ?? ev.end?.date ?? "",
          isAllDay: !ev.start?.dateTime,
          calendarName: cal.summary,
          calendarColor: cal.backgroundColor ?? "#4285F4",
          location: ev.location ?? undefined,
          description: ev.description ?? undefined,
        }));
      });

    const results = await Promise.all(eventFetches);
    const allEvents: CalendarEvent[] = results
      .flat()
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    return NextResponse.json({ events: allEvents, updatedAt: new Date().toISOString() });
  } catch (e: any) {
    console.error("[calendar/route]", e.message);
    return NextResponse.json({ error: "캘린더 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}
