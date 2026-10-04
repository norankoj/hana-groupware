// src/components/library/shared.tsx
// 자료실 공용 타입 · 헬퍼 · 자료 표 · 미리보기
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Download, Trash2, FileText, ExternalLink, Eye, Link as LinkIcon } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import { createClient } from "@/utils/supabase/client";
import { btnStyles } from "@/components/fund/shared";
import { tableCard, table, thead, thWide, tdWide, trHover, center, sub } from "@/components/ui/table";

export type LibraryCategory = {
  id: number;
  name: string;
  description: string | null;
  creator_id: string;
  created_at: string;
  sort_order: number;
  profiles?: { full_name: string } | null;
  library_files?: { count: number }[];
};

export type Attachment = { name: string; object_name: string; size: number };

/** 자료 한 건 — 파일 여러 개 + 링크(선택). 둘 중 하나는 꼭 있다 */
export type LibraryFile = {
  id: number;
  category_id: number;
  title: string;
  description: string | null;
  attachments: Attachment[];
  link_url: string | null;
  uploader_id: string;
  created_at: string;
  profiles?: { full_name: string } | null;
  library_categories?: { name: string } | null;
};

export type Me = { id: string; role: string };

export const BUCKET = "notice";
export const FOLDER = "library";
/** /api/upload 와 같은 값 */
export const MAX_SIZE = 10 * 1024 * 1024;
export const MAX_FILES = 10;
export const ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.hwpx,.txt,.zip";

export const isManager = (me: Me | null) => !!me && ["admin", "director"].includes(me.role);

export const formatSize = (b: number) =>
  b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))}KB` : `${(b / 1024 / 1024).toFixed(1)}MB`;

export const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

const totalSize = (f: LibraryFile) => f.attachments.reduce((s, a) => s + a.size, 0);

/** download=true 면 원래 이름으로 저장되게, 아니면 브라우저 안에서 연다(미리보기) */
const fileUrl = (a: Attachment, download = false) =>
  `/api/proxy-image?bucket=${BUCKET}&object=${encodeURIComponent(a.object_name)}` +
  (download ? `&name=${encodeURIComponent(a.name)}` : "");

export const deleteObject = (objectName: string) =>
  fetch(`/api/upload?bucket=${BUCKET}&object=${encodeURIComponent(objectName)}`, { method: "DELETE" });

/** 로그인한 사람 id · 권한 */
export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("id, role").eq("id", user.id).single();
      if (data) setMe(data as Me);
    })();
  }, []);
  return me;
}

/**
 * 진행률이 보이는 업로드 — fetch 는 올라가는 양을 알려주지 않아서 XHR 을 쓴다.
 * 실패하면 서버가 준 문구(10MB 초과, 형식 등)를 그대로 던진다.
 */
export function uploadWithProgress(file: File, onProgress: (ratio: number) => void) {
  return new Promise<{ objectName: string }>((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("bucket", BUCKET);
    fd.append("folder", FOLDER);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { objectName?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status < 300 && body.objectName) resolve({ objectName: body.objectName });
      else
        reject(new Error(body.error || (xhr.status === 413 ? "파일이 너무 큽니다" : `업로드 실패 (${xhr.status})`)));
    };
    xhr.onerror = () => reject(new Error("네트워크 오류로 올리지 못했습니다"));
    xhr.send(fd);
  });
}

/**
 * 받은 양을 세면서 모았다가 원래 이름으로 저장한다.
 * NAS 프록시가 Content-Length 를 안 주므로 진행률은 DB 의 size 로 잡는다 (onBytes 로 받은 바이트를 넘김).
 */
async function downloadAttachment(a: Attachment, onBytes: (received: number) => void) {
  const res = await fetch(fileUrl(a, true));
  if (!res.ok || !res.body) throw new Error("download failed");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onBytes(received);
  }
  const url = URL.createObjectURL(new Blob(chunks as BlobPart[]));
  const link = document.createElement("a");
  link.href = url;
  link.download = a.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 내려받기 + 진행률. key 하나에 파일 여러 개를 차례로 받고 진행률은 합쳐서 보여준다 */
function useDownloads() {
  const [progress, setProgress] = useState<Record<string, number>>({});
  const run = async (key: string, files: Attachment[]) => {
    if (key in progress) return;
    const total = files.reduce((s, a) => s + a.size, 0) || 1;
    let base = 0;
    setProgress((p) => ({ ...p, [key]: 0 }));
    try {
      for (const a of files) {
        await downloadAttachment(a, (got) =>
          setProgress((p) => ({ ...p, [key]: Math.min(1, (base + got) / total) })),
        );
        base += a.size;
      }
    } catch {
      toast.error("파일을 내려받지 못했습니다.");
    }
    setProgress(({ [key]: _, ...rest }) => rest);
  };
  return { progress, run };
}

const iconBtn =
  "relative w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-lg transition active:scale-[0.96]";

/** 다운로드 아이콘 — 받는 동안은 퍼센트와 얇은 막대 */
function DownloadButton({ ratio, onClick, label }: { ratio?: number; onClick: () => void; label: string }) {
  if (ratio === undefined)
    return (
      <button
        onClick={onClick}
        aria-label={label}
        title="다운로드"
        className={`${iconBtn} text-primary bg-primary-wash hover:bg-primary-soft`}
      >
        <Download className="w-4 h-4" />
      </button>
    );
  const pct = Math.round(ratio * 100);
  return (
    <span
      role="progressbar"
      aria-label={`${label} 중`}
      aria-valuenow={pct}
      className={`${iconBtn} flex-col gap-1 bg-primary-wash text-primary`}
    >
      <span className="text-[10px] font-bold tabular-nums leading-none">{pct}%</span>
      <span className="w-6 h-1 rounded-full bg-white overflow-hidden">
        <span className="block h-full bg-primary transition-[width] duration-150" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

/** 형식 표시 — 첫 파일 확장자(+나머지 개수), 파일 없이 링크만 있으면 LINK */
export const ExtBadge = ({ name, more = 0 }: { name: string | null; more?: number }) => (
  <span className="inline-flex items-center gap-1 shrink-0">
    {name ? (
      <span className="inline-block min-w-[40px] text-[10px] font-bold text-primary-active bg-primary-soft border border-primary/30 rounded px-1.5 py-0.5 text-center">
        {extOf(name).toUpperCase().slice(0, 4)}
      </span>
    ) : (
      <span className="inline-block min-w-[40px] text-[10px] font-bold text-info-active bg-info-soft border border-info/30 rounded px-1.5 py-0.5 text-center">
        LINK
      </span>
    )}
    {more > 0 && <span className="text-[10px] font-bold text-muted">+{more}</span>}
  </span>
);

const fileBadge = (f: LibraryFile) => (
  <ExtBadge name={f.attachments[0]?.name ?? null} more={Math.max(0, f.attachments.length - 1)} />
);

/** 불러오는 동안 표 모양 그대로 빈 줄 */
export const SkeletonRows = ({ rows = 4 }: { rows?: number }) => (
  <div className={tableCard}>
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-table-line last:border-0">
        <div className="h-4 w-10 rounded bg-table-header animate-pulse" />
        <div className="h-4 flex-1 max-w-[320px] rounded bg-table-header animate-pulse" />
        <div className="h-4 w-16 rounded bg-table-header animate-pulse ml-auto" />
      </div>
    ))}
  </div>
);

/** 자료 표 — 카테고리 안 목록과 전체 검색 결과가 같이 쓴다 */
export function FileTable({
  files,
  me,
  onDelete,
  showCategory = false,
}: {
  files: LibraryFile[];
  me: Me | null;
  onDelete: (f: LibraryFile) => void;
  showCategory?: boolean;
}) {
  const canDelete = (f: LibraryFile) => isManager(me) || f.uploader_id === me?.id;
  const { progress, run } = useDownloads();
  const [preview, setPreview] = useState<LibraryFile | null>(null);

  const actions = (f: LibraryFile) => (
    <div className="flex items-center justify-end gap-1">
      <button
        onClick={() => setPreview(f)}
        aria-label={`${f.title} 미리보기`}
        title="미리보기"
        className={`${iconBtn} text-gray-500 hover:text-heading hover:bg-table-header`}
      >
        <Eye className="w-4 h-4" />
      </button>
      {f.attachments.length ? (
        <DownloadButton
          ratio={progress[`row-${f.id}`]}
          onClick={() => run(`row-${f.id}`, f.attachments)}
          label={f.attachments.length > 1 ? `${f.title} 파일 ${f.attachments.length}개 내려받기` : `${f.title} 내려받기`}
        />
      ) : (
        <a
          href={f.link_url!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${f.title} 링크 열기`}
          title="링크 열기"
          className={`${iconBtn} text-info-active bg-info-soft hover:bg-info/20`}
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      )}
      {canDelete(f) && (
        <button
          onClick={() => onDelete(f)}
          aria-label={`${f.title} 삭제`}
          className={`${iconBtn} text-gray-400 hover:text-danger hover:bg-danger-soft`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  const titleBlock = (f: LibraryFile) => (
    <button onClick={() => setPreview(f)} className="min-w-0 text-left group">
      <p className="font-semibold truncate group-hover:text-primary group-hover:underline underline-offset-2">
        {f.title}
        {f.link_url && f.attachments.length > 0 && (
          <LinkIcon className="inline w-3.5 h-3.5 ml-1.5 -mt-0.5 text-info" aria-label="링크 포함" />
        )}
      </p>
      {f.description && <p className={`${sub} truncate mt-0.5`}>{f.description}</p>}
    </button>
  );

  return (
    <>
      {/* PC */}
      <div className={`${tableCard} hidden md:block`}>
        <table className={table}>
          <thead className={thead}>
            <tr>
              <th scope="col" className={thWide}>제목</th>
              {showCategory && <th scope="col" className={`${thWide} w-40`}>카테고리</th>}
              <th scope="col" className={`${thWide} ${center} w-28`}>올린 사람</th>
              <th scope="col" className={`${thWide} ${center} w-28`}>등록일</th>
              <th scope="col" className={`${thWide} ${center} w-20`}>크기</th>
              <th scope="col" className={`${thWide} w-36`}>
                <span className="sr-only">미리보기 · 다운로드</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id} className={trHover}>
                <td className={`${tdWide} max-w-0`}>
                  <div className="flex items-center gap-3 min-w-0">
                    {fileBadge(f)}
                    {titleBlock(f)}
                  </div>
                </td>
                {showCategory && (
                  <td className={`${tdWide} whitespace-nowrap`}>
                    <Link href={`/library/${f.category_id}`} className="text-muted hover:text-primary hover:underline">
                      {f.library_categories?.name}
                    </Link>
                  </td>
                )}
                <td className={`${tdWide} ${center} whitespace-nowrap text-muted`}>{f.profiles?.full_name || "-"}</td>
                <td className={`${tdWide} ${center} whitespace-nowrap text-muted`}>
                  {format(new Date(f.created_at), "yyyy.MM.dd")}
                </td>
                <td className={`${tdWide} ${center} whitespace-nowrap text-muted`}>
                  {f.attachments.length ? formatSize(totalSize(f)) : "-"}
                </td>
                <td className={tdWide}>{actions(f)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일 */}
      <ul className="md:hidden space-y-2">
        {files.map((f) => (
          // 좁은 화면 — 제목을 한 줄 다 쓰고, 형식 · 정보 · 버튼을 아랫줄 하나에 모은다
          <li key={f.id} className="bg-white rounded-xl border border-line pl-4 pr-2 pt-3 pb-2">
            <div className="flex min-w-0 pr-2">{titleBlock(f)}</div>
            <div className="mt-1.5 flex items-center gap-2">
              {fileBadge(f)}
              <p className="text-[11px] text-gray-400 truncate flex-1 min-w-0">
                {showCategory && `${f.library_categories?.name ?? ""} / `}
                {f.profiles?.full_name} / {format(new Date(f.created_at), "yy.MM.dd")}
                {f.attachments.length > 0 && ` / ${formatSize(totalSize(f))}`}
              </p>
              {actions(f)}
            </div>
          </li>
        ))}
      </ul>

      {preview && <PreviewModal file={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

// ── 미리보기 ──────────────────────────────────────────────────────────────
const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"];

/** 텍스트 파일은 iframe 에 그대로 넣으면 한글이 깨져서 UTF-8 로 읽어 보여준다 */
function TextPreview({ a }: { a: Attachment }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    fetch(fileUrl(a))
      .then((r) => r.arrayBuffer())
      .then((b) => setText(new TextDecoder("utf-8").decode(b)))
      .catch(() => setText("불러오지 못했습니다."));
  }, [a.object_name]);
  return (
    <pre className="h-full overflow-auto p-4 text-sm text-heading whitespace-pre-wrap break-words">
      {text ?? "불러오는 중..."}
    </pre>
  );
}

function AttachmentPreview({ a, onDownload }: { a: Attachment; onDownload: () => void }) {
  const ext = extOf(a.name);
  if (IMAGE_EXT.includes(ext))
    return (
      <div className="h-full flex items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fileUrl(a)} alt={a.name} className="max-w-full max-h-full object-contain rounded-lg" />
      </div>
    );
  if (ext === "pdf") return <iframe src={fileUrl(a)} title={a.name} className="w-full h-full bg-white" />;
  if (ext === "txt") return <TextPreview a={a} />;
  // 한글 · 오피스 문서는 브라우저가 직접 열지 못한다. 외부 뷰어는 교회 문서를 밖으로 보내야 해서 쓰지 않는다
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-white border border-line flex items-center justify-center mb-1">
        <FileText className="w-6 h-6 text-muted" />
      </div>
      <p className="text-sm font-semibold text-heading">{ext.toUpperCase()} 파일은 미리보기를 지원하지 않습니다</p>
      <p className="text-xs text-muted">이미지, PDF, 텍스트 파일만 바로 볼 수 있습니다</p>
      <button onClick={onDownload} className={`${btnStyles.soft} px-4 py-2 text-sm mt-3`}>
        내려받기
      </button>
    </div>
  );
}

function PreviewModal({ file: f, onClose }: { file: LibraryFile; onClose: () => void }) {
  const [selected, setSelected] = useState(0);
  const { progress, run } = useDownloads();
  const current = f.attachments[selected];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={f.title}
      className="sm:max-w-[880px]"
      footer={
        <button onClick={onClose} className={btnStyles.cancel}>
          닫기
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
          <span>{f.profiles?.full_name}</span>
          <span>/</span>
          <span>{format(new Date(f.created_at), "yyyy.MM.dd HH:mm")}</span>
        </div>
        {f.description && <p className="text-sm text-heading whitespace-pre-wrap">{f.description}</p>}

        {f.link_url && (
          <a
            href={f.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-info/30 bg-info-soft hover:bg-info/15 transition group"
          >
            <LinkIcon className="w-4 h-4 text-info-active shrink-0" />
            <span className="text-sm text-info-active truncate flex-1 group-hover:underline">{f.link_url}</span>
            <ExternalLink className="w-4 h-4 text-info-active shrink-0" />
          </a>
        )}

        {f.attachments.length > 0 && (
          <>
            {/* 첨부 목록 — 누르면 아래에서 미리 본다 */}
            <ul className="space-y-1.5">
              {f.attachments.map((a, i) => (
                <li
                  key={a.object_name}
                  className={`flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-lg border transition ${i === selected ? "border-primary/40 bg-primary-wash" : "border-line bg-white hover:bg-table-header"}`}
                >
                  <button onClick={() => setSelected(i)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                    <ExtBadge name={a.name} />
                    <span className={`text-sm truncate ${i === selected ? "font-semibold text-primary-active" : "text-heading"}`}>
                      {a.name}
                    </span>
                    <span className="text-xs text-muted shrink-0">{formatSize(a.size)}</span>
                  </button>
                  <DownloadButton ratio={progress[a.object_name]} onClick={() => run(a.object_name, [a])} label={`${a.name} 내려받기`} />
                </li>
              ))}
            </ul>

            <div className="h-[55vh] rounded-xl border border-line bg-table-header overflow-hidden">
              <AttachmentPreview key={current.object_name} a={current} onDownload={() => run(current.object_name, [current])} />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** 자료가 없을 때 — 무엇을 하면 되는지 함께 알려준다 */
export const EmptyState = ({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) => (
  <div className={`${tableCard} flex flex-col items-center justify-center gap-2 py-16 px-6 text-center`}>
    <div className="w-12 h-12 rounded-2xl bg-primary-wash flex items-center justify-center mb-1">
      <FileText className="w-6 h-6 text-primary" />
    </div>
    <p className="text-sm font-semibold text-heading">{title}</p>
    {hint && <p className="text-xs text-muted">{hint}</p>}
    {action && <div className="mt-3">{action}</div>}
  </div>
);
