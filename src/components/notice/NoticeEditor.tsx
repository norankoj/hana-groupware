"use client";

// 공지 본문 에디터 — TipTap v3 (MIT, 무료).
//
// v3 의 StarterKit 은 링크·밑줄을 이미 품고 있다. 예전엔 둘을 따로 또 등록해서
// 같은 확장이 두 번 들어가 있었다 — 여기선 StarterKit 설정으로만 켠다.
// 글자색·형광펜(Color · BackgroundColor)은 이미 설치돼 있던 text-style 패키지에 들어 있다.

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import {
  TextStyle,
  Color,
  BackgroundColor,
} from "@tiptap/extension-text-style";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Heading1,
  Heading2,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table,
  Underline,
  Undo2,
} from "lucide-react";
import { NOTICE_PROSE } from "./shared";

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /**
   * 본문에 넣을 이미지를 올리고 보여줄 주소를 돌려준다.
   * 없으면 이미지 버튼을 감춘다 (올릴 곳을 아는 건 쓰는 쪽이다).
   */
  uploadImage?: (file: File) => Promise<string | null>;
}

/* ── 색 — 디자인 시스템 팔레트에서만 고른다 ── */
const TEXT_COLORS = [
  { label: "기본", value: null },
  { label: "파랑", value: "#2151ec" },
  { label: "빨강", value: "#ea5455" },
  { label: "초록", value: "#198754" },
  { label: "주황", value: "#fd7e14" },
  { label: "보라", value: "#6f42c1" },
  { label: "회색", value: "#626f86" },
];
const HIGHLIGHTS = [
  { label: "없음", value: null },
  { label: "노랑", value: "rgba(240, 175, 35, 0.32)" },
  { label: "파랑", value: "rgba(33, 81, 236, 0.16)" },
  { label: "빨강", value: "rgba(234, 84, 85, 0.2)" },
  { label: "초록", value: "rgba(40, 199, 111, 0.22)" },
];

type Popover = "color" | "highlight" | "link" | null;

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      // 누르는 순간 에디터 선택이 풀리지 않게
      onMouseDown={(e) => {
        e.preventDefault();
        if (!disabled) onClick();
      }}
      className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "bg-primary-soft text-primary-active"
          : "text-dark hover:bg-secondary-soft"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-line mx-1" />;
}

/** 색 고르기 판 — 칸 하나를 누르면 바로 적용하고 닫힌다 */
function Swatches({
  items,
  current,
  onPick,
  kind,
}: {
  items: { label: string; value: string | null }[];
  current: string | null;
  onPick: (v: string | null) => void;
  kind: "text" | "bg";
}) {
  return (
    <div className="flex gap-1.5">
      {items.map((c) => {
        const on = (c.value ?? null) === (current ?? null);
        return (
          <button
            key={c.label}
            type="button"
            title={c.label}
            aria-label={c.label}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(c.value);
            }}
            className={`w-7 h-7 rounded-md border flex items-center justify-center text-xs font-bold cursor-pointer transition ${
              on ? "border-primary ring-2 ring-primary-soft" : "border-line-strong hover:border-primary"
            }`}
            style={
              kind === "bg"
                ? { background: c.value ?? "#fff" }
                : { color: c.value ?? "#11152a" }
            }
          >
            {kind === "text" ? "가" : c.value ? "" : "✕"}
          </button>
        );
      })}
    </div>
  );
}

export default function NoticeEditor({
  content,
  onChange,
  placeholder = "내용을 입력하세요...",
  uploadImage,
}: Props) {
  const [popover, setPopover] = useState<Popover>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: {
            class: "text-primary underline",
            rel: "noopener noreferrer",
            target: "_blank",
          },
        },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
      TextStyle,
      Color,
      BackgroundColor,
      Image.configure({ HTMLAttributes: { loading: "lazy" } }),
      // 칸 너비 끌기는 끈다 — 공지 표는 단순한 표로 충분하고, 끌기 손잡이가 모바일에서 거슬린다
      TableKit.configure({ table: { resizable: false } }),
    ],
    content,
    editorProps: {
      attributes: {
        // 상세 화면과 같은 틀(NOTICE_PROSE) — 쓰는 그대로 보인다
        class: `${NOTICE_PROSE} min-h-[220px] px-4 py-3 focus:outline-none`,
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  // 외부에서 content 변경 시 동기화 (수정 모드 진입 시)
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== content) {
      editor.commands.setContent(content || "");
    }
  }, [content, editor]);

  if (!editor) return null;

  const openLink = () => {
    setLinkUrl(editor.getAttributes("link").href ?? "");
    setPopover(popover === "link" ? null : "link");
  };
  const applyLink = () => {
    const url = linkUrl.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!url) chain.unsetLink().run();
    // 주소만 적어도 열리게 — http 가 없으면 붙인다
    else chain.setLink({ href: /^https?:\/\//i.test(url) ? url : `https://${url}` }).run();
    setPopover(null);
  };

  const onPickImage = async (file: File | undefined) => {
    if (!file || !uploadImage) return;
    setUploading(true);
    const src = await uploadImage(file);
    setUploading(false);
    if (src) editor.chain().focus().setImage({ src, alt: file.name }).run();
  };

  const inTable = editor.isActive("table");

  return (
    <div className="border border-line-strong rounded-xl bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-soft transition">
      {/* 툴바 — 스크롤할 때 위에 붙어 있게 */}
      <div className="sticky top-0 z-10 rounded-t-xl flex items-center flex-wrap gap-0.5 px-2 py-1.5 border-b border-line-soft bg-table-header">
        <ToolbarButton title="제목 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 size={17} />
        </ToolbarButton>
        <ToolbarButton title="제목 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={17} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton title="굵게" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton title="기울임" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton title="밑줄" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <Underline size={16} />
        </ToolbarButton>
        <ToolbarButton title="취소선" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough size={16} />
        </ToolbarButton>

        {/* 글자색 · 형광펜 */}
        <div className="relative">
          <ToolbarButton title="글자색" active={popover === "color"} onClick={() => setPopover(popover === "color" ? null : "color")}>
            <span className="flex flex-col items-center leading-none">
              <Baseline size={16} />
              <span
                className="w-3.5 h-[3px] rounded-full -mt-0.5"
                style={{ background: editor.getAttributes("textStyle").color ?? "#11152a" }}
              />
            </span>
          </ToolbarButton>
          {popover === "color" && (
            <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-line rounded-lg shadow-lg p-2">
              <Swatches
                kind="text"
                items={TEXT_COLORS}
                current={editor.getAttributes("textStyle").color ?? null}
                onPick={(v) => {
                  if (v) editor.chain().focus().setColor(v).run();
                  else editor.chain().focus().unsetColor().run();
                  setPopover(null);
                }}
              />
            </div>
          )}
        </div>
        <div className="relative">
          <ToolbarButton title="형광펜" active={popover === "highlight"} onClick={() => setPopover(popover === "highlight" ? null : "highlight")}>
            <Highlighter size={16} />
          </ToolbarButton>
          {popover === "highlight" && (
            <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-line rounded-lg shadow-lg p-2">
              <Swatches
                kind="bg"
                items={HIGHLIGHTS}
                current={editor.getAttributes("textStyle").backgroundColor ?? null}
                onPick={(v) => {
                  if (v) editor.chain().focus().setBackgroundColor(v).run();
                  else editor.chain().focus().unsetBackgroundColor().run();
                  setPopover(null);
                }}
              />
            </div>
          )}
        </div>

        <Divider />

        <ToolbarButton title="왼쪽 정렬" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft size={16} />
        </ToolbarButton>
        <ToolbarButton title="가운데 정렬" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter size={16} />
        </ToolbarButton>
        <ToolbarButton title="오른쪽 정렬" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight size={16} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton title="글머리 목록" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton title="번호 목록" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={16} />
        </ToolbarButton>
        <ToolbarButton title="인용구" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote size={16} />
        </ToolbarButton>
        <ToolbarButton title="구분선" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus size={16} />
        </ToolbarButton>

        <Divider />

        {/* 링크 */}
        <div className="relative">
          <ToolbarButton title="링크" active={editor.isActive("link") || popover === "link"} onClick={openLink}>
            <Link2 size={16} />
          </ToolbarButton>
          {popover === "link" && (
            <div className="absolute left-0 top-full mt-1 z-20 w-72 bg-white border border-line rounded-lg shadow-lg p-2 flex gap-1.5">
              <input
                autoFocus
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyLink();
                  }
                  if (e.key === "Escape") setPopover(null);
                }}
                placeholder="https:// 주소 (비우면 링크 해제)"
                className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-line-strong rounded-md outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={applyLink}
                className="px-3 py-1.5 text-sm font-semibold rounded-md bg-primary text-white hover:bg-primary-active cursor-pointer"
              >
                적용
              </button>
            </div>
          )}
        </div>

        {/* 이미지 — 올릴 곳이 있을 때만 */}
        {uploadImage && (
          <>
            <ToolbarButton title="이미지 넣기" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
            </ToolbarButton>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                onPickImage(e.target.files?.[0]);
                e.target.value = ""; // 같은 파일을 다시 골라도 동작하게
              }}
            />
          </>
        )}

        {/* 표 — 표 안에 있을 때만 줄·칸 편집 버튼이 붙는다 */}
        <ToolbarButton
          title="표 넣기 (3×3)"
          active={inTable}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <Table size={16} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton title="실행취소" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 size={16} />
        </ToolbarButton>
        <ToolbarButton title="다시실행" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 size={16} />
        </ToolbarButton>
      </div>

      {inTable && <TableBar editor={editor} />}

      {/* 색·링크 판이 열려 있을 때 바깥을 누르면 닫는다 */}
      {popover && (
        <div className="fixed inset-0 z-[5]" onMouseDown={() => setPopover(null)} />
      )}

      <EditorContent editor={editor} />
    </div>
  );
}

/** 표 안에 커서가 있을 때 — 줄·칸 추가·삭제 */
function TableBar({ editor }: { editor: Editor }) {
  const btn =
    "px-2 py-1 text-xs font-medium rounded-md text-dark hover:bg-secondary-soft cursor-pointer";
  const run = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    fn();
  };
  return (
    <div className="flex items-center flex-wrap gap-0.5 px-2 py-1 border-b border-line-soft bg-primary-wash text-xs">
      <span className="px-1.5 font-semibold text-primary-active">표</span>
      <button type="button" className={btn} onMouseDown={run(() => editor.chain().focus().addRowAfter().run())}>줄 추가</button>
      <button type="button" className={btn} onMouseDown={run(() => editor.chain().focus().deleteRow().run())}>줄 삭제</button>
      <button type="button" className={btn} onMouseDown={run(() => editor.chain().focus().addColumnAfter().run())}>칸 추가</button>
      <button type="button" className={btn} onMouseDown={run(() => editor.chain().focus().deleteColumn().run())}>칸 삭제</button>
      <button type="button" className={btn} onMouseDown={run(() => editor.chain().focus().toggleHeaderRow().run())}>머리줄</button>
      <button
        type="button"
        className="ml-auto px-2 py-1 text-xs font-medium rounded-md text-danger-active hover:bg-danger-soft cursor-pointer"
        onMouseDown={run(() => editor.chain().focus().deleteTable().run())}
      >
        표 삭제
      </button>
    </div>
  );
}
