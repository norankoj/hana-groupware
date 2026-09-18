// GET /api/expense/receipt?item=<결의서 줄 id>&i=<몇 번째 영수증>
// 지출결의서 영수증 내려주기 (MinIO private 버킷)
//
// 접근 권한은 expense_request_items 의 RLS로 판단한다 —
// 본인 결의서이거나 지출결의 담당자여야만 행이 조회되므로, 조회되면 볼 자격이 있는 것.
//
// NAS(MinIO)는 HTTP라 HTTPS 페이지에서 바로 부를 수 없어 이 서버를 거친다.
// 대신 받는 대로 흘려보내고(스트리밍), 브라우저가 한 번 받은 영수증은 다시 받지 않게 한다.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { streamObject } from "@/utils/minio";

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
    const itemId = req.nextUrl.searchParams.get("item");
    if (!itemId) {
      return NextResponse.json({ error: "item 파라미터 필요" }, { status: 400 });
    }

    const supabase = await createClient();

    // 로그인 확인과 줄 조회를 동시에 — 둘 다 같은 세션 쿠키를 쓰고
    // 줄 조회에는 RLS가 걸려 있어 순서를 기다릴 이유가 없다.
    const [
      {
        data: { user },
      },
      { data: row },
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("expense_request_items")
        .select("receipt_files")
        .eq("id", itemId)
        .maybeSingle(),
    ]);

    if (!user) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }
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

    const fileName = target.name || target.url.split("/").pop() || "영수증";
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    const disposition = INLINE.includes(ext) ? "inline" : "attachment";

    // NAS에서 받는 대로 브라우저로 흘려보낸다
    const body = await streamObject("private", target.url);

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        // 영수증 파일은 올린 뒤 바뀌지 않는다(이름에 시각·난수가 붙는다).
        // 옆으로 넘겼다 돌아올 때 다시 받지 않도록 본인 브라우저에만 하루 둔다.
        // private — 중간 서버(프록시·CDN)는 저장하지 않는다.
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[expense/receipt] 오류:", message);
    return NextResponse.json(
      { error: "영수증을 불러오지 못했습니다" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
