import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Compass,
  EyeOff,
  Flag,
  HelpCircle,
  Maximize2,
  Minimize2,
  Mountain,
  RotateCcw,
  Skull,
  Trophy,
  X,
} from 'lucide-react';
import type { ObstaclePlayerState } from '../types/exam';
import { getMountainPetById, getObstacleStageMeta } from '../data/mountainPets';

interface AvatarTokenProps {
  player: ObstaclePlayerState;
  isMe: boolean;
  sizeClass?: string;
}

const AnimalAvatarBadge: React.FC<AvatarTokenProps> = ({
  player,
  isMe,
  sizeClass = 'w-16 h-16 sm:w-20 sm:h-20',
}) => {
  const pet = getMountainPetById(player.petId);
  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div
        className={`relative ${sizeClass} rounded-2xl flex items-center justify-center shadow-md border-[3px] transition-all duration-300 ${
          player.eliminated
            ? 'bg-slate-200 border-slate-400 grayscale opacity-75'
            : isMe
              ? 'bg-white border-emerald-500 ring-4 ring-emerald-400/35 shadow-emerald-200/80 scale-[1.03]'
              : `${pet.bgClass} ${pet.borderClass}`
        }`}
        style={{
          borderColor: !player.eliminated && isMe ? '#10b981' : !player.eliminated ? pet.accentHex : undefined,
        }}
      >
        <span className="text-3xl sm:text-4xl leading-none drop-shadow-xs" aria-hidden="true">
          {pet.emoji}
        </span>

        {isMe && (
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-extrabold uppercase tracking-wide shadow-xs whitespace-nowrap">
            Bạn
          </span>
        )}

        {player.finished && !player.eliminated && (
          <span
            className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-sm border-2 border-white"
            title="Đã về đích"
          >
            <Trophy className="w-3.5 h-3.5" />
          </span>
        )}

        {player.eliminated && (
          <span
            className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-sm border-2 border-white"
            title="Bị loại"
          >
            <Skull className="w-3.5 h-3.5" />
          </span>
        )}
      </div>

      <span
        className={`max-w-[96px] truncate px-2 py-0.5 rounded-lg text-[11px] font-bold shadow-xs border whitespace-nowrap ${
          isMe
            ? 'bg-emerald-700 text-white border-emerald-800'
            : 'bg-white/95 text-slate-800 border-slate-200'
        }`}
        title={player.name}
      >
        {player.name}
      </span>
    </div>
  );
};

// ============================================================================
// MAP 1: MINIMAP TỔNG QUÁT (Thu gọn góc trên bên trái, bấm mở rộng toàn cảnh)
// ============================================================================
interface MountainMinimapProps {
  players: ObstaclePlayerState[];
  totalObstacles: number;
  currentPlayerId?: string;
}

export const MountainMinimap: React.FC<MountainMinimapProps> = ({
  players,
  totalObstacles,
  currentPlayerId,
}) => {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const safeTotal = Math.max(1, totalObstacles);

  const stageNodes = useMemo(() => {
    return Array.from({ length: safeTotal + 1 }, (_, idx) => {
      const t = idx / safeTotal;
      // Gentle ascending zig-zag inside a 260x88 viewBox
      const x = 18 + t * 224;
      const wave = Math.sin(t * Math.PI * 2.5) * 14;
      const y = 70 - t * 48 + wave * (idx === 0 || idx === safeTotal ? 0 : 0.65);
      return { idx, x, y };
    });
  }, [safeTotal]);

  const pathD = useMemo(() => {
    if (stageNodes.length === 0) return '';
    return stageNodes.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
  }, [stageNodes]);

  return (
    <>
      {/* Collapsed Compact Minimap Widget (Top-Left) */}
      <button
        type="button"
        onClick={() => setExpanded(true)}
        data-testid="minimap-collapsed-trigger"
        className="group text-left bg-white/95 hover:bg-white border-2 border-slate-200 hover:border-sky-400 rounded-2xl p-2.5 shadow-md hover:shadow-lg transition-all cursor-pointer w-56 sm:w-64 shrink-0"
        title="Bấm để mở rộng bản đồ tổng quát"
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Compass className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <span className="text-[11px] font-extrabold text-slate-800 truncate">
              Bản đồ tổng quát
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded-md border border-sky-200 shrink-0 whitespace-nowrap group-hover:bg-sky-100">
            <Maximize2 className="w-2.5 h-2.5" />
            Mở rộng
          </span>
        </div>

        <div className="relative rounded-xl bg-linear-to-b from-sky-50 to-emerald-50 border border-slate-100 overflow-hidden">
          <svg viewBox="0 0 260 88" className="w-full h-20 block">
            <path d={pathD} fill="none" stroke="#cbd5e1" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
            <path d={pathD} fill="none" stroke="#0284c7" strokeWidth={2} strokeDasharray="4 4" strokeLinecap="round" />

            {stageNodes.map((pt) => (
              <circle
                key={pt.idx}
                cx={pt.x}
                cy={pt.y}
                r={pt.idx === safeTotal ? 5 : 3}
                fill={pt.idx === safeTotal ? '#f59e0b' : pt.idx === 0 ? '#10b981' : '#ffffff'}
                stroke={pt.idx === safeTotal ? '#b45309' : '#64748b'}
                strokeWidth={1.5}
              />
            ))}

            {players.map((p, idx) => {
              const node = stageNodes[Math.min(safeTotal, Math.max(0, p.stageIndex))] || stageNodes[0];
              const isMe = p.id === currentPlayerId;
              const pet = getMountainPetById(p.petId);
              const offsetX = ((idx % 3) - 1) * 5;
              const offsetY = Math.floor(idx / 3) * -6;
              return (
                <g key={p.id} transform={`translate(${node.x + offsetX}, ${node.y + offsetY})`}>
                  <circle
                    r={isMe ? 8.5 : 6.5}
                    fill={isMe ? '#10b981' : '#ffffff'}
                    stroke={isMe ? '#065f46' : pet.accentHex}
                    strokeWidth={isMe ? 2.2 : 1.5}
                  />
                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    fontSize={isMe ? '10' : '8'}
                  >
                    {pet.emoji}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="mt-1 flex items-center justify-between text-[10px] font-semibold text-slate-500">
          <span>{players.length} người thi đấu</span>
          <span className="tabular-nums">{safeTotal} chướng ngại</span>
        </div>
      </button>

      {/* Expanded Minimap Overview Modal (click outside or close button to collapse) */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4"
          data-testid="minimap-expanded-modal"
          onClick={() => setExpanded(false)}
        >
          <div
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
                  <Mountain className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                    Toàn cảnh tuyến đường leo núi
                  </h3>
                  <p className="text-xs text-slate-500">
                    Theo dõi vị trí tất cả người chơi qua {safeTotal} chướng ngại vật. Bấm ra ngoài để thu gọn.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                data-testid="minimap-collapse-button"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
              >
                <Minimize2 className="w-4 h-4" />
                Thu gọn
                <X className="w-3.5 h-3.5 ml-0.5" />
              </button>
            </div>

            <MountainSpectatorMap
              players={players}
              totalObstacles={safeTotal}
              currentPlayerId={currentPlayerId}
              compactHeight
            />
          </div>
        </div>
      )}
    </>
  );
};

// ============================================================================
// MAP 2: MAP ĐƯỜNG ĐI CHÍNH ("Đi đến đâu hiện đến đấy, đi qua xa ẩn đi")
// ============================================================================
interface MountainProgressiveMapProps {
  players: ObstaclePlayerState[];
  totalObstacles: number;
  currentPlayerId?: string;
  pushedBackNotice?: string | null;
}

export const MountainProgressiveMap: React.FC<MountainProgressiveMapProps> = ({
  players,
  totalObstacles,
  currentPlayerId,
  pushedBackNotice,
}) => {
  const safeTotal = Math.max(1, totalObstacles);
  const myPlayer = players.find((p) => p.id === currentPlayerId);
  const myStage = Math.min(safeTotal, Math.max(0, myPlayer?.stageIndex ?? 0));

  // Window: 1 chặng ngay sau lưng + chặng hiện tại + 3 chặng phía trước
  // Nếu bị phạt lùi chặng, myStage giảm xuống -> cửa sổ tự động dịch lùi và mở sáng lại các chặng đã qua!
  const windowStart = Math.max(0, myStage - 1);
  const windowEnd = Math.min(safeTotal, myStage + 3);

  const visibleIndices = useMemo(() => {
    const arr: number[] = [];
    for (let i = windowStart; i <= windowEnd; i++) {
      arr.push(i);
    }
    return arr;
  }, [windowStart, windowEnd]);

  const hiddenBehindCount = windowStart;
  const hiddenAheadCount = safeTotal - windowEnd;

  const playersByStage = useMemo(() => {
    const map = new Map<number, ObstaclePlayerState[]>();
    players.forEach((p) => {
      const s = Math.min(safeTotal, Math.max(0, p.stageIndex));
      const list = map.get(s) || [];
      list.push(p);
      map.set(s, list);
    });
    // Sort self first so self is never buried
    map.forEach((list) => {
      list.sort((a, b) => {
        if (a.id === currentPlayerId) return -1;
        if (b.id === currentPlayerId) return 1;
        return a.joinedAtMs - b.joinedAtMs;
      });
    });
    return map;
  }, [players, safeTotal, currentPlayerId]);

  return (
    <div
      className="rounded-3xl border border-slate-200 bg-linear-to-b from-sky-50 via-white to-emerald-50/60 p-4 sm:p-5 shadow-sm space-y-4 overflow-hidden"
      data-testid="progressive-main-map"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mountain className="w-4 h-4 text-emerald-700" />
          <span className="text-xs sm:text-sm font-extrabold text-slate-900">
            Hành trình chặng hiện tại
          </span>
          <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-lg tabular-nums">
            {myStage >= safeTotal ? `Đích ${safeTotal}/${safeTotal}` : `Chặng ${myStage + 1}/${safeTotal}`}
          </span>
        </div>

        {pushedBackNotice && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold animate-pulse">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{pushedBackNotice}</span>
          </div>
        )}
      </div>

      {/* Horizontal winding trail across visible window */}
      <div className="overflow-x-auto pb-2">
        <div className="flex items-stretch gap-3 min-w-max px-1 py-2">
          {/* Dimmed collapsed stub for distant passed obstacles */}
          {hiddenBehindCount > 0 && (
            <div
              className="flex flex-col items-center justify-center w-28 shrink-0 rounded-2xl border border-dashed border-slate-300 bg-slate-100/70 px-3 py-4 opacity-55 transition-all"
              data-testid="progressive-hidden-behind"
              title="Các chặng đã vượt qua xa được thu gọn để giữ màn hình gọn gàng; sẽ tự động hiện lại nếu bạn bị lùi chặng"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mb-1.5" />
              <span className="text-[11px] font-bold text-slate-600 text-center">
                Đã vượt qua
              </span>
              <span className="text-xs font-extrabold text-slate-700 tabular-nums mt-0.5">
                {hiddenBehindCount} chặng trước
              </span>
            </div>
          )}

          {/* Visible obstacle nodes */}
          {visibleIndices.map((stageIdx, arrIdx) => {
            const isStart = stageIdx === 0;
            const isSummit = stageIdx === safeTotal;
            const isCurrent = stageIdx === myStage && myStage < safeTotal;
            const isPassed = stageIdx < myStage;
            const meta = getObstacleStageMeta(stageIdx);
            const playersHere = playersByStage.get(stageIdx) || [];

            return (
              <React.Fragment key={stageIdx}>
                <div
                  data-testid={`progressive-stage-${stageIdx}`}
                  className={`relative flex flex-col justify-between min-w-[168px] max-w-[230px] rounded-2xl border-2 p-3.5 transition-all duration-300 ${
                    isCurrent
                      ? 'bg-emerald-50/90 border-emerald-500 shadow-md ring-2 ring-emerald-300/60'
                      : isSummit
                        ? 'bg-amber-50/90 border-amber-400 shadow-sm'
                        : isPassed
                          ? 'bg-slate-50/80 border-slate-200 opacity-75'
                          : 'bg-white border-sky-200 shadow-xs'
                  }`}
                >
                  {/* Obstacle Header */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-lg leading-none" aria-hidden="true">
                        {isStart ? '⛺' : isSummit ? '🏔️' : meta.icon}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-900 truncate">
                          {isStart ? 'Xuất phát' : isSummit ? 'Đỉnh núi' : `Chặng ${stageIdx}`}
                        </div>
                        <div className="text-[10px] font-semibold text-slate-500 truncate">
                          {isStart ? 'Trại chân núi' : isSummit ? 'Vinh quang' : meta.label}
                        </div>
                      </div>
                    </div>

                    {isCurrent && (
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-extrabold whitespace-nowrap shrink-0">
                        Đang ở đây
                      </span>
                    )}
                    {isPassed && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                    {isSummit && myStage >= safeTotal && (
                      <Flag className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                  </div>

                  {/* Players standing on this obstacle — spaced in flex-wrap grid so 64-80px avatars never overlap */}
                  <div className="min-h-[108px] flex flex-wrap items-center justify-center gap-2.5 pt-1">
                    {playersHere.length > 0 ? (
                      playersHere.map((p) => (
                        <AnimalAvatarBadge
                          key={p.id}
                          player={p}
                          isMe={p.id === currentPlayerId}
                          sizeClass="w-16 h-16 sm:w-20 sm:h-20"
                        />
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-300 py-3">
                        <div className="w-8 h-8 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center text-[11px] font-bold">
                          {stageIdx}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {arrIdx < visibleIndices.length - 1 && (
                  <div className="flex items-center justify-center shrink-0">
                    <div className="w-6 h-1.5 rounded-full bg-linear-to-r from-emerald-300 to-sky-300" />
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {/* Fogged upcoming obstacles */}
          {hiddenAheadCount > 0 && (
            <div
              className="flex flex-col items-center justify-center w-32 shrink-0 rounded-2xl border border-dashed border-sky-300 bg-sky-50/75 px-3 py-4 opacity-80"
              data-testid="progressive-hidden-ahead"
            >
              <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center mb-1.5">
                {hiddenAheadCount > 2 ? <EyeOff className="w-4 h-4" /> : <HelpCircle className="w-4 h-4" />}
              </div>
              <span className="text-[11px] font-bold text-slate-600 text-center">
                Sương mù phía trước
              </span>
              <span className="text-xs font-extrabold text-sky-800 tabular-nums mt-0.5">
                +{hiddenAheadCount} chặng ẩn
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// BẢN ĐỒ TOÀN CẢNH CHO CHỦ TRÒ QUAN SÁT & CHẾ ĐỘ MỞ RỘNG MINIMAP
// ============================================================================
interface MountainSpectatorMapProps {
  players: ObstaclePlayerState[];
  totalObstacles: number;
  currentPlayerId?: string;
  compactHeight?: boolean;
}

export const MountainSpectatorMap: React.FC<MountainSpectatorMapProps> = ({
  players,
  totalObstacles,
  currentPlayerId,
  compactHeight = false,
}) => {
  const safeTotal = Math.max(1, totalObstacles);

  const playersByStage = useMemo(() => {
    const map = new Map<number, ObstaclePlayerState[]>();
    players.forEach((p) => {
      const s = Math.min(safeTotal, Math.max(0, p.stageIndex));
      const list = map.get(s) || [];
      list.push(p);
      map.set(s, list);
    });
    return map;
  }, [players, safeTotal]);

  const stages = useMemo(
    () => Array.from({ length: safeTotal + 1 }, (_, i) => i),
    [safeTotal]
  );

  return (
    <div
      className={`rounded-3xl border border-slate-200 bg-linear-to-b from-sky-50 via-white to-emerald-50/50 p-4 sm:p-6 shadow-sm ${
        compactHeight ? '' : 'min-h-[340px]'
      }`}
      data-testid="spectator-panorama-map"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Mountain className="w-5 h-5 text-emerald-700" />
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
            Bản đồ toàn cảnh đường đua ({safeTotal} chướng ngại vật)
          </h3>
        </div>
        <span className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-lg tabular-nums">
          {players.filter((p) => p.finished && !p.eliminated).length}/{players.length} đã về đích
        </span>
      </div>

      {/* Responsive full-route track grid where every obstacle and 64-80px player avatar sits clearly without overlapping */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {stages.map((stageIdx) => {
          const isStart = stageIdx === 0;
          const isSummit = stageIdx === safeTotal;
          const meta = getObstacleStageMeta(stageIdx);
          const group = playersByStage.get(stageIdx) || [];

          return (
            <div
              key={stageIdx}
              className={`rounded-2xl border-2 p-3 flex flex-col justify-between min-h-[156px] transition-all ${
                isSummit
                  ? 'bg-amber-50/85 border-amber-400 shadow-sm'
                  : isStart
                    ? 'bg-emerald-50/80 border-emerald-300'
                    : group.length > 0
                      ? 'bg-white border-sky-300 shadow-xs'
                      : 'bg-white/75 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 pb-2 mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-base leading-none" aria-hidden="true">
                    {isStart ? '⛺' : isSummit ? '🏆' : meta.icon}
                  </span>
                  <span className="text-xs font-extrabold text-slate-900 truncate">
                    {isStart ? 'Xuất phát' : isSummit ? 'Đỉnh núi' : `Chặng ${stageIdx}`}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-slate-500 tabular-nums shrink-0">
                  {group.length > 0 ? `${group.length} người` : `#${stageIdx}`}
                </span>
              </div>

              <div className="flex-1 flex flex-wrap items-center justify-center gap-2 py-1">
                {group.length > 0 ? (
                  group.map((p) => (
                    <AnimalAvatarBadge
                      key={p.id}
                      player={p}
                      isMe={p.id === currentPlayerId}
                      sizeClass="w-16 h-16"
                    />
                  ))
                ) : (
                  <span className="text-[11px] font-semibold text-slate-400">
                    {isStart ? 'Điểm xuất phát' : isSummit ? 'Cờ đích' : meta.label}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Legacy alias kept in case any external reference exists
export const MountainClimbMap = MountainSpectatorMap;
