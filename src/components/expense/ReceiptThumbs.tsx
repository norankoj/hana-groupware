// src/components/expense/ReceiptThumbs.tsx
// 영수증 썸네일 — 파일 이름 대신 작은 직사각형 미리보기. 누르면 크게 넘겨 본다.
"use client";

import { useState } from "react";
import { IMAGE_EXT, extOf, urlOf } from "./ReceiptViewer";

type Props = {
  itemId: string;
  files: { url: string; name: string }[];
  onOpen: (index: number) => void;
};

export default function ReceiptThumbs({ itemId, files, onOpen }: Props) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((f, i) => (
        <Thumb
          key={i}
          name={f.name}
          src={urlOf({ itemId, index: i, name: f.name, itemName: "" })}
          onClick={() => onOpen(i)}
        />
      ))}
    </div>
  );
}

function Thumb({
  name,
  src,
  onClick,
}: {
  name: string;
  src: string;
  onClick: () => void;
}) {
  // 브라우저가 못 그리는 사진(예전에 올린 HEIC 등)은 확장자로 대신 보여준다
  const [failed, setFailed] = useState(false);
  const ext = extOf(name);
  const image = IMAGE_EXT.includes(ext) && !failed;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation(); // 표의 줄 클릭과 겹치지 않게
        onClick();
      }}
      title={name}
      aria-label={`영수증 ${name} 크게 보기`}
      className="relative w-14 h-10 shrink-0 rounded-md border border-gray-200 bg-gray-50 overflow-hidden hover:ring-2 hover:ring-blue-300 transition cursor-pointer"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="flex h-full items-center justify-center font-mono text-[10px] font-bold uppercase text-gray-500">
          {ext || "파일"}
        </span>
      )}
    </button>
  );
}
