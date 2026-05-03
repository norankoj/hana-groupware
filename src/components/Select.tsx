"use client";
// src/components/Select.tsx
import { useState, useRef, useEffect } from "react";

type Option = {
  value: string;
  label: string;
  group?: string;
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
  const [openUpward, setOpenUpward] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
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

  // 그룹이 하나라도 있는지 확인
  const hasGroups = formattedOptions.some((opt) => opt.group);

  // 옵션들을 그룹별로 묶어주는 로직
  const groupedOptions = formattedOptions.reduce(
    (acc, opt) => {
      const groupName = opt.group || "기타";
      if (!acc[groupName]) acc[groupName] = [];
      acc[groupName].push(opt);
      return acc;
    },
    {} as Record<string, Option[]>,
  );

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && (
        <label className="block text-sm font-bold text-gray-600 mb-1.5 ml-1">
          {label}
        </label>
      )}

      {/* 선택 박스 (Trigger) */}
      <button
        type="button"
        onClick={() => {
          if (!isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const up = spaceBelow < 260;
            setOpenUpward(up);
            // position: fixed 로 overflow:hidden 부모 탈출
            setDropdownStyle(
              up
                ? { position: "fixed", bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width, zIndex: 200 }
                : { position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 200 }
            );
          }
          setIsOpen(!isOpen);
        }}
        style={{ colorScheme: "light" }}
        className={`flex items-center justify-between text-left transition-all duration-200 outline-none
          ${className} 
          ${isOpen ? "ring-2 ring-blue-200 border-blue-500" : ""}
          ${!className ? "w-full p-3 bg-white border border-gray-300 rounded-lg" : ""} 
        `}
      >
        <span
          className={`truncate font-bold ${
            className?.includes("text-xs")
              ? "text-xs"
              : className?.includes("text-sm")
                ? "text-sm"
                : "text-base"
          } ${value ? "text-gray-900" : "text-gray-400"}`}
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

      {/* 드롭다운 메뉴 — position:fixed로 overflow:hidden 부모 탈출 */}
      {isOpen && (
        <div
          className="bg-white border border-gray-100 rounded-xl shadow-lg max-h-60 overflow-y-auto custom-scrollbar animate-fadeIn"
          style={dropdownStyle}
        >
          {hasGroups
            ? Object.entries(groupedOptions).map(([group, opts]) => (
                <div key={group}>
                  <div className="px-4 py-2 text-xs font-extrabold text-gray-500 bg-gray-50/95 sticky top-0 backdrop-blur-sm border-y border-gray-100 first:border-t-0 z-10">
                    {group}
                  </div>
                  {opts.map((opt) => (
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
                            : "text-gray-700 hover:bg-gray-50 hover:text-blue-600 font-medium"
                        }
                      `}
                    >
                      <span className="pl-2">{opt.label}</span>{" "}
                    </div>
                  ))}
                </div>
              ))
            : formattedOptions.map((opt) => (
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
