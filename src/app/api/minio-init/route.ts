// GET /api/minio-init
// notice-images, vehicle-images 버킷 공개 읽기 정책 설정 (최초 1회 실행)

import { NextResponse } from "next/server";
import { getMinioClient, BUCKETS } from "@/utils/minio";

const PUBLIC_BUCKETS = [BUCKETS.notice, BUCKETS.vehicle];

export async function GET() {
  const results: Record<string, string> = {};

  for (const bucket of PUBLIC_BUCKETS) {
    try {
      const client = getMinioClient();
      const policy = JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Principal: { AWS: ["*"] },
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${bucket}/*`],
        }],
      });
      await client.setBucketPolicy(bucket, policy);
      results[bucket] = "✅ 공개 정책 설정 완료";
    } catch (e: any) {
      results[bucket] = `❌ 실패: ${e.message}`;
    }
  }

  return NextResponse.json(results);
}
