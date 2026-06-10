"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/utils/supabase/client";
import { fmtKDate, fmtEDate } from "@/utils/messageTemplates";
import { type AssignmentEntry } from "@/components/projects/AccommodationTab";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  familyGroup: string | null;
  representativeMissionaryId: string;
};

type Missionary = {
  id: string;
  name: string;
  family_group: string | null;
  phone: string | null;
  arrival_date: string | null;
  arrival_time: string | null;
  arrival_flight: string | null;
  arrival_terminal: string | null;
  departure_date: string | null;
  departure_time: string | null;
  departure_flight: string | null;
  departure_terminal: string | null;
};

type Accom = {
  id: string;
  provider_name: string;
  provider_contact: string | null;
  address: string | null;
  assignments: AssignmentEntry[] | null;
  assigned_missionary_id: string | null;
  available_from: string | null;
  available_to: string | null;
};

type Vehicle = {
  id: string;
  provider_name: string;
  provider_contact: string | null;
  car_model: string | null;
  car_number: string | null;
  insurance_added: boolean;
  insurance_company: string | null;
  insurance_number: string | null;
  assignments: AssignmentEntry[] | null;
  assigned_missionary_id: string | null;
  available_from: string | null;
  available_to: string | null;
};

type ScheduleItem = {
  id: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  location: string | null;
};

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function fmtShort(iso: string | null | undefined) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const day = DAY_KO[new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${day})`;
}

/** 텍스트 줄 안의 URL을 <a> 태그로 변환 */
function LineWithLinks({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.replace(/^[•·\-]\s*/, "").split(urlRegex);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-blue-600 underline underline-offset-2 hover:text-blue-800 break-all"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function NotesList({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim());
  if (!lines.length) return null;
  return (
    <div className="wp-notes-box mt-2.5 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
      <p className="wp-notes-title text-[11px] font-bold text-amber-600 mb-2 tracking-wide">💡 특이사항</p>
      <ul className="space-y-1.5">
        {lines.map((line, i) => (
          <li key={i} className="text-[13px] flex items-start gap-2 text-gray-700 leading-relaxed">
            <span className="shrink-0 text-amber-400 mt-px">•</span>
            <span className="flex-1 break-all"><LineWithLinks text={line} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DEFAULT_VEHICLE_INTRO =
  "이번 선교대회 기간에는 많은 분들이 한국에 입국하시는 관계로 차량 운영에 변동이 있을 수 있는 점 양해 부탁드립니다. 가능한 원활하게 안내드릴 수 있도록 최선을 다하겠습니다.";

export default function WelcomePackModal({
  isOpen, onClose, projectId, projectName,
  familyGroup, representativeMissionaryId,
}: Props) {
  const supabase = createClient();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<Missionary[]>([]);
  const [accoms, setAccoms] = useState<Accom[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [lang, setLang] = useState<"ko" | "en">("ko");

  // 특이사항 / 표시이름 상태
  const [accomNotes, setAccomNotes] = useState<Record<string, string>>({});
  const [vehicleIntro, setVehicleIntro] = useState(DEFAULT_VEHICLE_INTRO);
  const [vehicleNote, setVehicleNote] = useState("");
  const [displayName, setDisplayName] = useState(""); // 비어있으면 자동 생성 이름 사용

  // 팝업 편집 상태
  const [editPopup, setEditPopup] = useState<"accom" | "vehicle" | "header" | null>(null);

  // 가족 키 (welcome_pack_meta 내 per-family 저장용)
  const familyKey = familyGroup?.trim() || representativeMissionaryId;

  useEffect(() => setMounted(true), []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const memberQuery = familyGroup
      ? supabase.from("marf_missionaries").select("*").eq("project_id", projectId).eq("family_group", familyGroup)
      : supabase.from("marf_missionaries").select("*").eq("project_id", projectId).eq("id", representativeMissionaryId);

    const fKey = familyGroup?.trim() || representativeMissionaryId;

    const [{ data: mems }, { data: as }, { data: vs }, scsResult, { data: proj }] = await Promise.all([
      memberQuery,
      supabase.from("marf_accommodations").select("*").eq("project_id", projectId),
      supabase.from("marf_vehicles").select("*").eq("project_id", projectId),
      supabase.from("marf_schedules").select("*").eq("project_id", projectId).order("event_date"),
      supabase.from("projects").select("welcome_pack_meta").eq("id", projectId).maybeSingle(),
    ]);

    const memberArr = (mems ?? []) as Missionary[];
    const memberIds = new Set(memberArr.map((m) => m.id));
    const myAccoms = (as ?? []).filter((a: Accom) => {
      if ((a.assignments ?? []).some((ae) => memberIds.has(ae.missionary_id))) return true;
      return a.assigned_missionary_id ? memberIds.has(a.assigned_missionary_id) : false;
    });
    const myVehicles = (vs ?? []).filter((v: Vehicle) => {
      if ((v.assignments ?? []).some((ae) => memberIds.has(ae.missionary_id))) return true;
      return v.assigned_missionary_id ? memberIds.has(v.assigned_missionary_id) : false;
    });

    // welcome_pack_meta에서 저장된 값 복원
    const meta = (proj?.welcome_pack_meta ?? {}) as Record<string, unknown>;
    setAccomNotes((meta.accomNotes as Record<string, string>) ?? {});
    setVehicleIntro((meta.vehicleIntro as string) ?? DEFAULT_VEHICLE_INTRO);
    setVehicleNote(((meta.vehicleNotes as Record<string, string>)?.[fKey]) ?? "");
    setDisplayName(((meta.displayNames as Record<string, string>)?.[fKey]) ?? "");

    setMembers(memberArr);
    setAccoms(myAccoms);
    setVehicles(myVehicles);
    setSchedules(scsResult.error ? [] : ((scsResult.data ?? []) as ScheduleItem[]));
    setLoading(false);
  }, [familyGroup, projectId, representativeMissionaryId, supabase]);

  // 특이사항 저장
  const handleSave = useCallback(async () => {
    setSaving(true);
    const { data: proj } = await supabase
      .from("projects")
      .select("welcome_pack_meta")
      .eq("id", projectId)
      .maybeSingle();
    const meta = (proj?.welcome_pack_meta ?? {}) as Record<string, unknown>;
    const newMeta = {
      ...meta,
      vehicleIntro,
      accomNotes:   { ...(meta.accomNotes   as object ?? {}), ...accomNotes },
      vehicleNotes: { ...(meta.vehicleNotes as object ?? {}), [familyKey]: vehicleNote },
      displayNames: { ...(meta.displayNames as object ?? {}), [familyKey]: displayName },
    };
    await supabase.from("projects").update({ welcome_pack_meta: newMeta }).eq("id", projectId);
    setSaving(false);
    setEditPopup(null);
  }, [supabase, projectId, vehicleIntro, accomNotes, vehicleNote, familyKey]);

  useEffect(() => {
    if (isOpen) fetchAll();
  }, [isOpen, fetchAll]);

  if (!isOpen || !mounted) return null;

  const rep = members.find((m) => m.id === representativeMissionaryId) ?? members[0];

  // 헤더 표시 이름: 수동 설정 우선, 없으면 자동(첫 2명)
  const adultMembers = members.filter((m) => m.arrival_date);
  const coupleMembers = (adultMembers.length >= 2 ? adultMembers : members).slice(0, 2);
  const autoFamilyLabel = coupleMembers.length > 0 ? coupleMembers.map((m) => m.name).join("·") : "—";
  const familyLabel = displayName.trim() || autoFamilyLabel;

  const memberIds = new Set(members.map((m) => m.id));
  const myAssigns = <T extends {
    assignments: AssignmentEntry[] | null;
    assigned_missionary_id: string | null;
    available_from: string | null;
    available_to: string | null;
  }>(item: T): { from: string; to: string }[] => {
    if (item.assignments?.length) {
      return item.assignments.filter((a) => memberIds.has(a.missionary_id)).map((a) => ({ from: a.from, to: a.to }));
    }
    if (item.assigned_missionary_id && memberIds.has(item.assigned_missionary_id)) {
      return [{ from: item.available_from ?? "", to: item.available_to ?? "" }];
    }
    return [];
  };

  const fmt = lang === "ko" ? fmtKDate : fmtEDate;
  const t = (k: string) => I18N[k]?.[lang] ?? k;

  return createPortal(
    <div className="welcome-pack-overlay fixed inset-0 z-[9999] flex items-start justify-center bg-black/50 p-4 overflow-y-auto print:bg-white print:p-0 print:block">
      <div className="welcome-pack-card relative bg-white w-full max-w-[820px] my-8 rounded-lg shadow-2xl print:shadow-none print:my-0 print:max-w-full print:rounded-none">

        {/* ── 모달 헤더 (print:hidden) ── */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between print:hidden">
          <h2 className="text-lg font-bold text-gray-800">환영팩 미리보기</h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-gray-200 overflow-hidden">
              <button onClick={() => setLang("ko")} className={`px-2.5 py-1 text-xs font-semibold ${lang === "ko" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>한국어</button>
              <button onClick={() => setLang("en")} className={`px-2.5 py-1 text-xs font-semibold border-l border-gray-200 ${lang === "en" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>English</button>
            </div>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              인쇄
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── 인쇄 본문 ── */}
        <div className="wp-body p-10 print:p-8 text-gray-800">
          {loading ? (
            <p className="text-center text-gray-400 py-10">불러오는 중...</p>
          ) : !rep ? (
            <p className="text-center text-gray-400 py-10">선교사 정보를 찾을 수 없습니다.</p>
          ) : (
            <>
              {/* ── 헤더 ── */}
              <div className="mb-8">
                <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-blue-500 mb-3">{projectName}</p>
                <div className="flex items-center gap-2 group">
                  <h1 className="text-[28px] font-bold text-gray-900 leading-tight mb-1">
                    {t("welcome")}, {familyLabel} {lang === "ko" ? "선생님" : ""}
                  </h1>
                  <button
                    onClick={() => setEditPopup("header")}
                    className="print:hidden mb-1 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-blue-500 transition p-1 rounded"
                    title="이름 수정"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
                <div className="mt-3 space-y-0.5 text-[14px] text-gray-500 leading-relaxed">
                  <p>{t("welcomeSub")}</p>
                  <p>{t("welcomeSub2")}</p>
                </div>
                <div className="mt-5 border-t border-gray-200" />
              </div>

              {/* ── 도착 / 출국 ── */}
              <DocSection title={t("travel")}>
                <div className="grid grid-cols-2 gap-3">
                  <InfoBox label={t("arrival")}>
                    {members.map((m) => (
                      <div key={m.id} className="text-[13px] leading-relaxed">
                        <span className="font-semibold text-gray-800">{m.name}</span>
                        {m.arrival_date ? (
                          <div className="text-gray-600 mt-0.5">
                            {fmt(m.arrival_date)}{m.arrival_time ? ` · ${m.arrival_time.slice(0, 5)}` : ""}
                            {(m.arrival_flight || m.arrival_terminal) && (
                              <span className="text-gray-400 ml-1 text-xs">{m.arrival_flight ?? ""}{m.arrival_terminal ? ` · ${m.arrival_terminal}` : ""}</span>
                            )}
                          </div>
                        ) : <div className="text-gray-400 text-xs mt-0.5">{t("noData")}</div>}
                      </div>
                    ))}
                  </InfoBox>
                  <InfoBox label={t("departure")}>
                    {members.map((m) => (
                      <div key={m.id} className="text-[13px] leading-relaxed">
                        <span className="font-semibold text-gray-800">{m.name}</span>
                        {m.departure_date ? (
                          <div className="text-gray-600 mt-0.5">
                            {fmt(m.departure_date)}{m.departure_time ? ` · ${m.departure_time.slice(0, 5)}` : ""}
                            {(m.departure_flight || m.departure_terminal) && (
                              <span className="text-gray-400 ml-1 text-xs">{m.departure_flight ?? ""}{m.departure_terminal ? ` · ${m.departure_terminal}` : ""}</span>
                            )}
                          </div>
                        ) : <div className="text-gray-400 text-xs mt-0.5">{t("noData")}</div>}
                      </div>
                    ))}
                  </InfoBox>
                </div>
              </DocSection>

              {/* ── 숙소관련 ── */}
              <DocSection
                title={t("accom")}
                onEdit={accoms.length > 0 ? () => setEditPopup("accom") : undefined}
              >
                {accoms.length === 0 ? (
                  <p className="text-[13px] text-gray-400">{t("noAccom")}</p>
                ) : [...accoms]
                    .sort((a, b) => {
                      const af = myAssigns(a).map(p => p.from).filter(Boolean).sort()[0] ?? "";
                      const bf = myAssigns(b).map(p => p.from).filter(Boolean).sort()[0] ?? "";
                      return af.localeCompare(bf);
                    })
                    .map((a, idx) => {
                  const periods = myAssigns(a);
                  return (
                    <div key={a.id} className="mb-5 last:mb-0">
                      <p className="text-[14px] font-bold text-gray-800 mb-2">
                        <span className="text-blue-400 mr-1">{idx + 1}.</span> {a.provider_name}
                      </p>
                      <div className="ml-3 space-y-1 text-[13px] text-gray-600">
                        {periods.length > 0 && (
                          <p><span className="text-gray-400 w-12 inline-block">기간</span>{periods.map((p) => `${fmtShort(p.from)} ~ ${fmtShort(p.to)}`).join(", ")}</p>
                        )}
                        {a.address && <p><span className="text-gray-400 w-12 inline-block">주소</span>{a.address}</p>}
                        {a.provider_contact && <p><span className="text-gray-400 w-12 inline-block">연락처</span>{a.provider_contact}</p>}
                      </div>
                      <div className="ml-3 mt-1">
                        <NotesList text={accomNotes[a.id] || ""} />
                      </div>
                    </div>
                  );
                })}
              </DocSection>

              {/* ── 차량관련 ── */}
              <DocSection
                title={t("vehicle")}
                onEdit={vehicles.length > 0 ? () => setEditPopup("vehicle") : undefined}
              >
                {vehicles.length === 0 ? (
                  <p className="text-[13px] text-gray-400">{t("noVehicle")}</p>
                ) : (
                  <>
                    {vehicleIntro.trim() && (
                      <p className="text-[13px] text-gray-600 mb-4 leading-relaxed">{vehicleIntro}</p>
                    )}
                    <p className="text-[14px] font-semibold text-gray-700 mb-2">차량배치 일정</p>
                    <div className="mb-3 overflow-x-auto">
                      <table className="w-full border-collapse text-[14px]">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="border border-gray-200 px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">기간</th>
                            <th className="border border-gray-200 px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">차량 / 제공자</th>
                            <th className="border border-gray-200 px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">보험사</th>
                            <th className="border border-gray-200 px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">보험사 연락처</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vehicles
                            .flatMap((v) => myAssigns(v).map((p) => ({ p, v })))
                            .sort((a, b) => (a.p.from ?? "").localeCompare(b.p.from ?? ""))
                            .map(({ p, v }, i) => (
                              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                                <td className="border border-gray-200 px-3 py-2 whitespace-nowrap font-medium text-gray-800">
                                  {fmtShort(p.from)} ~ {fmtShort(p.to)}
                                </td>
                                <td className="border border-gray-200 px-3 py-2">
                                  <span className="font-semibold text-gray-800">{v.provider_name}</span>
                                  {v.car_model && (
                                    <span className="text-gray-500 ml-1">
                                      ({v.car_model}{v.car_number ? ` · ${v.car_number}` : ""})
                                    </span>
                                  )}
                                </td>
                                <td className="border border-gray-200 px-3 py-2 text-gray-700">
                                  {v.insurance_company || <span className="text-gray-300">—</span>}
                                </td>
                                <td className="border border-gray-200 px-3 py-2 text-gray-700">
                                  {v.insurance_number || <span className="text-gray-300">—</span>}
                                </td>
                              </tr>
                            ))
                          }
                        </tbody>
                      </table>
                    </div>
                    <NotesList text={vehicleNote} />
                  </>
                )}
              </DocSection>

              {/* ── 주요 일정 ── */}
              {schedules.length > 0 && (() => {
                const stayFrom = members.map((m) => m.arrival_date).filter(Boolean).sort()[0];
                const stayTo   = members.map((m) => m.departure_date).filter(Boolean).sort().at(-1);
                const inStay = schedules.filter((s) => {
                  if (!stayFrom || !stayTo) return true;
                  return s.event_date >= stayFrom && s.event_date <= stayTo;
                });
                if (!inStay.length) return null;
                return (
                  <DocSection title={t("schedule")}>
                    <div className="space-y-2">
                      {inStay.map((s) => (
                        <div key={s.id} className="flex items-baseline gap-3 text-[13px]">
                          <span className="shrink-0 text-gray-500 w-28">{fmt(s.event_date)}</span>
                          <span>
                            {s.start_time && <span className="text-gray-400 mr-1.5">{s.start_time.slice(0, 5)}</span>}
                            <span className="font-semibold text-gray-800">{s.title}</span>
                            {s.location && <span className="text-gray-400 ml-1.5">@ {s.location}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </DocSection>
                );
              })()}

            </>
          )}
        </div>

        {/* ── 헤더 이름 편집 팝업 (print:hidden) ── */}
        {editPopup === "header" && (
          <EditPopup
            title="헤더 이름 수정"
            hint="비워두면 자동으로 첫 2명 이름이 표시됩니다"
            onClose={() => setEditPopup(null)}
            onSave={handleSave}
            saving={saving}
          >
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">표시 이름</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={`자동: ${autoFamilyLabel}`}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 focus:outline-none"
              />
              <p className="text-xs text-gray-400 mt-1.5">예: 김영숙 · 김민준 &nbsp;/&nbsp; 홍길동 가정</p>
            </div>
          </EditPopup>
        )}

        {/* ── 숙소 특이사항 편집 팝업 (print:hidden) ── */}
        {editPopup === "accom" && (
          <EditPopup
            title="숙소 특이사항 편집"
            hint="줄마다 항목 하나로 표시됩니다"
            onClose={() => setEditPopup(null)}
            onSave={handleSave}
            saving={saving}
          >
            {accoms.map((a) => (
              <div key={a.id} className="mb-4 last:mb-0">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  🏠 {a.provider_name}
                </label>
                <textarea
                  value={accomNotes[a.id] || ""}
                  onChange={(e) => setAccomNotes((prev) => ({ ...prev, [a.id]: e.target.value }))}
                  rows={4}
                  placeholder={"호텔이라 취식이 불가합니다. (전자렌지 비치 X)\n세탁실은 B2에 위치해있습니다.\n입실시 수건/세탁바구니는 저희가 비치해두겠습니다."}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-blue-400 focus:outline-none"
                />
              </div>
            ))}
          </EditPopup>
        )}

        {/* ── 차량 특이사항 편집 팝업 (print:hidden) ── */}
        {editPopup === "vehicle" && (
          <EditPopup
            title="차량 안내 편집"
            hint="줄마다 항목 하나로 표시됩니다"
            onClose={() => setEditPopup(null)}
            onSave={handleSave}
            saving={saving}
          >
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">소개글</label>
              <textarea
                value={vehicleIntro}
                onChange={(e) => setVehicleIntro(e.target.value)}
                rows={3}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">💡 특이사항</label>
              <textarea
                value={vehicleNote}
                onChange={(e) => setVehicleNote(e.target.value)}
                rows={5}
                placeholder={"교회모닝은 엘로라호텔에 배치\n→ 반납은 6/14일 17시에 교회로 해주시면 됩니다.\n아반떼 15일 교육관 주차장에 비치\n→ 반납은 7/8일 교육관 주차장에 해주시면 됩니다.\n렌트카는 추후 말씀드리도록 하겠습니다."}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-blue-400 focus:outline-none"
              />
            </div>
          </EditPopup>
        )}
      </div>

      {/* 프리텐다드 폰트 + 인쇄 CSS */}
      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css');

        .wp-body, .wp-body * {
          font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
        }

        @media print {
          body * { visibility: hidden !important; }
          .welcome-pack-overlay, .welcome-pack-overlay * { visibility: visible !important; }
          .welcome-pack-overlay {
            position: absolute !important;
            inset: 0 !important;
            background: white !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          .welcome-pack-card {
            box-shadow: none !important;
            margin: 0 !important;
            max-width: 100% !important;
            border-radius: 0 !important;
          }
          /* 배경색·테두리 강제 인쇄 */
          .welcome-pack-card * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* 섹션 간격 */
          .wp-section { margin-bottom: 20px !important; page-break-inside: avoid; }
          /* 특이사항 박스 */
          .wp-notes-box {
            background-color: #fffbeb !important;
            border: 1px solid #fde68a !important;
            border-radius: 8px !important;
            padding: 10px 14px !important;
            margin-top: 8px !important;
            page-break-inside: avoid;
          }
          .wp-notes-box .wp-notes-title {
            font-size: 11px !important;
            font-weight: 700 !important;
            color: #d97706 !important;
            margin-bottom: 6px !important;
            letter-spacing: 0.05em !important;
          }
          .wp-notes-box li {
            font-size: 12px !important;
            color: #374151 !important;
            display: flex !important;
            align-items: flex-start !important;
            gap: 6px !important;
            margin-bottom: 3px !important;
            line-height: 1.6 !important;
          }
          @page { margin: 1.8cm 2cm; }
        }
      `}</style>
    </div>,
    document.body,
  );
}

// ─── 편집 팝업 (모달 내 오버레이) ─────────────────────────────────────────
function EditPopup({
  title, hint, onClose, onSave, saving, children,
}: {
  title: string;
  hint?: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="print:hidden absolute inset-0 z-20 flex items-center justify-center bg-black/30 rounded-lg"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* 팝업 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-800 text-sm">{title}</h3>
            {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* 팝업 내용 */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {children}
        </div>
        {/* 팝업 푸터 */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-lg hover:bg-gray-100 transition"
          >
            취소
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DocSection ──────────────────────────────────────────────────────────────
function DocSection({
  title, children, onEdit,
}: {
  title: string;
  children: React.ReactNode;
  onEdit?: () => void;
}) {
  return (
    <div className="wp-section mb-7">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-[3px] h-4 bg-blue-500 rounded-full shrink-0" />
          <h3 className="text-[13px] font-bold text-gray-700 tracking-wide">{title}</h3>
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            className="print:hidden flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-50 transition"
            title="특이사항 편집"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span className="hidden sm:inline">편집</span>
          </button>
        )}
      </div>
      <div className="ml-[11px] pl-4 border-l border-gray-100">
        {children}
      </div>
    </div>
  );
}

function InfoBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3.5 border border-gray-100">
      <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2.5">{label}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// ─── i18n ──────────────────────────────────────────────────────────────────
const I18N: Record<string, Record<"ko" | "en", string>> = {
  welcome:     { ko: "환영합니다",          en: "Welcome" },
  welcomeSub:  { ko: "샬롬! 한국에 방문하신 선생님들을 환영합니다.", en: "Shalom! We warmly welcome you to Korea." },
  welcomeSub2: { ko: "한국 일정과 관련하여 숙소 및 차량 안내를 아래와 같이 전달 드립니다.", en: "Please find below the accommodation and vehicle information for your stay." },
  travel:      { ko: "도착 / 출국 정보",    en: "Travel Info" },
  arrival:     { ko: "도착",               en: "Arrival" },
  departure:   { ko: "출국",               en: "Departure" },
  accom:       { ko: "숙소 안내",           en: "Accommodation" },
  vehicle:     { ko: "차량 안내",           en: "Vehicle" },
  schedule:    { ko: "주요 일정",           en: "Schedule" },
  noAccom:     { ko: "배정된 숙소가 없습니다.",     en: "No accommodation assigned." },
  noVehicle:   { ko: "배정된 차량이 없습니다.",     en: "No vehicle assigned." },
  noData:      { ko: "정보 없음",           en: "No data" },
};
