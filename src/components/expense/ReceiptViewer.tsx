// src/components/expense/ReceiptViewer.tsx
// 영수증 미리보기 — 한 청구서에 붙은 영수증을 옆으로 넘겨가며 본다.
// 모달 위에 떠야 하므로 Modal(z-9999)보다 높은 층에 직접 포털로 띄운다.
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  X,
} from "lucide-react";

/** 미리보기 대상 한 장 */
export type ReceiptRef = {
  itemId: string;
  /** 그 줄의 몇 번째 영수증인지 */
  index: number;
  name: string;
  /** 어느 청구 줄에 붙은 것인지 — 넘길 때 위치를 알려준다 */
  itemName: string;
};

// 부모는 열릴 때만 이 컴포넌트를 마운트한다 — 그래야 열 때마다 상태가
// 새로 시작되고, 초기화 effect를 둘 필요가 없다.
type Props = {
  receipts: ReceiptRef[];
  /** 처음 보여줄 위치 */
  startAt: number;
  onClose: () => void;
};

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "bmp"];

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

const urlOf = (r: ReceiptRef) =>
  `/api/expense/receipt?item=${encodeURIComponent(r.itemId)}&i=${r.index}`;

export default function ReceiptViewer({ receipts, startAt, onClose }: Props) {
  const [at, setAt] = useState(startAt);
  const [failed, setFailed] = useState(false);

  /** 넘길 때마다 실패 표시를 지운다 */
  const jump = (to: number) => {
    setAt(((to % receipts.length) + receipts.length) % receipts.length);
    setFailed(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft")
        setAt((i) => (i - 1 + receipts.length) % receipts.length);
      else if (e.key === "ArrowRight") setAt((i) => (i + 1) % receipts.length);
      else return;
      setFailed(false);
    };

    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [receipts.length, onClose]);

  // 앞뒤 영수증을 미리 받아둔다 — 서버가 브라우저에 하루 캐시하도록 하므로
  // 넘기는 순간 바로 뜬다. 사진만 (PDF·문서는 무거워서 누를 때 받는다).
  useEffect(() => {
    if (receipts.length < 2) return;
    const neighbors = [at + 1, at - 1].map(
      (i) => receipts[(i + receipts.length) % receipts.length],
    );
    for (const r of neighbors) {
      if (r && IMAGE_EXT.includes(extOf(r.name))) new Image().src = urlOf(r);
    }
  }, [at, receipts]);

  const current = receipts[Math.min(at, receipts.length - 1)];
  if (!current) return null;

  const url = urlOf(current);
  const ext = extOf(current.name);
  const isImage = IMAGE_EXT.includes(ext);
  const isPdf = ext === "pdf";
  const many = receipts.length > 1;

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex flex-col bg-black/85"
      role="dialog"
      aria-modal="true"
      aria-label="영수증 미리보기"
    >
      {/* 머리 — 파일명, 어느 줄의 것인지, 위치 */}
      <div className="flex items-center gap-3 px-4 py-3 text-white shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{current.name}</p>
          <p className="text-xs text-white/60 truncate">
            {current.itemName}
            {many && ` · ${at + 1} / ${receipts.length}`}
          </p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition"
          aria-label="새 창에서 열기"
          title="새 창에서 열기"
        >
          <ExternalLink size={18} />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
          aria-label="닫기"
        >
          <X size={20} />
        </button>
      </div>

      {/* 본문 */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 pb-2">
        {many && (
          <NavButton side="left" onClick={() => jump(at - 1)} />
        )}

        {failed || (!isImage && !isPdf) ? (
          <div className="max-w-sm mx-auto bg-white rounded-xl p-8 text-center">
            <FileText size={32} className="mx-auto text-gray-400" />
            <p className="mt-3 text-sm font-medium text-gray-800 break-all">
              {current.name}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {failed
                ? "미리보기를 불러오지 못했습니다."
                : "이 형식은 미리보기를 지원하지 않습니다."}
            </p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[#2151EC] text-white text-sm font-medium rounded-lg hover:bg-[#1a43c9] transition"
            >
              <Download size={15} /> 내려받기
            </a>
          </div>
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={current.name}
            onError={() => setFailed(true)}
            className="max-h-full max-w-full object-contain rounded-lg bg-white"
          />
        ) : (
          <iframe
            src={url}
            title={current.name}
            className="w-full h-full rounded-lg bg-white"
          />
        )}

        {many && <NavButton side="right" onClick={() => jump(at + 1)} />}
      </div>

      {/* 여러 장이면 아래에 썸네일 대신 이름 목록으로 바로 이동 */}
      {many && (
        <div className="shrink-0 flex gap-1.5 overflow-x-auto px-4 py-3">
          {receipts.map((r, i) => (
            <button
              key={`${r.itemId}-${r.index}`}
              type="button"
              onClick={() => jump(i)}
              aria-current={i === at}
              className={`shrink-0 max-w-[160px] px-2.5 py-1.5 rounded-md text-xs truncate transition cursor-pointer ${
                i === at
                  ? "bg-white text-gray-900 font-bold"
                  : "bg-white/10 text-white/70 hover:bg-white/20"
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

const NavButton = ({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={side === "left" ? "이전 영수증" : "다음 영수증"}
    className={`absolute top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full bg-black/40 text-white/80 hover:bg-black/70 hover:text-white transition cursor-pointer ${
      side === "left" ? "left-3" : "right-3"
    }`}
  >
    {side === "left" ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
  </button>
);

/** 결의서 줄들에서 미리보기 목록을 만든다 — 한 청구서 안의 영수증을 모두 넘길 수 있게 */
export const collectReceipts = (
  items: {
    id: string;
    item_name: string;
    receipt_files?: { url: string; name: string }[] | null;
  }[],
): ReceiptRef[] =>
  items.flatMap((it) =>
    (it.receipt_files ?? []).map((f, index) => ({
      itemId: it.id,
      index,
      name: f.name,
      itemName: it.item_name,
    })),
  );
