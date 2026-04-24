// POST /api/upload  — MinIO 파일 업로드
// DELETE /api/upload — MinIO 파일 삭제
//
// POST FormData 필드:
//   file   : 업로드할 파일 (File)
//   bucket : "notice" | "vehicle" | "private"
//   folder : (선택) 저장 폴더명 예) "123"

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { uploadToMinio, getPublicUrl, deleteFromMinio, BucketKey } from "@/utils/minio";

// 허용 MIME 타입
const ALLOWED_TYPES = [
  "image/jpeg", "image/jpg",   // JPEG (일부 Android는 image/jpg로 전송)
  "image/png", "image/webp", "image/gif",
  "image/heic", "image/heif",  // iOS 카메라 사진
  "image/avif",                // Android 12+ 기본 포맷 (Pixel, 갤럭시 등)
  "image/bmp", "image/x-bmp", // BMP (일부 구형 Android)
  "image/tiff", "image/x-tiff", // TIFF (Samsung Pro 모드 등)
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/msword",
  "application/zip",
];

// 최대 10MB
const MAX_SIZE = 10 * 1024 * 1024;

// ── 업로드 ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const bucketKey = (formData.get("bucket") as BucketKey) ?? "notice";
    const folder = (formData.get("folder") as string) ?? "";

    if (!file) return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "파일 크기는 10MB 이하만 가능합니다" }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "지원하지 않는 파일 형식입니다" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const objectName = await uploadToMinio(bucketKey, buffer, file.name, file.type, folder || undefined);

    // Private 버킷은 URL 노출 X, objectName만 반환
    const isPrivate = bucketKey === "private";
    const url = isPrivate ? null : getPublicUrl(bucketKey, objectName);

    return NextResponse.json({ success: true, objectName, url, bucket: bucketKey });
  } catch (error: any) {
    console.error("[upload POST] 오류:", error);
    const msg = error?.message || error?.code || String(error) || "업로드 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── 삭제 ──────────────────────────────────────────────────────────────────
// DELETE /api/upload?bucket=notice&object=파일경로
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const bucketKey = (searchParams.get("bucket") as BucketKey) ?? "notice";
    const objectName = searchParams.get("object");

    if (!objectName) return NextResponse.json({ error: "object 파라미터 필요" }, { status: 400 });

    await deleteFromMinio(bucketKey, objectName);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[upload DELETE] 오류:", error);
    return NextResponse.json({ error: error.message ?? "삭제 실패" }, { status: 500 });
  }
}
