// src/components/expense/BudgetChangeModal.tsx
// 예산 변경 — 추경(한 항목을 늘리거나 줄임) · 전용(항목에서 항목으로 옮김).
// 원안은 두고 변경을 기록으로 쌓는다. 고치거나 지우지 않는다.
"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ArrowRight } from "lucide-react";
import Modal from "@/components/Modal";
import { createClient } from "@/utils/supabase/client";
import { AmountField, DateField } from "@/components/fund/FundFields";
import BudgetItemModal from "./BudgetItemModal";
import {
  CHANGE_LABEL,
  availableAmount,
  btnStyles,
  flattenBudget,
  formatWon,
  inputClass,
  itemLabel,
  parseAmount,
  todayString,
  type BudgetChange,
  type BudgetFlat,
  type BudgetItem,
  type BudgetUsage,
} from "./shared";

type Props = {
  fiscalYear: number;
  /** 그 해 예산안 (변경이 이미 반영된 금액) */
  items: BudgetItem[];
  usage: BudgetUsage[];
  onClose: () => void;
  onSaved: () => void;
};

export default function BudgetChangeModal({
  fiscalYear,
  items,
  usage,
  onClose,
  onSaved,
}: Props) {
  const [kind, setKind] = useState<BudgetChange["kind"]>("revise");
  const [down, setDown] = useState(false); // 추경: 감액
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayString());
  const [memo, setMemo] = useState("");
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [busy, setBusy] = useState(false);

  const flat = useMemo(() => flattenBudget(items, usage), [items, usage]);
  const byId = useMemo(() => new Map(flat.map((o) => [o.id, o])), [flat]);
  // 말단(하위가 없는 항목)만 바꾼다 — 상위를 바로 바꾸면 하위 합과 어긋난다
  const leaf = useMemo(() => {
    const parents = new Set(items.map((i) => i.parent_id).filter(Boolean));
    return (id: string) => !parents.has(id);
  }, [items]);

  const amt = parseAmount(amount) ?? 0;
  const from = fromId ? byId.get(fromId) : undefined;
  const to = toId ? byId.get(toId) : undefined;

  const save = async () => {
    if (!to) return toast.error(kind === "transfer" ? "받는 항목을 골라주세요." : "항목을 골라주세요.");
    if (kind === "transfer" && !from) return toast.error("보내는 항목을 골라주세요.");
    if (kind === "transfer" && fromId === toId)
      return toast.error("보내는 항목과 받는 항목이 같습니다.");
    if (amt <= 0) return toast.error("금액을 입력해주세요.");
    if (!memo.trim()) return toast.error("사유를 입력해주세요.");

    setBusy(true);
    const { error } = await createClient()
      .from("budget_changes")
      .insert({
        fiscal_year: fiscalYear,
        kind,
        from_item_id: kind === "transfer" ? fromId : null,
        to_item_id: toId,
        amount: kind === "revise" && down ? -amt : amt,
        memo: memo.trim(),
        changed_on: date,
      });
    setBusy(false);
    if (error) return toast.error("기록 실패: " + error.message);
    toast.success(`${CHANGE_LABEL[kind]}을 기록했습니다.`);
    onSaved();
  };

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        title={`${fiscalYear}년 예산 변경`}
        footer={
          <div className="flex gap-2 w-full sm:w-auto sm:justify-end">
            <button onClick={onClose} className={btnStyles.cancel}>
              닫기
            </button>
            <button
              onClick={save}
              disabled={busy}
              className={`${btnStyles.save} sm:min-w-[80px]`}
            >
              {busy ? "기록 중..." : "기록"}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* 구분 */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["revise", "추경", "한 항목을 늘리거나 줄임"],
                ["transfer", "전용", "항목에서 항목으로 옮김"],
              ] as const
            ).map(([k, title, hint]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-lg border px-3 py-2.5 text-left transition cursor-pointer ${
                  kind === k
                    ? "border-primary bg-primary-wash"
                    : "border-line-strong bg-white hover:bg-gray-50"
                }`}
              >
                <p className={`text-sm font-bold ${kind === k ? "text-primary" : "text-gray-800"}`}>
                  {title}
                </p>
                <p className="mt-0.5 text-xs text-muted">{hint}</p>
              </button>
            ))}
          </div>

          {/* 항목 */}
          {kind === "revise" ? (
            <div className="space-y-3">
              <Slot
                amt={amt}
                label="항목"
                item={to}
                after={to ? to.planned_amount + (down ? -amt : amt) : undefined}
                onPick={() => setPicking("to")}
              />
              <div className="grid grid-cols-2 gap-2">
                {([false, true] as const).map((d) => (
                  <button
                    key={String(d)}
                    type="button"
                    onClick={() => setDown(d)}
                    className={`py-2 rounded-lg border text-sm font-bold transition cursor-pointer ${
                      down === d
                        ? d
                          ? "border-red-400 bg-red-50 text-red-600"
                          : "border-primary bg-primary-wash text-primary"
                        : "border-line-strong bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {d ? "감액" : "증액"}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-end gap-2">
              <Slot
                amt={amt}
                label="보내는 항목"
                item={from}
                after={from ? from.planned_amount - amt : undefined}
                onPick={() => setPicking("from")}
              />
              <ArrowRight size={18} className="hidden sm:block mb-5 shrink-0 text-gray-400" />
              <Slot
                amt={amt}
                label="받는 항목"
                item={to}
                after={to ? to.planned_amount + amt : undefined}
                onPick={() => setPicking("to")}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-bold text-muted mb-1.5">금액</p>
              <AmountField value={amount} onChange={setAmount} placeholder="0" />
            </div>
            <div>
              <p className="text-xs font-bold text-muted mb-1.5">변경일</p>
              <DateField value={date} onChange={setDate} />
            </div>
          </div>

          <div>
            <label htmlFor="budget-change-memo" className="block text-xs font-bold text-muted mb-1.5">
              사유
            </label>
            <textarea
              id="budget-change-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              placeholder="예) 5월 공동의회 결의로 선교지 센터 지원 증액"
              className={`${inputClass} resize-none`}
            />
          </div>

          <p className="text-xs text-muted">
            원안은 그대로 두고 변경을 기록으로 쌓습니다. 기록은 고치거나 지울 수 없어요.
            잘못 넣었으면 반대 변경을 하나 더 넣어주세요.
          </p>
        </div>
      </Modal>

      {picking && (
        <BudgetItemModal
          onClose={() => setPicking(null)}
          items={items}
          usage={usage}
          accounts={[]}
          value={picking === "from" ? fromId : toId}
          hideWithdraw
          onPick={(id) => {
            if (!leaf(id)) {
              toast.error("하위 항목이 있는 항목은 바꿀 수 없어요. 맨 아래 항목을 골라주세요.");
              return;
            }
            if (picking === "from") setFromId(id);
            else setToId(id);
          }}
        />
      )}
    </>
  );
}

  /** 고른 항목 칸 — 현재 예산과 가용 잔액을 함께 보여준다 */
function Slot({
    label,
    item,
    after,
    amt,
    onPick,
  }: {
    label: string;
    item?: BudgetFlat;
    /** 저장하면 이 항목의 예산이 얼마가 되는지 */
    after?: number;
    amt: number;
    onPick: () => void;
  }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-bold text-muted mb-1.5">{label}</p>
      <button
        type="button"
        onClick={onPick}
        className={`w-full text-left rounded-lg border px-3 py-2.5 transition cursor-pointer ${
          item ? "border-line-strong bg-white hover:bg-gray-50" : "border-dashed border-line-strong bg-table-header hover:bg-gray-100"
        }`}
      >
        {item ? (
          <>
            <p className="text-sm font-bold text-heading truncate">{itemLabel(item)}</p>
            <p className="mt-0.5 text-xs text-muted tabular-nums">
              예산 <span className="font-mono">{formatWon(item.planned_amount)}</span>
              {after !== undefined && amt > 0 && (
                <>
                  {" → "}
                  <b className={`font-mono ${after < item.planned_amount ? "text-red-600" : "text-primary"}`}>
                    {formatWon(after)}
                  </b>
                </>
              )}
              <span className="mx-1.5 text-disabled-text">·</span>
              가용 <span className="font-mono">{formatWon(availableAmount(item))}</span>
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-400">항목 고르기</p>
        )}
      </button>
    </div>
  );
}
