// src/components/fund/FundFields.tsx
// 건별 입력에서 쓰는 입력칸들 — 달력 / 금액 / 사역자 자동완성
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { format } from "date-fns";
import { inputClass, toCommaInput } from "./shared";

export type Member = { id: string; full_name: string; position: string | null };

/* ── 날짜 (차량 정비 등록 화면과 같은 react-calendar) ──
   스크롤되는 목록 안에서도 잘리지 않도록 body에 포털로 띄운다. */
const CALENDAR_HEIGHT = 340;

export function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  // 스크롤·리사이즈 중에는 위치가 어긋나므로 닫는다
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const parsed = value ? new Date(value) : new Date();
  const safeDate = isNaN(parsed.getTime()) ? new Date() : parsed;

  const toggle = () => {
    if (open) return setOpen(false);
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const openUpward = window.innerHeight - rect.bottom < CALENDAR_HEIGHT;
    setStyle({
      position: "fixed",
      left: Math.min(rect.left, window.innerWidth - 320),
      zIndex: 200,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
    setOpen(true);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={`${inputClass} flex items-center justify-between text-left cursor-pointer ${
          open ? "ring-2 ring-blue-500" : ""
        }`}
      >
        <span className="text-gray-900 tabular-nums">{value || "선택"}</span>
        <svg
          className="w-4 h-4 text-gray-400 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>

      {open &&
        mounted &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[199]"
              onClick={() => setOpen(false)}
            />
            <div
              className="bg-white border border-gray-200 rounded-xl shadow-2xl p-2"
              style={style}
            >
              <Calendar
                onChange={(val) => {
                  if (val && !Array.isArray(val)) {
                    onChange(format(val as Date, "yyyy-MM-dd"));
                    setOpen(false);
                  }
                }}
                value={safeDate}
                formatDay={(_locale, date) => format(date, "d")}
                calendarType="gregory"
                locale="ko-KR"
              />
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

/* ── 금액 (숫자만 · 천단위 콤마) ── */
export function AmountField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(toCommaInput(e.target.value))}
        placeholder={placeholder}
        className={`${inputClass} pr-8 text-right tabular-nums`}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
        원
      </span>
    </div>
  );
}

/* ── 사역자 자동완성 (방향키·Enter 선택 가능) ── */
export function MemberField({
  members,
  name,
  selectedId,
  onPick,
  onTextChange,
}: {
  members: Member[];
  name: string;
  selectedId: string;
  onPick: (m: Member) => void;
  onTextChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const kw = name.trim().toLowerCase();
  const suggestions = kw
    ? members.filter((m) => m.full_name.toLowerCase().includes(kw)).slice(0, 8)
    : members.slice(0, 8);

  useEffect(() => {
    setHighlight(0);
  }, [name]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // 방향키로 이동할 때 선택 항목이 보이도록 스크롤
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelectorAll("li")
      [highlight]?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const pick = (m: Member) => {
    onPick(m);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 한글 조합 중에는 Enter가 글자 확정용이므로 건너뛴다
    if (e.nativeEvent.isComposing) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) return setOpen(true);
      setHighlight((i) => (suggestions.length ? (i + 1) % suggestions.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      setHighlight((i) =>
        suggestions.length ? (i - 1 + suggestions.length) % suggestions.length : 0,
      );
    } else if (e.key === "Enter") {
      if (open && suggestions[highlight]) {
        e.preventDefault();
        pick(suggestions[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <input
        value={name}
        onChange={(e) => {
          onTextChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="이름을 입력하세요"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="member-suggestions"
        className={`${inputClass} ${
          name && !selectedId ? "border-amber-400" : ""
        }`}
      />

      {open && suggestions.length > 0 && (
        <ul
          id="member-suggestions"
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl"
        >
          {suggestions.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(m)}
                className={`w-full px-3 py-2 text-left text-sm cursor-pointer ${
                  i === highlight ? "bg-blue-50 text-blue-700" : "text-gray-800"
                }`}
              >
                {m.full_name}
                <span className="ml-2 text-xs text-gray-500">
                  {m.position ?? ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {name && !selectedId && (
        <p className="mt-1 text-xs text-amber-600">
          목록에서 사역자를 선택해주세요.
        </p>
      )}
    </div>
  );
}
