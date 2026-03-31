import { NextResponse } from "next/server";

// IQAir AirVisual API — https://www.iqair.com/dashboard (무료: 500건/일)
// 에어코리아 측정소 데이터 포함 → 한국 미세먼지 정확도 높음
const API_KEY = process.env.IQAIR_API_KEY ?? "";
// 경기도 용인시 수지구 서천동 기준 좌표 (환경변수로도 오버라이드 가능)
const LAT = process.env.WEATHER_LAT ?? "37.3229";
const LON = process.env.WEATHER_LON ?? "127.1012";

export const revalidate = 1800; // 30분 캐시 → 하루 최대 48건 호출

/**
 * IQAir 아이콘 코드 (OpenWeatherMap 동일 포맷) → 이모지
 * 예: "01d" = 맑음(낮), "01n" = 맑음(밤), "10d" = 비(낮)
 */
function iconToEmoji(icon: string): string {
  if (icon.startsWith("01")) return icon.endsWith("d") ? "☀️" : "🌙";
  if (icon.startsWith("02")) return "⛅";
  if (icon.startsWith("03") || icon.startsWith("04")) return "☁️";
  if (icon.startsWith("09") || icon.startsWith("10")) return "🌧️";
  if (icon.startsWith("11")) return "⛈️";
  if (icon.startsWith("13")) return "❄️";
  if (icon.startsWith("50")) return "🌫️";
  return "🌤️";
}

/** IQAir 아이콘 코드 → 한국어 날씨 설명 */
function iconToDescription(icon: string): string {
  if (icon.startsWith("01")) return "맑음";
  if (icon.startsWith("02")) return "구름 조금";
  if (icon.startsWith("03")) return "구름 많음";
  if (icon.startsWith("04")) return "흐림";
  if (icon.startsWith("09")) return "소나기";
  if (icon.startsWith("10")) return "비";
  if (icon.startsWith("11")) return "천둥번개";
  if (icon.startsWith("13")) return "눈";
  if (icon.startsWith("50")) return "안개";
  return "흐림";
}

/** PM2.5 수치 → 에어코리아 기준 등급 */
function pm25ToAqiLabel(pm25: number): { label: string; color: string } {
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
          "IQAIR_API_KEY 환경변수가 설정되지 않았습니다. iqair.com/dashboard에서 무료 API 키를 발급받으세요.",
      },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(
      `https://api.airvisualdata.com/v2/nearest_city?lat=${LAT}&lon=${LON}&key=${API_KEY}`,
      { next: { revalidate: 1800 } },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `IQAir API 오류 ${res.status}: ${err?.data?.message ?? res.statusText}`,
      );
    }

    const json = await res.json();

    if (json.status !== "success") {
      throw new Error(`IQAir 응답 오류: ${json.status}`);
    }

    const weather = json.data?.current?.weather;
    const pollution = json.data?.current?.pollution;

    if (!weather || !pollution) {
      throw new Error("IQAir 응답 데이터 누락");
    }

    const icon: string = weather.ic ?? "01d";
    const pm25: number | null =
      pollution.p2?.conc != null ? Math.round(pollution.p2.conc) : null;

    return NextResponse.json({
      temp: Math.round(weather.tp),
      feelsLike: Math.round(weather.tp), // IQAir 무료 플랜은 체감온도 미제공 → 기온으로 대체
      description: iconToDescription(icon),
      emoji: iconToEmoji(icon),
      humidity: weather.hu,
      pm25,
      aqiLabel: pm25 != null ? pm25ToAqiLabel(pm25) : null,
    });
  } catch (e) {
    console.error("[weather/route]", e);
    return NextResponse.json(
      { error: "날씨 정보를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
