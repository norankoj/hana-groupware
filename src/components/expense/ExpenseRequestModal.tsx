// src/components/expense/ExpenseRequestModal.tsx
// 경비지급요청 — 한 장에 여러 건을 담아 올린다 (헤더 + 청구 줄)
// 계좌는 줄마다 따로 적는다. 최근에 쓴 계좌를 버튼으로 골라 넣을 수 있다.
"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import { Paperclip, Plus, Trash2, X } from "lucide-react";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import { AmountField, DateField } from "@/components/fund/FundFields";
import {
  BANK_OPTIONS,
  btnStyles,
  formatWon,
  inputClass,
  parseAmount,
  selectClass,
  todayString,
  toCommaInput,
  fiscalYearFor,
  type BudgetYear,
  type ExpenseUser,
  type ProofFile,
} from "./shared";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  user: ExpenseUser;
  /** 어느 연도 예산으로 처리할 청구인지. 담당자가 이 연도의 비목에 배정한다. */
  fiscalYear: number;
  years: BudgetYear[];
  onSubmitted: () => void;
};

// /api/upload 가 받아주는 형식과 맞춘다
const RECEIPT_ACCEPT = "image/*,application/pdf,.xlsx,.xls,.docx,.doc,.zip";

/** 통장 적요에 들어가는 길이 — 넘으면 은행에서 잘린다 */
const ITEM_NAME_HINT = 7;

// 브라우저가 다시 그려서 줄일 수 있는 사진 형식.
// HEIC·TIFF 는 대부분의 브라우저가 못 읽고, GIF 는 움직임이 사라져서 그대로 올린다.
const COMPRESSIBLE = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/bmp",
  "image/avif",
];

/** 이보다 작으면 이미 충분히 작다 — 다시 그리면 오히려 글씨만 흐려진다 */
const SMALL_ENOUGH = 300 * 1024;

/** 줄이기 전 원래 크기 — 목록에 '4.2MB → 380KB'로 보여주려고 기억한다 */
const originalSize = new WeakMap<File, number>();

/** WebP 로 저장할 수 있는 브라우저인지 (못 하면 JPEG 로 저장한다) */
let webpOk: boolean | null = null;
const canEncodeWebp = () => {
  if (webpOk !== null) return webpOk;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    webpOk = c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpOk = false;
  }
  return webpOk;
};

/** PDF 는 브라우저에서 줄일 수 없어 크기로 막는다 */
const PDF_MAX = 1024 * 1024;
const isPdf = (f: File) =>
  f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/** 아이폰 사진(HEIC) — 대부분의 브라우저가 못 읽으니 먼저 JPEG 로 바꾼다 */
const isHeic = (f: File) =>
  /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);
const heicToJpeg = async (file: File): Promise<File> => {
  const { default: heic2any } = await import("heic2any");
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = Array.isArray(out) ? out[0] : out;
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
    type: "image/jpeg",
  });
};

/**
 * 영수증 사진을 올리기 전에 줄인다. 고르기·끌어놓기·붙여넣기 모두 같은 기준.
 *
 *  · 긴 변 2000px — 영수증 글씨가 읽혀야 해서 차량 사진(1024px)보다 넉넉하게
 *  · WebP 품질 0.8 — 같은 화질에서 JPEG 보다 작고, 캡처 화면(PNG)은 훨씬 작아진다
 *  · 한 장 0.5MB 안쪽 — 폰 사진 3~8MB 가 대략 200~500KB 가 된다
 */

const shrinkReceipt = async (input: File): Promise<File> => {
  let file = input;
  if (isHeic(file)) {
    try {
      file = await heicToJpeg(file);
    } catch {
      return input; // 바꾸지 못하면 원본 그대로 올린다
    }
  }
  if (!COMPRESSIBLE.includes(file.type) || file.size <= SMALL_ENOUGH) {
    if (file !== input) originalSize.set(file, input.size);
    return file;
  }
  try {
    const { default: imageCompression } = await import(
      "browser-image-compression"
    );
    const type = canEncodeWebp() ? "image/webp" : "image/jpeg";
    const out = await imageCompression(file, {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 2000,
      initialQuality: 0.8,
      fileType: type,
      useWebWorker: true,
    });
    // 줄인 결과가 오히려 크면 원본을 쓴다
    if (out.size >= file.size) {
      if (file !== input) originalSize.set(file, input.size);
      return file;
    }

    // 형식이 바뀌었으니 확장자도 맞춘다 — 서버가 확장자로 파일 형식을 판단한다
    const ext = out.type === "image/webp" ? "webp" : "jpg";
    const shrunk = new File([out], `${file.name.replace(/\.[^.]+$/, "")}.${ext}`, {
      type: out.type || type,
    });
    originalSize.set(shrunk, input.size);
    return shrunk;
  } catch {
    return file; // 줄이지 못하면 원본 그대로 올린다
  }
};

const sizeText = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;

type Account = {
  bank_name: string;
  account_no: string;
  account_holder: string;
};

type Row = Account & {
  key: string;
  item_name: string;
  qty: string;
  unit_price: string;
  amount: string;
  /** 총액을 직접 고쳤으면 수량×단가로 다시 계산하지 않는다 (카드영수증 합계에 맞추는 경우) */
  amountLocked: boolean;
  purpose: string;
  files: File[];
};

// 예금주는 비워둔다 — 본인이 아닌 다른 사람 계좌로 넣는 경우가 있다
const emptyAccount = (): Account => ({
  bank_name: "",
  account_no: "",
  account_holder: "",
});

const newRow = (account: Account): Row => ({
  key: crypto.randomUUID(),
  item_name: "",
  qty: "",
  unit_price: "",
  amount: "",
  amountLocked: false,
  purpose: "",
  files: [],
  ...account,
});

/** 수량은 소수 두 자리까지 (numeric(12,2)) */
const toQtyInput = (raw: string) => {
  const cleaned = raw.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
  const [int, dec] = cleaned.split(".");
  return dec === undefined ? int : `${int}.${dec.slice(0, 2)}`;
};

const rowAmount = (r: Row) => parseAmount(r.amount) ?? 0;

/** 뭐라도 입력된 줄 — 빈 줄은 조용히 버리고, 반쯤 채운 줄은 오류로 잡는다 */
const isTouched = (r: Row) =>
  !!(
    r.item_name.trim() ||
    r.unit_price.trim() ||
    r.amount.trim() ||
    r.purpose.trim() ||
    r.files.length
  );


export default function ExpenseRequestModal({
  isOpen,
  onClose,
  user,
  fiscalYear,
  years,
  onSubmitted,
}: Props) {
  const supabase = createClient();

  const [requestDate, setRequestDate] = useState(todayString());
  const [saved, setSaved] = useState<Account[]>([]);
  const [rows, setRows] = useState<Row[]>([newRow(emptyAccount())]);
  const [saving, setSaving] = useState(false);
  /** 사진을 줄이는 중인 장수 — 끝나기 전에 청구하면 빠진다 */
  const [shrinking, setShrinking] = useState(0);
  const addFiles = (key: string, added: File[]) =>
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, files: [...r.files, ...added] } : r)),
    );

  // 예전에 썼던 계좌를 불러와 버튼으로 고를 수 있게 한다 (최근에 쓴 것이 위).
  //
  // 반드시 '내가 올린 청구'로 좁혀야 한다. 결의서 줄 조회 정책은
  // '본인 것 또는 담당자는 전체'라서, 담당자 계정에서는 조건 없이 긁으면
  // 남의 계좌까지 목록에 뜬다.
  useEffect(() => {
    if (!isOpen) return;

    setRequestDate(todayString());
    setSaved([]);
    setRows([newRow(emptyAccount())]);

    const load = async () => {
      const { data } = await supabase
        .from("expense_request_items")
        .select(
          "bank_name, account_no, account_holder, created_at, request:request_id!inner(requester_id)",
        )
        .eq("request.requester_id", user.id)
        .not("account_no", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);

      const seen = new Set<string>();
      const list: Account[] = [];
      for (const r of data ?? []) {
        const key = `${r.bank_name}|${r.account_no}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({
          bank_name: r.bank_name ?? "",
          account_no: r.account_no ?? "",
          account_holder: r.account_holder ?? "",
        });
        if (list.length >= 6) break; // 버튼이 너무 많아지지 않게
      }
      setSaved(list);
    };

    load();
  }, [isOpen, user.id, supabase]);

  const patchRow = (key: string, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // 총액을 직접 고친 적이 없으면 수량×단가로 채워준다
        if (
          !next.amountLocked &&
          (patch.qty !== undefined || patch.unit_price !== undefined)
        ) {
          // 수량을 비워두면 1개로 본다 (저장할 때와 같은 기준)
          const q = Number(next.qty || "1");
          const p = parseAmount(next.unit_price) ?? 0;
          next.amount =
            q > 0 && p > 0 ? toCommaInput(String(Math.round(q * p))) : "";
        }
        return next;
      }),
    );

  const total = rows.reduce((sum, r) => sum + rowAmount(r), 0);
  const touched = rows.filter(isTouched);

  /** 줄 추가 — 마지막 줄의 계좌를 물려받는다 (대개 같은 계좌로 청구한다) */
  const addRow = () => {
    const last = rows[rows.length - 1];
    setRows((prev) => [
      ...prev,
      newRow(
        last
          ? {
              bank_name: last.bank_name,
              account_no: last.account_no,
              account_holder: last.account_holder,
            }
          : emptyAccount(),
      ),
    ]);
  };

  const notifyManagers = async (count: number, won: number) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("is_expense_manager", true);

      const ids = (data ?? []).map((p) => p.id);
      if (ids.length === 0) return;

      await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: ids,
          title: "경비지급 요청",
          body: `${user.full_name}님이 ${count}건 ${formatWon(won)}원을 청구했습니다.`,
          url: "/expense?tab=approve",
        }),
      });
    } catch {
      // 알림 실패는 청구 결과에 영향을 주지 않는다
    }
  };

  const handleSubmit = async () => {
    if (touched.length === 0)
      return toast.error("청구 내역을 한 건 이상 입력해주세요.");

    // 반쯤 채운 줄은 조용히 버리지 않고 알려준다.
    // 수량·단가는 비워도 된다 — 총액만 있으면 청구된다.
    for (const [i, r] of touched.entries()) {
      if (!r.item_name.trim())
        return toast.error(`${i + 1}번 줄의 품명을 입력해주세요.`);
      if (rowAmount(r) <= 0)
        return toast.error(`${i + 1}번 줄의 금액을 입력해주세요.`);
      if (!r.bank_name.trim() || !r.account_no.trim())
        return toast.error(`${i + 1}번 줄의 받을 계좌를 입력해주세요.`);
    }

    setSaving(true);
    // 중간에 실패하면 이미 만든 청구를 되돌린다
    const created: string[] = [];

    try {
      // 1) 영수증 업로드 — 교회 NAS private 버킷의 expense/{user_id}/ 아래
      const uploaded: ProofFile[][] = [];
      for (const r of touched) {
        const files: ProofFile[] = [];
        for (const f of r.files) {
          const formData = new FormData();
          formData.append("file", f);
          formData.append("bucket", "private");
          formData.append("folder", `expense/${user.id}`);

          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });
          const json = await res.json();
          if (!res.ok)
            throw new Error(`${f.name} — ${json?.error ?? "업로드 실패"}`);
          files.push({ url: json.objectName, name: f.name });
        }
        uploaded.push(files);
      }

      // 2) 줄마다 따로 청구한다.
      //    한 줄은 승인되고 다른 줄은 반려될 수 있으므로 건별로 처리돼야 한다.
      //    입력만 한 화면에서 모아 받고, 저장은 건별로 쪼갠다.
      for (const [i, r] of touched.entries()) {
        const { data: request, error: requestError } = await supabase
          .from("expense_requests")
          .insert({
            requester_id: user.id,
            // 청구일자(지출일) 기준 — 그 해 예산이 확정 전이면 확정된 최근 연도
            fiscal_year: fiscalYearFor(requestDate, years, fiscalYear),
            title: r.item_name.trim(),
            request_date: requestDate,
            status: "pending",
          })
          .select("id")
          .single();
        if (requestError) throw requestError;
        created.push(request.id);

        const { error: itemError } = await supabase
          .from("expense_request_items")
          .insert({
            request_id: request.id,
            sort_order: 1,
            item_name: r.item_name.trim(),
            qty: Number(r.qty || "1"),
            unit_price: parseAmount(r.unit_price) ?? 0,
            amount: rowAmount(r),
            purpose: r.purpose.trim() || null,
            bank_name: r.bank_name.trim(),
            account_no: r.account_no.trim(),
            account_holder: r.account_holder.trim() || null,
            receipt_files: uploaded[i],
          });
        if (itemError) throw itemError;
      }

      notifyManagers(touched.length, total);
      toast.success(`${touched.length}건이 접수되었습니다.`);
      onSubmitted();
    } catch (e: unknown) {
      // 절반만 들어가면 신청자가 무엇이 접수됐는지 알 수 없다 — 전부 되돌린다
      if (created.length > 0) {
        await supabase.from("expense_requests").delete().in("id", created);
      }
      const message = e instanceof Error ? e.message : "알 수 없는 오류";
      toast.error("청구 실패: " + message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="경비지급 요청"
      className="sm:max-w-[860px]"
      footer={
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1">
            <p className="text-xs text-gray-500">
              {touched.length}건 합계
            </p>
            <p className="text-lg font-bold text-gray-900 tabular-nums leading-tight">
              {formatWon(total)}
              <span className="ml-0.5 text-sm font-medium text-gray-400">원</span>
            </p>
          </div>
          <button onClick={onClose} className={btnStyles.cancel}>
            닫기
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || shrinking > 0}
            className={btnStyles.save}
          >
            {saving ? "접수 중..." : shrinking > 0 ? "사진 줄이는 중..." : "청구하기"}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ── 청구일자 ── */}
        <div className="w-full sm:w-[200px]">
          <label className="block text-sm font-bold text-gray-700 mb-1.5">
            청구일자<span className="ml-1 text-red-500">*</span>
          </label>
          <DateField value={requestDate} onChange={setRequestDate} />
        </div>

        {/* ── 청구 내역 ── */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label className="text-sm font-bold text-gray-700">
              청구 내역<span className="ml-1 text-red-500">*</span>
            </label>
            <span className="text-xs text-gray-500">
              수량·단가는 비워도 됩니다
            </span>
          </div>

          <div className="space-y-2.5">
            {rows.map((r, i) => (
              <RowCard
                key={r.key}
                index={i + 1}
                row={r}
                saved={saved}
                canRemove={rows.length > 1}
                onChange={(patch) => patchRow(r.key, patch)}
                onAddFiles={(files) => addFiles(r.key, files)}
                onShrinking={(d) => setShrinking((n) => Math.max(0, n + d))}
                onRemove={() =>
                  setRows((prev) => prev.filter((x) => x.key !== r.key))
                }
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-[#2151EC] border border-dashed border-blue-300 rounded-lg hover:bg-blue-50 transition cursor-pointer"
          >
            <Plus size={16} /> 줄 추가
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ── 청구 줄 한 개 ────────────────────────────────────────────────── */

function RowCard({
  index,
  row,
  saved,
  canRemove,
  onChange,
  onAddFiles,
  onShrinking,
  onRemove,
}: {
  index: number;
  row: Row;
  saved: Account[];
  canRemove: boolean;
  onChange: (patch: Partial<Row>) => void;
  onAddFiles: (files: File[]) => void;
  onShrinking: (delta: number) => void;
  onRemove: () => void;
}) {
  const amount = rowAmount(row);
  const auto = !row.amountLocked && !!row.unit_price;
  const overLength = row.item_name.trim().length > ITEM_NAME_HINT;

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* 줄 머리 — 순번과 그 줄 금액을 함께 두어 눈으로 합계를 따라갈 수 있게 */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-bold text-gray-500 tabular-nums">
          순번 {index}
        </span>
        <div className="flex items-center gap-3">
          <span
            className={`text-sm font-bold tabular-nums ${
              amount > 0 ? "text-gray-900" : "text-gray-300"
            }`}
          >
            {amount > 0 ? `${formatWon(amount)}원` : "금액 미입력"}
          </span>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`${index}번 줄 삭제`}
              className="text-gray-400 hover:text-red-600 transition cursor-pointer"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="p-3 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_72px_1fr_1fr] gap-2">
          <SubField
            label="품명 / 지출대상"
            hint={overLength ? `${ITEM_NAME_HINT}자 초과` : undefined}
            tone={overLength ? "warn" : "info"}
          >
            <input
              value={row.item_name}
              onChange={(e) => onChange({ item_name: e.target.value })}
              placeholder={`${ITEM_NAME_HINT}자 이내`}
              className={inputClass}
            />
          </SubField>
          <SubField label="수량">
            <input
              inputMode="decimal"
              value={row.qty}
              onChange={(e) => onChange({ qty: toQtyInput(e.target.value) })}
              placeholder="1"
              className={`${inputClass} text-right tabular-nums`}
            />
          </SubField>
          <SubField label="단가">
            <AmountField
              value={row.unit_price}
              onChange={(v) => onChange({ unit_price: v })}
              placeholder="0"
            />
          </SubField>
          <SubField label="총액" hint={auto ? "자동" : undefined}>
            <AmountField
              value={row.amount}
              // 비우면 다시 수량×단가로 채워준다
              onChange={(v) => onChange({ amount: v, amountLocked: !!v.trim() })}
              placeholder="0"
            />
          </SubField>
        </div>

        <SubField label="용도 / 비고">
          <input
            value={row.purpose}
            onChange={(e) => onChange({ purpose: e.target.value })}
            placeholder="선교전략회의 의전"
            className={inputClass}
          />
        </SubField>

        {/* 증빙과 지급 정보는 한 묶음으로 떨어뜨린다 */}
        <div className="pt-3 mt-3 border-t border-gray-100 space-y-2.5">
          <ReceiptPicker
            index={index}
            files={row.files}
            onChange={(files) => onChange({ files })}
            onAdd={onAddFiles}
            onShrinking={onShrinking}
          />

          <SubField label="받을 계좌">
            {saved.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {saved.map((a, i) => {
                  const picked =
                    row.bank_name === a.bank_name &&
                    row.account_no === a.account_no;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onChange(a)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition cursor-pointer ${
                        picked
                          ? "border-blue-500 bg-blue-50 text-blue-700 font-bold"
                          : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {a.bank_name} {a.account_no}
                      {a.account_holder && ` ${a.account_holder}`}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => onChange(emptyAccount())}
                  className="px-2.5 py-1 text-xs rounded-md border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 cursor-pointer"
                >
                  비우기
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,140px)_1fr_minmax(0,110px)] gap-2">
              <Select
                value={row.bank_name}
                onChange={(v) => onChange({ bank_name: v })}
                options={BANK_OPTIONS}
                placeholder="은행"
                className={selectClass}
              />
              <input
                inputMode="numeric"
                value={row.account_no}
                onChange={(e) =>
                  onChange({ account_no: e.target.value.replace(/[^\d-]/g, "") })
                }
                placeholder="계좌번호 (숫자, - 만)"
                className={inputClass}
              />
              <input
                value={row.account_holder}
                onChange={(e) => onChange({ account_holder: e.target.value })}
                placeholder="예금주"
                className={inputClass}
              />
            </div>
          </SubField>
        </div>
      </div>
    </div>
  );
}

/* ── 영수증 — 여러 장 한 번에 고르거나 끌어다 놓기 ────────────────── */

function ReceiptPicker({
  index,
  files,
  onChange,
  onAdd,
  onShrinking,
}: {
  index: number;
  files: File[];
  /** 지우기용 — 목록 전체를 바꾼다 */
  onChange: (files: File[]) => void;
  /** 추가용 — 줄이는 동안 다른 파일이 들어와도 안 빠지게 부모가 이어 붙인다 */
  onAdd: (files: File[]) => void;
  onShrinking: (delta: number) => void;
}) {
  const [busy, setBusy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [pasteReady, setPasteReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = `receipt-${index}`;

  /** 넣는 순간 줄인다 — 고르기·끌어놓기·붙여넣기 모두 같은 기준 */
  const add = async (all: File[]) => {
    const tooBig = all.filter((f) => isPdf(f) && f.size > PDF_MAX);
    if (tooBig.length)
      toast.error(
        `PDF는 1MB까지 올릴 수 있습니다: ${tooBig.map((f) => f.name).join(", ")}`,
      );
    const picked = all.filter((f) => !tooBig.includes(f));
    if (!picked.length) return;
    setBusy((n) => n + picked.length);
    onShrinking(picked.length);
    try {
      onAdd(await Promise.all(picked.map(shrinkReceipt)));
    } finally {
      setBusy((n) => n - picked.length);
      onShrinking(-picked.length);
    }
  };

  /**
   * 붙여넣기 — 캡처한 이미지는 죄다 'image.png' 라는 이름으로 들어와
   * 여러 장 붙이면 구분이 안 된다. 순번과 시각을 붙여 이름을 만든다.
   */
  const addPasted = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return false;

    const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
    void add(
      picked.map((f, i) => {
        const ext = f.name.split(".").pop()?.toLowerCase() || "png";
        const generic = !f.name || /^image\.\w+$/i.test(f.name);
        return generic
          ? new File([f], `영수증_${stamp}_${i + 1}.${ext}`, { type: f.type })
          : f;
      }),
    );
    return true;
  };

  return (
    <SubField label="영수증">
      {/* 누르기 · 끌어놓기 · 붙여넣기를 한 자리에서 받는다.
          붙여넣기는 포커스된 요소에만 오므로 label 이 아니라 button 이어야 한다. */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onFocus={() => setPasteReady(true)}
        onBlur={() => setPasteReady(false)}
        onPaste={(e) => {
          if (addPasted(e.clipboardData?.files ?? null)) e.preventDefault();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addPasted(e.dataTransfer.files);
        }}
        className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-dashed cursor-pointer transition text-sm outline-none ${
          dragging
            ? "border-[#2151EC] bg-blue-50 text-[#2151EC]"
            : pasteReady
              ? "border-[#2151EC] bg-blue-50/50 text-[#2151EC] ring-2 ring-blue-100"
              : "border-gray-300 bg-gray-50/60 text-gray-500 hover:bg-gray-100"
        }`}
      >
        <Paperclip size={15} className="shrink-0" />
        <span>
          {busy > 0
            ? `사진 ${busy}장 줄이는 중...`
            : pasteReady
            ? "Ctrl+V 로 복사한 이미지를 붙여넣으세요"
            : files.length > 0
              ? `${files.length}장 선택됨 — 더 넣으려면 누르거나 끌어다 놓으세요`
              : "여러 장 선택 · 끌어다 놓기 · 붙여넣기(Ctrl+V)"}
        </span>
      </button>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={RECEIPT_ACCEPT}
        multiple
        onChange={(e) => {
          void add(Array.from(e.target.files ?? []));
          e.target.value = ""; // 같은 파일을 다시 고를 수 있게
        }}
        className="hidden"
      />

      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 text-sm bg-white border border-gray-200 rounded px-3 py-1.5"
            >
              <span className="truncate text-gray-700">{f.name}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400 tabular-nums">
                  {originalSize.has(f)
                    ? `${sizeText(originalSize.get(f)!)} → ${sizeText(f.size)}`
                    : sizeText(f.size)}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(files.filter((_, j) => j !== i))}
                  aria-label={`${f.name} 삭제`}
                  className="text-gray-400 hover:text-red-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SubField>
  );
}

/* ── 라벨 ─────────────────────────────────────────────────────────── */

const SubField = ({
  label,
  hint,
  tone = "info",
  children,
}: {
  label: string;
  hint?: string;
  tone?: "info" | "warn";
  children: React.ReactNode;
}) => (
  <div>
    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
      {label}
      {hint && (
        <span
          className={`text-[10px] rounded border px-1 ${
            tone === "warn"
              ? "text-amber-700 border-amber-200 bg-amber-50"
              : "text-[#2151EC] border-blue-200 bg-blue-50"
          }`}
        >
          {hint}
        </span>
      )}
    </label>
    {children}
  </div>
);
