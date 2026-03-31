// GET /api/calendar
// 구글 캘린더 API — 내 계정의 모든 캘린더에서 오늘~7일 이내 일정 조회
import { NextResponse } from "next/server";

export const revalidate = 900; // 15분 캐시

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN!;

/** Refresh Token → Access Token 발급 */
async function getAccessToken(): Promise<string> {
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
  if (!data.access_token) throw new Error("Access token 발급 실패: " + JSON.stringify(data));
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
};

export async function GET() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    return NextResponse.json(
      { error: "구글 캘린더 환경변수가 설정되지 않았습니다." },
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

    // ② 오늘 00:00 ~ 14일 후까지 범위 설정
    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14).toISOString();

    // ③ 각 캘린더별 이벤트 병렬 조회 (읽기 권한 있는 것만)
    const eventFetches = calendars
      .filter((cal) => cal.accessRole !== "freeBusyReader")
      .map(async (cal) => {
        const params = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "20",
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
