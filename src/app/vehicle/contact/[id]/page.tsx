import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

async function getDriver(vehicleId: number) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: vehicle } = await supabase
    .from("resources")
    .select("id, name")
    .eq("id", vehicleId)
    .eq("category", "vehicle")
    .single();

  if (!vehicle) return { vehicle: null, driver: null };

  const now = new Date().toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const in1h = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { data: active } = await supabase
    .from("reservations")
    .select("driver_name, reservee_phone")
    .eq("resource_id", vehicleId)
    .in("vehicle_status", ["reserved", "in_use"])
    .lte("start_at", now)
    .gte("end_at", now)
    .order("start_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (active) return { vehicle, driver: active };

  const { data: recent } = await supabase
    .from("reservations")
    .select("driver_name, reservee_phone")
    .eq("resource_id", vehicleId)
    .in("vehicle_status", ["reserved", "in_use"])
    .gte("start_at", since24h)
    .lte("start_at", now)
    .order("start_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) return { vehicle, driver: recent };

  const { data: upcoming } = await supabase
    .from("reservations")
    .select("driver_name, reservee_phone")
    .eq("resource_id", vehicleId)
    .in("vehicle_status", ["reserved"])
    .gte("start_at", now)
    .lte("start_at", in1h)
    .order("start_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return { vehicle, driver: upcoming ?? null };
}

const DEFAULT_NAME = "김건웅";
const DEFAULT_PHONE = "010-2344-2859";

export default async function VehicleContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const vehicleId = Number(id);
  const { vehicle, driver } = await getDriver(vehicleId);

  if (!vehicle) {
    return (
      <div style={{ minHeight: "100dvh", background: "#F0F2F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#9CA3AF", fontSize: 14 }}>등록되지 않은 차량입니다.</p>
      </div>
    );
  }

  const name = driver?.driver_name || null;
  const phone = driver ? formatPhone(driver.reservee_phone) : null;

  const displayName = name || DEFAULT_NAME;
  const displayPhone = phone || DEFAULT_PHONE;
  const isDefault = !name;

  const initial = displayName.slice(0, 1);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #F8FAFF; }
        .page {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(160deg, #EFF6FF 0%, #ffffff 55%);
        }
        .topbar {
          padding: 20px 24px 0;
          display: flex;
          justify-content: center;
        }
        .vehicle-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #1E293B;
          color: #CBD5E1;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.04em;
          padding: 7px 14px;
          border-radius: 999px;
        }
        .vehicle-badge svg { width: 14px; height: 14px; opacity: 0.6; }
        .center {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px 28px;
        }
        .avatar {
          width: 88px;
          height: 88px;
          border-radius: 50%;
          background: #2563EB;
          color: #fff;
          font-size: 36px;
          font-weight: 900;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 28px;
          box-shadow: 0 8px 24px rgba(37,99,235,0.28);
          letter-spacing: -0.02em;
        }
        .avatar.default-avatar {
          background: #64748B;
          box-shadow: 0 8px 20px rgba(100,116,139,0.2);
        }
        .label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.12em;
          color: #94A3B8;
          text-transform: uppercase;
          margin-bottom: 10px;
        }
        .driver-name {
          font-size: clamp(44px, 13vw, 64px);
          font-weight: 900;
          color: #0F172A;
          letter-spacing: -0.03em;
          line-height: 1;
          text-align: center;
          margin-bottom: 20px;
        }
        .phone-chip {
          display: inline-flex;
          align-items: center;
          background: #fff;
          border: 1.5px solid #E2E8F0;
          border-radius: 14px;
          padding: 10px 20px;
          font-size: 18px;
          font-weight: 700;
          color: #334155;
          letter-spacing: 0.06em;
          box-shadow: 0 1px 4px rgba(0,0,0,0.05);
        }
        .bottom { padding: 0 24px 36px; }
        .call-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 20px;
          background: #2563EB;
          color: #fff;
          font-size: 20px;
          font-weight: 800;
          border-radius: 20px;
          text-decoration: none;
          letter-spacing: -0.01em;
          box-shadow: 0 4px 20px rgba(37,99,235,0.35);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .call-btn:active {
          transform: scale(0.97);
          box-shadow: 0 2px 10px rgba(37,99,235,0.2);
        }
        .call-btn svg { width: 22px; height: 22px; flex-shrink: 0; }
      `}</style>

      <div className="page">
        {/* 차량 배지 */}
        <div className="topbar">
          <div className="vehicle-badge">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
            </svg>
            {vehicle.name}
          </div>
        </div>

        {/* 메인 */}
        <div className="center">
          <div className={`avatar${isDefault ? " default-avatar" : ""}`}>
            {initial}
          </div>
          <p className="label">{isDefault ? "차량 담당자" : "운전자"}</p>
          <p className="driver-name">{displayName}</p>
          <div className="phone-chip">{displayPhone}</div>
        </div>

        {/* 전화 버튼 */}
        <div className="bottom">
          <a href={`tel:${displayPhone}`} className="call-btn">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
            </svg>
            전화하기
          </a>
        </div>
      </div>
    </>
  );
}
