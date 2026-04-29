"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { format, parse, isValid } from "date-fns";
import Modal from "@/components/Modal";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";

type Resource = { id: number; name: string; category: string };

interface ExcelRow {
  날짜: string;
  시작시간: string;
  종료시간: string;
  시설명: string;
  사용목적: string;
  예약자: string;
}

type ParsedRow = ExcelRow & {
  _resourceId: number | null;
  _error: string | null;
  _startAt: string | null;
  _endAt: string | null;
};

interface ExcelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  resources: Resource[];
  onSuccess: () => void;
  currentUserId: string;
}

// ── 템플릿 다운로드 ──────────────────────────────────────────────────────────
function downloadTemplate(resources: Resource[]) {
  const resourceNames = resources.map((r) => r.name).join(", ");
  const ws = XLSX.utils.aoa_to_sheet([
    ["날짜", "시작시간", "종료시간", "시설명", "사용목적", "예약자"],
    ["2025-05-01", "10:00", "12:00", resources[0]?.name ?? "본당", "선교팀 회의", "홍길동"],
    ["2025-05-02", "14:00", "16:00", resources[0]?.name ?? "본당", "청년부 모임", "김영희"],
  ]);
  ws["!cols"] = [
    { wch: 14 }, { wch: 10 }, { wch: 10 },
    { wch: 20 }, { wch: 24 }, { wch: 12 },
  ];
  if (!ws["A1"].c) ws["A1"].c = [];
  ws["A1"].c.push({ a: "시스템", t: "YYYY-MM-DD 형식으로 입력" });
  ws["D1"].c = [{ a: "시스템", t: `사용 가능한 시설: ${resourceNames}` }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "시설예약");
  XLSX.writeFile(wb, "시설예약_업로드_템플릿.xlsx");
}

// ── Excel 소수점 시간 → HH:mm 변환 (예: 0.4166... → "10:00") ────────────────
function decimalToHHMM(val: string): string {
  const trimmed = val.trim().replace("：", ":");
  if (trimmed.includes(":")) return trimmed; // 이미 HH:mm 형태
  const num = parseFloat(trimmed);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMin = Math.round(num * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return trimmed;
}

// ── 날짜/시간 파싱 ─────────────────────────────────────────────────────────
function parseTime(dateStr: string, timeStr: string): string | null {
  try {
    const hhmm = decimalToHHMM(timeStr);
    const dt = parse(`${dateStr} ${hhmm}`, "yyyy-MM-dd HH:mm", new Date());
    return isValid(dt) ? dt.toISOString() : null;
  } catch {
    return null;
  }
}

function normalizeDate(raw: any): string | null {
  if (!raw) return null;
  if (typeof raw === "number") {
    const date = XLSX.SSF.parse_date_code(raw);
    if (!date) return null;
    return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  const str = String(raw).trim().replace(/\//g, "-").replace(/\./g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return null;
}

// ── 행 재검증 ──────────────────────────────────────────────────────────────
function validateRow(draft: ExcelRow, resources: Resource[]): ParsedRow {
  const resource = resources.find((r) => r.name === draft.시설명);
  let _error: string | null = null;
  if (!draft.날짜) _error = "날짜 형식 오류";
  else if (!draft.시작시간 || !draft.종료시간) _error = "시간 누락";
  else if (!resource) _error = `시설 없음: ${draft.시설명}`;
  else if (!draft.예약자) _error = "예약자 이름 누락";
  const _startAt = draft.날짜 ? parseTime(draft.날짜, draft.시작시간) : null;
  const _endAt   = draft.날짜 ? parseTime(draft.날짜, draft.종료시간) : null;
  if (!_error && draft.날짜 && (!_startAt || !_endAt)) _error = "시간 형식 오류 (HH:mm)";
  if (!_error && _startAt && _endAt && _startAt >= _endAt) _error = "시작≥종료 오류";
  return { ...draft, _resourceId: resource?.id ?? null, _error, _startAt, _endAt };
}

// ── 컴포넌트 ───────────────────────────────────────────────────────────────
export default function ExcelUploadModal({
  isOpen,
  onClose,
  resources,
  onSuccess,
  currentUserId,
}: ExcelUploadModalProps) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [rows,    setRows]    = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);

  // 인라인 편집
  const [editingIdx,  setEditingIdx]  = useState<number | null>(null);
  const [editDraft,   setEditDraft]   = useState<ExcelRow>({
    날짜: "", 시작시간: "", 종료시간: "", 시설명: "", 사용목적: "", 예약자: "",
  });

  // ── 파일 파싱 ────────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setLoading(true);
    setRows([]);
    setEditingIdx(null);

    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf, { type: "array", cellDates: false });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<any>(ws, { header: 1 }) as any[][];

    const headerIdx = raw.findIndex(
      (row) => Array.isArray(row) && row.some((c) => String(c).includes("날짜")),
    );
    if (headerIdx === -1) {
      toast.error("올바른 템플릿 파일이 아닙니다. 헤더(날짜, 시작시간...)를 확인해주세요.");
      setLoading(false);
      return;
    }
    const headers  = raw[headerIdx].map((h: any) => String(h).trim());
    const dataRows = raw.slice(headerIdx + 1).filter((r) => r.some((c: any) => c != null && c !== ""));

    const parsed: ParsedRow[] = dataRows.map((row) => {
      const get = (key: string) => {
        const idx = headers.findIndex((h) => h.includes(key));
        return idx >= 0 ? row[idx] : undefined;
      };

      const rawDate = get("날짜");
      const 날짜    = normalizeDate(rawDate) ?? String(rawDate ?? "");
      // 소수점 시간 자동 변환
      const 시작시간 = decimalToHHMM(String(get("시작시간") ?? "").trim());
      const 종료시간 = decimalToHHMM(String(get("종료시간") ?? "").trim());
      const 시설명   = String(get("시설") ?? get("시설명") ?? "").trim();
      const 사용목적 = String(get("목적") ?? get("사용목적") ?? "").trim();
      const 예약자   = String(get("예약자") ?? "").trim();

      return validateRow({ 날짜, 시작시간, 종료시간, 시설명, 사용목적, 예약자 }, resources);
    });

    setRows(parsed);
    setLoading(false);
  };

  // ── 인라인 편집 ──────────────────────────────────────────────────────────
  const startEdit = (idx: number) => {
    const r = rows[idx];
    setEditDraft({
      날짜:    r.날짜,
      시작시간: r.시작시간,
      종료시간: r.종료시간,
      시설명:  r.시설명,
      사용목적: r.사용목적,
      예약자:  r.예약자,
    });
    setEditingIdx(idx);
  };

  const applyEdit = (idx: number) => {
    const updated = validateRow(editDraft, resources);
    setRows((prev) => prev.map((row, i) => (i === idx ? updated : row)));
    setEditingIdx(null);
  };

  // ── 저장 ─────────────────────────────────────────────────────────────────
  const validRows = rows.filter((r) => !r._error);
  const errorRows = rows.filter((r) =>  r._error);

  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);

  const CHUNK_SIZE = 100; // 100행씩 나눠서 저장

  const handleSave = async () => {
    if (validRows.length === 0) return;
    setSaving(true);

    const inserts = validRows.map((r) => ({
      resource_id:   r._resourceId!,
      user_id:       currentUserId,
      reservee_name: r.예약자,
      start_at:      r._startAt!,
      end_at:        r._endAt!,
      purpose:       r.사용목적,
      status:        "confirmed",
    }));

    // 100행씩 청크 분할 저장
    const chunks: typeof inserts[] = [];
    for (let i = 0; i < inserts.length; i += CHUNK_SIZE) {
      chunks.push(inserts.slice(i, i + CHUNK_SIZE));
    }

    setSaveProgress({ done: 0, total: inserts.length });

    for (const chunk of chunks) {
      const { error } = await supabase.from("reservations").insert(chunk);
      if (error) {
        setSaving(false);
        setSaveProgress(null);
        toast.error("저장 실패: " + error.message);
        return;
      }
      setSaveProgress((prev) =>
        prev ? { ...prev, done: prev.done + chunk.length } : null,
      );
    }

    setSaving(false);
    setSaveProgress(null);
    toast.success(`${validRows.length}건 예약이 등록되었습니다.`);
    setRows([]);
    onSuccess();
    onClose();
  };

  // ── 공통 input 스타일 ─────────────────────────────────────────────────────
  const inputCls =
    "border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 bg-white";

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="엑셀 일괄 업로드"
      className="sm:!max-w-[900px]"
      bodyClassName="p-0"
      footer={
        rows.length > 0 ? (
          <div className="flex items-center gap-3 w-full">
            <span className="text-sm text-gray-500 flex-1">
              총 {rows.length}행 —{" "}
              <span className="text-green-600 font-bold">{validRows.length}건 정상</span>
              {errorRows.length > 0 && (
                <>, <span className="text-red-500 font-bold">{errorRows.length}건 오류</span> (오류 행은 제외됩니다)</>
              )}
            </span>
            <button
              onClick={() => { setRows([]); setEditingIdx(null); if (inputRef.current) inputRef.current.value = ""; }}
              className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-bold hover:bg-gray-200 transition text-sm"
            >
              초기화
            </button>
            <button
              onClick={handleSave}
              disabled={saving || validRows.length === 0}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50 text-sm min-w-[100px]"
            >
              {saveProgress
                ? `${saveProgress.done} / ${saveProgress.total}건…`
                : saving
                  ? "저장 중..."
                  : `${validRows.length}건 저장`}
            </button>
          </div>
        ) : null
      }
    >
      <div className="p-6 space-y-5">
        {/* 안내 + 템플릿 다운로드 */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-800 mb-1">사용 방법</p>
            <ol className="text-xs text-blue-700 space-y-0.5 list-decimal list-inside">
              <li>템플릿을 다운로드해 양식에 맞게 작성합니다.</li>
              <li>시설명은 <strong>정확히 일치</strong>해야 합니다.</li>
              <li>예약자는 실제 사용하는 <strong>성도 이름</strong>을 자유롭게 입력하세요.</li>
              <li>업로드 후 오류 행은 연필 버튼으로 직접 수정할 수 있습니다.</li>
            </ol>
          </div>
          <button
            onClick={() => downloadTemplate(resources)}
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white border border-blue-200 text-blue-700 rounded-lg font-bold text-sm hover:bg-blue-100 transition whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            템플릿 다운로드
          </button>
        </div>

        {/* 파일 업로드 영역 */}
        <div
          className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">파일 분석 중...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-bold text-gray-600">.xlsx / .xls / .csv 파일을 드래그하거나 클릭해서 선택</p>
              <p className="text-xs text-gray-400">행 수 제한 없음 · 100행씩 나눠 저장</p>
            </div>
          )}
        </div>

        {/* 미리보기 테이블 */}
        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 text-left font-bold text-gray-600">상태</th>
                  <th className="px-3 py-2.5 text-left font-bold text-gray-600">날짜</th>
                  <th className="px-3 py-2.5 text-left font-bold text-gray-600">시간</th>
                  <th className="px-3 py-2.5 text-left font-bold text-gray-600">시설</th>
                  <th className="px-3 py-2.5 text-left font-bold text-gray-600">목적</th>
                  <th className="px-3 py-2.5 text-left font-bold text-gray-600">예약자</th>
                  <th className="px-3 py-2.5 text-center font-bold text-gray-600">수정</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) =>
                  editingIdx === i ? (
                    /* ── 편집 행 ──────────────────────────────────────────── */
                    <tr key={i} className="border-b border-blue-200 bg-blue-50/60">
                      <td colSpan={7} className="px-3 py-3">
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-gray-500">날짜</label>
                            <input
                              type="date"
                              value={editDraft.날짜}
                              onChange={(e) => setEditDraft((d) => ({ ...d, 날짜: e.target.value }))}
                              className={`${inputCls} w-32`}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-gray-500">시작시간</label>
                            <input
                              type="time"
                              value={editDraft.시작시간}
                              onChange={(e) => setEditDraft((d) => ({ ...d, 시작시간: e.target.value }))}
                              className={`${inputCls} w-24`}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-gray-500">종료시간</label>
                            <input
                              type="time"
                              value={editDraft.종료시간}
                              onChange={(e) => setEditDraft((d) => ({ ...d, 종료시간: e.target.value }))}
                              className={`${inputCls} w-24`}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-gray-500">시설</label>
                            <select
                              value={editDraft.시설명}
                              onChange={(e) => setEditDraft((d) => ({ ...d, 시설명: e.target.value }))}
                              className={`${inputCls} w-28`}
                            >
                              <option value="">선택</option>
                              {resources.map((res) => (
                                <option key={res.id} value={res.name}>{res.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-gray-500">목적</label>
                            <input
                              type="text"
                              value={editDraft.사용목적}
                              onChange={(e) => setEditDraft((d) => ({ ...d, 사용목적: e.target.value }))}
                              className={`${inputCls} w-32`}
                              placeholder="사용 목적"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-gray-500">예약자</label>
                            <input
                              type="text"
                              value={editDraft.예약자}
                              onChange={(e) => setEditDraft((d) => ({ ...d, 예약자: e.target.value }))}
                              className={`${inputCls} w-20`}
                              placeholder="이름"
                            />
                          </div>
                          <div className="flex gap-1.5 pb-[1px]">
                            <button
                              onClick={() => applyEdit(i)}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition"
                            >
                              저장
                            </button>
                            <button
                              onClick={() => setEditingIdx(null)}
                              className="px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-300 transition"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    /* ── 일반 행 ──────────────────────────────────────────── */
                    <tr
                      key={i}
                      className={`border-b border-gray-100 ${r._error ? "bg-red-50" : "bg-white hover:bg-gray-50"}`}
                    >
                      <td className="px-3 py-2">
                        {r._error ? (
                          <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            {r._error}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-green-600 font-bold">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            정상
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{r.날짜}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {r._startAt
                          ? format(new Date(r._startAt), "HH:mm")
                          : r.시작시간}{" "}
                        ~{" "}
                        {r._endAt
                          ? format(new Date(r._endAt), "HH:mm")
                          : r.종료시간}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{r.시설명}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[160px] truncate">{r.사용목적}</td>
                      <td className="px-3 py-2 text-gray-700">{r.예약자}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => startEdit(i)}
                          title="수정"
                          className="inline-flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H7v-3.414a2 2 0 01.586-1.414z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
