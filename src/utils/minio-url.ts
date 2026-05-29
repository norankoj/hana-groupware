// src/utils/minio-url.ts
// 클라이언트에서 안전하게 사용 가능한 MinIO URL 유틸
// (minio 패키지 미사용 — Node.js 전용 모듈 없음)

const BUCKET_NAMES: Record<string, string> = {
  notice:  process.env.NEXT_PUBLIC_MINIO_BUCKET_NOTICE   ?? "notice-images",
  vehicle: process.env.NEXT_PUBLIC_MINIO_BUCKET_VEHICLE  ?? "vehicle-images",
  private: process.env.NEXT_PUBLIC_MINIO_BUCKET_PRIVATE  ?? "private-files",
  project: process.env.NEXT_PUBLIC_MINIO_BUCKET_PROJECT  ?? "project-files",
};

/**
 * 기존 DB의 MinIO 직접 URL → 프록시 URL 변환
 * http://IP:9000/bucket/object → /api/proxy-image?bucket=...&object=...
 */
export function toProxyUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/api/proxy-image")) return url;
  if (url.includes("supabase")) return url;

  const endpoint = process.env.NEXT_PUBLIC_MINIO_ENDPOINT ?? "";
  if (!endpoint) return url;

  for (const [key, bucket] of Object.entries(BUCKET_NAMES)) {
    const prefix = `${endpoint}/${bucket}/`;
    if (url.startsWith(prefix)) {
      const objectName = url.slice(prefix.length);
      return `/api/proxy-image?bucket=${key}&object=${encodeURIComponent(objectName)}`;
    }
  }
  return url;
}
