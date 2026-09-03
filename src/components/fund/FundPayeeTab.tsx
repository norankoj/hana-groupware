// src/components/fund/FundPayeeTab.tsx
// 펀드 대상자 명부 — 그룹웨어 계정이 없는 분·통장이자도 여기서 관리한다
"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import ConfirmModal from "./ConfirmModal";
import {
  PAYEE_KIND_LABEL,
  btnStyles,
  formatWon,
  inputClass,
  selectClass,
  type FundBalance,
  type FundPayee,
} from "./shared";

type Profile = { id: string; full_name: string; position: string | null };

type Props = {
  payees: FundPayee[];
  balances: Record<string, FundBalance>;
  profiles: Profile[];
  onRefresh: () => void;
};

const KIND_OPTIONS = [
  { value: "person", label: "사역자" },
  { value: "fund", label: "기타 (통장이자 등)" },
];

const KIND_FILTER = [
  { value: "all", label: "전체 구분" },
  { value: "person", label: "사역자" },
  { value: "fund", label: "기타" },
];

type SortKey = "name" | "balance";

const EMPTY_FORM = {
  name: "",
  kind: "person" as FundPayee["kind"],
  user_id: "",
  memo: "",
  is_active: true,
};

export default function FundPayeeTab({
  payees,
  balances,
  profiles,
  onRefresh,
}: Props) {
  const supabase = createClient();
  const [editing, setEditing] = useState<FundPayee | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FundPayee | null>(null);
  const [keyword, setKeyword] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // 이미 다른 명부 항목에 연결된 계정은 고를 수 없다
  const linkOptions = useMemo(() => {
    const taken = new Set(
      payees
        .filter((p) => p.user_id && p.id !== editing?.id)
        .map((p) => p.user_id as string),
    );
    return [
      { value: "", label: "연결 안 함 (미가입자·기타)" },
      ...profiles
        .filter((p) => !taken.has(p.id))
        .map((p) => ({
          value: p.id,
          label: `${p.full_name}${p.position ? ` (${p.position})` : ""}`,
        })),
    ];
  }, [payees, profiles, editing]);

  const openNew = () => {
    setForm(EMPTY_FORM);
    setIsNew(true);
    setEditing({} as FundPayee);
  };

  const openEdit = (p: FundPayee) => {
    setForm({
      name: p.name,
      kind: p.kind,
      user_id: p.user_id ?? "",
      memo: p.memo ?? "",
      is_active: p.is_active,
    });
    setIsNew(false);
    setEditing(p);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("이름을 입력해주세요.");

    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      user_id: form.user_id || null,
      memo: form.memo.trim() || null,
      is_active: form.is_active,
    };

    setSaving(true);
    const { error } = isNew
      ? await supabase.from("fund_payees").insert(payload)
      : await supabase
          .from("fund_payees")
          .update(payload)
          .eq("id", editing!.id);
    setSaving(false);

    if (error) {
      return toast.error(
        error.message.includes("uq_fund_payees_name")
          ? "같은 이름이 이미 명부에 있습니다."
          : "저장 실패: " + error.message,
      );
    }
    toast.success(isNew ? "명부에 추가했습니다." : "수정했습니다.");
    setEditing(null);
    onRefresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    const { error } = await supabase
      .from("fund_payees")
      .delete()
      .eq("id", deleteTarget.id);
    setSaving(false);
    setDeleteTarget(null);

    if (error) {
      return toast.error(
        "삭제 실패: 이미 등록된 내역이 있는 대상자는 지울 수 없습니다. 대신 '사용 안 함'으로 바꿔주세요.",
      );
    }
    toast.success("명부에서 지웠습니다.");
    onRefresh();
  };

  // 사용 중인 항목만 센다
  const counts = useMemo(() => {
    const live = payees.filter((p) => p.is_active);
    const person = live.filter((p) => p.kind === "person");
    return {
      total: live.length,
      person: person.length,
      fund: live.length - person.length,
      unlinked: person.filter((p) => !p.user_id).length,
    };
  }, [payees]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // 잔액은 큰 금액부터 보는 게 자연스럽다
      setSortDir(key === "balance" ? "desc" : "asc");
    }
  };

  const sorted = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const dir = sortDir === "asc" ? 1 : -1;
    return [...payees]
      .filter((p) => {
        if (kindFilter !== "all" && p.kind !== kindFilter) return false;
        if (!kw) return true;
        return (
          p.name.toLowerCase().includes(kw) ||
          (p.memo ?? "").toLowerCase().includes(kw)
        );
      })
      .sort((a, b) => {
        // 사용 안 함은 정렬과 무관하게 항상 아래로
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        if (sortKey === "balance") {
          const diff =
            (balances[a.id]?.balance ?? 0) - (balances[b.id]?.balance ?? 0);
          if (diff !== 0) return diff * dir;
          return a.name.localeCompare(b.name, "ko");
        }
        return a.name.localeCompare(b.name, "ko") * dir;
      });
  }, [payees, keyword, kindFilter, sortKey, sortDir, balances]);

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-gray-600">
        적립·사용을 기록할 대상자 목록입니다. 그룹웨어에 가입하지 않은 분도 여기
        등록하면 내역을 남길 수 있고, 나중에 가입하면 계정을 연결해 과거 내역을
        그대로 살릴 수 있습니다.
      </p>

      {/* 한눈에 보기 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
        <CountCell label="전체 대상자" value={counts.total} unit="명" />
        <CountCell label="사역자" value={counts.person} unit="명" />
        <CountCell
          label="기타 (통장이자 등)"
          value={counts.fund}
          unit="건"
          muted
        />
        <CountCell
          label="계정 미연결"
          value={counts.unlinked}
          unit="명"
          muted
        />
      </div>

      {/* 검색 · 필터 */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-stretch">
        <div className="w-full sm:w-44">
          <Select
            value={kindFilter}
            onChange={setKindFilter}
            options={KIND_FILTER}
            className={selectClass}
          />
        </div>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="이름 또는 메모 검색"
          className={`${inputClass} flex-1`}
        />
        <div className="flex items-center justify-center bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-500 whitespace-nowrap">
          <b className="text-gray-700">{sorted.length}</b>명
        </div>
        <button
          onClick={openNew}
          className="px-4 py-2.5 bg-[#2151EC] text-white font-bold rounded-lg hover:bg-[#1a43c9] transition text-sm shadow-md cursor-pointer whitespace-nowrap"
        >
          대상자 추가
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[430px] sm:h-[490px]">
        <div className="flex-1 overflow-auto custom-scrollbar">
          {sorted.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              등록된 대상자가 없습니다.
            </div>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                  <SortHeader
                    label="이름"
                    active={sortKey === "name"}
                    dir={sortDir}
                    onClick={() => toggleSort("name")}
                  />
                  <th className="text-left px-4 py-3 font-bold">구분</th>
                  <th className="text-left px-4 py-3 font-bold">계정 연결</th>
                  <SortHeader
                    label="현재 잔액"
                    align="right"
                    active={sortKey === "balance"}
                    dir={sortDir}
                    onClick={() => toggleSort("balance")}
                  />
                  <th className="text-right px-4 py-3 font-bold">관리</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const bal = balances[p.id];
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-gray-100 last:border-0 ${
                        p.is_active ? "" : "bg-gray-50/60 text-gray-400"
                      }`}
                    >
                      <td className="px-4 py-3 font-medium">
                        {p.name}
                        {!p.is_active && (
                          <span className="ml-2 text-[11px] font-bold text-gray-400">
                            사용 안 함
                          </span>
                        )}
                        {p.memo && (
                          <span className="block text-xs text-gray-400">
                            {p.memo}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 text-[11px] font-bold rounded border ${
                            p.kind === "person"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-violet-50 text-violet-700 border-violet-200"
                          }`}
                        >
                          {PAYEE_KIND_LABEL[p.kind]}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.user_id ? (
                          <span className="text-emerald-700">연결됨</span>
                        ) : (
                          <span className="text-gray-400">
                            {p.kind === "fund" ? "-" : "미가입"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold whitespace-nowrap">
                        {formatWon(bal?.balance ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => openEdit(p)}
                          className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 cursor-pointer"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => setDeleteTarget(p)}
                          className="ml-2 px-3 py-1.5 text-xs font-bold text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 cursor-pointer"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 추가 · 수정 */}
      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={isNew ? "대상자 추가" : "대상자 수정"}
        size="sm"
        footer={
          <>
            <button
              onClick={() => setEditing(null)}
              className={btnStyles.cancel}
            >
              닫기
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={btnStyles.save}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label>이름</Label>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="예) 고성호 / 통장이자"
              className={inputClass}
            />
          </div>

          <div>
            <Label>구분</Label>
            <Select
              value={form.kind}
              onChange={(v) =>
                setForm({
                  ...form,
                  kind: v as FundPayee["kind"],
                  user_id: v === "fund" ? "" : form.user_id,
                })
              }
              options={KIND_OPTIONS}
              className={selectClass}
            />
          </div>

          {form.kind === "person" && (
            <div>
              <Label>그룹웨어 계정 연결</Label>
              <Select
                value={form.user_id}
                onChange={(v) => setForm({ ...form, user_id: v })}
                options={linkOptions}
                placeholder="연결 안 함"
                className={selectClass}
              />
              <p className="mt-1.5 text-sm text-gray-500">
                연결하면 그분 '내 펀드' 화면에 잔액과 내역이 보이고 사용 신청을
                할 수 있습니다. 미가입자는 비워두세요.
              </p>
            </div>
          )}

          <div>
            <Label>메모</Label>
            <input
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
              placeholder="선택"
              className={inputClass}
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.checked })
              }
              className="w-4 h-4 accent-[#2151EC] cursor-pointer"
            />
            <span className="text-sm text-gray-700">
              사용 중 (끄면 등록 화면 목록에서 빠집니다)
            </span>
          </label>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="명부에서 지울까요?"
        confirmText="삭제"
        danger
        busy={saving}
        onConfirm={handleDelete}
      >
        <p className="text-sm leading-relaxed text-gray-700">
          <b>{deleteTarget?.name}</b> 을(를) 명부에서 지웁니다. 이미 등록된
          적립·사용 내역이 있으면 지워지지 않습니다 — 그럴 때는 수정에서 '사용
          중'을 꺼주세요.
        </p>
      </ConfirmModal>
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-sm font-bold text-gray-700 mb-1.5">
    {children}
  </label>
);

const SortHeader = ({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) => (
  <th
    className={`px-4 py-3 font-bold ${align === "right" ? "text-right" : "text-left"}`}
  >
    <button
      type="button"
      onClick={onClick}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`inline-flex items-center gap-1 cursor-pointer transition hover:text-gray-800 ${
        active ? "text-gray-900" : ""
      }`}
    >
      {label}
      <span
        aria-hidden="true"
        className={`text-[10px] leading-none ${active ? "text-blue-600" : "text-gray-300"}`}
      >
        {active ? (dir === "asc" ? "▲" : "▼") : "▲"}
      </span>
    </button>
  </th>
);

const CountCell = ({
  label,
  value,
  unit,
  muted = false,
}: {
  label: string;
  value: number;
  unit: string;
  muted?: boolean;
}) => (
  <div className="bg-white px-4 py-4">
    <p className="text-xs font-medium text-gray-500">{label}</p>
    <p
      className={`mt-1 text-lg font-bold tabular-nums ${muted ? "text-gray-500" : "text-gray-900"}`}
    >
      {value}
      <span className="ml-0.5 text-sm font-semibold text-gray-400">{unit}</span>
    </p>
  </div>
);
