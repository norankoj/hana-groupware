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
  /** 가족 그룹 식별자 (없으면 missionaryId 단일 가정) */
  familyGroup: string | null;
  /** 대표 선교사 id (family_group이 없을 때 단일 가정 식별용) */
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

/**
 * 선교사 가정별 환영팩 인쇄 모달.
 * - 도착·출국 일정 + 배정 숙소 + 배정 차량 + 주요 일정을 A4 1장에 보여줌
 * - 인쇄 시 헤더/푸터 외 모달만 출력되도록 print CSS 활용
 */
export default function WelcomePackModal({
  isOpen, onClose, projectId, projectName,
  familyGroup, representativeMissionaryId,
}: Props) {
  const supabase = createClient();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Missionary[]>([]);
  const [accoms, setAccoms] = useState<Accom[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [lang, setLang] = useState<"ko" | "en">("ko");

  useEffect(() => setMounted(true), []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    // 1. 가족 멤버들
    const memberQuery = familyGroup
      ? supabase.from("marf_missionaries")
          .select("*").eq("project_id", projectId).eq("family_group", familyGroup)
      : supabase.from("marf_missionaries")
          .select("*").eq("project_id", projectId).eq("id", representativeMissionaryId);
    const [{ data: mems }, { data: as }, { data: vs }, { data: scs }] = await Promise.all([
      memberQuery,
      supabase.from("marf_accommodations").select("*").eq("project_id", projectId),
      supabase.from("marf_vehicles").select("*").eq("project_id", projectId),
      supabase.from("marf_schedules").select("*").eq("project_id", projectId).order("event_date"),
    ]);
    const memberArr = (mems ?? []) as Missionary[];
    const memberIds = new Set(memberArr.map((m) => m.id));

    // 이 가족에 배정된 숙소/차량만 필터
    const myAccoms = (as ?? []).filter((a: Accom) => {
      const assigned = a.assignments ?? [];
      if (assigned.some((ae) => memberIds.has(ae.missionary_id))) return true;
      return a.assigned_missionary_id ? memberIds.has(a.assigned_missionary_id) : false;
    });
    const myVehicles = (vs ?? []).filter((v: Vehicle) => {
      const assigned = v.assignments ?? [];
      if (assigned.some((ae) => memberIds.has(ae.missionary_id))) return true;
      return v.assigned_missionary_id ? memberIds.has(v.assigned_missionary_id) : false;
    });

    setMembers(memberArr);
    setAccoms(myAccoms);
    setVehicles(myVehicles);
    setSchedules((scs ?? []) as ScheduleItem[]);
    setLoading(false);
  }, [familyGroup, projectId, representativeMissionaryId, supabase]);

  useEffect(() => {
    if (isOpen) fetchAll();
  }, [isOpen, fetchAll]);

  if (!isOpen || !mounted) return null;

  const rep = members.find((m) => m.id === representativeMissionaryId) ?? members[0];
  const familyLabel = rep
    ? (familyGroup || rep.name) + (members.length > 1 ? ` (${members.length}명)` : "")
    : "—";

  // 이 가족에 해당하는 배정 기간만 추출 (assignments JSONB에서)
  const memberIds = new Set(members.map((m) => m.id));
  const myAssigns = <T extends { assignments: AssignmentEntry[] | null; assigned_missionary_id: string | null; available_from: string | null; available_to: string | null }>(
    item: T,
  ): { from: string; to: string }[] => {
    if (item.assignments?.length) {
      return item.assignments
        .filter((a) => memberIds.has(a.missionary_id))
        .map((a) => ({ from: a.from, to: a.to }));
    }
    if (item.assigned_missionary_id && memberIds.has(item.assigned_missionary_id)) {
      return [{ from: item.available_from ?? "", to: item.available_to ?? "" }];
    }
    return [];
  };

  const handlePrint = () => window.print();

  const fmt = lang === "ko" ? fmtKDate : fmtEDate;
  const t = (k: string) => I18N[k][lang];

  return createPortal(
    <div className="welcome-pack-overlay fixed inset-0 z-[9999] flex items-start justify-center bg-black/50 p-4 overflow-y-auto print:bg-white print:p-0 print:block">
      <div className="welcome-pack-card bg-white w-full max-w-[800px] my-8 rounded-lg shadow-2xl print:shadow-none print:my-0 print:max-w-full print:rounded-none">
        {/* 헤더 - 인쇄 시 숨김 */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between print:hidden">
          <h2 className="text-lg font-bold text-gray-800">환영팩 인쇄 미리보기</h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-gray-200 overflow-hidden">
              <button
                onClick={() => setLang("ko")}
                className={`px-2.5 py-1 text-xs font-semibold ${lang === "ko" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >한국어</button>
              <button
                onClick={() => setLang("en")}
                className={`px-2.5 py-1 text-xs font-semibold border-l border-gray-200 ${lang === "en" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >English</button>
            </div>
            <button
              onClick={handlePrint}
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

        {/* 인쇄 영역 */}
        <div className="p-8 print:p-6 text-gray-800">
          {loading ? (
            <p className="text-center text-gray-400 py-10">불러오는 중...</p>
          ) : !rep ? (
            <p className="text-center text-gray-400 py-10">선교사 정보를 찾을 수 없습니다.</p>
          ) : (
            <>
              {/* 헤더 */}
              <div className="text-center pb-4 border-b-2 border-blue-600">
                <p className="text-xs font-semibold text-blue-600 mb-1">{projectName}</p>
                <h1 className="text-2xl font-bold text-gray-900">
                  {t("welcome")}, {familyLabel}
                </h1>
                <p className="text-sm text-gray-500 mt-1">{t("welcomeSub")}</p>
              </div>

              {/* 도착/출국 */}
              <Section title={t("travel")}>
                <div className="grid grid-cols-2 gap-4">
                  <InfoBox label={t("arrival")}>
                    {members.map((m) => (
                      <div key={m.id} className="text-sm">
                        <div className="font-semibold">{m.name}</div>
                        {m.arrival_date ? (
                          <>
                            <div>{fmt(m.arrival_date)} {m.arrival_time ?? ""}</div>
                            <div className="text-gray-600 text-xs">
                              {m.arrival_flight ?? ""}
                              {m.arrival_terminal ? ` · ${m.arrival_terminal}` : ""}
                            </div>
                          </>
                        ) : <span className="text-gray-400 text-xs">{t("noData")}</span>}
                      </div>
                    ))}
                  </InfoBox>
                  <InfoBox label={t("departure")}>
                    {members.map((m) => (
                      <div key={m.id} className="text-sm">
                        <div className="font-semibold">{m.name}</div>
                        {m.departure_date ? (
                          <>
                            <div>{fmt(m.departure_date)} {m.departure_time ?? ""}</div>
                            <div className="text-gray-600 text-xs">
                              {m.departure_flight ?? ""}
                              {m.departure_terminal ? ` · ${m.departure_terminal}` : ""}
                            </div>
                          </>
                        ) : <span className="text-gray-400 text-xs">{t("noData")}</span>}
                      </div>
                    ))}
                  </InfoBox>
                </div>
              </Section>

              {/* 숙소 */}
              <Section title={t("accom")}>
                {accoms.length === 0 ? (
                  <p className="text-sm text-gray-400">{t("noAccom")}</p>
                ) : accoms.map((a) => (
                  <div key={a.id} className="mb-3 last:mb-0 p-3 bg-emerald-50/40 border border-emerald-100 rounded">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-bold text-emerald-700">{a.provider_name}</span>
                      {a.provider_contact && <span className="text-xs text-gray-600">📞 {a.provider_contact}</span>}
                    </div>
                    {a.address && <div className="text-sm text-gray-700 mt-1">📍 {a.address}</div>}
                    <div className="mt-1.5 space-y-0.5">
                      {myAssigns(a).map((p, i) => (
                        <div key={i} className="text-xs text-gray-600">
                          📅 {fmt(p.from)} ~ {fmt(p.to)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </Section>

              {/* 차량 */}
              <Section title={t("vehicle")}>
                {vehicles.length === 0 ? (
                  <p className="text-sm text-gray-400">{t("noVehicle")}</p>
                ) : vehicles.map((v) => (
                  <div key={v.id} className="mb-3 last:mb-0 p-3 bg-sky-50/40 border border-sky-100 rounded">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-bold text-sky-700">{v.provider_name}</span>
                      {v.provider_contact && <span className="text-xs text-gray-600">📞 {v.provider_contact}</span>}
                      {!v.insurance_added && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold">{t("insurancePending")}</span>}
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                      🚗 {v.car_model ?? ""} {v.car_number ? `· ${v.car_number}` : ""}
                    </div>
                    <div className="mt-1.5 space-y-0.5">
                      {myAssigns(v).map((p, i) => (
                        <div key={i} className="text-xs text-gray-600">
                          📅 {fmt(p.from)} ~ {fmt(p.to)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </Section>

              {/* 주요 일정 (도착~출국 사이) */}
              <Section title={t("schedule")}>
                {(() => {
                  const stayFrom = members.map(m => m.arrival_date).filter(Boolean).sort()[0];
                  const stayTo   = members.map(m => m.departure_date).filter(Boolean).sort().at(-1);
                  const inStay = schedules.filter((s) => {
                    if (!stayFrom || !stayTo) return true;
                    return s.event_date >= stayFrom && s.event_date <= stayTo;
                  });
                  if (inStay.length === 0) return <p className="text-sm text-gray-400">{t("noSchedule")}</p>;
                  return (
                    <ul className="space-y-1.5">
                      {inStay.map((s) => (
                        <li key={s.id} className="text-sm flex items-start gap-2">
                          <span className="shrink-0 font-semibold text-gray-700 w-24">{fmt(s.event_date)}</span>
                          <span className="text-gray-600">
                            {s.start_time && <span className="mr-1">{s.start_time.slice(0,5)}</span>}
                            <span className="font-medium">{s.title}</span>
                            {s.location && <span className="text-gray-400 ml-1">@ {s.location}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </Section>

              <p className="text-center text-xs text-gray-400 pt-4 mt-6 border-t border-gray-100">
                {t("footer")}
              </p>
            </>
          )}
        </div>
      </div>

      {/* 인쇄 전용 스타일 */}
      <style jsx global>{`
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
          }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </div>,
    document.body,
  );
}

// ─── 작은 컴포넌트 ─────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="text-sm font-bold text-gray-700 mb-2 pb-1 border-b border-gray-200">{title}</h3>
      {children}
    </div>
  );
}

function InfoBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded p-2.5">
      <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">{label}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

// ─── 다국어 텍스트 ─────────────────────────────────────────────────────────
const I18N: Record<string, Record<"ko" | "en", string>> = {
  welcome:        { ko: "환영합니다",       en: "Welcome" },
  welcomeSub:     { ko: "한국에서 평안하고 복된 시간 되시길 기도합니다.", en: "We pray for a blessed and restful time in Korea." },
  travel:         { ko: "도착 / 출국",      en: "Arrival / Departure" },
  arrival:        { ko: "도착",             en: "Arrival" },
  departure:      { ko: "출국",             en: "Departure" },
  accom:          { ko: "숙소 정보",        en: "Accommodation" },
  vehicle:        { ko: "차량 정보",        en: "Vehicle" },
  schedule:       { ko: "주요 일정",        en: "Schedule" },
  noAccom:        { ko: "배정된 숙소가 없습니다.",     en: "No accommodation assigned." },
  noVehicle:      { ko: "배정된 차량이 없습니다.",     en: "No vehicle assigned." },
  noSchedule:     { ko: "예정된 일정이 없습니다.",     en: "No scheduled events." },
  noData:         { ko: "정보 없음",        en: "No data" },
  insurancePending: { ko: "보험 등록 중",   en: "Insurance pending" },
  footer:         { ko: "문의: 수원하나교회 MARF 준비팀", en: "Contact: Suwon Hana Church MARF Team" },
};
