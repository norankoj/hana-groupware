"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import Modal from "@/components/Modal";
import Select from "@/components/Select";

type Props = {
  projectId: string;
  myUserId: string;
  isMember: boolean;
  isAdmin: boolean;
};

type Attendee = {
  id: string;
  name: string;
  affiliation: string | null;
  country: string | null;
  family_group: string | null;
  family_role: string | null;
  attend_supasun: boolean;
  attend_retreat: boolean;
  overnight_retreat: boolean;
  retreat_transport: string | null;
  mk_program: string | null; // null = X, 'attend' = O, 'staff' = 스텝
  attend_marf: boolean;
};

type SortKey =
  | "country"
  | "name"
  | "affiliation"
  | "attend_supasun"
  | "attend_retreat"
  | "overnight_retreat"
  | "retreat_transport"
  | "mk_program"
  | "attend_marf";

// ── 국가 순서 & 색상 (DB 실제 값 기준) ───────────────────────

const COUNTRY_ORDER = [
  "요르단",
  "이집트",
  "이스라엘",
  "레바논",
  "사우디",
  "인도네시아",
  "피지",
  "파키스탄",
  "호주컴미션",
  "모로코",
  "한국",
];

const COUNTRY_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  요르단: {
    bg: "bg-amber-100",
    text: "text-amber-800",
    border: "border-amber-300",
  },
  이집트: {
    bg: "bg-rose-100",
    text: "text-rose-800",
    border: "border-rose-300",
  },
  이스라엘: {
    bg: "bg-blue-100",
    text: "text-blue-800",
    border: "border-blue-300",
  },
  레바논: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" },
  사우디: {
    bg: "bg-green-100",
    text: "text-green-800",
    border: "border-green-300",
  },
  인도네시아: {
    bg: "bg-orange-100",
    text: "text-orange-800",
    border: "border-orange-300",
  },
  피지: { bg: "bg-teal-100", text: "text-teal-800", border: "border-teal-300" },
  파키스탄: {
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    border: "border-emerald-300",
  },
  호주컴미션: {
    bg: "bg-violet-100",
    text: "text-violet-800",
    border: "border-violet-300",
  },
  모로코: {
    bg: "bg-pink-100",
    text: "text-pink-800",
    border: "border-pink-300",
  },
  한국: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-300",
  },
};
const DEFAULT_COLOR = {
  bg: "bg-indigo-50",
  text: "text-indigo-700",
  border: "border-indigo-200",
};

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const COUNTRY_ORDER_NORMED = COUNTRY_ORDER.map(norm);

const countryRank = (c: string) => {
  const idx = COUNTRY_ORDER_NORMED.indexOf(norm(c));
  return idx === -1 ? COUNTRY_ORDER.length : idx;
};
const countryColor = (c: string) => {
  const normed = norm(c);
  const key = COUNTRY_ORDER.find((o) => norm(o) === normed);
  return key ? (COUNTRY_COLORS[key] ?? DEFAULT_COLOR) : DEFAULT_COLOR;
};

// ── 역할 / 이동방법 ───────────────────────────────────────────

const MK_CYCLE = [null, "attend", "staff"] as const;
type MKValue = (typeof MK_CYCLE)[number];

const ROLE_ORDER: Record<string, number> = {
  head: 0,
  spouse: 1,
  child: 2,
  staff: 3,
};
const ROLE_CYCLE = ["head", "spouse", "child"] as const;
const TRANSPORT_CYCLE = [null, "단체버스", "개인이동"] as const;
const roleLabel = (r: string | null) =>
  r === "spouse"
    ? "배우자"
    : r === "child"
      ? "자녀"
      : r === "staff"
        ? "스텝"
        : "대표";

// ── 서브 컴포넌트 ──────────────────────────────────────────────

function OXBadge({ value, onClick }: { value: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`w-8 h-6 rounded text-xs font-bold transition select-none
        ${value ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-400 hover:bg-gray-200"}
        ${!onClick ? "cursor-default" : "cursor-pointer"}`}
    >
      {value ? "O" : "X"}
    </button>
  );
}

function MKBadge({
  value,
  onClick,
}: {
  value: string | null;
  onClick?: () => void;
}) {
  const style =
    value === "attend"
      ? "bg-green-100 text-green-700 hover:bg-green-200 w-8"
      : value === "staff"
        ? "bg-orange-100 text-orange-700 hover:bg-orange-200 px-2.5"
        : "bg-gray-100 text-gray-400 hover:bg-gray-200 w-8";
  const label = value === "attend" ? "O" : value === "staff" ? "스텝" : "X";
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      title={onClick ? "클릭: X → O → 스텝" : undefined}
      className={`h-6 rounded text-xs font-bold transition select-none ${style} ${!onClick ? "cursor-default" : "cursor-pointer"}`}
    >
      {label}
    </button>
  );
}

function TransportBadge({
  value,
  active,
  onClick,
}: {
  value: string | null;
  active: boolean;
  onClick?: () => void;
}) {
  if (!active)
    return (
      <span
        className="text-gray-300 text-xs select-none"
        title="수양회 O 설정 후 활성화"
      >
        -
      </span>
    );
  const color =
    value === "단체버스"
      ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
      : value === "개인이동"
        ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
        : "bg-gray-100 text-gray-400 hover:bg-gray-200";
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`px-1.5 py-0.5 rounded text-xs font-bold whitespace-nowrap transition ${color} ${!onClick ? "cursor-default" : "cursor-pointer"}`}
    >
      {value ?? "미정"}
    </button>
  );
}

function RoleBadge({
  role,
  onClick,
}: {
  role: string | null;
  onClick?: () => void;
}) {
  const r = role ?? "head";
  const color =
    r === "spouse"
      ? "bg-pink-100 text-pink-600 hover:bg-pink-200"
      : r === "child"
        ? "bg-gray-100 text-gray-500 hover:bg-gray-200"
        : r === "staff"
          ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
          : "bg-blue-100 text-blue-700 hover:bg-blue-200";
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      title={
        onClick && r !== "staff"
          ? "클릭 시 역할 변경 (대표→배우자→자녀)"
          : undefined
      }
      className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold transition ${color} ${!onClick ? "cursor-default" : "cursor-pointer"}`}
    >
      {roleLabel(role)}
    </button>
  );
}

function SortTh({
  label,
  colKey,
  currentKey,
  currentDir,
  onSort,
  center = false,
}: {
  label: string;
  colKey: SortKey;
  currentKey: SortKey | null;
  currentDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  center?: boolean;
}) {
  const active = currentKey === colKey;
  return (
    <th
      onClick={() => onSort(colKey)}
      className={`px-3 py-2.5 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors bg-gray-50 text-gray-500 text-xs ${center ? "text-center" : "text-left"}`}
    >
      <div
        className={`flex items-center gap-0.5 ${center ? "justify-center" : ""}`}
      >
        <span>{label}</span>
        <span
          className={`text-[9px] ml-0.5 ${active ? "text-blue-500" : "text-gray-300"}`}
        >
          {active ? (currentDir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </div>
    </th>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="text-xs font-semibold text-gray-500">{label}</div>
      <div className="text-xl font-bold mt-0.5 text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────

export default function AttendanceTab({ projectId, isMember, isAdmin }: Props) {
  const supabase = createClient();
  const [rows, setRows] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    country: "한국",
    affiliation: "",
    family_group: "",
    family_role: "staff",
  });
  const [addSaving, setAddSaving] = useState(false);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("marf_missionaries")
      .select(
        "id, name, affiliation, country, family_group, family_role, attend_supasun, attend_retreat, overnight_retreat, retreat_transport, mk_program, attend_marf",
      )
      .eq("project_id", projectId);
    if (error) toast.error("불러오기 실패");
    else setRows((data ?? []) as Attendee[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") setSortDir("desc");
    else {
      setSortKey(null);
      setSortDir("asc");
    }
  };

  const updateField = async (
    id: string,
    field: string,
    value: boolean | string | null,
  ) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
    const { error } = await supabase
      .from("marf_missionaries")
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("저장 실패");
      fetchData();
    }
  };

  const toggleRetreat = async (row: Attendee) => {
    const next = !row.attend_retreat;
    // 수양회 OFF 시 숙박·이동방법 초기화
    const patch = next
      ? { attend_retreat: true }
      : { attend_retreat: false, overnight_retreat: false, retreat_transport: null };
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    const { error } = await supabase
      .from("marf_missionaries")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) { toast.error("저장 실패"); fetchData(); }
  };

  const cycleTransport = (row: Attendee) => {
    const idx = TRANSPORT_CYCLE.indexOf(
      row.retreat_transport as (typeof TRANSPORT_CYCLE)[number],
    );
    updateField(
      row.id,
      "retreat_transport",
      TRANSPORT_CYCLE[(idx + 1) % TRANSPORT_CYCLE.length] ?? null,
    );
  };

  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim()) {
      toast.error("이름을 입력해주세요");
      return;
    }
    setAddSaving(true);
    const { error } = await supabase.from("marf_missionaries").insert({
      project_id: projectId,
      name: addForm.name.trim(),
      country: addForm.country,
      affiliation: addForm.affiliation.trim() || null,
      family_group: addForm.family_group.trim() || null,
      family_role: addForm.family_role,
      attend_supasun: false,
      attend_retreat: false,
      overnight_retreat: false,
      mk_program: null,
      attend_marf: false,
    });
    setAddSaving(false);
    if (error) {
      toast.error("추가 실패: " + error.message);
      return;
    }
    toast.success(`${addForm.name.trim()} 추가됨`);
    setAddForm({
      name: "",
      country: "한국",
      affiliation: "",
      family_group: "",
      family_role: "staff",
    });
    setShowAddModal(false);
    fetchData();
  };

  const cycleMK = (row: Attendee) => {
    const idx = MK_CYCLE.indexOf(row.mk_program as MKValue);
    updateField(
      row.id,
      "mk_program",
      MK_CYCLE[(idx + 1) % MK_CYCLE.length] ?? null,
    );
  };

  const cycleRole = (row: Attendee) => {
    const idx = ROLE_CYCLE.indexOf(
      (row.family_role ?? "head") as (typeof ROLE_CYCLE)[number],
    );
    updateField(
      row.id,
      "family_role",
      ROLE_CYCLE[(idx + 1) % ROLE_CYCLE.length],
    );
  };

  // ── 정렬 (가족 단위) ───────────────────────────────────────────

  const sorted = (() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const fkOf = (r: Attendee) => r.family_group ?? `__solo__${r.id}`;

    // 1. 가족별로 묶기
    const familyMap = new Map<string, Attendee[]>();
    rows.forEach((r) => {
      const k = fkOf(r);
      if (!familyMap.has(k)) familyMap.set(k, []);
      familyMap.get(k)!.push(r);
    });

    // 2. 가족 내부는 항상 역할 순 (대표→배우자→자녀→스텝)
    for (const members of familyMap.values()) {
      members.sort(
        (a, b) =>
          (ROLE_ORDER[a.family_role ?? "head"] ?? 0) -
            (ROLE_ORDER[b.family_role ?? "head"] ?? 0) ||
          a.name.localeCompare(b.name, "ko"),
      );
    }

    // 3. 가족 대표자 (head → 없으면 첫 번째 멤버)
    const rep = (members: Attendee[]) =>
      members.find((m) => m.family_role === "head") ?? members[0];

    // 4. 가족 단위 정렬
    const families = [...familyMap.values()];
    families.sort((a, b) => {
      const ra = rep(a);
      const rb = rep(b);

      if (!sortKey || sortKey === "country") {
        const cr =
          countryRank(ra.country ?? "") - countryRank(rb.country ?? "");
        if (cr !== 0) return cr * (sortKey === "country" ? dir : 1);
        return (ra.family_group ?? ra.id).localeCompare(
          rb.family_group ?? rb.id,
          "ko",
        );
      }

      const va = ra[sortKey as keyof Attendee];
      const vb = rb[sortKey as keyof Attendee];
      let cmp = 0;
      if (typeof va === "boolean" && typeof vb === "boolean")
        cmp = (vb ? 1 : 0) - (va ? 1 : 0);
      else if (typeof va === "string" && typeof vb === "string")
        cmp = va.localeCompare(vb, "ko");
      else if (va == null && vb != null) cmp = 1;
      else if (va != null && vb == null) cmp = -1;
      // 같은 값이면 국가 순 → 이름 순
      return (
        cmp * dir ||
        countryRank(ra.country ?? "") - countryRank(rb.country ?? "") ||
        ra.name.localeCompare(rb.name, "ko")
      );
    });

    // 5. 펼치기
    return families.flat();
  })();

  // ── 검색 필터 ─────────────────────────────────────────────────

  const q = search.trim().toLowerCase();
  const filtered = q
    ? sorted.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.affiliation ?? "").toLowerCase().includes(q) ||
          (r.country ?? "").toLowerCase().includes(q),
      )
    : sorted;

  // ── 행 메타 계산 (경계선용) ───────────────────────────────────

  const familyKey = (r: Attendee) => r.family_group ?? `__solo__${r.id}`;

  // ── 요약 통계 ─────────────────────────────────────────────────

  const total = rows.length;
  const adultCount = rows.filter((r) => r.family_role !== "child").length;
  const supasunCount = rows.filter((r) => r.attend_supasun).length;
  const supasunAdultCount = rows.filter((r) => r.attend_supasun && r.family_role !== "child").length;
  const supasunChildCount = rows.filter((r) => r.attend_supasun && r.family_role === "child").length;
  const retreatCount = rows.filter((r) => r.attend_retreat).length;
  const overnightCount = rows.filter((r) => r.overnight_retreat).length;
  const busCount = rows.filter(
    (r) => r.retreat_transport === "단체버스",
  ).length;
  const indivCount = rows.filter(
    (r) => r.retreat_transport === "개인이동",
  ).length;
  const mkCount = rows.filter((r) => r.mk_program === "attend").length;
  const mkStaffCount = rows.filter((r) => r.mk_program === "staff").length;
  const marfChildCount = rows.filter(
    (r) => r.attend_marf && r.family_role === "child",
  ).length;

  const canEdit = isMember;

  // ── 엑셀 다운로드 ─────────────────────────────────────────────

  const downloadExcel = () => {
    const wsData = sorted.map((r) => ({
      파송국가: r.country ?? "",
      역할: roleLabel(r.family_role),
      이름: r.name,
      소속: r.affiliation ?? "",
      수파선: r.attend_supasun ? "O" : "X",
      수양회: r.attend_retreat ? "O" : "X",
      "수양회 숙박": r.overnight_retreat ? "O" : "X",
      "수양회→문막(이동)": r.retreat_transport ?? "",
      MK프로그램:
        r.mk_program === "attend"
          ? "O"
          : r.mk_program === "staff"
            ? "스텝"
            : "X",
      "마프참석(자녀)": r.attend_marf ? "O" : "X",
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "참여현황");
    XLSX.writeFile(wb, "참여현황.xlsx");
  };

  // ── 렌더 ──────────────────────────────────────────────────────

  if (loading)
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <svg
          className="animate-spin w-5 h-5 mr-2"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8z"
          />
        </svg>
        불러오는 중...
      </div>
    );

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="마프 전체"
          value={`${total}명`}
          sub={`어른 ${adultCount}명 · MK ${mkCount + mkStaffCount}명 · 참석자녀 ${marfChildCount}명`}
        />
        <StatCard label="수파선" value={`${supasunCount}명`} sub={`어른 ${supasunAdultCount}명 · 자녀 ${supasunChildCount}명`} />
        <StatCard
          label="수양회"
          value={`${retreatCount}명`}
          sub={`숙박 ${overnightCount}명`}
        />
        <StatCard
          label="MK프로그램"
          value={`${mkCount + mkStaffCount}명`}
          sub={`스텝 ${mkStaffCount}명`}
        />
        <StatCard label="마프참석(자녀)" value={`${marfChildCount}명`} />
      </div>

      {retreatCount > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
          <span className="font-semibold text-gray-600">
            수양회 → 마프 이동
          </span>
          <span>
            단체버스{" "}
            <span className="font-bold text-blue-700">{busCount}명</span>
          </span>
          <span>
            개인이동{" "}
            <span className="font-bold text-orange-700">{indivCount}명</span>
          </span>
          <span>
            미정{" "}
            <span className="font-bold text-gray-500">
              {retreatCount - busCount - indivCount}명
            </span>
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        {canEdit && (
          <button
            onClick={() => setShowAddModal(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            인원 추가
          </button>
        )}
        <div className="relative flex-1 max-w-xs">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름·소속 검색..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <button
          onClick={downloadExcel}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          엑셀 다운로드
        </button>
        {canEdit && (
          <span className="hidden sm:inline text-xs text-amber-600 font-medium whitespace-nowrap">
            숙박·수양회→문막 이동방법은 <strong>수양회 O</strong> 후 활성화
          </span>
        )}
      </div>

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="인원 추가"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              취소
            </button>
            <button
              type="submit"
              form="add-person-form"
              disabled={addSaving}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {addSaving ? "저장 중..." : "추가"}
            </button>
          </>
        }
      >
        <form
          id="add-person-form"
          onSubmit={handleAddPerson}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              이름 *
            </label>
            <input
              type="text"
              value={addForm.name}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, name: e.target.value }))
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="이름 입력"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                파송국가
              </label>
              <Select
                value={addForm.country}
                onChange={(v) => setAddForm((f) => ({ ...f, country: v }))}
                options={COUNTRY_ORDER}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                역할
              </label>
              <Select
                value={addForm.family_role}
                onChange={(v) => setAddForm((f) => ({ ...f, family_role: v }))}
                options={[
                  { value: "staff", label: "스텝" },
                  { value: "head", label: "대표" },
                  { value: "spouse", label: "배우자" },
                  { value: "child", label: "자녀" },
                ]}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              소속
            </label>
            <input
              type="text"
              value={addForm.affiliation}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, affiliation: e.target.value }))
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="소속 교회·단체"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              가족 묶음{" "}
              <span className="font-normal text-gray-400">
                (같은 가족은 동일하게 입력)
              </span>
            </label>
            <input
              type="text"
              value={addForm.family_group}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, family_group: e.target.value }))
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="예: 홍길동가정"
            />
          </div>
        </form>
      </Modal>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
        <table className="w-full text-sm border-collapse min-w-[760px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th
                onClick={() => handleSort("country")}
                className="px-2 py-2.5 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors bg-gray-50 text-gray-500 text-xs text-center w-20"
              >
                <div className="flex items-center justify-center gap-0.5">
                  <span>파송국가</span>
                  <span
                    className={`text-[9px] ml-0.5 ${sortKey === "country" ? "text-blue-500" : "text-gray-300"}`}
                  >
                    {sortKey === "country"
                      ? sortDir === "asc"
                        ? "▲"
                        : "▼"
                      : "⇅"}
                  </span>
                </div>
              </th>
              <SortTh
                label="이름"
                colKey="name"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortTh
                label="소속"
                colKey="affiliation"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortTh
                label="수파선"
                colKey="attend_supasun"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
                center
              />
              <SortTh
                label="수양회"
                colKey="attend_retreat"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
                center
              />
              <SortTh
                label="수양회 숙박"
                colKey="overnight_retreat"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
                center
              />
              <SortTh
                label="수양회→문막"
                colKey="retreat_transport"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
                center
              />
              <SortTh
                label="MK"
                colKey="mk_program"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
                center
              />
              <SortTh
                label="마프참석"
                colKey="attend_marf"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
                center
              />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-12 text-center text-gray-400 text-sm"
                >
                  {q
                    ? "검색 결과가 없습니다."
                    : "명단에 등록된 선교사가 없습니다."}
                </td>
              </tr>
            )}
            {filtered.map((row, idx) => {
              const prev = filtered[idx - 1];
              const country = row.country ?? "(미지정)";
              const prevCountry = prev?.country ?? "(미지정)";
              const fk = familyKey(row);
              const prevFk = prev ? familyKey(prev) : null;

              // 국가 경계 (두꺼운 선), 가족 경계 (얇은 선)
              const isCountryBoundary =
                idx > 0 && norm(prevCountry) !== norm(country);
              const isFamilyBoundary =
                idx > 0 && !isCountryBoundary && prevFk !== fk;
              // 가족 내 첫 행에만 소속 표시 (기본 정렬 시)
              const isFirstInFamily =
                idx === 0 ||
                prevFk !== fk ||
                norm(prevCountry) !== norm(country);

              const borderClass = isCountryBoundary
                ? "border-t-2 border-gray-400"
                : isFamilyBoundary
                  ? "border-t border-gray-200"
                  : "border-t border-gray-50";

              const { bg, text, border } = countryColor(country);

              return (
                <tr
                  key={row.id}
                  className={`bg-white hover:bg-blue-50/20 transition-colors ${borderClass}`}
                >
                  {/* 파송국가 */}
                  <td className="px-2 py-2 text-center border-r border-gray-100 w-20">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold leading-tight ${bg} ${text} whitespace-nowrap`}
                    >
                      {country}
                    </span>
                  </td>

                  {/* 이름 */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <RoleBadge
                        role={row.family_role}
                        onClick={isAdmin ? () => cycleRole(row) : undefined}
                      />
                      <span className="font-medium text-gray-900">
                        {row.name}
                      </span>
                    </div>
                  </td>

                  {/* 소속 — 가족 첫 행 또는 정렬 시 전체 표시 */}
                  <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                    {!sortKey || sortKey === "country"
                      ? isFirstInFamily
                        ? (row.affiliation ?? "-")
                        : ""
                      : (row.affiliation ?? "-")}
                  </td>

                  {/* 수파선 */}
                  <td className="px-3 py-2 text-center">
                    <OXBadge
                      value={row.attend_supasun}
                      onClick={
                        canEdit
                          ? () =>
                              updateField(
                                row.id,
                                "attend_supasun",
                                !row.attend_supasun,
                              )
                          : undefined
                      }
                    />
                  </td>

                  {/* 수양회 */}
                  <td className="px-3 py-2 text-center">
                    <OXBadge
                      value={row.attend_retreat}
                      onClick={canEdit ? () => toggleRetreat(row) : undefined}
                    />
                  </td>

                  {/* 수양회 숙박 */}
                  <td className="px-3 py-2 text-center">
                    {row.attend_retreat ? (
                      <OXBadge
                        value={row.overnight_retreat}
                        onClick={
                          canEdit
                            ? () =>
                                updateField(
                                  row.id,
                                  "overnight_retreat",
                                  !row.overnight_retreat,
                                )
                            : undefined
                        }
                      />
                    ) : (
                      <span
                        className="text-gray-200 text-xs select-none"
                        title="수양회 O 설정 후 활성화"
                      >
                        -
                      </span>
                    )}
                  </td>

                  {/* 이동방법 */}
                  <td className="px-3 py-2 text-center">
                    <TransportBadge
                      value={row.retreat_transport}
                      active={row.attend_retreat}
                      onClick={
                        canEdit && row.attend_retreat
                          ? () => cycleTransport(row)
                          : undefined
                      }
                    />
                  </td>

                  {/* MK */}
                  <td className="px-3 py-2 text-center">
                    {row.family_role === "child" ? (
                      <MKBadge
                        value={row.mk_program}
                        onClick={canEdit ? () => cycleMK(row) : undefined}
                      />
                    ) : (
                      <span
                        className="text-gray-200 text-xs select-none"
                        title="자녀에게만 해당"
                      >
                        -
                      </span>
                    )}
                  </td>

                  {/* 마프참석 */}
                  <td className="px-3 py-2 text-center">
                    <OXBadge
                      value={row.attend_marf}
                      onClick={
                        canEdit
                          ? () =>
                              updateField(
                                row.id,
                                "attend_marf",
                                !row.attend_marf,
                              )
                          : undefined
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="text-xs text-gray-400 text-right">
          {isAdmin && "역할(대표/배우자/자녀) · "}O/X · 이동방법 클릭 시 즉시
          저장
        </div>
      )}
    </div>
  );
}
