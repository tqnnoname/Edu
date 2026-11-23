import React, { useMemo } from 'react';
import { Flag, Mountain, Anchor, CheckCircle2, RotateCcw } from 'lucide-react';
import type { MountainPlayerState } from '../types/exam';
import { getMountainPetById, MOUNTAIN_OBSTACLES } from '../data/mountainPets';

interface MountainClimbMapProps {
  players: MountainPlayerState[];
  summitSteps: number;
  currentPlayerId?: string;
  totalQuestions: number;
}

interface Point2D {
  x: number;
  y: number;
}

const WAYPOINTS: Point2D[] = [
  { x: 96, y: 472 },   // Base camp (Step 0)
  { x: 245, y: 458 },
  { x: 430, y: 446 },
  { x: 645, y: 430 },
  { x: 790, y: 382 },  // Switchback 1 right
  { x: 655, y: 332 },
  { x: 410, y: 320 },
  { x: 180, y: 298 },  // Switchback 2 left
  { x: 135, y: 238 },
  { x: 310, y: 205 },
  { x: 545, y: 192 },
  { x: 740, y: 162 },  // Switchback 3 right
  { x: 610, y: 112 },
  { x: 425, y: 94 },
  { x: 495, y: 66 },   // Summit ridge
  { x: 660, y: 62 },   // Summit peak!
];

function samplePolylinePoints(waypoints: Point2D[], count: number): Point2D[] {
  if (count <= 1) return [waypoints[0]];
  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const dx = waypoints[i + 1].x - waypoints[i].x;
    const dy = waypoints[i + 1].y - waypoints[i].y;
    const len = Math.hypot(dx, dy);
    segLengths.push(len);
    totalLen += len;
  }

  const out: Point2D[] = [];
  for (let i = 0; i < count; i++) {
    const targetDist = (i / (count - 1)) * totalLen;
    let accum = 0;
    let placed = false;
    for (let s = 0; s < segLengths.length; s++) {
      const segLen = segLengths[s];
      if (accum + segLen >= targetDist || s === segLengths.length - 1) {
        const localT = segLen > 0 ? Math.max(0, Math.min(1, (targetDist - accum) / segLen)) : 0;
        const p0 = waypoints[s];
        const p1 = waypoints[s + 1];
        out.push({
          x: p0.x + (p1.x - p0.x) * localT,
          y: p0.y + (p1.y - p0.y) * localT,
        });
        placed = true;
        break;
      }
      accum += segLen;
    }
    if (!placed) out.push(waypoints[waypoints.length - 1]);
  }
  return out;
}

function buildSmoothSvgPath(points: Point2D[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export const MountainClimbMap: React.FC<MountainClimbMapProps> = ({
  players,
  summitSteps,
  currentPlayerId,
  totalQuestions,
}) => {
  const safeSteps = Math.max(4, summitSteps);

  const stepPoints = useMemo(
    () => samplePolylinePoints(WAYPOINTS, safeSteps + 1),
    [safeSteps]
  );

  const trailPathD = useMemo(() => buildSmoothSvgPath(WAYPOINTS), []);

  const obstacleNodes = useMemo(() => {
    const fractions = [0.18, 0.36, 0.54, 0.72, 0.88];
    return MOUNTAIN_OBSTACLES.map((obs, idx) => {
      const stepIdx = Math.max(
        1,
        Math.min(safeSteps - 1, Math.round(fractions[idx] * safeSteps))
      );
      const pt = stepPoints[stepIdx] || stepPoints[0];
      return {
        ...obs,
        stepIdx,
        pt,
        labelAbove: idx % 2 === 0,
      };
    });
  }, [safeSteps, stepPoints]);

  // Group players by their step so co-located pets spread neatly without overlapping
  const positionedPlayers = useMemo(() => {
    const groups = new Map<number, MountainPlayerState[]>();
    players.forEach((p) => {
      const clampedStep = Math.max(0, Math.min(safeSteps, p.step));
      const arr = groups.get(clampedStep) || [];
      arr.push(p);
      groups.set(clampedStep, arr);
    });

    const result: Array<{
      player: MountainPlayerState;
      x: number;
      y: number;
      clampedStep: number;
    }> = [];

    groups.forEach((group, stepIdx) => {
      const basePt = stepPoints[stepIdx] || stepPoints[0];
      const count = group.length;
      group.forEach((player, idx) => {
        if (count === 1) {
          result.push({ player, x: basePt.x, y: basePt.y - 22, clampedStep: stepIdx });
          return;
        }
        const angle = ((idx / count) * Math.PI * 2) - Math.PI / 2;
        const radius = count <= 3 ? 22 : count <= 6 ? 28 : 34;
        result.push({
          player,
          x: basePt.x + Math.cos(angle) * radius,
          y: basePt.y - 18 + Math.sin(angle) * (radius * 0.65),
          clampedStep: stepIdx,
        });
      });
    });

    // Sort so current player renders on top
    return result.sort((a, b) => {
      if (a.player.id === currentPlayerId) return 1;
      if (b.player.id === currentPlayerId) return -1;
      return 0;
    });
  }, [players, safeSteps, stepPoints, currentPlayerId]);

  const summitPt = stepPoints[stepPoints.length - 1] || WAYPOINTS[WAYPOINTS.length - 1];
  const basePt = stepPoints[0] || WAYPOINTS[0];

  const myPlayer = players.find((p) => p.id === currentPlayerId);
  const myAnchoredEarly = Boolean(myPlayer && myPlayer.step >= safeSteps && !myPlayer.officiallyFinished);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Map Header Bar */}
      <div className="px-4 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
            <Mountain className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold tracking-tight truncate">
              Bản đồ Chinh phục Đỉnh núi ({safeSteps} bậc)
            </h3>
            <p className="text-[11px] text-slate-300 truncate">
              Cần vượt chặng &amp; hoàn thành đủ {totalQuestions} câu hỏi để về đích chính thức
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-bold">
          <span className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-amber-300 tabular-nums">
            Đích: Bậc {safeSteps}
          </span>
          {myPlayer && (
            <span className="px-2.5 py-1 rounded-md bg-emerald-600 text-white tabular-nums">
              Bạn: Bậc {myPlayer.step}/{safeSteps}
            </span>
          )}
        </div>
      </div>

      {/* Early Summit Anchor Alert */}
      {myAnchoredEarly && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-900 font-semibold">
          <Anchor className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            Linh vật của bạn đã chạm đỉnh sớm! Hãy tiếp tục hoàn tất các câu hỏi còn lại (và sửa câu sai nếu có) để được công nhận <strong>Về đích chính thức</strong>.
          </span>
        </div>
      )}

      {/* Interactive Winding Mountain SVG */}
      <div className="relative w-full bg-sky-100 select-none">
        <svg
          viewBox="0 0 900 540"
          className="w-full h-auto block"
          role="img"
          aria-label="Bản đồ đường đi leo núi với các chướng ngại vật và vị trí người chơi"
        >
          <defs>
            <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.28" />
              <stop offset="55%" stopColor="#e0f2fe" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#ecfdf5" />
            </linearGradient>
            <linearGradient id="mountainBack" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
            <linearGradient id="mountainMain" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="35%" stopColor="#475569" />
              <stop offset="70%" stopColor="#15803d" />
              <stop offset="100%" stopColor="#166534" />
            </linearGradient>
            <linearGradient id="trailStroke" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#fef08a" />
            </linearGradient>
          </defs>

          {/* Sky Background */}
          <rect x="0" y="0" width="900" height="540" fill="url(#skyGrad)" />

          {/* Sun & Soft Clouds */}
          <circle cx="148" cy="84" r="34" fill="#fde047" opacity="0.85" />
          <circle cx="148" cy="84" r="48" fill="#fef08a" opacity="0.3" />
          <g fill="#ffffff" opacity="0.82">
            <ellipse cx="265" cy="96" rx="46" ry="16" />
            <ellipse cx="290" cy="86" rx="30" ry="14" />
            <ellipse cx="780" cy="112" rx="48" ry="15" />
            <ellipse cx="805" cy="102" rx="28" ry="13" />
          </g>

          {/* Far Mountain Range Silhouette */}
          <path
            d="M 0 360 L 145 190 L 295 310 L 455 150 L 635 280 L 795 145 L 900 245 L 900 540 L 0 540 Z"
            fill="url(#mountainBack)"
            opacity="0.38"
          />

          {/* Main Alpine Massif */}
          <path
            d="M -20 540 L -20 420 L 160 280 L 290 220 L 440 120 L 660 52 L 820 155 L 920 270 L 920 540 Z"
            fill="url(#mountainMain)"
            opacity="0.92"
          />

          {/* Snow Cap on Summit */}
          <path
            d="M 548 86 L 660 52 L 758 116 L 718 122 L 690 104 L 656 122 L 620 100 L 580 116 Z"
            fill="#f8fafc"
            opacity="0.95"
          />
          <path
            d="M 380 160 L 440 120 L 502 152 L 465 155 L 440 144 L 412 162 Z"
            fill="#f1f5f9"
            opacity="0.75"
          />

          {/* Meadow Slope Base */}
          <path
            d="M 0 470 Q 250 435 490 462 T 900 445 L 900 540 L 0 540 Z"
            fill="#15803d"
            opacity="0.88"
          />

          {/* Stylized Pine Trees */}
          {[
            { x: 54, y: 452, s: 1 },
            { x: 75, y: 465, s: 0.85 },
            { x: 830, y: 425, s: 1.05 },
            { x: 856, y: 440, s: 0.9 },
            { x: 255, y: 375, s: 0.78 },
            { x: 515, y: 265, s: 0.75 },
          ].map((tree, idx) => (
            <g
              key={idx}
              transform={`translate(${tree.x}, ${tree.y}) scale(${tree.s})`}
              opacity="0.85"
            >
              <polygon points="0,-32 -14,-6 14,-6" fill="#065f46" />
              <polygon points="0,-20 -17,6 17,6" fill="#047857" />
              <rect x="-3" y="6" width="6" height="10" fill="#78350f" />
            </g>
          ))}

          {/* Winding Trail Base Shadow & Path */}
          <path
            d={trailPathD}
            fill="none"
            stroke="#0f172a"
            strokeWidth="18"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.3"
          />
          <path
            d={trailPathD}
            fill="none"
            stroke="url(#trailStroke)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={trailPathD}
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.5"
            strokeDasharray="6 10"
            strokeLinecap="round"
            opacity="0.65"
          />

          {/* Step Nodes along Trail */}
          {stepPoints.map((pt, idx) => {
            const isStart = idx === 0;
            const isSummit = idx === stepPoints.length - 1;
            const isMajor = idx % 5 === 0 || isStart || isSummit;
            return (
              <g key={idx}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isSummit ? 11 : isStart ? 9 : isMajor ? 7 : 4.5}
                  fill={isSummit ? '#facc15' : isStart ? '#10b981' : '#ffffff'}
                  stroke={isSummit ? '#854d0e' : '#0f172a'}
                  strokeWidth={isMajor ? 2.5 : 1.5}
                />
                {isMajor && !isStart && !isSummit && (
                  <text
                    x={pt.x}
                    y={pt.y + 3}
                    textAnchor="middle"
                    fontSize="8"
                    fontWeight="800"
                    fill="#0f172a"
                  >
                    {idx}
                  </text>
                )}
              </g>
            );
          })}

          {/* Base Camp Sign */}
          <g transform={`translate(${basePt.x}, ${basePt.y + 26})`}>
            <rect x="-44" y="-11" width="88" height="22" rx="6" fill="#065f46" stroke="#ecfdf5" strokeWidth="1.5" />
            <text x="0" y="3.5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#ffffff">
              CHÂN NÚI · 0
            </text>
          </g>

          {/* Summit Flag & Peak Banner */}
          <g transform={`translate(${summitPt.x}, ${summitPt.y})`}>
            <line x1="0" y1="0" x2="0" y2="-40" stroke="#78350f" strokeWidth="3.5" strokeLinecap="round" />
            <polygon points="1,-40 34,-30 1,-20" fill="#ef4444" stroke="#ffffff" strokeWidth="1.2" />
            <rect x="40" y="-22" width="112" height="24" rx="6" fill="#0f172a" stroke="#facc15" strokeWidth="1.8" />
            <text x="96" y="-6.5" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#fde047">
              ĐỈNH NÚI · {safeSteps}
            </text>
          </g>

          {/* Obstacle Milestones */}
          {obstacleNodes.map((obs, idx) => {
            const dy = obs.labelAbove ? -26 : 28;
            return (
              <g key={`${obs.label}_${idx}`} transform={`translate(${obs.pt.x}, ${obs.pt.y + dy})`}>
                <rect
                  x="-42"
                  y="-11"
                  width="84"
                  height="21"
                  rx="6"
                  fill="#0f172a"
                  fillOpacity="0.82"
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />
                <text x="0" y="3" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#f8fafc">
                  {obs.icon} {obs.label}
                </text>
              </g>
            );
          })}

          {/* Animated Pet Tokens */}
          {positionedPlayers.map(({ player, x, y }) => {
            const pet = getMountainPetById(player.petId);
            const isSelf = player.id === currentPlayerId;
            const isAnchoredEarly = player.step >= safeSteps && !player.officiallyFinished;
            const shortName =
              player.name.length > 11 ? `${player.name.slice(0, 10)}…` : player.name;

            return (
              <g
                key={player.id}
                style={{
                  transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`,
                  transition: 'transform 650ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              >
                {/* Glow ring for current player or official finisher */}
                {(isSelf || player.officiallyFinished) && (
                  <circle
                    cx="0"
                    cy="0"
                    r="23"
                    fill="none"
                    stroke={player.officiallyFinished ? '#facc15' : '#10b981'}
                    strokeWidth="3"
                    strokeDasharray={isAnchoredEarly ? '4 3' : undefined}
                  />
                )}

                {/* Token circle */}
                <circle
                  cx="0"
                  cy="0"
                  r="18"
                  fill="#ffffff"
                  stroke={isSelf ? '#059669' : pet.accentHex}
                  strokeWidth={isSelf ? 3.5 : 2.5}
                />
                <text
                  x="0"
                  y="7"
                  textAnchor="middle"
                  fontSize="21"
                >
                  {pet.emoji}
                </text>

                {/* Status micro-badge (Finished / Anchored / Retrying) */}
                {player.officiallyFinished && (
                  <g transform="translate(14, -14)">
                    <circle cx="0" cy="0" r="8" fill="#16a34a" stroke="#ffffff" strokeWidth="1.5" />
                    <text x="0" y="3.5" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">
                      ✓
                    </text>
                  </g>
                )}
                {isAnchoredEarly && (
                  <g transform="translate(15, -14)">
                    <circle cx="0" cy="0" r="8.5" fill="#d97706" stroke="#ffffff" strokeWidth="1.5" />
                    <text x="0" y="3" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">
                      ⚓
                    </text>
                  </g>
                )}

                {/* Player name pill underneath */}
                <g transform="translate(0, 25)">
                  <rect
                    x="-40"
                    y="-8"
                    width="80"
                    height="16"
                    rx="4"
                    fill={isSelf ? '#065f46' : '#0f172a'}
                    fillOpacity="0.9"
                  />
                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="700"
                    fill="#ffffff"
                  >
                    {shortName} ({player.step})
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Compact Legend Footer */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1 font-semibold">
            <Flag className="w-3.5 h-3.5 text-rose-600" />
            <span>Mốc đỉnh: {safeSteps} bậc</span>
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
            <Anchor className="w-3.5 h-3.5" />
            <span>Neo đỉnh: Chờ hoàn tất câu hỏi</span>
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Về đích chính thức: Xong toàn bộ &amp; sạch câu sai</span>
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-slate-500">
          <RotateCcw className="w-3 h-3" />
          <span>Sai sẽ tự động quay lại vòng ôn cuối chặng</span>
        </span>
      </div>
    </div>
  );
};
