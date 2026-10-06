// src/components/library/LibraryModals.tsx
// 자료실 모달 — 자료 올리기(파일 여러 개 + 링크를 한 건으로) · 카테고리 만들기/고치기
"use client";

import { useRef, useState } from "react";
import { Upload, X, Check, AlertCircle, ChevronUp, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import { btnStyles, inputClass } from "@/components/fund/shared";
import { createClient } from "@/utils/supabase/client";
import {
  ACCEPT,
  MAX_SIZE,
  MAX_FILES,
  ExtBadge,
  formatSize,
  deleteAttachment,
  MAX_SIZE_LABEL,
  type Uploaded,
  uploadWithProgress,
  type Attachment,
  type LibraryCategory,
} from "./shared";

const labelClass = "block text-sm font-bold text-gray-600 mb-1.5 ml-1";
const errorText = "mt-1.5 ml-1 flex items-center gap-1 text-xs text-danger";

type Pending = {
  file: File;
  /** 0~1 진행률, null = 아직 시작 전 */
  progress: number | null;
  error: string | null;
  /** 올라간 뒤 받은 이름 — 다시 등록을 눌러도 이미 올린 건 또 올리지 않는다 */
  uploaded: Uploaded | null;
};

const deleteUploaded = (u: Uploaded) => deleteAttachment({ object_name: u.objectName, parts: u.parts });

/** 'naver.com' 처럼 앞을 빼고 붙여넣어도 받는다. 비었으면 "", 주소가 아니면 null */
function normalizeLink(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return u.hostname.includes(".") ? u.href : null;
  } catch {
    return null;
  }
}

// ── 자료 올리기 ───────────────────────────────────────────────────────────
export function UploadModal({
  categoryId,
  meId,
  onClose,
  onUploaded,
}: {
  categoryId: number;
  meId: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Pending[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  const link_url = normalizeLink(link);
  const sizeError = items.some((it) => it.file.size > MAX_SIZE);
  // 한 개면 파일 이름, 링크만 있으면 사이트 주소를 제목으로 쓸 수 있다. 여러 개를 묶을 때만 제목이 꼭 필요하다
  const titleRequired = items.length > 1 && !title.trim();
  const canSubmit =
    !busy && (items.length > 0 || !!link_url) && link_url !== null && !sizeError && !titleRequired;

  const patch = (i: number, p: Partial<Pending>) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...p } : it)));

  const addFiles = (list: FileList | null) => {
    // 지금 배열로 떠둔다. FileList 는 input 을 비우면 같이 비워져서,
    // 상태 갱신이 나중에 돌면 두 번째로 고른 파일이 사라졌다
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    const room = MAX_FILES - items.length;
    if (picked.length > room) toast.error(`자료 하나에 파일은 ${MAX_FILES}개까지 첨부할 수 있습니다.`);
    const next = picked.slice(0, Math.max(0, room)).map((file) => ({
      file,
      progress: null,
      uploaded: null,
      // 서버까지 보내기 전에 걸러서 바로 알려준다
      error: file.size > MAX_SIZE ? `${MAX_SIZE_LABEL}를 넘어서 올릴 수 없습니다` : null,
    }));
    setItems((prev) => [...prev, ...next]);
  };

  const removeItem = (i: number) => {
    const it = items[i];
    if (it.uploaded) deleteUploaded(it.uploaded); // 올려두고 빼면 NAS 에서도 치운다
    setItems((prev) => prev.filter((_, j) => j !== i));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);

    // 1) 파일을 차례로 올린다
    const attachments: Attachment[] = [];
    let failed = false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let uploaded = it.uploaded;
      if (!uploaded) {
        patch(i, { progress: 0, error: null });
        try {
          uploaded = await uploadWithProgress(it.file, (r) => patch(i, { progress: r }));
          patch(i, { uploaded, progress: 1 });
        } catch (e) {
          patch(i, { error: e instanceof Error ? e.message : "업로드 실패", progress: null });
          failed = true;
          continue;
        }
      }
      attachments.push({
        name: it.file.name,
        object_name: uploaded.objectName,
        size: it.file.size,
        ...(uploaded.parts && { parts: uploaded.parts }),
      });
    }
    // 하나라도 실패하면 등록하지 않고 멈춘다 — 빼거나 다시 누르면 실패한 것만 다시 올린다
    if (failed) {
      setBusy(false);
      return;
    }

    // 2) 자료 한 건으로 기록
    const { error } = await supabase.from("library_files").insert({
      category_id: categoryId,
      title: title.trim() || (items[0]?.file.name.replace(/\.[^.]+$/, "") ?? new URL(link_url!).hostname),
      description: description.trim() || null,
      attachments,
      link_url: link_url || null,
      uploader_id: meId,
    });
    setBusy(false);
    if (error) return toast.error("저장하지 못했습니다. 다시 눌러주세요.");
    toast.success("자료를 올렸습니다.");
    onUploaded();
    onClose();
  };

  // 등록 없이 닫으면 올려둔 파일을 치운다
  const handleClose = () => {
    if (busy) return;
    items.forEach((it) => it.uploaded && deleteUploaded(it.uploaded));
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title="자료 올리기"
      className="sm:max-w-[560px]"
      footer={
        <div className="flex gap-2 ml-auto">
          <button onClick={handleSubmit} disabled={!canSubmit} className={btnStyles.save}>
            {busy ? "올리는 중..." : "등록"}
          </button>
          <button onClick={handleClose} disabled={busy} className={btnStyles.cancel}>
            취소
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>
            제목{" "}
            {items.length > 1 ? (
              <span className="text-danger">*</span>
            ) : (
              <span className="font-normal text-muted">(비우면 파일 이름)</span>
            )}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예) 2026 차량 운행 서식 모음"
            className={inputClass}
          />
          {titleRequired && (
            <p className={errorText}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              파일을 여러 개 묶어 올릴 때는 제목을 적어주세요
            </p>
          )}
        </div>

        <div>
          <label className={labelClass}>
            설명 <span className="font-normal text-muted">(선택)</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="어떤 자료인지 한 줄로 적어주세요"
            className={inputClass}
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-1.5 mx-1">
            <span className="text-sm font-bold text-gray-600">첨부파일</span>
            <span className="text-xs text-muted tabular-nums">
              {items.length} / {MAX_FILES}개
            </span>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy || items.length >= MAX_FILES}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) addFiles(e.dataTransfer.files);
            }}
            className="flex flex-col items-center gap-1.5 px-4 py-5 border-2 border-dashed border-line rounded-xl text-sm text-muted hover:border-primary hover:text-primary hover:bg-primary-wash/40 transition w-full disabled:opacity-50 disabled:hover:border-line disabled:hover:text-muted disabled:hover:bg-transparent"
          >
            <Upload className="w-5 h-5" />
            <span className="font-semibold">
              {items.length >= MAX_FILES ? `최대 ${MAX_FILES}개까지 첨부했습니다` : "파일을 선택하거나 끌어다 놓으세요"}
            </span>
            <span className="text-xs text-muted">
              최대 {MAX_FILES}개, 파일당 {MAX_SIZE_LABEL} / 한글, PDF, 오피스, 이미지, ZIP
            </span>
          </button>

          {items.length > 0 && (
            <ul className="mt-3 space-y-2">
              {items.map((it, i) => (
                <li key={`${it.file.name}-${i}`} className="px-3 py-2.5 bg-table-header rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <ExtBadge name={it.file.name} />
                    <span className="truncate text-heading flex-1">{it.file.name}</span>
                    <span className="text-xs text-muted shrink-0">{formatSize(it.file.size)}</span>
                    {it.uploaded && <Check className="w-4 h-4 text-success shrink-0" aria-label="올라감" />}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removeItem(i)}
                      aria-label={`${it.file.name} 빼기`}
                      className="text-gray-400 hover:text-danger shrink-0 disabled:opacity-30"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {it.progress !== null && !it.uploaded && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-white overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-[width] duration-200"
                          style={{ width: `${Math.round(it.progress * 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted tabular-nums w-9 text-right">
                        {Math.round(it.progress * 100)}%
                      </span>
                    </div>
                  )}
                  {it.error && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-danger">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {it.error}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className={labelClass}>
            링크 <span className="font-normal text-muted">(선택, 파일 없이 링크만 올려도 됩니다)</span>
          </label>
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://"
            className={inputClass}
          />
          {link_url === null && (
            <p className={errorText}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              올바른 주소가 아닙니다
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── 카테고리 순서 (관리자/디렉터) ─────────────────────────────────────────
export function CategoryOrderModal({
  categories,
  onClose,
  onSaved,
}: {
  categories: LibraryCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [list, setList] = useState(categories);
  const [busy, setBusy] = useState(false);

  const move = (i: number, d: -1 | 1) =>
    setList((prev) => {
      const next = [...prev];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  const handleSave = async () => {
    setBusy(true);
    // 자리가 바뀐 것만 1, 2, 3… 으로 고쳐 쓴다
    const results = await Promise.all(
      list
        .map((c, i) => ({ c, order: i + 1 }))
        .filter(({ c, order }) => c.sort_order !== order)
        .map(({ c, order }) => supabase.from("library_categories").update({ sort_order: order }).eq("id", c.id)),
    );
    setBusy(false);
    if (results.some((r) => r.error)) return toast.error("순서를 저장하지 못했습니다.");
    toast.success("순서를 저장했습니다.");
    onSaved();
  };

  const arrow =
    "w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:text-primary hover:bg-primary-wash transition disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-gray-500";

  return (
    <Modal
      isOpen
      onClose={() => !busy && onClose()}
      title="카테고리 순서"
      className="sm:max-w-[440px]"
      footer={
        <div className="flex gap-2 ml-auto">
          <button onClick={handleSave} disabled={busy} className={btnStyles.save}>
            {busy ? "저장 중..." : "저장"}
          </button>
          <button onClick={onClose} disabled={busy} className={btnStyles.cancel}>
            취소
          </button>
        </div>
      }
    >
      <p className="text-xs text-muted mb-3 ml-1">화살표로 옮긴 뒤 저장하면 모든 사람에게 같은 순서로 보입니다</p>
      <ol className="space-y-1.5">
        {list.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-lg border border-line bg-white">
            <span className="w-5 text-xs font-bold text-muted tabular-nums">{i + 1}</span>
            <span className="flex-1 min-w-0 text-sm font-semibold text-heading truncate">{c.name}</span>
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0 || busy}
              aria-label={`${c.name} 위로`}
              className={arrow}
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === list.length - 1 || busy}
              aria-label={`${c.name} 아래로`}
              className={arrow}
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ol>
    </Modal>
  );
}

// ── 카테고리 만들기 / 고치기 ─────────────────────────────────────────────
export function CategoryModal({
  initial,
  meId,
  onClose,
  onSaved,
}: {
  initial?: LibraryCategory;
  meId: string;
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const supabase = createClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const values = { name: name.trim(), description: description.trim() || null };
    const { data, error } = initial
      ? await supabase.from("library_categories").update(values).eq("id", initial.id).select("id").single()
      : await supabase
          .from("library_categories")
          .insert({ ...values, creator_id: meId })
          .select("id")
          .single();
    setBusy(false);
    if (error || !data) return toast.error("저장하지 못했습니다.");
    toast.success(initial ? "수정되었습니다." : "카테고리를 만들었습니다.");
    onSaved(data.id);
  };

  return (
    <Modal
      isOpen
      onClose={() => !busy && onClose()}
      title={initial ? "카테고리 수정" : "카테고리 만들기"}
      className="sm:max-w-[480px]"
      footer={
        <div className="flex gap-2 ml-auto">
          <button onClick={handleSave} disabled={!name.trim() || busy} className={btnStyles.save}>
            {busy ? "저장 중..." : initial ? "수정" : "만들기"}
          </button>
          <button onClick={onClose} disabled={busy} className={btnStyles.cancel}>
            취소
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>이름</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && handleSave()}
            placeholder="예) 차량 관련 서식"
            maxLength={40}
            autoFocus
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>설명 (선택)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="어떤 자료를 모아두는 곳인지"
            maxLength={100}
            className={inputClass}
          />
        </div>
      </div>
    </Modal>
  );
}
