import { NextResponse } from "next/server";

// ① IQAir AirVisual — 날씨 데이터 (무료: 500건/일, 30분 캐시 → 실제 48건/일)
const IQAIR_KEY = process.env.IQAIR_API_KEY ?? "";
// ② 에어코리아 — PM10·PM2.5 실측값 (data.go.kr 무료, 측정소: 수지)
const AIRKOREA_KEY = process.env.AIRKOREA_API_KEY ?? "";
const AIRKOREA_STATION = process.env.AIRKOREA_STATION ?? "수지"; // 가장 가까운 측정소

// 경기도 용인시 수지구 서천동 기준 좌표
const LAT = process.env.WEATHER_LAT ?? "37.3229";
const LON = process.env.WEATHER_LON ?? "127.1012";

export const revalidate = 1800; // 30분 캐시

/** IQAir 아이콘 코드 → 이모지 */
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

/** IQAir 아이콘 코드 → 한국어 설명 */
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

/** PM10 수치 → 에어코리아 기준 등급 */
function pm10Grade(v: number): { label: string; face: string; color: string } {
  if (v <= 30) return { label: "좋음", face: "😊", color: "text-teal-600" };
  if (v <= 80) return { label: "보통", face: "🙂", color: "text-blue-600" };
  if (v <= 150) return { label: "나쁨", face: "😟", color: "text-orange-500" };
  return { label: "매우나쁨", face: "😤", color: "text-red-600" };
}

/** PM2.5 수치 → 에어코리아 기준 등급 */
function pm25Grade(v: number): { label: string; face: string; color: string } {
  if (v <= 15) return { label: "좋음", face: "😊", color: "text-teal-600" };
  if (v <= 35) return { label: "보통", face: "🙂", color: "text-blue-600" };
  if (v <= 75) return { label: "나쁨", face: "😟", color: "text-orange-500" };
  return { label: "매우나쁨", face: "😤", color: "text-red-600" };
}

/** AQI US 지수 → 등급 (에어코리아 키 없을 때 폴백) */
function aqiusGrade(aqi: number): { label: string; face: string; color: string } {
  if (aqi <= 50) return { label: "좋음", face: "😊", color: "text-teal-600" };
  if (aqi <= 100) return { label: "보통", face: "🙂", color: "text-blue-600" };
  if (aqi <= 150) return { label: "민감군 나쁨", face: "😐", color: "text-yellow-600" };
  if (aqi <= 200) return { label: "나쁨", face: "😟", color: "text-orange-500" };
  if (aqi <= 300) return { label: "매우나쁨", face: "😤", color: "text-red-600" };
  return { label: "위험", face: "🤢", color: "text-red-800" };
}

export async function GET() {
  if (!IQAIR_KEY) {
    return NextResponse.json(
      { error: "IQAIR_API_KEY 환경변수가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  try {
    // ── ① IQAir 날씨 + AQI ──────────────────────────────────────────
    const [iqairRes, airkoreaRes] = await Promise.allSettled([
      fetch(
        `https://api.airvisual.com/v2/nearest_city?lat=${LAT}&lon=${LON}&key=${IQAIR_KEY}`,
        { next: { revalidate: 1800 } },
      ),
      AIRKOREA_KEY
        ? fetch(
            // serviceKey는 Encoding 키(이미 URL인코딩됨)를 직접 삽입
            // stationName 등 나머지만 encodeURIComponent 처리
            `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty` +
              `?serviceKey=${AIRKOREA_KEY}` +
              `&stationName=${encodeURIComponent(AIRKOREA_STATION)}` +
              `&dataTerm=DAILY&pageNo=1&numOfRows=1&returnType=json&ver=1.0`,
            { next: { revalidate: 1800 } },
          )
        : Promise.reject("AIRKOREA_API_KEY 없음"),
    ]);

    // IQAir 파싱
    if (iqairRes.status === "rejected") throw new Error("IQAir 요청 실패");
    const iqairJson = await iqairRes.value.json();
    if (iqairJson.status !== "success") throw new Error(`IQAir 오류: ${iqairJson.status}`);

    const wx = iqairJson.data?.current?.weather;
    const pollution = iqairJson.data?.current?.pollution;
    if (!wx) throw new Error("IQAir 날씨 데이터 누락");

    const icon: string = wx.ic ?? "01d";
    const aqius: number | null = pollution?.aqius ?? null;
    // IQAir PM2.5 농도 (μg/m³) — 에어코리아 실패 시 폴백용
    const iqairPm25: number | null =
      pollution?.p2?.conc != null ? Math.round(Number(pollution.p2.conc)) : null;

    // ── ② 에어코리아 미세먼지 파싱 ────────────────────────────────────
    let pm10: number | null = null;
    let pm25: number | null = null;

    if (airkoreaRes.status === "fulfilled") {
      try {
        const akJson = await airkoreaRes.value.json();
        const item = akJson?.response?.body?.items?.[0];
        if (item) {
          // 플래그(통신장애 등)가 있으면 해당 항목은 null 처리
          if (!item.pm10Flag) {
            const v = parseFloat(item.pm10Value);
            if (!isNaN(v) && v >= 0) pm10 = Math.round(v);
          }
          if (!item.pm25Flag) {
            const v = parseFloat(item.pm25Value);
            if (!isNaN(v) && v >= 0) pm25 = Math.round(v);
          }
        }
      } catch {
        // 인증키 오류 또는 XML 응답 → IQAir 폴백으로 처리
      }
    }

    // 에어코리아 PM2.5 없으면 IQAir PM2.5로 폴백, 그것도 없으면 AQI 기반 등급
    if (pm25 == null && iqairPm25 != null) pm25 = iqairPm25;

    const airGrade =
      pm25 != null
        ? pm25Grade(pm25)
        : pm10 != null
          ? pm10Grade(pm10)
          : aqius != null
            ? aqiusGrade(aqius)
            : null;

    return NextResponse.json({
      temp: Math.round(wx.tp),
      feelsLike: Math.round(wx.tp),
      description: iconToDescription(icon),
      emoji: iconToEmoji(icon),
      humidity: wx.hu,
      // 미세먼지
      pm10,                          // μg/m³ (에어코리아)
      pm25,                          // μg/m³ (에어코리아)
      aqius,                         // AQI US (IQAir, 폴백용)
      airGrade,                      // 표시용 등급
    });
  } catch (e) {
    console.error("[weather/route]", e);
    return NextResponse.json(
      { error: "날씨 정보를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
