import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type OdometerDecimalMode = 'auto_decimal' | '1' | '2' | '0';

// 5 full cycles of 0..9 (indices 0..49) so even long multi-second spins roll continuously without gaps
const ODOMETER_DIGITS = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
];

export interface OdometerToken {
  key: string;
  char: string;
  isDigit: boolean;
  digitNum: number;
  colOrder: number;
}

export function formatScoreTokens(
  value: number,
  decimalPlaces: 0 | 1 | 2,
  minIntDigits = 3
): OdometerToken[] {
  const safeVal = Number.isFinite(value) ? Math.max(0, value) : 0;
  const fixed =
    decimalPlaces === 0 ? String(Math.round(safeVal)) : safeVal.toFixed(decimalPlaces);
  const [rawInt, rawDec] = fixed.split('.');
  const paddedInt = rawInt.padStart(minIntDigits, '0');

  const tokens: OdometerToken[] = [];
  let digitOrder = 0;

  for (let i = 0; i < paddedInt.length; i++) {
    const ch = paddedInt[i];
    const placeFromRight = paddedInt.length - 1 - i;
    tokens.push({
      key: `int-${placeFromRight}`,
      char: ch,
      isDigit: true,
      digitNum: Number(ch),
      colOrder: digitOrder++,
    });
  }

  if (decimalPlaces > 0 && rawDec !== undefined) {
    tokens.push({
      key: 'sep-dot',
      char: '.',
      isDigit: false,
      digitNum: -1,
      colOrder: -1,
    });
    for (let j = 0; j < rawDec.length; j++) {
      const ch = rawDec[j];
      tokens.push({
        key: `dec-${j}`,
        char: ch,
        isDigit: true,
        digitNum: Number(ch),
        colOrder: digitOrder++,
      });
    }
  }

  return tokens;
}

export function computeOdometerMaxRevealMs(
  prevVal: number,
  nextVal: number,
  decimalPlaces: 0 | 1 | 2,
  requestedTotalDurationMs?: number,
  minIntDigits = 3
): number {
  if (requestedTotalDurationMs && requestedTotalDurationMs > 0) {
    return Math.max(800, requestedTotalDurationMs);
  }
  const maxDigits = Math.max(
    formatScoreTokens(prevVal, decimalPlaces, minIntDigits).filter((t) => t.isDigit).length,
    formatScoreTokens(nextVal, decimalPlaces, minIntDigits).filter((t) => t.isDigit).length
  );
  const lastIdx = Math.max(0, maxDigits - 1);
  const duration = 640 + lastIdx * 140;
  const delay = lastIdx * 75;
  return duration + delay + 220;
}

interface OdometerDigitColumnProps {
  targetDigit: number;
  colOrder: number;
  totalCols: number;
  totalDurationMs?: number;
  rollTrigger?: string | number;
  isDecimalDigit?: boolean;
  theme?: 'light' | 'dark';
}

const OdometerDigitColumn: React.FC<OdometerDigitColumnProps> = React.memo(
  ({
    targetDigit,
    colOrder,
    totalCols,
    totalDurationMs,
    rollTrigger,
    isDecimalDigit = false,
    theme = 'light',
  }) => {
    const [reelIndex, setReelIndex] = useState<number>(targetDigit);
    const [transitionEnabled, setTransitionEnabled] = useState<boolean>(false);
    const [lockedDurationMs, setLockedDurationMs] = useState<number>(640);
    const [lockedDelayMs, setLockedDelayMs] = useState<number>(0);

    const committedTargetRef = useRef<number>(targetDigit);
    const prevTriggerRef = useRef<string | number | undefined>(rollTrigger);
    const raf1Ref = useRef<number | null>(null);
    const raf2Ref = useRef<number | null>(null);
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearPending = useCallback(() => {
      if (raf1Ref.current !== null) {
        cancelAnimationFrame(raf1Ref.current);
        raf1Ref.current = null;
      }
      if (raf2Ref.current !== null) {
        cancelAnimationFrame(raf2Ref.current);
        raf2Ref.current = null;
      }
      if (settleTimerRef.current !== null) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    }, []);

    const settleToFinal = useCallback(() => {
      clearPending();
      const finalDigit = committedTargetRef.current;
      setTransitionEnabled(false);
      setReelIndex(finalDigit);
    }, [clearPending]);

    useEffect(() => {
      const triggerChanged =
        rollTrigger !== undefined && rollTrigger !== prevTriggerRef.current;
      if (targetDigit === committedTargetRef.current && !triggerChanged) {
        return;
      }

      const prevDigit = committedTargetRef.current;
      committedTargetRef.current = targetDigit;
      prevTriggerRef.current = rollTrigger;
      clearPending();

      const startIdx = triggerChanged ? 0 : ((prevDigit % 10) + 10) % 10;

      // Distribute duration & stagger smoothly within totalDurationMs if configured
      let durationMs = 640 + colOrder * 140;
      let delayMs = colOrder * 75;
      let extraCycles = 1;

      if (totalDurationMs && totalDurationMs > 0) {
        const usableMs = Math.max(600, totalDurationMs - 140);
        const maxOrder = Math.max(1, totalCols - 1);
        const ratio = maxOrder > 0 ? colOrder / maxOrder : 0;
        // Earlier digits lock slightly earlier to build tension until the final digit locks at `usableMs`
        delayMs = Math.round(ratio * Math.min(550, usableMs * 0.16));
        const colFinishAt = Math.round(usableMs * (0.52 + 0.48 * ratio));
        durationMs = Math.max(450, colFinishAt - delayMs);

        if (durationMs >= 5000) {
          extraCycles = 3;
        } else if (durationMs >= 2200) {
          extraCycles = 2;
        } else if (durationMs >= 1000) {
          extraCycles = 1;
        } else {
          extraCycles = 0;
        }
      }

      let destIdx = targetDigit + extraCycles * 10;
      if (destIdx <= startIdx) {
        destIdx += 10;
      }
      if (destIdx >= ODOMETER_DIGITS.length) {
        destIdx = targetDigit + 30;
      }

      setTransitionEnabled(false);
      setReelIndex(startIdx);

      raf1Ref.current = requestAnimationFrame(() => {
        raf2Ref.current = requestAnimationFrame(() => {
          setLockedDurationMs(durationMs);
          setLockedDelayMs(delayMs);
          setTransitionEnabled(true);
          setReelIndex(destIdx);
        });
      });

      settleTimerRef.current = setTimeout(() => {
        settleToFinal();
      }, durationMs + delayMs + 90);
    }, [
      targetDigit,
      colOrder,
      totalCols,
      totalDurationMs,
      rollTrigger,
      clearPending,
      settleToFinal,
    ]);

    useEffect(() => {
      return () => clearPending();
    }, [clearPending]);

    const handleTransitionEnd = (e: React.TransitionEvent<HTMLSpanElement>) => {
      if (e.propertyName === 'transform') {
        settleToFinal();
      }
    };

    const cellTone =
      theme === 'dark'
        ? isDecimalDigit
          ? 'bg-amber-400/15 text-amber-300 border border-amber-400/25'
          : 'bg-white/10 text-white border border-white/15'
        : isDecimalDigit
        ? 'bg-amber-500/10 text-amber-700'
        : 'bg-slate-950/5 text-slate-950';

    return (
      <span className={`odometer-digit-window px-[1px] rounded-md ${cellTone}`}>
        <span
          className="odometer-digit-reel"
          onTransitionEnd={handleTransitionEnd}
          style={{
            transform: `translate3d(0, calc(-1 * ${reelIndex} * var(--odo-h)), 0)`,
            transitionDuration: transitionEnabled ? `${lockedDurationMs}ms` : '0ms',
            transitionDelay: transitionEnabled ? `${lockedDelayMs}ms` : '0ms',
          }}
        >
          {ODOMETER_DIGITS.map((d, idx) => (
            <span key={idx} className="odometer-digit-cell">
              {d}
            </span>
          ))}
        </span>
      </span>
    );
  }
);
OdometerDigitColumn.displayName = 'OdometerDigitColumn';

export interface OdometerScoreProps {
  value: number;
  decimalPlaces: 0 | 1 | 2;
  minIntDigits?: number;
  totalDurationMs?: number;
  rollTrigger?: string | number;
  isRolling?: boolean;
  size?: 'md' | 'lg' | 'xl' | '2xl';
  theme?: 'light' | 'dark';
}

export const OdometerScore: React.FC<OdometerScoreProps> = React.memo(
  ({
    value,
    decimalPlaces,
    minIntDigits = 3,
    totalDurationMs,
    rollTrigger,
    isRolling = false,
    size = 'lg',
    theme = 'light',
  }) => {
    const tokens = useMemo(
      () => formatScoreTokens(value, decimalPlaces, minIntDigits),
      [value, decimalPlaces, minIntDigits]
    );
    const totalDigitCols = useMemo(
      () => tokens.filter((t) => t.isDigit).length,
      [tokens]
    );

    const sizeClass =
      size === '2xl'
        ? 'odometer-size-2xl font-black tracking-wider'
        : size === 'xl'
        ? 'odometer-size-xl font-black tracking-wider'
        : size === 'lg'
        ? 'odometer-size-lg font-extrabold tracking-wide'
        : 'odometer-size-md font-bold';

    return (
      <span
        className={`odometer-score-root font-mono ${sizeClass} ${
          isRolling
            ? theme === 'dark'
              ? 'text-amber-300'
              : 'text-amber-500'
            : ''
        }`}
      >
        {tokens.map((tok) => {
          if (!tok.isDigit) {
            return (
              <span key={tok.key} className="odometer-separator font-black">
                {tok.char}
              </span>
            );
          }
          return (
            <OdometerDigitColumn
              key={tok.key}
              targetDigit={tok.digitNum}
              colOrder={tok.colOrder}
              totalCols={totalDigitCols}
              totalDurationMs={totalDurationMs}
              rollTrigger={rollTrigger}
              isDecimalDigit={tok.key.startsWith('dec-')}
              theme={theme}
            />
          );
        })}
      </span>
    );
  }
);
OdometerScore.displayName = 'OdometerScore';
