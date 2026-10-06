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
  "application/x-zip-compressed", // Windows 브라우저가 .zip 을 이렇게 보낸다
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "text/plain",
];

// 브라우저가 MIME 을 비워 보내거나 제각각인 한글 파일 — 확장자로 받는다
const EXT_TYPES: Record<string, string> = {
  hwp: "application/x-hwp",
  hwpx: "application/vnd.hancom.hwpx",
};

// 최대 10MB
const MAX_SIZE = 10 * 1024 * 1024;

// 조각 업로드(chunk_of) 때 원래 파일 이름으로 확인하는 확장자 — 조각 자체는 형식이 없다
const CHUNK_EXTS = new Set([
  "jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif", "bmp", "tif", "tiff",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "zip", "hwp", "hwpx",
]);

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

    // 배포 서버(Vercel)는 요청 하나에 4.5MB 까지라 큰 파일은 브라우저가 조각내 보낸다.
    // 조각은 형식을 알 수 없으니 원래 파일 이름(chunk_of)의 확장자로 확인한다
    const chunkOf = formData.get("chunk_of") as string | null;
    const ext = (chunkOf ?? file.name).split(".").pop()?.toLowerCase() ?? "";
    const mimeType = chunkOf
      ? CHUNK_EXTS.has(ext) ? "application/octet-stream" : undefined
      : ALLOWED_TYPES.includes(file.type) ? file.type : EXT_TYPES[ext];
    if (!mimeType) return NextResponse.json({ error: "지원하지 않는 파일 형식입니다" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const objectName = await uploadToMinio(bucketKey, buffer, file.name, mimeType, folder || undefined);

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
