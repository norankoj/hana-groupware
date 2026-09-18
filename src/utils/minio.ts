// src/utils/minio.ts
import { Readable } from "node:stream";
import * as Minio from "minio";

// MinIO 클라이언트 싱글톤
let _client: Minio.Client | null = null;

export function getMinioClient(): Minio.Client {
  if (_client) return _client;

  const endpoint = process.env.MINIO_ENDPOINT ?? "";
  const withoutProtocol = endpoint.replace(/^https?:\/\//, "");
  const useSSL = endpoint.startsWith("https://");
  const [host, portStr] = withoutProtocol.split(":");
  const port = portStr ? parseInt(portStr, 10) : useSSL ? 443 : 9000;

  _client = new Minio.Client({
    endPoint: host,
    port,
    useSSL,
    accessKey: process.env.MINIO_ACCESS_KEY ?? "",
    secretKey: process.env.MINIO_SECRET_KEY ?? "",
  });

  return _client;
}

/** 버킷 이름 상수 */
export const BUCKETS = {
  notice:  process.env.MINIO_BUCKET_NOTICE   ?? "notice-images",
  vehicle: process.env.MINIO_BUCKET_VEHICLE  ?? "vehicle-images",
  private: process.env.MINIO_BUCKET_PRIVATE  ?? "private-files",
  project: process.env.MINIO_BUCKET_PROJECT  ?? "project-files",
} as const;

export type BucketKey = keyof typeof BUCKETS;

// Public 버킷 (notice, vehicle) — 이미지 URL 직접 접근 허용
const PUBLIC_BUCKETS: BucketKey[] = ["notice", "vehicle", "project"];

/** 권한 확인 없이 내려줘도 되는 버킷인지 (private 은 아니다) */
export const isPublicBucket = (key: string): key is BucketKey =>
  (PUBLIC_BUCKETS as string[]).includes(key);

/**
 * 파일을 받는 대로 흘려보낼 스트림.
 * 다 받아 모았다가 보내면 파일 전체를 기다려야 첫 바이트가 나간다.
 * 브라우저가 중간에 끊으면 NAS 연결도 같이 닫힌다.
 */
export async function streamObject(
  bucketKey: BucketKey,
  objectName: string,
): Promise<ReadableStream<Uint8Array>> {
  const stream = await getMinioClient().getObject(BUCKETS[bucketKey], objectName);
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}

/** 버킷에 공개 읽기 정책 설정 */
async function ensurePublicReadPolicy(bucketName: string): Promise<void> {
  const client = getMinioClient();
  const policy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: { AWS: ["*"] },
      Action: ["s3:GetObject"],
      Resource: [`arn:aws:s3:::${bucketName}/*`],
    }],
  });
  await client.setBucketPolicy(bucketName, policy);
}

/** notice, vehicle 버킷 공개 정책 초기화 — 동시 호출 안전 (Promise 싱글톤) */
const _initialized = new Set<string>();
let _initPromise: Promise<void> | null = null;
export function ensurePublicBuckets(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    for (const key of PUBLIC_BUCKETS) {
      const name = BUCKETS[key];
      if (_initialized.has(name)) continue;
      try {
        await ensurePublicReadPolicy(name);
        _initialized.add(name);
      } catch {
        // 이미 설정됐거나 연결 안 됨 — 무시
      }
    }
  })();
  return _initPromise;
}

/**
 * 파일 업로드 후 objectName 반환
 */
export async function uploadToMinio(
  bucketKey: BucketKey,
  file: Buffer,
  fileName: string,
  mimeType: string,
  folder?: string,
): Promise<string> {
  const client = getMinioClient();
  const bucket = BUCKETS[bucketKey];

  const ext = fileName.split(".").pop() ?? "bin";
  const baseName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const objectName = folder ? `${folder}/${baseName}` : baseName;

  await client.putObject(bucket, objectName, file, file.length, {
    "Content-Type": mimeType,
  });

  return objectName;
}

/**
 * Public 버킷 파일 URL
 * — Next.js 프록시 경유 (HTTPS 혼합 콘텐츠 차단 방지)
 */
export function getPublicUrl(bucketKey: BucketKey, objectName: string): string {
  return `/api/proxy-image?bucket=${bucketKey}&object=${encodeURIComponent(objectName)}`;
}


/**
 * Private 버킷 임시 접근 URL (기본 1시간)
 */
export async function getPresignedUrl(
  bucketKey: BucketKey,
  objectName: string,
  expirySeconds = 3600,
): Promise<string> {
  const client = getMinioClient();
  const bucket = BUCKETS[bucketKey];
  return client.presignedGetObject(bucket, objectName, expirySeconds);
}

/**
 * 파일 삭제
 */
export async function deleteFromMinio(
  bucketKey: BucketKey,
  objectName: string,
): Promise<void> {
  const client = getMinioClient();
  const bucket = BUCKETS[bucketKey];
  await client.removeObject(bucket, objectName);
}

/**
 * Presigned PUT URL 발급 — 클라이언트 직접 업로드용 (업로드 속도 최적화)
 */
export async function getPresignedPutUrl(
  bucketKey: BucketKey,
  objectName: string,
  expirySeconds = 600,
): Promise<string> {
  const client = getMinioClient();
  const bucket = BUCKETS[bucketKey];
  return client.presignedPutObject(bucket, objectName, expirySeconds);
}
