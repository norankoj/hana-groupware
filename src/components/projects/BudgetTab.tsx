"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { uploadFile, deleteFile } from "@/utils/upload";
import toast from "react-hot-toast";

/* ── Props & Types ─────────────────────────────────────────────────── */

type Props = {
  projectId: string;
  myUserId:  string;
  isMember:  boolean;
  isAdmin:   boolean;
  isMarf?:   boolean;
};

type Budget = {
  id:              string;
  label:           string;
  category:        string;
  budgeted_amount: number;
  notes:           string | null;
  sort_order:      number;
};

type Expense = {
  id:               string;
  budget_id:        string | null;
  title:            string;
  category:         string;
  amount:           number;
  paid_at:          string | null;
  paid_by:          string | null;
  payment_method:   string;
  receipt_url:      string | null;
  receipt_path:     string | null;
  receipt_filename: string | null;
  status:           string;
  notes:            string | null;
  created_at:       string;
};

/* ── Constants ─────────────────────────────────────────────────────── */

const CATS_MARF    = ["숙소", "차량", "선물", "식비", "교통비", "행사운영", "기타"];
const CATS_GENERAL = ["식비", "교통비", "행사운영", "기타"];
const PAY_METHODS  = ["카드", "현금", "계좌이체", "기타"];

const STATUS_MAP: Record<string, { label: string; cls: string; dot: string }> = {
  pending:    { label: "대기중",   cls: "bg-yellow-100 text-yellow-700", dot: "#f59e0b" },
  approved:   { label: "승인됨",   cls: "bg-blue-100  text-blue-700",   dot: "#3b82f6" },
  reimbursed: { label: "정산완료", cls: "bg-green-100 text-green-700",  dot: "#10b981" },
};

const CAT_COLORS: Record<string, string> = {
  숙소:    "bg-sky-100    text-sky-700",
  차량:    "bg-indigo-100 text-indigo-700",
  선물:    "bg-pink-100   text-pink-700",
  식비:    "bg-orange-100 text-orange-700",
  교통비:  "bg-amber-100  text-amber-700",
  행사운영: "bg-purple-100 text-purple-700",
  기타:    "bg-gray-100   text-gray-600",
};

const krw  = (n: number) => n.toLocaleString("ko-KR");
const fmtD = (d: string | null) => (d ? d.slice(5).replace("-", "/") : "—");

/* ── Default form factories ────────────────────────────────────────── */

const newExpForm = (defaultCat: string) => ({
  title:           "",
  category:        defaultCat,
  amount:          "",
  paid_at:         new Date().toISOString().slice(0, 10),
  paid_by:         "",
  payment_method:  "카드",
  budget_id:       "",
  status:          "pending",
  notes:           "",
  receipt_url:     "",
  receipt_path:    "",
  receipt_filename: "",
});

const newBudForm = (defaultCat: string) => ({
  label:           "",
  category:        defaultCat,
  budgeted_amount: "",
  notes:           "",
});

/* ── Component ─────────────────────────────────────────────────────── */

export default function BudgetTab({ projectId, myUserId, isMember, isAdmin, isMarf }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const CATS     = isMarf ? CATS_MARF : CATS_GENERAL;

  /* Data */
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets,  setBudgets]  = useState<Budget[]>([]);
  const [loading,  setLoading]  = useState(true);

  /* View / filter */
  const [view,         setView]         = useState<"expenses" | "summary">("expenses");
  const [filterCat,    setFilterCat]    = useState("전체");
  const [filterStatus, setFilterStatus] = useState("전체");

  /* Modals */
  const [expModal,    setExpModal]    = useState(false);
  const [editExp,     setEditExp]     = useState<Expense | null>(null);
  const [expForm,     setExpForm]     = useState(() => newExpForm(CATS[0]));
  const [saving,      setSaving]      = useState(false);

  const [budModal,    setBudModal]    = useState(false);
  const [editBud,     setEditBud]     = useState<Budget | null>(null);
  const [budForm,     setBudForm]     = useState(() => newBudForm(CATS[0]));

  /* Receipt */
  const fileRef         = useRef<HTMLInputElement>(null);
  const [uploading,     setUploading]     = useState(false);
  const [receiptViewer, setReceiptViewer] = useState<string | null>(null);

  /* ── Fetch ──────────────────────────────────────────────────────── */
  const fetchAll = useCallback(async () => {
    const [{ data: e }, { data: b }] = await Promise.all([
      supabase.from("project_expenses").select("*").eq("project_id", projectId)
        .order("paid_at",   { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("project_budgets").select("*").eq("project_id", projectId)
        .order("sort_order").order("created_at"),
    ]);
    setExpenses((e ?? []) as Expense[]);
    setBudgets((b  ?? []) as Budget[]);
    setLoading(false);
  }, [supabase, projectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── Derived stats ──────────────────────────────────────────────── */
  const totalBudget  = useMemo(() => budgets.reduce((s, b) => s + b.budgeted_amount, 0), [budgets]);
  const totalSpent   = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0),          [expenses]);
  const pendingCount = useMemo(() => expenses.filter((e) => e.status === "pending").length, [expenses]);
  const balance      = totalBudget - totalSpent;

  const catSummary = useMemo(() =>
    CATS.map((cat) => ({
      cat,
      catBudget: budgets.filter((b) => b.category === cat).reduce((s, b) => s + b.budgeted_amount, 0),
      catSpent:  expenses.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0),
    })).filter((c) => c.catBudget > 0 || c.catSpent > 0),
  [CATS, budgets, expenses]);

  const filtered = useMemo(() => expenses.filter((e) => {
    if (filterCat !== "전체" && e.category !== filterCat) return false;
    if (filterStatus !== "전체" && e.status !== filterStatus) return false;
    return true;
  }), [expenses, filterCat, filterStatus]);

  const filteredTotal = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered]);

  /* ── Receipt upload (MinIO NAS) ─────────────────────────────────── */
  const uploadReceipt = async (file: File) => {
    setUploading(true);
    try {
      const { objectName, url } = await uploadFile(file, "project", projectId);
      setExpForm((f) => ({
        ...f,
        receipt_url:      url ?? "",
        receipt_path:     objectName,
        receipt_filename: file.name,
      }));
      toast.success("영수증 업로드 완료");
    } catch (e: any) {
      toast.error("업로드 실패: " + (e?.message ?? "알 수 없는 오류"));
    } finally {
      setUploading(false);
    }
  };

  /* ── Expense CRUD ───────────────────────────────────────────────── */
  const openAddExp = () => {
    setEditExp(null);
    setExpForm(newExpForm(CATS[0]));
    setExpModal(true);
  };

  const openEditExp = (e: Expense) => {
    setEditExp(e);
    setExpForm({
      title:            e.title,
      category:         e.category,
      amount:           String(e.amount),
      paid_at:          e.paid_at ?? new Date().toISOString().slice(0, 10),
      paid_by:          e.paid_by ?? "",
      payment_method:   e.payment_method,
      budget_id:        e.budget_id ?? "",
      status:           e.status,
      notes:            e.notes ?? "",
      receipt_url:      e.receipt_url ?? "",
      receipt_path:     e.receipt_path ?? "",
      receipt_filename: e.receipt_filename ?? "",
    });
    setExpModal(true);
  };

  const handleSaveExp = async () => {
    if (!expForm.title.trim())          { toast.error("항목명을 입력하세요."); return; }
    if (!expForm.amount || Number.isNaN(Number(expForm.amount)) || Number(expForm.amount) <= 0)
                                        { toast.error("올바른 금액을 입력하세요."); return; }
    setSaving(true);

    const row = {
      project_id:       projectId,
      title:            expForm.title.trim(),
      category:         expForm.category,
      amount:           Number(expForm.amount),
      paid_at:          expForm.paid_at || null,
      paid_by:          expForm.paid_by.trim()  || null,
      payment_method:   expForm.payment_method,
      budget_id:        expForm.budget_id       || null,
      status:           expForm.status,
      notes:            expForm.notes.trim()    || null,
      receipt_url:      expForm.receipt_url     || null,
      receipt_path:     expForm.receipt_path    || null,
      receipt_filename: expForm.receipt_filename || null,
      created_by:       myUserId,
    };

    if (editExp) {
      const { error } = await supabase.from("project_expenses").update({ ...row, updated_at: new Date().toISOString() }).eq("id", editExp.id);
      if (error) { toast.error("수정 실패"); setSaving(false); return; }
      setExpenses((prev) => prev.map((e) => e.id === editExp.id ? { ...e, ...row } : e));
      toast.success("수정되었습니다.");
    } else {
      const { data, error } = await supabase.from("project_expenses").insert(row).select().single();
      if (error) { toast.error("추가 실패"); setSaving(false); return; }
      setExpenses((prev) => [data as Expense, ...prev]);
      toast.success("지출이 추가되었습니다.");
    }

    setExpModal(false);
    setSaving(false);
  };

  const handleDeleteExp = async (id: string) => {
    if (!window.confirm("이 지출 내역을 삭제하시겠습니까?")) return;
    // MinIO 영수증 파일도 함께 삭제
    const target = expenses.find((e) => e.id === id);
    if (target?.receipt_path) {
      deleteFile(target.receipt_path, "project").catch(() => {});
    }
    const { error } = await supabase.from("project_expenses").delete().eq("id", id);
    if (error) { toast.error("삭제 실패"); return; }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    toast.success("삭제되었습니다.");
  };

  const handleStatusChange = async (exp: Expense, status: string) => {
    await supabase.from("project_expenses").update({ status }).eq("id", exp.id);
    setExpenses((prev) => prev.map((e) => e.id === exp.id ? { ...e, status } : e));
  };

  /* ── Budget CRUD ────────────────────────────────────────────────── */
  const openAddBud = () => {
    setEditBud(null);
    setBudForm(newBudForm(CATS[0]));
    setBudModal(true);
  };

  const openEditBud = (b: Budget) => {
    setEditBud(b);
    setBudForm({ label: b.label, category: b.category, budgeted_amount: String(b.budgeted_amount), notes: b.notes ?? "" });
    setBudModal(true);
  };

  const handleSaveBud = async () => {
    if (!budForm.label.trim()) { toast.error("항목명을 입력하세요."); return; }
    if (!budForm.budgeted_amount || Number(budForm.budgeted_amount) <= 0)
      { toast.error("예산액을 입력하세요."); return; }

    const row = {
      project_id:      projectId,
      label:           budForm.label.trim(),
      category:        budForm.category,
      budgeted_amount: Number(budForm.budgeted_amount),
      notes:           budForm.notes.trim() || null,
      sort_order:      editBud ? editBud.sort_order : budgets.length,
    };

    if (editBud) {
      const { error } = await supabase.from("project_budgets").update(row).eq("id", editBud.id);
      if (error) { toast.error("수정 실패"); return; }
      setBudgets((prev) => prev.map((b) => b.id === editBud.id ? { ...b, ...row } : b));
      toast.success("수정되었습니다.");
    } else {
      const { data, error } = await supabase.from("project_budgets").insert(row).select().single();
      if (error) { toast.error("추가 실패"); return; }
      setBudgets((prev) => [...prev, data as Budget]);
      toast.success("예산 항목이 추가되었습니다.");
    }
    setBudModal(false);
  };

  const handleDeleteBud = async (id: string) => {
    if (!window.confirm("이 예산 항목을 삭제하시겠습니까?\n연결된 지출 내역의 연결은 해제됩니다.")) return;
    await supabase.from("project_budgets").delete().eq("id", id);
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  };

  /* ── Loading ────────────────────────────────────────────────────── */
  if (loading) return <div className="text-center py-10 text-gray-400">로딩 중...</div>;

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">

      {/* ── 영수증 확대 뷰어 ──────────────────────────────────────── */}
      {receiptViewer && (
        <div
          className="fixed inset-0 z-[9999] bg-black/75 flex items-center justify-center p-4"
          onClick={() => setReceiptViewer(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setReceiptViewer(null)}
              className="absolute top-2 right-2 z-10 w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70 text-lg leading-none"
            >
              ✕
            </button>
            {/\.(jpg|jpeg|png|gif|webp)/i.test(receiptViewer) ? (
              <img src={receiptViewer} alt="영수증" className="rounded-xl max-w-full" />
            ) : (
              <div className="bg-white rounded-xl p-10 text-center space-y-4">
                <div className="text-5xl">📄</div>
                <p className="text-gray-600 text-sm">PDF 파일입니다.</p>
                <a
                  href={receiptViewer} target="_blank" rel="noopener noreferrer"
                  className="inline-block px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
                >
                  새 탭에서 열기
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 요약 카드 4개 ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <BudCard label="총 예산"   value={krw(totalBudget)} unit="원" color="blue" />
        <BudCard label="총 지출"   value={krw(totalSpent)}  unit="원" color={totalBudget > 0 && totalSpent > totalBudget ? "red" : "default"} />
        <BudCard label="잔액"      value={krw(Math.abs(balance))} unit={balance < 0 ? "원 초과" : "원"} color={balance < 0 ? "red" : "green"} />
        <BudCard label="미처리 건" value={String(pendingCount)}    unit="건"  color={pendingCount > 0 ? "yellow" : "default"} />
      </div>

      {/* 초과 경고 배너 */}
      {totalBudget > 0 && balance < 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <span className="text-base">⚠️</span>
          <span>예산을 <b>{krw(-balance)}원</b> 초과했습니다. 예산 항목을 검토해 주세요.</span>
        </div>
      )}

      {/* ── 뷰 전환 + 액션 버튼 ──────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
          {(["expenses", "summary"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${
                view === v ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {v === "expenses" ? "💸 지출 내역" : "📊 예산 현황"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {isAdmin && view === "summary" && (
            <button
              onClick={openAddBud}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              예산 항목
            </button>
          )}
          {isMember && (
            <button
              onClick={openAddExp}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              지출 추가
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          지출 내역 뷰
      ══════════════════════════════════════════════════════════════ */}
      {view === "expenses" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* 필터 바 */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {["전체", ...CATS].map((c) => (
                <button
                  key={c} onClick={() => setFilterCat(c)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-full transition ${
                    filterCat === c ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex gap-1 ml-auto flex-wrap shrink-0">
              {["전체", ...Object.keys(STATUS_MAP)].map((s) => (
                <button
                  key={s} onClick={() => setFilterStatus(s)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-full transition ${
                    filterStatus === s ? "bg-gray-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {s === "전체" ? "전체" : STATUS_MAP[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* 목록 */}
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              <p>지출 내역이 없습니다.</p>
              {isMember && <p className="mt-1 text-xs">위의 "지출 추가" 버튼으로 첫 지출을 등록하세요.</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {["날짜","항목","카테고리","금액","지출자","결제","상태","영수증"].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-2.5 text-xs font-semibold text-gray-500 ${
                          i === 3 ? "text-right" : "text-left"
                        } ${h === "날짜" ? "w-16" : h === "카테고리" ? "w-24" : h === "금액" ? "w-28" : h === "지출자" || h === "결제" ? "w-20" : h === "상태" ? "w-24" : h === "영수증" ? "w-14" : ""}`}
                      >
                        {h}
                      </th>
                    ))}
                    {isAdmin && <th className="w-14" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50/60 transition group">
                      <td className="px-4 py-3 text-xs text-gray-400 tabular-nums whitespace-nowrap">
                        {fmtD(e.paid_at)}
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <p className="font-medium text-gray-800 truncate">{e.title}</p>
                        {e.notes && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">{e.notes}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CAT_COLORS[e.category] ?? "bg-gray-100 text-gray-600"}`}>
                          {e.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                        {krw(e.amount)}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{e.paid_by ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{e.payment_method}</td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <select
                            value={e.status}
                            onChange={(ev) => handleStatusChange(e, ev.target.value)}
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer outline-none focus:outline-none ${STATUS_MAP[e.status]?.cls ?? ""}`}
                          >
                            {Object.entries(STATUS_MAP).map(([k, v]) => (
                              <option key={k} value={k}>{v.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_MAP[e.status]?.cls ?? "bg-gray-100 text-gray-500"}`}>
                            {STATUS_MAP[e.status]?.label ?? e.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.receipt_url ? (
                          <button
                            onClick={() => setReceiptViewer(e.receipt_url!)}
                            title={e.receipt_filename ?? "영수증 보기"}
                            className="text-blue-400 hover:text-blue-600 transition text-base"
                          >
                            📎
                          </button>
                        ) : (
                          <span className="text-gray-200 text-xs">—</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditExp(e)}
                              title="수정"
                              className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-blue-500 transition rounded"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteExp(e.id)}
                              title="삭제"
                              className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 transition rounded"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={3} className="px-4 py-2.5 text-xs text-gray-500 font-semibold">
                      {filtered.length}건
                      {(filterCat !== "전체" || filterStatus !== "전체") && " (필터 적용됨)"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums text-sm">
                      {krw(filteredTotal)}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span>
                    </td>
                    <td colSpan={isAdmin ? 5 : 4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          예산 현황 뷰
      ══════════════════════════════════════════════════════════════ */}
      {view === "summary" && (
        <div className="space-y-4">
          {/* 전체 진행 바 */}
          {totalBudget > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">전체 예산 사용률</span>
                <span className={`text-sm font-bold tabular-nums ${balance < 0 ? "text-red-600" : "text-gray-700"}`}>
                  {Math.round((totalSpent / totalBudget) * 100)}%
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${balance < 0 ? "bg-red-400" : "bg-blue-500"}`}
                  style={{ width: `${Math.min((totalSpent / totalBudget) * 100, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-gray-400 tabular-nums">
                <span>지출 {krw(totalSpent)}원</span>
                <span>예산 {krw(totalBudget)}원</span>
              </div>
            </div>
          )}

          {/* 카테고리별 카드 */}
          {catSummary.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {catSummary.map(({ cat, catBudget, catSpent }) => {
                const catBalance = catBudget - catSpent;
                const pct        = catBudget > 0 ? Math.min((catSpent / catBudget) * 100, 100) : 0;
                const over       = catBudget > 0 && catSpent > catBudget;
                return (
                  <div key={cat} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CAT_COLORS[cat] ?? "bg-gray-100 text-gray-600"}`}>
                        {cat}
                      </span>
                      {over && <span className="text-xs text-red-500 font-bold">초과!</span>}
                    </div>
                    <div className="text-2xl font-bold text-gray-900 tabular-nums leading-tight mb-0.5">
                      {krw(catSpent)}<span className="text-sm font-normal text-gray-400 ml-0.5">원</span>
                    </div>
                    <div className="text-xs text-gray-400 mb-3">
                      예산 {catBudget > 0 ? `${krw(catBudget)}원` : "미설정"}
                    </div>
                    {catBudget > 0 && (
                      <>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                          <div
                            className={`h-full rounded-full transition-all ${over ? "bg-red-400" : "bg-blue-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs tabular-nums">
                          <span className="text-gray-400">{Math.round(pct)}% 사용</span>
                          <span className={catBalance < 0 ? "text-red-500 font-semibold" : "text-green-600 font-semibold"}>
                            {catBalance < 0 ? `${krw(-catBalance)}원 초과` : `${krw(catBalance)}원 남음`}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-gray-400 text-sm">
              <p className="mb-1">등록된 예산 항목이 없습니다.</p>
              {isAdmin && (
                <p className="text-xs">위의 "예산 항목" 버튼으로 카테고리별 예산을 설정하세요.</p>
              )}
            </div>
          )}

          {/* 예산 항목 목록 */}
          {budgets.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800">예산 항목 목록</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {budgets.map((b) => {
                  const spent      = expenses.filter((e) => e.budget_id === b.id).reduce((s, e) => s + e.amount, 0);
                  const budBalance = b.budgeted_amount - spent;
                  const pct        = b.budgeted_amount > 0 ? Math.min((spent / b.budgeted_amount) * 100, 100) : 0;
                  return (
                    <div key={b.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 transition group">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${CAT_COLORS[b.category] ?? "bg-gray-100 text-gray-600"}`}>
                        {b.category}
                      </span>
                      <span className="flex-1 text-sm text-gray-800 truncate">{b.label}</span>
                      {/* mini progress bar */}
                      <div className="hidden sm:flex items-center gap-2 w-32 shrink-0">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${budBalance < 0 ? "bg-red-400" : "bg-blue-400"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400 tabular-nums w-8 text-right">{Math.round(pct)}%</span>
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums shrink-0">
                        {krw(b.budgeted_amount)}원
                      </span>
                      <span className={`text-xs font-semibold tabular-nums shrink-0 ${budBalance < 0 ? "text-red-500" : "text-green-600"}`}>
                        {budBalance < 0 ? `−${krw(-budBalance)}` : `+${krw(budBalance)}`}
                      </span>
                      {isAdmin && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditBud(b)}
                            title="수정"
                            className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-blue-500 transition rounded"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteBud(b.id)}
                            title="삭제"
                            className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 transition rounded"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          지출 추가/수정 모달
      ══════════════════════════════════════════════════════════════ */}
      {expModal && (
        <div
          className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
          onClick={() => !saving && !uploading && setExpModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="font-bold text-gray-900 text-base">{editExp ? "지출 수정" : "지출 추가"}</h2>
              <button
                onClick={() => setExpModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* 폼 바디 */}
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              {/* 항목명 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  항목명 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={expForm.title}
                  onChange={(e) => setExpForm({ ...expForm, title: e.target.value })}
                  placeholder="예: 선교사 선물 구매"
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 카테고리 + 금액 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">카테고리</label>
                  <select
                    value={expForm.category}
                    onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    금액 (원) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    value={expForm.amount}
                    onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })}
                    placeholder="0"
                    min="0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {expForm.amount && !isNaN(Number(expForm.amount)) && Number(expForm.amount) > 0 && (
                    <p className="text-xs text-gray-400 mt-1 tabular-nums">{krw(Number(expForm.amount))}원</p>
                  )}
                </div>
              </div>

              {/* 지출일 + 지출자 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">지출일</label>
                  <input
                    type="date"
                    value={expForm.paid_at}
                    onChange={(e) => setExpForm({ ...expForm, paid_at: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">지출자</label>
                  <input
                    type="text"
                    value={expForm.paid_by}
                    onChange={(e) => setExpForm({ ...expForm, paid_by: e.target.value })}
                    placeholder="이름"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* 결제방법 + 예산 항목 연결 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">결제 방법</label>
                  <select
                    value={expForm.payment_method}
                    onChange={(e) => setExpForm({ ...expForm, payment_method: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">예산 항목 연결</label>
                  <select
                    value={expForm.budget_id}
                    onChange={(e) => setExpForm({ ...expForm, budget_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— 연결 안함 —</option>
                    {budgets.map((b) => (
                      <option key={b.id} value={b.id}>[{b.category}] {b.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 처리 상태 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">처리 상태</label>
                <div className="flex gap-2">
                  {Object.entries(STATUS_MAP).map(([k, v]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setExpForm({ ...expForm, status: k })}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${
                        expForm.status === k
                          ? `${v.cls} border-current shadow-sm`
                          : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 영수증 첨부 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">영수증 첨부</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReceipt(f); e.target.value = ""; }}
                />
                {expForm.receipt_url ? (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                    {/\.(jpg|jpeg|png|gif|webp)/i.test(expForm.receipt_url) ? (
                      <img
                        src={expForm.receipt_url}
                        alt="영수증 미리보기"
                        className="w-16 h-16 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition"
                        onClick={() => setReceiptViewer(expForm.receipt_url!)}
                      />
                    ) : (
                      <div
                        className="w-16 h-16 bg-red-50 rounded-lg border border-red-100 flex items-center justify-center text-2xl cursor-pointer hover:opacity-80 transition"
                        onClick={() => setReceiptViewer(expForm.receipt_url!)}
                      >
                        📄
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 font-medium truncate">{expForm.receipt_filename || "영수증"}</p>
                      <div className="flex gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          className="text-xs text-blue-500 hover:text-blue-700"
                        >
                          교체
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (expForm.receipt_path) {
                              deleteFile(expForm.receipt_path, "project").catch(() => {});
                            }
                            setExpForm({ ...expForm, receipt_url: "", receipt_path: "", receipt_filename: "" });
                          }}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-full border-2 border-dashed border-gray-200 rounded-xl py-6 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition text-center disabled:opacity-50"
                  >
                    {uploading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        업로드 중...
                      </span>
                    ) : (
                      <>
                        <span className="block text-2xl mb-1">📷</span>
                        클릭하여 영수증 첨부
                        <span className="block text-xs text-gray-300 mt-0.5">이미지 또는 PDF</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* 메모 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">메모</label>
                <textarea
                  value={expForm.notes}
                  onChange={(e) => setExpForm({ ...expForm, notes: e.target.value })}
                  rows={2}
                  placeholder="비고 사항..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            {/* 푸터 */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
              <button
                onClick={() => setExpModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                취소
              </button>
              <button
                onClick={handleSaveExp}
                disabled={saving || uploading}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {saving ? "저장 중..." : editExp ? "수정" : "추가"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          예산 항목 추가/수정 모달
      ══════════════════════════════════════════════════════════════ */}
      {budModal && (
        <div
          className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setBudModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editBud ? "예산 항목 수정" : "예산 항목 추가"}</h2>
              <button
                onClick={() => setBudModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  항목명 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={budForm.label}
                  onChange={(e) => setBudForm({ ...budForm, label: e.target.value })}
                  placeholder="예: 선교사 숙소 제공비"
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">카테고리</label>
                  <select
                    value={budForm.category}
                    onChange={(e) => setBudForm({ ...budForm, category: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    예산액 (원) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    value={budForm.budgeted_amount}
                    onChange={(e) => setBudForm({ ...budForm, budgeted_amount: e.target.value })}
                    placeholder="0"
                    min="0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {budForm.budgeted_amount && !isNaN(Number(budForm.budgeted_amount)) && Number(budForm.budgeted_amount) > 0 && (
                    <p className="text-xs text-gray-400 mt-1 tabular-nums">{krw(Number(budForm.budgeted_amount))}원</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">메모</label>
                <textarea
                  value={budForm.notes}
                  onChange={(e) => setBudForm({ ...budForm, notes: e.target.value })}
                  rows={2}
                  placeholder="비고 사항..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setBudModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                취소
              </button>
              <button
                onClick={handleSaveBud}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition"
              >
                {editBud ? "수정" : "추가"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── BudCard 서브 컴포넌트 ──────────────────────────────────────────── */
function BudCard({ label, value, unit, color }: {
  label: string; value: string; unit: string; color: string;
}) {
  const CLS: Record<string, string> = {
    blue:    "border-blue-100   bg-blue-50",
    green:   "border-green-100  bg-green-50",
    yellow:  "border-yellow-100 bg-yellow-50",
    red:     "border-red-100    bg-red-50",
    default: "border-gray-200   bg-white",
  };
  return (
    <div className={`rounded-xl border p-4 ${CLS[color] ?? CLS.default}`}>
      <div className="text-xs text-gray-500 font-medium mb-1">{label}</div>
      <div className="text-lg font-bold text-gray-900 tabular-nums leading-tight">
        {value}
        <span className="text-xs font-normal text-gray-400 ml-1">{unit}</span>
      </div>
    </div>
  );
}
