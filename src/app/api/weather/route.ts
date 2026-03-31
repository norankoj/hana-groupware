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

/** AQI US 지수 → 한국어 등급 (미국 EPA 기준) */
function aqiusToLabel(aqi: number): { label: string; color: string } {
  if (aqi <= 50) return { label: "좋음", color: "text-blue-500" };
  if (aqi <= 100) return { label: "보통", color: "text-green-500" };
  if (aqi <= 150) return { label: "민감군 나쁨", color: "text-yellow-500" };
  if (aqi <= 200) return { label: "나쁨", color: "text-orange-500" };
  if (aqi <= 300) return { label: "매우나쁨", color: "text-red-500" };
  return { label: "위험", color: "text-red-700" };
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
      `https://api.airvisual.com/v2/nearest_city?lat=${LAT}&lon=${LON}&key=${API_KEY}`,
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

    // IQAir 무료 플랜은 PM2.5 농도(p2.conc) 미제공 → AQI US 지수 사용
    const aqius: number | null = pollution.aqius ?? null;

    return NextResponse.json({
      temp: Math.round(weather.tp),
      feelsLike: Math.round(weather.tp),
      description: iconToDescription(icon),
      emoji: iconToEmoji(icon),
      humidity: weather.hu,
      pm25: null,           // 무료 플랜 미제공
      aqius,                // AQI US 지수 (0~500)
      aqiLabel: aqius != null ? aqiusToLabel(aqius) : null,
    });
  } catch (e) {
    console.error("[weather/route]", e);
    return NextResponse.json(
      { error: "날씨 정보를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
