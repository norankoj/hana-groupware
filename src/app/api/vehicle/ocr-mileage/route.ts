// POST /api/vehicle/ocr-mileage
// FormData: { image: File }
// Returns: { mileage: number | null, fuel: number | null }
//
// Claude Vision API를 사용해 계기판 이미지에서 주행거리와 연료량을 추출합니다.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  try {
    // 인증 확인
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === "your-anthropic-api-key-here") {
      return NextResponse.json(
        { error: "OCR API 키가 설정되지 않았습니다." },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;
    if (!imageFile) {
      return NextResponse.json({ error: "이미지 파일이 없습니다." }, { status: 400 });
    }

    // 파일을 base64로 변환
    const arrayBuffer = await imageFile.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    // MIME 타입 결정 (Claude API 지원 형식)
    const rawType = imageFile.type || "image/jpeg";
    const mimeType = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(rawType)
      ? rawType
      : "image/jpeg";

    // Claude API 호출 (claude-haiku — 빠르고 저렴)
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 60,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: base64Data,
                },
              },
              {
                type: "text",
                text: `이 차량 계기판 사진에서 두 가지를 추출하세요.
1. ODO(총 주행거리) 숫자 (km)
2. 연료 게이지 잔량 (0~100% 중 가장 가까운 값: 0, 12, 25, 37, 50, 62, 75, 87, 100)

JSON으로만 답하세요. 예: {"mileage":132944,"fuel":75}
읽을 수 없으면 null 사용. 예: {"mileage":null,"fuel":null}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      console.error("[ocr-mileage] Anthropic API 오류:", errBody);
      return NextResponse.json({ mileage: null, fuel: null });
    }

    const data = await response.json();
    const rawText = (data.content?.[0]?.text ?? "").trim();

    // JSON 파싱
    let mileage: number | null = null;
    let fuel: number | null = null;
    try {
      const jsonMatch = rawText.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const rawMileage = parsed.mileage;
        const rawFuel = parsed.fuel;

        // 주행거리 검증 (1,000 ~ 9,999,999 km)
        if (typeof rawMileage === "number" && rawMileage > 0 && rawMileage < 9_999_999) {
          mileage = rawMileage;
        }

        // 연료 검증 (0~100)
        const validFuelValues = [0, 12, 25, 37, 50, 62, 75, 87, 100];
        if (typeof rawFuel === "number" && validFuelValues.includes(rawFuel)) {
          fuel = rawFuel;
        } else if (typeof rawFuel === "number" && rawFuel >= 0 && rawFuel <= 100) {
          // 유효값 중 가장 가까운 값으로 보정
          fuel = validFuelValues.reduce((a, b) =>
            Math.abs(b - rawFuel) < Math.abs(a - rawFuel) ? b : a
          );
        }
      }
    } catch {
      console.error("[ocr-mileage] JSON 파싱 실패:", rawText);
    }

    return NextResponse.json({ mileage, fuel });
  } catch (error: any) {
    console.error("[ocr-mileage] 오류:", error);
    return NextResponse.json({ mileage: null, fuel: null });
  }
}
