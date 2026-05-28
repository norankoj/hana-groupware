"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { fmtKDate, fmtEDate } from "@/utils/messageTemplates";
import type { AssignmentEntry } from "@/components/projects/AccommodationTab";

type Project = { id: string; name: string };
type Member = {
  id: string;
  name: string;
  family_group: string | null;
  arrival_date: string | null;
  arrival_time: string | null;
  arrival_flight: string | null;
  arrival_terminal: string | null;
  departure_date: string | null;
  departure_time: string | null;
  departure_flight: string | null;
  departure_terminal: string | null;
  phone: string | null;
};
type Accom = {
  id: string;
  provider_name: string;
  provider_contact: string | null;
  address: string | null;
  available_from: string | null;
  available_to: string | null;
  assignments: AssignmentEntry[] | null;
  notes: string | null;
};
type Vehicle = {
  id: string;
  provider_name: string;
  provider_contact: string | null;
  car_model: string | null;
  car_number: string | null;
  available_from: string | null;
  available_to: string | null;
  assignments: AssignmentEntry[] | null;
  notes: string | null;
};
type Schedule = {
  id: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  location: string | null;
};

type ShareData = {
  project: Project;
  family: Member[];
  accommodations: Accom[];
  vehicles: Vehicle[];
  schedules: Schedule[];
};

// M/D 짧은 날짜
function fmtShort(iso: string | null | undefined) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${parseInt(m)}/${parseInt(d)}`;
}

// URL을 링크로 변환
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
            className="inline-flex items-center gap-0.5 text-blue-600 underline underline-offset-2 break-all"
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

// 노트 텍스트 → 💡 특이사항 박스
function NoteBox({ text }: { text: string | null }) {
  if (!text?.trim()) return null;
  const lines = text.split("\n").filter((l) => l.trim());
  return (
    <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
      <p className="text-[11px] font-bold text-gray-500 mb-1.5">💡 특이사항</p>
      <ul className="space-y-1">
        {lines.map((line, i) => (
          <li key={i} className="text-sm flex items-start gap-1.5 text-gray-700">
            <span className="shrink-0 mt-0.5">•</span>
            <span className="flex-1 break-all"><LineWithLinks text={line} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MissionarySharePage() {
  const supabase = createClient();
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<"ko" | "en">("ko");

  const fetchShare = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const { data: rpcData, error: rpcErr } = await supabase
      .rpc("get_missionary_share_data", { p_token: token });
    if (rpcErr || !rpcData) {
      setError("정보를 찾을 수 없습니다. 링크가 만료되었거나 잘못되었을 수 있습니다.");
      setLoading(false);
      return;
    }
    setData(rpcData as ShareData);
    setLoading(false);
  }, [token, supabase]);

  useEffect(() => { fetchShare(); }, [fetchShare]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-gray-400 text-sm">불러오는 중...</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 max-w-sm w-full p-6 text-center">
          <p className="text-2xl mb-2">😔</p>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  const fmt = lang === "ko" ? fmtKDate : fmtEDate;
  const t = (k: keyof typeof I18N) => I18N[k][lang];

  const memberIds = new Set(data.family.map((m) => m.id));
  const myAssigns = <T extends { assignments: AssignmentEntry[] | null; available_from: string | null; available_to: string | null }>(item: T) => {
    if (item.assignments?.length) {
      return item.assignments.filter((a) => memberIds.has(a.missionary_id)).map((a) => ({ from: a.from, to: a.to }));
    }
    return [{ from: item.available_from ?? "", to: item.available_to ?? "" }];
  };

  // 부부(성인) 이름 — arrival_date 있는 멤버 최대 2명
  const adults = data.family.filter((m) => m.arrival_date);
  const coupleNames = (adults.length >= 2 ? adults : data.family).slice(0, 2).map((m) => m.name).join("·");

  const stayFrom = data.family.map((m) => m.arrival_date).filter(Boolean).sort()[0];
  const stayTo   = data.family.map((m) => m.departure_date).filter(Boolean).sort().at(-1);
  const inStaySchedules = data.schedules.filter((s) => {
    if (!stayFrom || !stayTo) return true;
    return s.event_date >= stayFrom && s.event_date <= stayTo;
  });

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-lg mx-auto px-5 py-6">

        {/* ── 헤더 ── */}
        <header className="pb-5 mb-1 border-b-2 border-blue-600">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-blue-600 tracking-widest uppercase mb-0.5">
                {data.project.name}
              </p>
              <h1 className="text-xl font-bold text-gray-900">
                {t("welcome")}, {coupleNames}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">{t("welcomeSub")}</p>
            </div>
            {/* 언어 전환 */}
            <div className="flex rounded-md border border-gray-200 overflow-hidden shrink-0 mt-0.5">
              <button onClick={() => setLang("ko")} className={`px-2.5 py-1 text-xs font-semibold transition ${lang === "ko" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}>한국어</button>
              <button onClick={() => setLang("en")} className={`px-2.5 py-1 text-xs font-semibold border-l border-gray-200 transition ${lang === "en" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}>EN</button>
            </div>
          </div>
        </header>

        {/* ── 도착 / 출국 ── */}
        <DocSection title={t("travel")}>
          <div className="space-y-4">
            {data.family.map((m) => (
              <div key={m.id}>
                <p className="font-semibold text-sm text-gray-800 mb-1.5">{m.name}</p>
                <div className="grid grid-cols-2 gap-2">
                  <TravelBox label={t("arrival")}>
                    {m.arrival_date ? (
                      <>
                        <div className="font-medium">{fmt(m.arrival_date)}</div>
                        {m.arrival_time && <div className="text-gray-500">{m.arrival_time.slice(0, 5)}</div>}
                        {(m.arrival_flight || m.arrival_terminal) && (
                          <div className="text-gray-500 text-[11px]">
                            {m.arrival_flight ?? ""}{m.arrival_terminal ? ` · ${m.arrival_terminal}` : ""}
                          </div>
                        )}
                      </>
                    ) : <span className="text-gray-400">{t("noData")}</span>}
                  </TravelBox>
                  <TravelBox label={t("departure")}>
                    {m.departure_date ? (
                      <>
                        <div className="font-medium">{fmt(m.departure_date)}</div>
                        {m.departure_time && <div className="text-gray-500">{m.departure_time.slice(0, 5)}</div>}
                        {(m.departure_flight || m.departure_terminal) && (
                          <div className="text-gray-500 text-[11px]">
                            {m.departure_flight ?? ""}{m.departure_terminal ? ` · ${m.departure_terminal}` : ""}
                          </div>
                        )}
                      </>
                    ) : <span className="text-gray-400">{t("noData")}</span>}
                  </TravelBox>
                </div>
              </div>
            ))}
          </div>
        </DocSection>

        {/* ── 숙소관련 ── */}
        {data.accommodations.length > 0 && (
          <DocSection title={t("accom")}>
            {data.accommodations.map((a, idx) => {
              const periods = myAssigns(a);
              return (
                <div key={a.id} className="mb-4 last:mb-0">
                  <p className="font-bold text-gray-900 mb-1.5">{idx + 1}. {a.provider_name}</p>
                  <ul className="ml-4 space-y-0.5 text-sm text-gray-700">
                    {periods.length > 0 && (
                      <li>• 기간 : {periods.map((p) => `${fmtShort(p.from)} ~ ${fmtShort(p.to)}`).join(", ")}</li>
                    )}
                    {a.address && (
                      <li className="flex items-start gap-1">
                        <span className="shrink-0">•</span>
                        <span>
                          주소 :{" "}
                          <a
                            href={`https://map.kakao.com/link/search/${encodeURIComponent(a.address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline underline-offset-2"
                          >
                            {a.address}
                          </a>
                        </span>
                      </li>
                    )}
                    {a.provider_contact && (
                      <li>
                        • 연락처 :{" "}
                        <a href={`tel:${a.provider_contact}`} className="text-blue-600 underline underline-offset-2">
                          {a.provider_contact}
                        </a>
                      </li>
                    )}
                  </ul>
                  <div className="ml-4">
                    <NoteBox text={a.notes} />
                  </div>
                </div>
              );
            })}
          </DocSection>
        )}

        {/* ── 차량관련 ── */}
        {data.vehicles.length > 0 && (
          <DocSection title={t("vehicle")}>
            {data.vehicles.map((v, idx) => {
              const periods = myAssigns(v);
              return (
                <div key={v.id} className="mb-4 last:mb-0">
                  <p className="font-bold text-gray-900 mb-1.5">{idx + 1}. {v.provider_name}</p>
                  <ul className="ml-4 space-y-0.5 text-sm text-gray-700">
                    {periods.length > 0 && (
                      <li>• 기간 : {periods.map((p) => `${fmtShort(p.from)} ~ ${fmtShort(p.to)}`).join(", ")}</li>
                    )}
                    {(v.car_model || v.car_number) && (
                      <li>• 차량 : {v.car_model ?? ""}{v.car_number ? ` (${v.car_number})` : ""}</li>
                    )}
                    {v.provider_contact && (
                      <li>
                        • 연락처 :{" "}
                        <a href={`tel:${v.provider_contact}`} className="text-blue-600 underline underline-offset-2">
                          {v.provider_contact}
                        </a>
                      </li>
                    )}
                  </ul>
                  <div className="ml-4">
                    <NoteBox text={v.notes} />
                  </div>
                </div>
              );
            })}
          </DocSection>
        )}

        {/* ── 주요 일정 ── */}
        {inStaySchedules.length > 0 && (
          <DocSection title={t("schedule")}>
            <ul className="space-y-2">
              {inStaySchedules.map((s) => (
                <li key={s.id} className="flex items-start gap-3 text-sm">
                  <span className="shrink-0 text-xs font-semibold text-gray-500 w-20 pt-0.5">{fmt(s.event_date)}</span>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {s.start_time && <span className="text-gray-400 font-normal mr-1.5">{s.start_time.slice(0, 5)}</span>}
                      {s.title}
                    </div>
                    {s.location && <div className="text-xs text-gray-500 mt-0.5">📍 {s.location}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </DocSection>
        )}

      </div>
    </div>
  );
}

// ─── 섹션 컴포넌트 ──────────────────────────────────────────────────────────
function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-extrabold text-gray-800 mb-3 pb-1.5 border-b-2 border-gray-200">
        {title}
      </h2>
      {children}
    </section>
  );
}

function TravelBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-lg p-2.5 bg-gray-50/50">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <div className="text-sm text-gray-800 space-y-0.5">{children}</div>
    </div>
  );
}

// ─── i18n ──────────────────────────────────────────────────────────────────
const I18N = {
  welcome:    { ko: "환영합니다",   en: "Welcome" },
  welcomeSub: { ko: "샬롬! 한국에 방문하신 선생님들을 환영합니다.", en: "Shalom! We warmly welcome you to Korea." },
  travel:     { ko: "[도착 / 출국 정보]", en: "[Travel Info]" },
  arrival:    { ko: "도착",         en: "Arrival" },
  departure:  { ko: "출국",         en: "Departure" },
  accom:      { ko: "[숙소관련]",   en: "[Accommodation]" },
  vehicle:    { ko: "[차량관련]",   en: "[Vehicle]" },
  schedule:   { ko: "[주요 일정]",  en: "[Schedule]" },
  noData:     { ko: "정보 없음",    en: "No data" },
} as const;
