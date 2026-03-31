import { NextResponse } from "next/server";

// WeatherAPI.com — https://www.weatherapi.com (무료 플랜: 월 100만 건)
const API_KEY = process.env.WEATHERAPI_KEY ?? "";
// 경기도 용인시 수지구 서천동 기준 좌표 (환경변수로도 오버라이드 가능)
const LAT = process.env.WEATHER_LAT ?? "37.3229";
const LON = process.env.WEATHER_LON ?? "127.1012";

export const revalidate = 1800; // 30분 캐시

/** WeatherAPI condition code → 이모지 */
function codeToEmoji(code: number, isDay: number): string {
  if (code === 1000) return isDay ? "☀️" : "🌙";
  if (code === 1003) return "⛅";
  if (code === 1006 || code === 1009) return "☁️";
  if ([1030, 1135, 1147].includes(code)) return "🌫️";
  if (
    [
      1063, 1072, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189, 1192, 1195,
      1198, 1201, 1240, 1243, 1246, 1249, 1252,
    ].includes(code)
  )
    return "🌧️";
  if (
    [
      1066, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1255, 1258, 1261,
      1264,
    ].includes(code)
  )
    return "❄️";
  if ([1087, 1273, 1276, 1279, 1282].includes(code)) return "⛈️";
  return "🌤️";
}

/** PM2.5 수치 → 에어코리아 기준 등급 */
function pm25ToAqi(pm25: number): { label: string; color: string } {
  if (pm25 <= 15) return { label: "좋음", color: "text-blue-500" };
  if (pm25 <= 35) return { label: "보통", color: "text-green-500" };
  if (pm25 <= 75) return { label: "나쁨", color: "text-yellow-500" };
  return { label: "매우나쁨", color: "text-red-600" };
}

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json(
      {
        error:
          "WEATHERAPI_KEY 환경변수가 설정되지 않았습니다. weatherapi.com에서 무료 API 키를 발급 받으세요.",
      },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(
      `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${LAT},${LON}&aqi=yes&lang=ko`,
      { next: { revalidate: 1800 } },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `WeatherAPI 오류 ${res.status}: ${err?.error?.message ?? res.statusText}`,
      );
    }

    const data = await res.json();
    const current = data.current;
    const condition = current.condition;
    const air = current.air_quality;

    const pm25: number | null =
      air?.pm2_5 != null ? Math.round(air.pm2_5) : null;
    const aqiLabel = pm25 != null ? pm25ToAqi(pm25) : null;

    return NextResponse.json({
      temp: Math.round(current.temp_c),
      feelsLike: Math.round(current.feelslike_c),
      description: condition.text ?? "",
      // 이모지 직접 변환 (icon URL 대신 code 사용)
      icon: String(condition.code) + (current.is_day ? "_d" : "_n"),
      conditionCode: condition.code,
      isDay: current.is_day,
      emoji: codeToEmoji(condition.code, current.is_day),
      humidity: current.humidity,
      pm25,
      aqiLabel,
    });
  } catch (e) {
    console.error("[weather/route]", e);
    return NextResponse.json(
      { error: "날씨 정보를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
