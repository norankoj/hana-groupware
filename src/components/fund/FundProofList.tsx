// src/components/fund/FundProofList.tsx
// 증빙자료 — 이미지는 썸네일로 보여주고 누르면 크게, 나머지는 파일 버튼
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { openProof, proofList, type FundRequest } from "./shared";

const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp"];

const isImage = (name: string) =>
  IMAGE_EXT.includes(name.split(".").pop()?.toLowerCase() ?? "");

/** 미리보기·내려받기 모두 이 주소를 쓴다 (권한은 서버가 확인) */
const proofSrc = (requestId: string, index: number) =>
  `/api/fund/proof?request=${encodeURIComponent(requestId)}&i=${index}`;

export default function FundProofList({
  request,
  empty = "첨부된 증빙자료가 없습니다.",
}: {
  request: Pick<FundRequest, "id" | "proof_files" | "proof_url" | "proof_name">;
  empty?: string;
}) {
  const [zoom, setZoom] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // 크게 보는 중에는 Esc로 닫는다
  useEffect(() => {
    if (zoom === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const files = proofList(request);
  if (files.length === 0)
    return <p className="text-sm text-gray-400">{empty}</p>;

  const images = files
    .map((f, i) => ({ ...f, i }))
    .filter((f) => isImage(f.name));
  const others = files
    .map((f, i) => ({ ...f, i }))
    .filter((f) => !isImage(f.name));

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((f) => (
            <button
              key={f.i}
              type="button"
              onClick={() => setZoom(f.i)}
              title={f.name}
              className="w-24 h-24 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 hover:border-blue-400 transition cursor-pointer"
            >
              <img
                src={proofSrc(request.id, f.i)}
                alt={f.name}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {others.map((f) => (
            <button
              key={f.i}
              type="button"
              onClick={() => openProof(request.id, f.i)}
              className="px-3.5 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 cursor-pointer"
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* 크게 보기 — 모달 위에 떠야 해서 body에 붙인다 */}
      {zoom !== null &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] bg-black/80 flex flex-col items-center justify-center p-4"
            onClick={() => setZoom(null)}
          >
            <img
              src={proofSrc(request.id, zoom)}
              alt={files[zoom]?.name ?? ""}
              className="max-w-full max-h-[80vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <div
              className="mt-4 flex items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-sm text-white/80">
                {files[zoom]?.name}
              </span>
              <a
                href={proofSrc(request.id, zoom)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-sm font-bold text-gray-800 bg-white rounded hover:bg-gray-100"
              >
                새 창에서 열기
              </a>
              <button
                onClick={() => setZoom(null)}
                className="px-3 py-1.5 text-sm font-bold text-white border border-white/40 rounded hover:bg-white/10 cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
