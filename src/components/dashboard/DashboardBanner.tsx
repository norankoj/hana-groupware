"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import Modal from "@/components/Modal";

export type WeatherData = {
  temp: number;
  feelsLike: number;
  description: string;
  emoji: string;
  humidity: number;
  pm10: number | null;
  pm25: number | null;
  aqius: number | null;
  airGrade: { label: string; face: string; color: string } | null;
};

type AlarmItem = {
  id: string;
  badge: string;
  badgeColor: string;
  title: string;
  subtitle?: string;
  date: string;
  href: string;
};

type PopupReservation = {
  id: number;
  start_at: string;
  end_at: string;
  purpose: string;
  driver_name?: string | null;
  department?: string | null;
  destination?: string | null;
  profiles: { full_name?: string } | null;
  resources: { name?: string; category?: string } | null;
};

type PopupNotice = {
  id: number;
  title: string;
  category: string;
  created_at: string;
};

type PopupData = {
  facility: PopupReservation[];
  vehicle: PopupReservation[];
  notices: PopupNotice[];
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-gray-400 w-16 shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-sm text-gray-800 font-medium leading-snug">
        {value}
      </span>
    </div>
  );
}

const ALARM_BADGE_STYLE: Record<string, string> = {
  중요: "bg-red-50 text-red-600",
  공지: "bg-blue-50 text-blue-600",
  일반: "bg-gray-100 text-gray-500",
  차량: "bg-green-50 text-green-700",
  시설: "bg-purple-50 text-purple-600",
};

function AlarmDetailPopup({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<PopupData | null>(null);
  const [loading, setLoading] = useState(false);
  const [popover, setPopover] = useState<{
    reservation?: PopupReservation;
    notice?: PopupNotice;
    isVehicle?: boolean;
    rect: DOMRect;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setData(null);
    setPopover(null);
    const supabase = createClient();
    const now = new Date();

    // 오늘 범위 (차량용)
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    // 이번 달 범위 (시설용)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const facilitySelect =
      "id, start_at, end_at, purpose, profiles:user_id(full_name), resources:resource_id(name, category)";
    const vehicleSelect =
      "id, start_at, end_at, purpose, driver_name, department, destination, profiles:user_id(full_name), resources:resource_id(name, category)";

    Promise.all([
      // 시설 예약: 이번 달 전체
      supabase
        .from("reservations")
        .select(facilitySelect)
        .or("status.is.null,status.neq.cancelled")
        .gte("start_at", monthStart.toISOString())
        .lte("start_at", monthEnd.toISOString())
        .order("start_at"),
      // 차량 예약: 오늘 하루
      supabase
        .from("reservations")
        .select(vehicleSelect)
        .or("status.is.null,status.neq.cancelled")
        .gte("start_at", todayStart.toISOString())
        .lte("start_at", todayEnd.toISOString())
        .order("start_at"),
      // 공지
      supabase
        .from("notices")
        .select("id, title, category, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]).then(([{ data: facilityData }, { data: vehicleData }, { data: noticeData }]) => {
      const toItem = (r: any): PopupReservation => {
        const res  = Array.isArray(r.resources) ? r.resources[0] : r.resources;
        const prof = Array.isArray(r.profiles)  ? r.profiles[0]  : r.profiles;
        return {
          id: r.id, start_at: r.start_at, end_at: r.end_at,
          purpose: r.purpose, driver_name: r.driver_name,
          department: r.department, destination: r.destination,
          profiles: prof, resources: res,
        };
      };

      const facility = (facilityData ?? []).map(toItem).filter((r) => r.resources?.category !== "vehicle");
      const vehicle  = (vehicleData  ?? []).map(toItem).filter((r) => r.resources?.category === "vehicle");

      setData({ facility, vehicle, notices: (noticeData ?? []) as PopupNotice[] });
      setLoading(false);
    });
  }, [isOpen]);

  const skeletons = (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse bg-gray-100 rounded-xl h-[100px]"
        />
      ))}
    </div>
  );

  const empty = (msg: string) => (
    <div className="flex items-center justify-center h-full min-h-[80px]">
      <p className="text-xs text-gray-300 font-medium">{msg}</p>
    </div>
  );

  // 카드 공통 — 고정 높이 100px
  const cardCls =
    "bg-white border border-gray-200 rounded-xl p-4 shadow-sm cursor-pointer hover:border-gray-300 hover:shadow-md transition-all flex flex-col justify-between h-[100px]";

  const facilityCards = loading ? (
    skeletons
  ) : (data?.facility.length ?? 0) === 0 ? (
    empty("이번 달 시설 예약 없음")
  ) : (
    <div className="space-y-3">
      {data!.facility.map((r) => {
        const start = new Date(r.start_at);
        const end   = new Date(r.end_at);
        return (
          <div
            key={r.id}
            className={cardCls}
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setPopover({ reservation: r, isVehicle: false, rect });
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 truncate max-w-[120px]">
                {r.resources?.name ?? "시설"}
              </span>
              <span className="text-[10px] font-bold text-gray-500 tabular-nums shrink-0">
                {format(start, "M/d (EEE)", { locale: ko })}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-1">
              {r.purpose || "예약"}
            </p>
            <p className="text-xs text-gray-400 tabular-nums">
              {format(start, "HH:mm")}~{format(end, "HH:mm")}{" "}·{" "}
              <span className="text-gray-600 font-medium">
                {r.profiles?.full_name ?? "—"}
              </span>
            </p>
          </div>
        );
      })}
    </div>
  );

  const vehicleCards = loading ? (
    skeletons
  ) : (data?.vehicle.length ?? 0) === 0 ? (
    empty("오늘 차량 예약 없음")
  ) : (
    <div className="space-y-3">
      {data!.vehicle.map((r) => {
        const start = new Date(r.start_at);
        const end = new Date(r.end_at);
        return (
          <div
            key={r.id}
            className={cardCls}
            onClick={(e) => {
              const rect = (
                e.currentTarget as HTMLElement
              ).getBoundingClientRect();
              setPopover({ reservation: r, isVehicle: true, rect });
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 truncate max-w-[120px]">
                {r.resources?.name ?? "차량"}
              </span>
              <span className="text-[10px] text-gray-400 tabular-nums shrink-0">
                {format(start, "HH:mm")}~{format(end, "HH:mm")}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-1">
              {r.purpose || "운행"}
            </p>
            <p className="text-xs text-gray-400">
              운전자{" "}
              <span className="text-gray-600 font-medium">
                {r.driver_name ?? "—"}
              </span>
              {r.department && (
                <span className="text-gray-400"> · {r.department}</span>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );

  const noticeCards = loading ? (
    skeletons
  ) : (data?.notices.length ?? 0) === 0 ? (
    empty("공지 없음")
  ) : (
    <div className="space-y-3">
      {data!.notices.map((n) => (
        <div
          key={n.id}
          className={cardCls}
          onClick={(e) => {
            const rect = (
              e.currentTarget as HTMLElement
            ).getBoundingClientRect();
            setPopover({ notice: n, rect });
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
              {n.category}
            </span>
            <span className="text-[10px] text-gray-400 shrink-0">
              {format(new Date(n.created_at), "M.d (EEE)", { locale: ko })}
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-1">
            {n.title}
          </p>
          <p className="text-xs text-gray-300">공지사항</p>
        </div>
      ))}
    </div>
  );

  const colHeader = (label: string, count: number, badgeClass: string) => (
    <div className="flex items-center gap-2 mb-3 shrink-0">
      <span className="text-sm font-bold text-gray-700">{label}</span>
      <span
        className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeClass}`}
      >
        {count}
      </span>
    </div>
  );

  // ── 팝오버 파생 변수 ───────────────────────────────────────────────────────
  const r = popover?.reservation;
  const n = popover?.notice;
  const isVehicle = popover?.isVehicle;
  const headerBg = isVehicle
    ? "bg-green-50"
    : n
      ? "bg-blue-50"
      : "bg-purple-50";
  const labelCls = isVehicle
    ? "text-green-600"
    : n
      ? "text-blue-600"
      : "text-purple-600";
  const typeLabel = isVehicle ? "차량 예약" : n ? "최근 공지" : "시설 예약";

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="오늘의 현황"
        className="sm:!max-w-[1060px] sm:!h-[640px]"
        bodyClassName="flex flex-col p-0"
      >
        <div className="flex-1 overflow-hidden">
          {/* 3-컬럼 칸반 */}
          <div className="flex h-full divide-x divide-gray-100 overflow-x-auto">
            <div className="flex-1 min-w-[300px] flex flex-col px-6 py-6 overflow-hidden">
              {colHeader(
                `시설 예약 · ${format(new Date(), "M월")}`,
                data?.facility.length ?? 0,
                "bg-purple-50 text-purple-700",
              )}
              <div
                className="flex-1 overflow-y-auto pr-1.5"
                style={{
                  scrollbarWidth: "thin",
                  scrollbarColor: "#d1d5db transparent",
                }}
              >
                {facilityCards}
              </div>
            </div>
            <div className="flex-1 min-w-[300px] flex flex-col px-6 py-6 overflow-hidden">
              {colHeader(
                "차량 예약",
                data?.vehicle.length ?? 0,
                "bg-green-50 text-green-700",
              )}
              <div
                className="flex-1 overflow-y-auto pr-1.5"
                style={{
                  scrollbarWidth: "thin",
                  scrollbarColor: "#d1d5db transparent",
                }}
              >
                {vehicleCards}
              </div>
            </div>
            <div className="flex-1 min-w-[300px] flex flex-col px-6 py-6 overflow-hidden">
              {colHeader(
                "최근 공지",
                data?.notices.length ?? 0,
                "bg-blue-50 text-blue-600",
              )}
              <div
                className="flex-1 overflow-y-auto pr-1.5"
                style={{
                  scrollbarWidth: "thin",
                  scrollbarColor: "#d1d5db transparent",
                }}
              >
                {noticeCards}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── 카드 상세 팝오버 (Portal) ── */}
      {popover &&
        createPortal(
          <>
            {/* 외부 클릭 → 닫기 */}
            <div
              className="fixed inset-0 z-[10001]"
              onClick={() => setPopover(null)}
            />
            {/* 팝오버 카드 */}
            <div
              className="fixed z-[10002] bg-white rounded-2xl shadow-2xl w-[340px] overflow-hidden border border-gray-100"
              style={{
                top: Math.max(
                  16,
                  Math.min(popover.rect.top, window.innerHeight - 380),
                ),
                left:
                  popover.rect.right + 354 < window.innerWidth
                    ? popover.rect.right + 10
                    : popover.rect.left - 350,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div
                className={`px-5 py-4 flex items-start justify-between gap-3 ${headerBg}`}
              >
                <div className="min-w-0">
                  <span className={`text-xs font-bold ${labelCls}`}>
                    {typeLabel}
                  </span>
                  <p className="text-base font-extrabold text-gray-900 mt-0.5 leading-snug">
                    {r ? (r.resources?.name ?? "—") : n?.title}
                  </p>
                </div>
                <button
                  onClick={() => setPopover(null)}
                  className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full hover:bg-black/10 transition text-gray-500"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* 본문 */}
              <div className="px-5 py-4 space-y-3">
                {r && (
                  <>
                    <InfoRow
                      label="예약 시간"
                      value={`${format(new Date(r.start_at), "yyyy.MM.dd")}  ${format(new Date(r.start_at), "HH:mm")} ~ ${format(new Date(r.end_at), "HH:mm")}`}
                    />
                    {isVehicle && r.destination && (
                      <InfoRow label="목적지" value={r.destination} />
                    )}
                    {r.purpose && (
                      <InfoRow
                        label={isVehicle ? "운행 목적" : "사용 목적"}
                        value={r.purpose}
                      />
                    )}
                    <div className="border-t border-gray-100 pt-1" />
                    {isVehicle ? (
                      <>
                        <InfoRow
                          label="운전자"
                          value={`${r.driver_name ?? "—"}${r.department ? ` (${r.department})` : ""}`}
                        />
                        {r.profiles?.full_name && (
                          <InfoRow
                            label="예약자"
                            value={r.profiles.full_name}
                          />
                        )}
                      </>
                    ) : (
                      <InfoRow
                        label="예약자"
                        value={`${r.profiles?.full_name ?? "—"}`}
                      />
                    )}
                  </>
                )}
                {n && (
                  <>
                    <InfoRow
                      label="등록일"
                      value={format(
                        new Date(n.created_at),
                        "yyyy년 M월 d일 (EEE)",
                        { locale: ko },
                      )}
                    />
                    <div className="border-t border-gray-100 pt-1" />
                    <Link
                      href="/notice"
                      onClick={onClose}
                      className="block w-full text-center text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 py-2.5 rounded-lg transition"
                    >
                      공지 페이지로 이동
                    </Link>
                  </>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

function AlarmCard() {
  const [items, setItems] = useState<AlarmItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [popupOpen, setPopupOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // 공지 3건 + 예약 5건을 각각 보장해서 가져온 뒤 날짜순 병합
    Promise.all([
      supabase
        .from("notices")
        .select("id, title, category, created_at")
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("reservations")
        .select(
          "id, created_at, start_at, end_at, profiles:user_id(full_name), resources:resource_id(name, category)",
        )
        .or("status.is.null,status.neq.cancelled")
        .order("created_at", { ascending: false })
        .limit(5),
    ]).then(([{ data: notices }, { data: reservations }]) => {
      const noticeItems: AlarmItem[] = (notices ?? []).map((n) => ({
        id: `n-${n.id}`,
        badge: n.category,
        badgeColor: ALARM_BADGE_STYLE[n.category] ?? ALARM_BADGE_STYLE["일반"],
        title: n.title,
        subtitle: format(new Date(n.created_at), "M.d(EEE) 공지", {
          locale: ko,
        }),
        date: n.created_at,
        href: "/notice",
      }));

      const reservationItems: AlarmItem[] = (reservations ?? []).map((r) => {
        const resource = (
          Array.isArray(r.resources) ? r.resources[0] : r.resources
        ) as { name?: string; category?: string } | null;
        const profile = (
          Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
        ) as { full_name?: string } | null;
        const isVehicle = resource?.category === "vehicle";
        const badge = isVehicle ? "차량" : "시설";

        let subtitle: string | undefined;
        if (r.start_at && r.end_at) {
          const start = new Date(r.start_at);
          const end = new Date(r.end_at);
          const startStr = format(start, "M.d(EEE) HH:mm", { locale: ko });
          const endSameDay =
            format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");
          subtitle = endSameDay
            ? `${startStr}~${format(end, "HH:mm")}`
            : `${format(start, "M.d(EEE)", { locale: ko })} ~ ${format(end, "M.d(EEE)", { locale: ko })}`;
        }

        return {
          id: `r-${r.id}`,
          badge,
          badgeColor: ALARM_BADGE_STYLE[badge],
          title: `${resource?.name ?? ""}${profile?.full_name ? ` · ${profile.full_name}님` : ""} 예약`,
          subtitle,
          date: r.created_at,
          href: isVehicle ? "/vehicle" : "/reservation",
        };
      });

      // 공지 최대 3 + 예약 최대 5 = 최대 8건, 날짜 내림차순으로 정렬
      const merged = [...noticeItems, ...reservationItems].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      setItems(merged);
      setLoading(false);
    });
  }, []);

  return (
    <>
      <div className="lg:w-2/5 min-w-0 bg-white rounded-2xl border border-gray-200 p-5 flex flex-col h-[260px] sm:h-[168px] overflow-hidden">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <p className="text-xs font-semibold text-gray-400 tracking-wide">
            🔔 최근 알림
          </p>
          <button
            onClick={() => setPopupOpen(true)}
            className="hidden sm:flex items-center gap-1 text-[11px] font-bold text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-2 py-0.5 rounded-md transition"
          >
            오늘 현황
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-3 flex-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-2 items-center">
                <div className="h-3 bg-gray-100 rounded w-8 shrink-0" />
                <div className="h-3 bg-gray-100 rounded flex-1" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-300 flex-1 flex items-center">
            최근 활동이 없습니다.
          </p>
        ) : (
          <ul className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-start gap-2 min-w-0 hover:bg-gray-50 rounded-lg px-1 py-0.5 transition-colors"
                >
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${item.badgeColor}`}
                  >
                    {item.badge}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-700 font-medium truncate block">
                      {item.title}
                    </span>
                    {item.subtitle && (
                      <span className="text-[11px] text-gray-400 truncate block">
                        {item.subtitle}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap mt-0.5">
                    {format(new Date(item.date), "M.d", { locale: ko })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlarmDetailPopup
        isOpen={popupOpen}
        onClose={() => setPopupOpen(false)}
      />
    </>
  );
}

type Profile = {
  id: string;
  full_name: string;
  position: string;
  team_id: number;
  role: string;
  status: string;
  is_approver?: boolean;
};

interface Props {
  profile: Profile;
  pendingCount: number;
  myPendingCount: number;
  canViewCalendar: boolean;
  parkingText: string;
  weather: WeatherData | null;
  weatherLoading: boolean;
}

function pm10BadgeColor(v: number): string {
  if (v <= 30) return "#1bc47d";
  if (v <= 80) return "#00b0f0";
  if (v <= 150) return "#ff6600";
  return "#d63030";
}
function pm25BadgeColor(v: number): string {
  if (v <= 15) return "#1bc47d";
  if (v <= 35) return "#00b0f0";
  if (v <= 75) return "#ff6600";
  return "#d63030";
}

export default function DashboardBanner({
  profile,
  pendingCount,
  myPendingCount,
  parkingText,
  weather,
  weatherLoading,
}: Props) {
  const canApprove =
    profile.is_approver ||
    profile.role === "admin" ||
    profile.role === "director";

  const [verse, setVerse] = useState<{ text: string; ref: string } | null>(
    null,
  );
  const [verseLoading, setVerseLoading] = useState(true);

  useEffect(() => {
    fetch("/api/bible-verse")
      .then((r) => r.json())
      .then((data) => {
        if (data?.text) setVerse(data);
      })
      .catch(() => {})
      .finally(() => setVerseLoading(false));
  }, []);

  return (
    <section className="flex flex-col lg:flex-row gap-4 items-stretch">
      {/* ── 알림 카드 (왼쪽 2/5) ── */}
      <AlarmCard />

      {/* ── 우측 카드 영역 ── */}
      <div className="lg:flex-1 min-w-0 flex flex-col sm:flex-row gap-4">
        {/* 날씨 + 미세먼지 통합 카드 */}
        <div className="w-full sm:flex-[2] min-w-0 bg-white rounded-2xl border border-gray-200 min-h-[140px] sm:min-h-[168px] flex overflow-hidden">
          {/* 날씨 — 왼쪽 */}
          <div className="flex-1 min-w-0 p-5 flex flex-col justify-between">
            <p className="text-xs font-semibold text-gray-400 tracking-wide truncate">
              날씨 · 용인 서천동
            </p>
            {weatherLoading ? (
              <div className="animate-pulse space-y-2 mt-3">
                <div className="h-8 w-20 bg-gray-100 rounded" />
                <div className="h-3 w-24 bg-gray-100 rounded" />
              </div>
            ) : weather ? (
              <>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-4xl leading-none">{weather.emoji}</span>
                  <div>
                    <p className="text-3xl font-extrabold text-gray-900 leading-tight">
                      {weather.temp}°
                      <span className="text-base font-bold text-gray-400">
                        C
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {weather.description}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 text-[11px] text-gray-400">
                  <span>체감 {weather.feelsLike}°C</span>
                  <span className="text-gray-200">|</span>
                  <span>습도 {weather.humidity}%</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-4">날씨 정보 없음</p>
            )}
          </div>

          <div className="w-px bg-gray-100 my-4" />

          {/* 미세먼지 — 오른쪽 */}
          <div className="flex-1 min-w-0 p-5 flex flex-col justify-between">
            <p className="text-xs font-semibold text-gray-400 tracking-wide">
              미세먼지
            </p>
            {weatherLoading ? (
              <div className="animate-pulse space-y-3 mt-3">
                <div className="h-5 w-full bg-gray-100 rounded" />
                <div className="h-5 w-full bg-gray-100 rounded" />
              </div>
            ) : weather?.airGrade ? (
              <>
                {/* 이모지 + 등급 (중앙 배치) */}
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-3xl leading-none">
                    {weather.airGrade.face}
                  </span>
                  <span
                    className={`text-base font-extrabold ${weather.airGrade.color}`}
                  >
                    {weather.airGrade.label}
                  </span>
                </div>

                {/* PM10 / PM2.5 수치 + 색상 뱃지 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-medium">미세먼지</span>
                    <div className="flex items-center gap-1.5">
                      {weather.pm10 != null && (
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: pm10BadgeColor(weather.pm10),
                          }}
                        />
                      )}
                      <span className="font-bold text-gray-700">
                        {weather.pm10 != null ? `${weather.pm10} ㎍` : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-medium">
                      초미세먼지
                    </span>
                    <div className="flex items-center gap-1.5">
                      {weather.pm25 != null && (
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: pm25BadgeColor(weather.pm25),
                          }}
                        />
                      )}
                      <span className="font-bold text-gray-700">
                        {weather.pm25 != null ? `${weather.pm25} ㎍` : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-4">정보 없음</p>
            )}
          </div>
        </div>

        {/* 오늘의 말씀 */}
        <div className="w-full sm:flex-1 min-w-0 flex flex-col justify-center gap-2 px-4 py-4 min-h-[140px] sm:min-h-[168px]">
          <p className="text-[12px] font-semibold text-gray-700 tracking-widest uppercase">
            오늘의 말씀
          </p>
          {verse ? (
            <>
              <p className="text-md font-bold text-gray-700 leading-relaxed">
                {verse.text}
              </p>
              <p className="text-xs font-semibold text-gray-400">{verse.ref}</p>
            </>
          ) : (
            <div className="animate-pulse space-y-2 mt-1">
              <div className="h-3.5 bg-gray-100 rounded w-full" />
              <div className="h-3.5 bg-gray-100 rounded w-4/5" />
              <div className="h-3 bg-gray-100 rounded w-16 mt-1" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
