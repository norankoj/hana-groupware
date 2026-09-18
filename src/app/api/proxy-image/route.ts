// GET /api/proxy-image?bucket=notice&object=경로/파일명.webp
// MinIO(HTTP) → Next.js 서버 → 브라우저(HTTPS) 프록시
// Mixed Content 문제 해결용
//
// 공개 버킷(notice · vehicle · project)만 내려준다. 권한 확인을 하지 않는
// 경로라서, 여기로 private 버킷을 열면 선교펀드 증빙·지출 영수증을
// 경로만 알면 누구나 받을 수 있게 된다. 비공개 파일은 각자 권한을 확인하는
// /api/fund/proof, /api/expense/receipt 로만 내려준다.

import { NextRequest, NextResponse } from "next/server";
import {
  getMinioClient,
  BUCKETS,
  isPublicBucket,
  streamObject,
} from "@/utils/minio";

const NOT_FOUND = () =>
  new NextResponse("파일을 불러올 수 없습니다", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });

const CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  pdf: "application/pdf",
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const bucketKey = searchParams.get("bucket") ?? "notice";
    const objectName = searchParams.get("object");

    if (!objectName) {
      return new NextResponse("object 파라미터 필요", { status: 400 });
    }
    // private 버킷은 여기서 내주지 않는다 — 있는지 없는지도 알리지 않는다
    if (!isPublicBucket(bucketKey)) return NOT_FOUND();

    // 확장자로 Content-Type 을 정한다. 모를 때만 NAS 에 한 번 더 물어본다.
    const ext = objectName.split(".").pop()?.toLowerCase() ?? "";
    const contentType =
      CONTENT_TYPES[ext] ??
      ((
        await getMinioClient().statObject(BUCKETS[bucketKey], objectName)
      ).metaData?.["content-type"] as string | undefined) ??
      "image/jpeg";

    // 받는 대로 흘려보낸다 (다 모았다가 보내지 않는다)
    const body = await streamObject(bucketKey, objectName);

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable", // 1년 캐시
      },
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error
        ? error.message
        : String((error as { code?: string })?.code ?? error);
    console.error("[proxy-image] 오류:", msg);
    return NOT_FOUND();
  }
}
