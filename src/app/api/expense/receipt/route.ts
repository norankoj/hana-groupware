// GET /api/expense/receipt?item=<결의서 줄 id>&i=<몇 번째 영수증>
// 지출결의서 영수증 내려주기 (MinIO private 버킷)
//
// 접근 권한은 expense_request_items 의 RLS로 판단한다 —
// 본인 결의서이거나 지출결의 담당자여야만 행이 조회되므로, 조회되면 볼 자격이 있는 것.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getMinioClient, BUCKETS } from "@/utils/minio";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  zip: "application/zip",
};

// 브라우저에서 바로 열어도 되는 형식
const INLINE = ["pdf", "png", "jpg", "jpeg", "gif", "webp"];

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }

    const itemId = req.nextUrl.searchParams.get("item");
    if (!itemId) {
      return NextResponse.json({ error: "item 파라미터 필요" }, { status: 400 });
    }

    const { data: row } = await supabase
      .from("expense_request_items")
      .select("receipt_files")
      .eq("id", itemId)
      .maybeSingle();

    if (!row) {
      return NextResponse.json(
        { error: "청구 내역을 찾을 수 없거나 볼 권한이 없습니다" },
        { status: 404 },
      );
    }

    const files: { url: string; name: string }[] = Array.isArray(
      row.receipt_files,
    )
      ? row.receipt_files
      : [];

    const index = Number(req.nextUrl.searchParams.get("i") ?? "0");
    const target = files[Number.isFinite(index) ? index : 0];
    if (!target?.url) {
      return NextResponse.json(
        { error: "첨부된 영수증이 없습니다" },
        { status: 404 },
      );
    }

    const client = getMinioClient();
    const stream = await client.getObject(BUCKETS.private, target.url);

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    const buffer = Buffer.concat(chunks);

    const fileName = target.name || target.url.split("/").pop() || "영수증";
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    const disposition = INLINE.includes(ext) ? "inline" : "attachment";

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[expense/receipt] 오류:", message);
    return NextResponse.json(
      { error: "영수증을 불러오지 못했습니다" },
      { status: 500 },
    );
  }
}
