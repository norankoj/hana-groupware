// GET /api/proxy-image?bucket=notice&object=경로/파일명.webp
// MinIO(HTTP) → Next.js 서버 → 브라우저(HTTPS) 프록시
// Mixed Content 문제 해결용

import { NextRequest, NextResponse } from "next/server";
import { getMinioClient, BUCKETS, BucketKey } from "@/utils/minio";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const bucketKey = (searchParams.get("bucket") as BucketKey) ?? "notice";
    const objectName = searchParams.get("object");

    if (!objectName) {
      return new NextResponse("object 파라미터 필요", { status: 400 });
    }

    const client = getMinioClient();
    const bucket = BUCKETS[bucketKey];

    // MinIO에서 메타데이터 + 파일 스트림 병렬 조회
    const [stat, stream] = await Promise.all([
      client.statObject(bucket, objectName),
      client.getObject(bucket, objectName),
    ]);

    // 스트림을 버퍼로 변환
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    const buffer = Buffer.concat(chunks);

    // 확장자로 Content-Type 추론 → 안 되면 MinIO 메타데이터 사용
    const ext = objectName.split(".").pop()?.toLowerCase() ?? "";
    const contentTypeMap: Record<string, string> = {
      webp: "image/webp",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      pdf: "application/pdf",
    };
    const contentType =
      contentTypeMap[ext] ??
      (stat.metaData?.["content-type"] as string | undefined) ??
      "image/jpeg";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable", // 1년 캐시
      },
    });
  } catch (error: any) {
    const msg = error?.message || error?.code || "unknown";
    console.error("[proxy-image] 오류:", msg);
    return new NextResponse("파일을 불러올 수 없습니다", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
