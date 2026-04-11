// GET /api/migrate-attachments
// Supabase Storage → MinIO 첨부파일 마이그레이션 (1회 실행)
// notices 테이블의 attachments 컬럼에서 Supabase URL을 MinIO URL로 교체

import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { uploadToMinio, getPublicUrl } from "@/utils/minio";

const SUPABASE_BUCKET = "notice-attachments";

export async function GET() {
  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. 첨부파일 있는 공지 전체 조회
  const { data: notices, error } = await supabase
    .from("notices")
    .select("id, attachments")
    .not("attachments", "eq", "[]")
    .not("attachments", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { noticeId: number; file: string; status: string }[] = [];

  for (const notice of notices ?? []) {
    const attachments = notice.attachments as any[];
    if (!attachments?.length) continue;

    let changed = false;
    const updated = await Promise.all(
      attachments.map(async (att: any) => {
        // 이미 MinIO URL이거나 objectName 있으면 스킵
        if (att.objectName || !att.url?.includes(SUPABASE_BUCKET)) {
          return att;
        }

        try {
          // Supabase Storage URL에서 파일 경로 추출
          const urlParts = att.url.split(`/${SUPABASE_BUCKET}/`);
          const filePath = urlParts[1];
          if (!filePath) return att;

          // Supabase Storage에서 파일 다운로드
          const { data: fileData, error: dlError } = await supabase.storage
            .from(SUPABASE_BUCKET)
            .download(filePath);

          if (dlError || !fileData) {
            results.push({ noticeId: notice.id, file: att.name, status: `❌ 다운로드 실패: ${dlError?.message}` });
            return att;
          }

          // Buffer 변환
          const buffer = Buffer.from(await fileData.arrayBuffer());
          const mimeType = fileData.type || "application/octet-stream";

          // MinIO 업로드
          const objectName = await uploadToMinio("notice", buffer, att.name, mimeType, String(notice.id));
          const newUrl = getPublicUrl("notice", objectName);

          changed = true;
          results.push({ noticeId: notice.id, file: att.name, status: "✅ 완료" });

          return { ...att, url: newUrl, objectName };
        } catch (e: any) {
          results.push({ noticeId: notice.id, file: att.name, status: `❌ 오류: ${e.message}` });
          return att;
        }
      }),
    );

    // 변경사항 있으면 DB 업데이트
    if (changed) {
      await supabase.from("notices").update({ attachments: updated }).eq("id", notice.id);
    }
  }

  const total = results.length;
  const success = results.filter((r) => r.status.startsWith("✅")).length;
  const failed = results.filter((r) => r.status.startsWith("❌")).length;

  return NextResponse.json({
    summary: `총 ${total}개 중 성공 ${success}개, 실패 ${failed}개`,
    details: results,
  });
}
