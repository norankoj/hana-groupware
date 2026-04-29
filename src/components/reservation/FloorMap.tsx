"use client";

interface RoomDef {
  id: string;
  label: string;
  capacity?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: "room" | "utility" | "stair";
  restricted?: boolean;
}

/* ── 교육관 1 (2층) ─── viewBox 0 0 500 262 ─── */
const EDU1_ROOMS: RoomDef[] = [
  { id: "wc",   label: "남자\n화장실",  type: "utility", x: 5,   y: 15,  w: 70,  h: 95  },
  { id: "1202", label: "1202",          capacity: "8명 · 최대 10명",  type: "room", x: 80,  y: 15,  w: 115, h: 95  },
  { id: "s3",   label: "계단\n(3층)",   type: "stair",   x: 200, y: 15,  w: 45,  h: 95  },
  { id: "1201", label: "1201",          capacity: "10명 · 최대 12명", type: "room", x: 250, y: 15,  w: 245, h: 95  },
  { id: "1203", label: "1203",          capacity: "12명 · 최대 20명", type: "room", x: 5,   y: 140, w: 155, h: 115 },
  { id: "1204", label: "1204",          capacity: "8명 · 최대 10명",  type: "room", x: 165, y: 140, w: 120, h: 115 },
  { id: "s1",   label: "계단\n(1층)",   type: "stair",   x: 290, y: 140, w: 50,  h: 115 },
  { id: "1205", label: "1205",          capacity: "10명 · 최대 12명", type: "room", x: 345, y: 140, w: 150, h: 115 },
];

/* ── 교육관 2 ─── viewBox 0 0 550 225 ─── */
const EDU2_ROOMS: RoomDef[] = [
  { id: "2105",  label: "2105",   capacity: "16명 · 최대 26명",  type: "room",    x: 5,   y: 5,   w: 115, h: 215 },
  { id: "2103",  label: "2103",   capacity: "12명 · 최대 16명",  type: "room",    x: 125, y: 5,   w: 145, h: 115 },
  { id: "2101",  label: "2101",   capacity: "다음세대\n부서 전용", restricted: true, type: "room", x: 275, y: 5, w: 110, h: 115 },
  { id: "2104",  label: "2104",   capacity: "12명 · 최대 16명",  type: "room",    x: 125, y: 125, w: 120, h: 95  },
  { id: "wc",    label: "화장실",                                  type: "utility", x: 250, y: 125, w: 35,  h: 95  },
  { id: "2102",  label: "2102",   capacity: "8명 · 최대 12명",   type: "room",    x: 290, y: 125, w: 95,  h: 95  },
  { id: "lobby", label: "현관",                                    type: "utility", x: 390, y: 5,   w: 155, h: 215 },
];

/* ── RoomRect 렌더러 ─────────────────────────────────────────────────────── */
function RoomRect({ room, isSelected }: { room: RoomDef; isSelected: boolean }) {
  const isUtil = room.type !== "room";

  const bg = isSelected
    ? "#2563eb"
    : isUtil
    ? "#f1f5f9"
    : room.restricted
    ? "#fef9c3"
    : "#eff6ff";

  const border = isSelected
    ? "#1d4ed8"
    : isUtil
    ? "#e2e8f0"
    : room.restricted
    ? "#fcd34d"
    : "#bfdbfe";

  const labelFill = isSelected
    ? "#ffffff"
    : isUtil
    ? "#64748b"
    : room.restricted
    ? "#92400e"
    : "#1e3a8a";

  const capFill = isSelected ? "rgba(255,255,255,0.72)" : "#94a3b8";

  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;

  const labelLines = room.label.split("\n");
  const capLines   = room.capacity ? room.capacity.split("\n") : [];
  const hasCap     = capLines.length > 0;

  const LABEL_H = 14;
  const CAP_H   = 11;
  const GAP     = 4;

  const totalH =
    labelLines.length * LABEL_H +
    (hasCap ? GAP + capLines.length * CAP_H : 0);

  const firstLabelY = cy - totalH / 2 + LABEL_H / 2;
  const firstCapY   = firstLabelY + labelLines.length * LABEL_H - LABEL_H / 2 + GAP + CAP_H / 2;

  const labelSize = isUtil ? 9 : 12;
  const labelWeight = isUtil ? "400" : "700";

  return (
    <g>
      {/* Glow ring for selected */}
      {isSelected && (
        <rect
          x={room.x - 3} y={room.y - 3}
          width={room.w + 6} height={room.h + 6}
          fill="none" stroke="#93c5fd" strokeWidth={3} rx={8} opacity={0.55}
        />
      )}

      {/* Room background */}
      <rect
        x={room.x} y={room.y} width={room.w} height={room.h}
        fill={bg} stroke={border} strokeWidth={isSelected ? 2 : 1} rx={5}
      />

      {/* Restricted diagonal pattern */}
      {room.restricted && !isSelected && (
        <rect
          x={room.x} y={room.y} width={room.w} height={room.h}
          fill="url(#hatch)" opacity={0.25} rx={5}
        />
      )}

      {/* Label lines */}
      {labelLines.map((line, i) => (
        <text
          key={`lbl-${i}`}
          x={cx}
          y={firstLabelY + i * LABEL_H}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={labelSize}
          fontWeight={labelWeight}
          fill={labelFill}
          style={{ userSelect: "none" }}
        >
          {line}
        </text>
      ))}

      {/* Capacity lines */}
      {capLines.map((line, i) => (
        <text
          key={`cap-${i}`}
          x={cx}
          y={firstCapY + i * CAP_H}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={8}
          fill={capFill}
          style={{ userSelect: "none" }}
        >
          {line}
        </text>
      ))}

      {/* Lock icon for restricted */}
      {room.restricted && !isSelected && (
        <text x={room.x + room.w - 9} y={room.y + 12} fontSize={10} fill="#f59e0b" style={{ userSelect: "none" }}>
          🔒
        </text>
      )}
    </g>
  );
}

/* ── Default export ─────────────────────────────────────────────────────── */
export default function FloorMap({
  category,
  resourceName,
}: {
  category: string;
  resourceName: string;
}) {
  const isEdu1 = category === "edu1";
  const isEdu2 = category === "edu2";
  if (!isEdu1 && !isEdu2) return null;

  const rooms     = isEdu1 ? EDU1_ROOMS : EDU2_ROOMS;
  const viewBox   = isEdu1 ? "0 0 500 262" : "0 0 550 225";
  const outlineW  = isEdu1 ? 498 : 548;
  const outlineH  = isEdu1 ? 260 : 223;
  const floorLabel = isEdu1 ? "교육관 1 · 2층" : "교육관 2";

  const selectedId = rooms.find(
    (r) => r.type === "room" && resourceName.includes(r.id),
  )?.id;

  return (
    <div>
      <svg
        viewBox={viewBox}
        width="100%"
        style={{ height: "auto", display: "block" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Hatch pattern for restricted rooms */}
        <defs>
          <pattern id="hatch" patternUnits="userSpaceOnUse" width={8} height={8} patternTransform="rotate(-45)">
            <line x1={0} y1={0} x2={0} y2={8} stroke="#fbbf24" strokeWidth={2} />
          </pattern>
        </defs>

        {/* Building outline */}
        <rect x={1} y={1} width={outlineW} height={outlineH}
          fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1.5} rx={8} />

        {/* EDU1 middle corridor strip */}
        {isEdu1 && (
          <>
            <rect x={1} y={113} width={outlineW} height={24} fill="#f1f5f9" />
            <text x={249} y={125} textAnchor="middle" dominantBaseline="central"
              fontSize={9.5} fill="#94a3b8" fontWeight="600"
              style={{ userSelect: "none" }}>
              {floorLabel}
            </text>
          </>
        )}

        {/* Rooms */}
        {rooms.map((room) => (
          <RoomRect key={room.id} room={room} isSelected={room.id === selectedId} />
        ))}

        {/* EDU2 floor label (bottom center) */}
        {isEdu2 && (
          <text x={195} y={215} textAnchor="middle" dominantBaseline="central"
            fontSize={9.5} fill="#94a3b8" fontWeight="600"
            style={{ userSelect: "none" }}>
            {floorLabel}
          </text>
        )}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2.5 flex-wrap">
        {selectedId && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
            <div className="w-3 h-3 rounded bg-blue-600" />
            선택된 공간
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-3 h-3 rounded border border-blue-200 bg-blue-50" />
          예약 가능
        </div>
        {isEdu2 && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <div className="w-3 h-3 rounded border border-yellow-300 bg-yellow-50" />
            제한 공간
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-3 h-3 rounded bg-slate-100 border border-slate-200" />
          공용 공간
        </div>
      </div>
    </div>
  );
}
