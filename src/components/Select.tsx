"use client";

import { useState, useRef, useEffect } from "react";

type Option = {
  value: string;
  label: string;
};

type SelectProps = {
  label?: string; // 라벨 (선택사항)
  value: string; // 현재 선택된 값
  onChange: (value: string) => void; // 값 변경 시 실행할 함수
  options: Option[] | string[]; // 옵션 목록 (문자열 배열 또는 객체 배열)
  placeholder?: string;
};

export default function Select({
  label,
  value,
  onChange,
  options,
  placeholder = "선택하세요",
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 옵션 데이터 정규화 (문자열 배열도 처리 가능하도록)
  const formattedOptions: Option[] = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt,
  );

  const selectedLabel = formattedOptions.find(
    (opt) => opt.value === value,
  )?.label;

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && (
        <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
          {label}
        </label>
      )}

      {/* 선택 박스 (Trigger) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between p-3 bg-white border rounded-lg text-left transition-all duration-200 outline-none
          ${isOpen ? "border-blue-600 ring-1 ring-blue-600" : "border-gray-300 hover:border-gray-400"}
        `}
      >
        <span
          className={`text-sm ${value ? "text-gray-900 font-medium" : "text-gray-400"}`}
        >
          {selectedLabel || placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180 text-blue-600" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* 드롭다운 메뉴 (Options) */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-100 rounded-lg shadow-lg max-h-60 overflow-y-auto animate-fadeIn">
          {formattedOptions.map((opt) => (
            <div
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`px-4 py-3 text-sm cursor-pointer transition-colors
                ${value === opt.value ? "bg-blue-50 text-blue-600 font-bold" : "text-gray-700 hover:bg-blue-50 hover:text-blue-600"}
              `}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
