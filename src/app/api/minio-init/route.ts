// GET /api/minio-init
// 버킷 없으면 생성 + 공개 읽기 정책 설정 (최초 1회 실행)

import { NextResponse } from "next/server";
import { getMinioClient, BUCKETS } from "@/utils/minio";

const PUBLIC_BUCKETS = [BUCKETS.notice, BUCKETS.vehicle, BUCKETS.project];

export async function GET() {
  const client  = getMinioClient();
  const results: Record<string, string> = {};

  for (const bucket of PUBLIC_BUCKETS) {
    try {
      // 버킷 없으면 생성
      const exists = await client.bucketExists(bucket);
      if (!exists) {
        await client.makeBucket(bucket);
        results[bucket] = "🆕 버킷 생성됨";
      } else {
        results[bucket] = "✔ 이미 존재";
      }

      // 공개 읽기 정책 적용
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
      results[bucket] += " → ✅ 공개 정책 설정 완료";
    } catch (e: any) {
      results[bucket] = (results[bucket] ?? "") + ` ❌ 실패: ${e.message}`;
    }
  }

  return NextResponse.json(results);
}
