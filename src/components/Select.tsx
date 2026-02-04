"use client";

import { useState, useRef, useEffect } from "react";

type Option = {
  value: string;
  label: string;
};

type SelectProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[] | string[];
  placeholder?: string;
  className?: string; // 외부 스타일 주입용
};

export default function Select({
  label,
  value,
  onChange,
  options,
  placeholder = "선택하세요",
  className = "",
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

  // 옵션 데이터 정규화
  const formattedOptions: Option[] = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt,
  );

  const selectedLabel = formattedOptions.find(
    (opt) => opt.value === value,
  )?.label;

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* 라벨은 외부에서 그릴 수도 있고 내부에서 그릴 수도 있게 처리 */}
      {label && (
        <label className="block text-sm font-bold text-gray-600 mb-1.5 ml-1">
          {label}
        </label>
      )}

      {/* 선택 박스 (Trigger) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        // ★ 핵심: 외부에서 받은 className을 적용하되, 정렬(flex) 속성은 유지
        // style={{ colorScheme: 'light' }} -> 다크모드에서도 강제로 밝은 스타일 유지
        style={{ colorScheme: "light" }}
        className={`flex items-center justify-between text-left transition-all duration-200 outline-none
          ${className} 
          ${isOpen ? "ring-2 ring-blue-200 border-blue-500" : ""}
          ${!className ? "w-full p-3 bg-white border border-gray-300 rounded-lg" : ""} 
        `}
      >
        <span
          className={`text-base truncate ${
            value ? "text-gray-900" : "text-gray-400"
          }`}
        >
          {selectedLabel || placeholder}
        </span>

        {/* 화살표 아이콘 */}
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-blue-600" : ""
          }`}
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

      {/* 드롭다운 메뉴 */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg max-h-60 overflow-y-auto animate-fadeIn">
          {formattedOptions.map((opt) => (
            <div
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`px-4 py-3 text-base cursor-pointer transition-colors
                ${
                  value === opt.value
                    ? "bg-blue-50 text-blue-600 font-bold"
                    : "text-gray-700 hover:bg-gray-50 hover:text-blue-600"
                }
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
