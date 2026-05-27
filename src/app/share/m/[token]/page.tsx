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
  amenities: string[] | null;
  notes: string | null;
};
type Vehicle = {
  id: string;
  provider_name: string;
  provider_contact: string | null;
  car_model: string | null;
  car_number: string | null;
  insurance_added: boolean;
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
  description: string | null;
};

type ShareData = {
  project: Project;
  family: Member[];
  accommodations: Accom[];
  vehicles: Vehicle[];
  schedules: Schedule[];
};

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

  const fmt = lang === "ko" ? fmtKDate : fmtEDate;
  const t = (k: keyof typeof I18N) => I18N[k][lang];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">불러오는 중...</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-xl shadow-md max-w-sm w-full p-6 text-center">
          <p className="text-base font-semibold text-gray-800 mb-1">😔</p>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  const memberIds = new Set(data.family.map((m) => m.id));

  // 가족에 해당하는 배정 기간만 추출
  const myAssigns = <T extends { assignments: AssignmentEntry[] | null; available_from: string | null; available_to: string | null }>(item: T) => {
    if (item.assignments?.length) {
      return item.assignments
        .filter((a) => memberIds.has(a.missionary_id))
        .map((a) => ({ from: a.from, to: a.to }));
    }
    return [{ from: item.available_from ?? "", to: item.available_to ?? "" }];
  };

  const stayFrom = data.family.map(m => m.arrival_date).filter(Boolean).sort()[0];
  const stayTo   = data.family.map(m => m.departure_date).filter(Boolean).sort().at(-1);
  const inStaySchedules = data.schedules.filter((s) => {
    if (!stayFrom || !stayTo) return true;
    return s.event_date >= stayFrom && s.event_date <= stayTo;
  });

  const familyName = data.family[0]?.family_group ?? data.family[0]?.name ?? "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-xl mx-auto px-4 py-6">
        {/* 상단 헤더 */}
        <header className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[11px] font-semibold text-blue-600">{data.project.name}</p>
            <h1 className="text-xl font-bold text-gray-900">
              {t("welcome")}, {familyName}!
            </h1>
          </div>
          <div className="flex rounded-md border border-gray-200 overflow-hidden bg-white">
            <button onClick={() => setLang("ko")} className={`px-2.5 py-1 text-xs font-semibold ${lang==="ko" ? "bg-blue-600 text-white" : "text-gray-600"}`}>한국어</button>
            <button onClick={() => setLang("en")} className={`px-2.5 py-1 text-xs font-semibold border-l border-gray-200 ${lang==="en" ? "bg-blue-600 text-white" : "text-gray-600"}`}>EN</button>
          </div>
        </header>

        {/* 여행 정보 */}
        <Section title={t("travel")}>
          {data.family.map((m) => (
            <div key={m.id} className="mb-3 last:mb-0 pb-3 last:pb-0 border-b border-gray-100 last:border-0">
              <div className="font-semibold text-sm text-gray-800 mb-1">{m.name}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <Info label={t("arrival")} icon="✈️">
                  {m.arrival_date ? (
                    <>
                      <div>{fmt(m.arrival_date)} {m.arrival_time && <span className="text-gray-500">{m.arrival_time.slice(0,5)}</span>}</div>
                      {(m.arrival_flight || m.arrival_terminal) && (
                        <div className="text-gray-500">{m.arrival_flight ?? ""}{m.arrival_terminal ? ` · ${m.arrival_terminal}` : ""}</div>
                      )}
                    </>
                  ) : <span className="text-gray-400">{t("noData")}</span>}
                </Info>
                <Info label={t("departure")} icon="🛫">
                  {m.departure_date ? (
                    <>
                      <div>{fmt(m.departure_date)} {m.departure_time && <span className="text-gray-500">{m.departure_time.slice(0,5)}</span>}</div>
                      {(m.departure_flight || m.departure_terminal) && (
                        <div className="text-gray-500">{m.departure_flight ?? ""}{m.departure_terminal ? ` · ${m.departure_terminal}` : ""}</div>
                      )}
                    </>
                  ) : <span className="text-gray-400">{t("noData")}</span>}
                </Info>
              </div>
            </div>
          ))}
        </Section>

        {/* 숙소 */}
        <Section title={t("accom")}>
          {data.accommodations.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noAccom")}</p>
          ) : data.accommodations.map((a) => (
            <div key={a.id} className="mb-3 last:mb-0 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-bold text-emerald-700">🏠 {a.provider_name}</span>
                {a.provider_contact && (
                  <a href={`tel:${a.provider_contact}`} className="text-xs text-blue-600 underline">
                    📞 {a.provider_contact}
                  </a>
                )}
              </div>
              {a.address && (
                <div className="text-sm text-gray-700 mt-1 flex items-start gap-1">
                  📍 <span className="flex-1">{a.address}</span>
                </div>
              )}
              <div className="mt-1.5 space-y-0.5">
                {myAssigns(a).map((p, i) => (
                  <div key={i} className="text-xs text-gray-600">
                    📅 {fmt(p.from)} ~ {fmt(p.to)}
                  </div>
                ))}
              </div>
              {a.amenities?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {a.amenities.map((am) => (
                    <span key={am} className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{am}</span>
                  ))}
                </div>
              ) : null}
              {a.notes && <p className="mt-2 text-xs text-gray-500 whitespace-pre-wrap">{a.notes}</p>}
            </div>
          ))}
        </Section>

        {/* 차량 */}
        <Section title={t("vehicle")}>
          {data.vehicles.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noVehicle")}</p>
          ) : data.vehicles.map((v) => (
            <div key={v.id} className="mb-3 last:mb-0 p-3 bg-sky-50 border border-sky-100 rounded-lg">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-bold text-sky-700">🚗 {v.provider_name}</span>
                {v.provider_contact && (
                  <a href={`tel:${v.provider_contact}`} className="text-xs text-blue-600 underline">
                    📞 {v.provider_contact}
                  </a>
                )}
                {!v.insurance_added && (
                  <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold">
                    {t("insurancePending")}
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-700 mt-1">
                {v.car_model ?? ""}{v.car_number ? ` · ${v.car_number}` : ""}
              </div>
              <div className="mt-1.5 space-y-0.5">
                {myAssigns(v).map((p, i) => (
                  <div key={i} className="text-xs text-gray-600">
                    📅 {fmt(p.from)} ~ {fmt(p.to)}
                  </div>
                ))}
              </div>
              {v.notes && <p className="mt-2 text-xs text-gray-500 whitespace-pre-wrap">{v.notes}</p>}
            </div>
          ))}
        </Section>

        {/* 행사 일정 */}
        <Section title={t("schedule")}>
          {inStaySchedules.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noSchedule")}</p>
          ) : (
            <ul className="space-y-2">
              {inStaySchedules.map((s) => (
                <li key={s.id} className="flex items-start gap-2 text-sm">
                  <span className="shrink-0 w-20 font-semibold text-gray-600 text-xs">{fmt(s.event_date)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-800">
                      {s.start_time && <span className="text-xs text-gray-500 mr-1">{s.start_time.slice(0,5)}</span>}
                      {s.title}
                    </div>
                    {s.location && <div className="text-xs text-gray-500">@ {s.location}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <footer className="text-center text-[11px] text-gray-400 py-4">
          {t("footer")}
        </footer>
      </div>
    </div>
  );
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-3">
      <h2 className="text-sm font-bold text-gray-700 mb-2.5 pb-2 border-b border-gray-100">{title}</h2>
      {children}
    </section>
  );
}

function Info({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded p-2">
      <div className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">{icon} {label}</div>
      <div className="text-gray-800">{children}</div>
    </div>
  );
}

// ─── i18n ──────────────────────────────────────────────────────────────────
const I18N = {
  welcome:           { ko: "환영합니다", en: "Welcome" },
  travel:            { ko: "도착 / 출국 정보", en: "Travel Info" },
  arrival:           { ko: "도착", en: "Arrival" },
  departure:         { ko: "출국", en: "Departure" },
  accom:             { ko: "숙소", en: "Accommodation" },
  vehicle:           { ko: "차량", en: "Vehicle" },
  schedule:          { ko: "주요 일정", en: "Schedule" },
  noAccom:           { ko: "배정된 숙소가 없습니다.", en: "No accommodation assigned." },
  noVehicle:         { ko: "배정된 차량이 없습니다.", en: "No vehicle assigned." },
  noSchedule:        { ko: "예정된 일정이 없습니다.", en: "No scheduled events." },
  noData:            { ko: "정보 없음", en: "No data" },
  insurancePending:  { ko: "보험 등록 중", en: "Insurance pending" },
  footer:            { ko: "수원하나교회 MARF 준비팀", en: "Suwon Hana Church MARF Team" },
} as const;
