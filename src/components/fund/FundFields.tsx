// src/components/fund/FundFields.tsx
// 건별 입력에서 쓰는 입력칸들 — 달력 / 금액 / 사역자 자동완성
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
// 차량·휴가·예약 화면과 같은 그룹웨어 공용 달력 스타일
import "@/styles/calendar.css";
import { format } from "date-fns";
import Select from "@/components/Select";
import { inputClass, selectClass, toCommaInput } from "./shared";

export type Member = { id: string; name: string; hint?: string | null };

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
      // body로 포털되므로 Modal(z-9999)보다 위에 있어야 한다 —
      // 모달 안에서 쓰면 그보다 낮은 값은 팝업 뒤에 가려진다
      zIndex: 10001,
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
          open ? "ring-2 ring-primary" : ""
        }`}
      >
        <span className="text-heading tabular-nums">{value || "선택"}</span>
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
              className="fixed inset-0 z-[10000]"
              onClick={() => setOpen(false)}
            />
            {/* range-calendar-wrapper: 공용 스타일이 숨기는 월 이동 버튼을 팝업에서는 되살린다 */}
            <div
              className="range-calendar-wrapper animate-fadeIn bg-white border border-line rounded-xl shadow-2xl p-3 w-[300px] sm:w-[350px]"
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

/* ── 날짜 + 시각 ("yyyy-MM-ddTHH:mm", datetime-local 과 같은 값) ──
   브라우저 기본 달력·시계는 모양을 바꿀 수 없어서 그룹웨어 달력 + 시·분 목록으로 만든다. */
const HOURS = Array.from({ length: 24 }, (_, h) => {
  const v = String(h).padStart(2, "0");
  return { value: v, label: `${v}시` };
});
const MINUTES = Array.from({ length: 60 }, (_, m) => {
  const v = String(m).padStart(2, "0");
  return { value: v, label: `${v}분` };
});

/** 시각만 ("HH:mm") — 시 · 분 목록 두 개 */
export function TimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  // 비어 있으면 지금 시각을 보여주되, 고르기 전까지는 값을 바꾸지 않는다
  const now = new Date();
  const hh = value.slice(0, 2) || String(now.getHours()).padStart(2, "0");
  const mm = value.slice(3, 5) || String(now.getMinutes()).padStart(2, "0");
  return (
    <div className="grid grid-cols-2 gap-2">
      <Select
        value={hh}
        onChange={(h) => onChange(`${h}:${mm}`)}
        options={HOURS}
        className={`${selectClass} tabular-nums`}
      />
      <Select
        value={mm}
        onChange={(m) => onChange(`${hh}:${m}`)}
        options={MINUTES}
        className={`${selectClass} tabular-nums`}
      />
    </div>
  );
}

export function DateTimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [date, time = ""] = value ? value.split("T") : ["", ""];
  const today = format(new Date(), "yyyy-MM-dd");
  // TimeField 가 빈 값일 때 보여주는 '지금'을 그대로 이어 붙인다
  const nowTime = format(new Date(), "HH:mm");
  return (
    <div className="grid grid-cols-[1fr_192px] gap-2">
      <DateField
        value={date}
        onChange={(d) => onChange(`${d}T${time || nowTime}`)}
      />
      <TimeField
        value={time}
        onChange={(t) => onChange(`${date || today}T${t}`)}
      />
    </div>
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

/* ── 대상자 자동완성 (방향키·Enter 선택 가능) ── */
export function MemberField({
  members,
  name,
  selectedId,
  onPick,
  onTextChange,
  placeholder = "이름을 입력하세요",
  emptyHint,
}: {
  members: Member[];
  name: string;
  selectedId: string;
  onPick: (m: Member) => void;
  onTextChange: (v: string) => void;
  placeholder?: string;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const kw = name.trim().toLowerCase();
  const suggestions = kw
    ? members.filter((m) => m.name.toLowerCase().includes(kw)).slice(0, 8)
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
        placeholder={placeholder}
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
          className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-line rounded-lg shadow-xl"
        >
          {suggestions.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(m)}
                className={`w-full px-3 py-2 text-left text-sm cursor-pointer ${
                  i === highlight ? "bg-primary-wash text-primary-active" : "text-gray-800"
                }`}
              >
                {m.name}
                {m.hint && (
                  <span className="ml-2 text-xs text-muted">{m.hint}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {name && !selectedId && (
        <p className="mt-1 text-xs text-amber-600">
          {suggestions.length === 0 && emptyHint
            ? emptyHint
            : "목록에서 선택해주세요."}
        </p>
      )}
    </div>
  );
}
