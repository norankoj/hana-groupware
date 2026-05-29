// src/utils/upload.ts
// MinIO 파일 업로드 / 조회 헬퍼 (클라이언트 전용)

export type UploadBucket = "notice" | "vehicle" | "private" | "project";

export type UploadResult = {
  objectName: string;
  url: string | null; // private는 null
};

/**
 * 파일을 MinIO에 직접 업로드 (Presigned PUT)
 * - notice / vehicle: 공개 URL 반환
 * - private: objectName만 반환 (URL 없음)
 */
export async function uploadFile(
  file: File,
  bucket: UploadBucket,
  folder?: string,
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("bucket", bucket);
  if (folder) formData.append("folder", folder);

  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (!res.ok) throw new Error("파일 업로드 실패");

  const { objectName, url } = await res.json();
  return { objectName, url };
}

/**
 * Private 파일 임시 열람 URL 발급 (1시간 유효)
 * - 급여명세서, 선교펀드 등 민감 파일 표시 시 사용
 */
export async function getPrivateFileUrl(
  objectName: string,
  bucket: UploadBucket = "private",
): Promise<string> {
  const params = new URLSearchParams({ bucket, object: objectName });
  const res = await fetch(`/api/presigned?${params}`);
  if (!res.ok) throw new Error("파일 URL 발급 실패");
  const { url } = await res.json();
  return url;
}

/**
 * 파일 삭제
 */
export async function deleteFile(
  objectName: string,
  bucket: UploadBucket,
): Promise<void> {
  await fetch(
    `/api/upload?bucket=${bucket}&object=${encodeURIComponent(objectName)}`,
    { method: "DELETE" },
  );
}
