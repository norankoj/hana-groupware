// GET /api/presigned?bucket=private&object=파일경로&expiry=3600
// Private 파일 임시 접근 URL 발급 (기본 1시간)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getPresignedUrl, BucketKey } from "@/utils/minio";

export async function GET(req: NextRequest) {
  try {
    // 인증 확인
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const bucketKey = (searchParams.get("bucket") as BucketKey) ?? "private";
    const objectName = searchParams.get("object");
    const expiry = parseInt(searchParams.get("expiry") ?? "3600", 10);

    if (!objectName) {
      return NextResponse.json({ error: "object 파라미터 필요" }, { status: 400 });
    }

    const url = await getPresignedUrl(bucketKey, objectName, expiry);

    return NextResponse.json({ url });
  } catch (error: any) {
    console.error("[presigned] 오류:", error);
    return NextResponse.json(
      { error: error.message ?? "URL 발급 실패" },
      { status: 500 },
    );
  }
}
