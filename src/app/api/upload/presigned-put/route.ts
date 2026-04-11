// GET /api/upload/presigned-put?bucket=notice&folder=123&filename=photo.webp
// 클라이언트가 MinIO에 직접 업로드할 수 있는 Presigned PUT URL 발급
// → 브라우저 → MinIO 직접 업로드 (Next.js 서버 경유 없음)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getPresignedPutUrl, getPublicUrl, BUCKETS, BucketKey } from "@/utils/minio";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const bucketKey = (searchParams.get("bucket") as BucketKey) ?? "notice";
    const folder = searchParams.get("folder") ?? "";
    const filename = searchParams.get("filename") ?? "file";

    const ext = filename.split(".").pop() ?? "bin";
    const baseName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const objectName = folder ? `${folder}/${baseName}` : baseName;

    const putUrl = await getPresignedPutUrl(bucketKey, objectName);
    const publicUrl = bucketKey !== "private" ? getPublicUrl(bucketKey, objectName) : null;

    return NextResponse.json({ putUrl, objectName, url: publicUrl });
  } catch (error: any) {
    console.error("[presigned-put] 오류:", error);
    return NextResponse.json({ error: error.message ?? "URL 발급 실패" }, { status: 500 });
  }
}
