// src/components/fund/FundEntryForm.tsx
"use client";

import { useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import Select from "@/components/Select";
import { AmountField, DateField, MemberField, type Member } from "./FundFields";
import {
  ENTRY_MODE_OPTIONS,
  ENTRY_TYPE_ALIASES,
  ENTRY_TYPE_LABEL,
  formatWon,
  inputClass,
  parseAmount,
  parseEntryDate,
  selectClass,
  todayString,
  type FundEntryType,
  type FundUser,
} from "./shared";

type Props = {
  manager: FundUser;
  members: Member[];
  onSaved: () => void;
};

// 엑셀 미리보기 한 줄
type ParsedRow = {
  line: number; // 엑셀 기준 행 번호
  entry_type: FundEntryType | null;
  name: string;
  user_id: string | null;
  amount: number | null;
  description: string;
  entry_date: string | null;
  account: string;
  errors: string[];
};

const TEMPLATE_HEADERS = [
  "구분",
  "사역자명",
  "금액",
  "내용",
  "날짜",
  "요청일자",
  "계좌정보",
];

const EMPTY_SINGLE = {
  mode: "deposit" as "deposit" | "withdraw",
  name: "",
  user_id: "",
  self_amount: "",
  match_amount: "",
  use_amount: "",
  description: "",
  entry_date: todayString(),
};

export default function FundEntryForm({ manager, members, onSaved }: Props) {
  const supabase = createClient();

  // ── 건별 입력 ──
  const [single, setSingle] = useState(EMPTY_SINGLE);
  const [savingSingle, setSavingSingle] = useState(false);

  const isDeposit = single.mode === "deposit";

  const handleSaveSingle = async () => {
    if (!single.user_id) return toast.error("사역자를 목록에서 선택해주세요.");
    if (!single.entry_date) return toast.error("일자를 입력해주세요.");

    const base = {
      user_id: single.user_id,
      description: single.description.trim() || null,
      entry_date: single.entry_date,
      created_by: manager.id,
    };

    const rows: Record<string, unknown>[] = [];

    if (isDeposit) {
      const self = parseAmount(single.self_amount) ?? 0;
      const match = parseAmount(single.match_amount) ?? 0;
      if (self <= 0 && match <= 0)
        return toast.error("본인적립금 또는 교회지원금을 입력해주세요.");
      if (self > 0)
        rows.push({ ...base, entry_type: "self_deposit", amount: self });
      if (match > 0)
        rows.push({ ...base, entry_type: "church_match", amount: match });
    } else {
      const use = parseAmount(single.use_amount) ?? 0;
      if (use <= 0) return toast.error("금액을 입력해주세요.");
      rows.push({ ...base, entry_type: "withdraw", amount: use });
    }

    setSavingSingle(true);
    const { error } = await supabase.from("fund_ledger").insert(rows);
    setSavingSingle(false);

    if (error) return toast.error("등록 실패: " + error.message);

    const summary = rows
      .map(
        (r) =>
          `${ENTRY_TYPE_LABEL[r.entry_type as FundEntryType]} ${formatWon(r.amount as number)}원`,
      )
      .join(" · ");
    toast.success(`${single.name} — ${summary} 등록 완료`);

    setSingle({
      ...EMPTY_SINGLE,
      mode: single.mode,
      entry_date: single.entry_date,
    });
    onSaved();
  };

  // ── 엑셀 업로드 ──
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [savingBulk, setSavingBulk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const validRows = rows?.filter((r) => r.errors.length === 0) ?? [];
  const invalidRows = rows?.filter((r) => r.errors.length > 0) ?? [];

  const handleDownloadTemplate = () => {
    const sample = [
      TEMPLATE_HEADERS,
      ["본인적립금", "고성호", 250000, "본인적립금 9월", "2026-09-01", "", ""],
      ["교회지원금", "고성호", 250000, "교회지원금 9월", "2026-09-01", "", ""],
      [
        "사용",
        "고성호",
        1250000,
        "요르단비전트립 항공권",
        "2026-08-30",
        "2026-08-28",
        "국민, 00000-00-00000, 고성호",
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sample);
    ws["!cols"] = [
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 24 },
      { wch: 12 },
      { wch: 12 },
      { wch: 28 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "선교펀드");
    XLSX.writeFile(wb, "선교펀드_등록양식.xlsx");
  };

  const handlePickFile = async (file: File) => {
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
      });

      const byName = new Map(members.map((m) => [m.full_name.trim(), m]));

      const parsed: ParsedRow[] = raw.map((r, i) => {
        const errors: string[] = [];

        const typeRaw = String(r["구분"] ?? "").trim();
        const entry_type = ENTRY_TYPE_ALIASES[typeRaw] ?? null;
        if (!entry_type)
          errors.push(
            typeRaw ? `구분 '${typeRaw}'을 알 수 없음` : "구분이 비어 있음",
          );

        const name = String(r["사역자명"] ?? "").trim();
        const member = byName.get(name);
        if (!name) errors.push("사역자명이 비어 있음");
        else if (!member) errors.push(`'${name}' 사역자를 찾을 수 없음`);

        const amount = parseAmount(r["금액"]);
        if (amount === null) errors.push("금액을 읽을 수 없음");
        else if (amount <= 0) errors.push("금액이 0 이하");

        const entry_date = parseEntryDate(r["날짜"]);
        if (!entry_date) errors.push("날짜를 읽을 수 없음");

        const account = String(r["계좌정보"] ?? "").trim();
        let description = String(r["내용"] ?? "").trim();
        if (entry_type === "withdraw" && account) {
          description = description ? `${description} / ${account}` : account;
        }

        return {
          line: i + 2, // 헤더가 1행
          entry_type,
          name,
          user_id: member?.id ?? null,
          amount,
          description,
          entry_date,
          account,
          errors,
        };
      });

      if (parsed.length === 0) {
        toast.error("읽을 수 있는 데이터가 없습니다.");
        setRows(null);
        return;
      }
      setRows(parsed);
    } catch (e: any) {
      toast.error("파일을 읽지 못했습니다: " + (e?.message ?? ""));
      setRows(null);
    }
  };

  const handleSaveBulk = async () => {
    if (validRows.length === 0) return toast.error("저장할 줄이 없습니다.");

    setSavingBulk(true);
    const { error } = await supabase.from("fund_ledger").insert(
      validRows.map((r) => ({
        user_id: r.user_id,
        entry_type: r.entry_type,
        amount: r.amount,
        description: r.description || null,
        entry_date: r.entry_date,
        created_by: manager.id,
      })),
    );
    setSavingBulk(false);

    if (error) return toast.error("저장 실패: " + error.message);
    toast.success(`${validRows.length}건 등록 완료`);
    resetBulk();
    onSaved();
  };

  const resetBulk = () => {
    setRows(null);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      {/* ── 건별 입력 ── */}
      <Card
        title="건별 입력"
        desc="한 건씩 직접 등록합니다. 적립은 본인적립금과 교회지원금을 함께 넣을 수 있습니다."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3">
          <div>
            <Label>구분</Label>
            <Select
              value={single.mode}
              onChange={(v) =>
                setSingle({ ...single, mode: v as "deposit" | "withdraw" })
              }
              options={ENTRY_MODE_OPTIONS}
              className={selectClass}
            />
          </div>

          <div>
            <Label>사역자</Label>
            <MemberField
              members={members}
              name={single.name}
              selectedId={single.user_id}
              onTextChange={(v) =>
                setSingle({ ...single, name: v, user_id: "" })
              }
              onPick={(m) =>
                setSingle({ ...single, name: m.full_name, user_id: m.id })
              }
            />
          </div>

          {isDeposit ? (
            <>
              <div>
                <Label>본인적립금</Label>
                <AmountField
                  value={single.self_amount}
                  onChange={(v) => setSingle({ ...single, self_amount: v })}
                  placeholder="250,000"
                />
              </div>
              <div>
                <Label>교회지원금</Label>
                <AmountField
                  value={single.match_amount}
                  onChange={(v) => setSingle({ ...single, match_amount: v })}
                  placeholder="250,000"
                />
              </div>
            </>
          ) : (
            <div>
              <Label>금액</Label>
              <AmountField
                value={single.use_amount}
                onChange={(v) => setSingle({ ...single, use_amount: v })}
                placeholder="1,250,000"
              />
            </div>
          )}

          <div className={isDeposit ? "lg:col-span-3" : "lg:col-span-2"}>
            <Label>내용</Label>
            <input
              value={single.description}
              onChange={(e) =>
                setSingle({ ...single, description: e.target.value })
              }
              placeholder={isDeposit ? "예) 9월 적립" : "예) 비전트립 항공권"}
              className={inputClass}
            />
          </div>

          <div>
            <Label>{isDeposit ? "입금일자" : "이체일자"}</Label>
            <DateField
              value={single.entry_date}
              onChange={(v) => setSingle({ ...single, entry_date: v })}
            />
          </div>
        </div>

        {isDeposit && (
          <p className="mt-4 text-sm leading-relaxed text-gray-600">
            교회지원금은 규정(가정 25만원 / 싱글 15만원 한도)에 맞춰 직접
            입력하시면 됩니다. 한쪽만 넣어도 등록됩니다.
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSaveSingle}
            disabled={savingSingle}
            className="px-5 py-2.5 bg-[#2151EC] text-white font-bold rounded-lg hover:bg-[#1a43c9] transition text-sm shadow-md disabled:opacity-60 cursor-pointer"
          >
            {savingSingle ? "등록 중..." : "등록"}
          </button>
        </div>
      </Card>

      {/* ── 엑셀 업로드 ── */}
      <Card
        title="파일로 다중 입력"
        desc="양식을 내려받아 채운 뒤 올리면, 저장 전에 확인 화면을 먼저 보여드립니다."
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            onClick={handleDownloadTemplate}
            className="px-4 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap"
          >
            양식 내려받기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePickFile(f);
            }}
            className="flex-1 text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:text-xs file:font-bold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 file:cursor-pointer"
          />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          구분 칸에는 <b>본인적립금 · 교회지원금 · 사용</b> 중 하나를 적습니다.
          구분이 '사용'이면 날짜는 이체일자로 기록되고, 처리자는 파일을 올린
          담당자로 남습니다.
        </p>

        {rows && (
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-bold text-gray-800">{fileName}</span>
              <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-xs font-bold">
                저장 가능 {validRows.length}건
              </span>
              {invalidRows.length > 0 && (
                <span className="text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded text-xs font-bold">
                  오류 {invalidRows.length}건
                </span>
              )}
            </div>

            <div className="border border-gray-200 rounded-lg overflow-auto custom-scrollbar max-h-[360px]">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                    <th className="text-left px-3 py-2 font-bold">행</th>
                    <th className="text-left px-3 py-2 font-bold">구분</th>
                    <th className="text-left px-3 py-2 font-bold">사역자</th>
                    <th className="text-right px-3 py-2 font-bold">금액</th>
                    <th className="text-left px-3 py-2 font-bold">내용</th>
                    <th className="text-left px-3 py-2 font-bold">날짜</th>
                    <th className="text-left px-3 py-2 font-bold">확인</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const bad = r.errors.length > 0;
                    return (
                      <tr
                        key={r.line}
                        className={`border-b border-gray-100 last:border-0 ${bad ? "bg-red-50/60" : ""}`}
                      >
                        <td className="px-3 py-2 text-gray-400 tabular-nums">
                          {r.line}
                        </td>
                        <td className="px-3 py-2">
                          {r.entry_type ? ENTRY_TYPE_LABEL[r.entry_type] : "-"}
                        </td>
                        <td className="px-3 py-2">{r.name || "-"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.amount === null ? "-" : formatWon(r.amount)}
                        </td>
                        <td className="px-3 py-2 max-w-[220px] truncate">
                          {r.description || "-"}
                        </td>
                        <td className="px-3 py-2">{r.entry_date ?? "-"}</td>
                        <td className="px-3 py-2 text-xs">
                          {bad ? (
                            <span className="text-red-600 font-medium">
                              {r.errors.join(" · ")}
                            </span>
                          ) : (
                            <span className="text-emerald-600">확인</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {invalidRows.length > 0 && (
              <p className="text-sm text-red-600">
                오류가 있는 줄은 저장되지 않습니다. 파일을 고쳐서 다시 올리거나,
                나머지만 저장한 뒤 따로 등록해주세요.
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={resetBulk}
                className="px-4 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleSaveBulk}
                disabled={savingBulk || validRows.length === 0}
                className="px-5 py-2.5 bg-[#2151EC] text-white font-bold rounded-lg hover:bg-[#1a43c9] transition text-sm shadow-md disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {savingBulk ? "저장 중..." : `${validRows.length}건 저장하기`}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// 자동완성·달력이 카드 밖으로 펼쳐져야 해서 overflow-hidden 대신 모서리를 각자 둥글린다
const Card = ({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) => (
  <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
    <div className="px-4 sm:px-5 py-3 border-b border-gray-200 bg-gray-50/50 rounded-t-xl">
      <h2 className="text-base font-bold text-gray-800">{title}</h2>
      <p className="mt-0.5 text-sm text-gray-500">{desc}</p>
    </div>
    <div className="p-4 sm:p-5">{children}</div>
  </div>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-sm font-bold text-gray-600 mb-1.5">
    {children}
  </label>
);
