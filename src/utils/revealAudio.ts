// Web Audio API Synthesizer for Live Score Presentation Roll & Reveal Fanfare

export type RevealMusicStyle = 'dramatic' | 'ceremonial' | 'mute';

let sharedAudioCtx: AudioContext | null = null;
let rollIntervalId: ReturnType<typeof setInterval> | null = null;
let activeNodes: AudioNode[] = [];

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function registerNode(node: AudioNode) {
  activeNodes.push(node);
}

export function stopRevealAudio(): void {
  if (rollIntervalId !== null) {
    clearInterval(rollIntervalId);
    rollIntervalId = null;
  }
  activeNodes.forEach((node) => {
    try {
      node.disconnect();
    } catch {
      // ignore disconnect errors on completed nodes
    }
  });
  activeNodes = [];
}

function triggerTone(
  ctx: AudioContext,
  freq: number,
  durationSec: number,
  type: OscillatorType,
  peakGain: number,
  delaySec = 0
) {
  const startAt = ctx.currentTime + delaySec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peakGain), startAt + Math.min(0.03, durationSec * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  registerNode(osc);
  registerNode(gain);

  osc.start(startAt);
  osc.stop(startAt + durationSec + 0.02);
}

/**
 * Bắt đầu nhạc nền hồi hộp trong suốt quá trình chạy chữ số (Odometer roll).
 * Nhịp độ tăng nhẹ khi sắp chốt điểm cuối cùng và tự dừng khi hết thời lượng.
 */
export function startRevealRollMusic(
  style: RevealMusicStyle,
  durationMs: number
): () => void {
  stopRevealAudio();
  if (style === 'mute') return () => {};

  const ctx = getAudioContext();
  if (!ctx) return () => {};

  const startedAt = Date.now();
  const safeDuration = Math.max(800, durationMs);
  let stepIndex = 0;

  // Dramatic game-show ascending pentatonic & rhythmic pulse vs Ceremonial warm bells
  const dramaticNotes = [220, 261.63, 293.66, 329.63, 392.0, 440, 523.25, 587.33];
  const ceremonialNotes = [261.63, 329.63, 392.0, 493.88, 523.25, 659.25];
  const stepPeriodMs = style === 'dramatic' ? 140 : 210;

  const playStep = () => {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= safeDuration - 100) {
      if (rollIntervalId !== null) {
        clearInterval(rollIntervalId);
        rollIntervalId = null;
      }
      return;
    }

    const progress = Math.min(1, elapsed / safeDuration);

    if (style === 'dramatic') {
      // Rhythmic ticker + ascending harmonic tension
      const noteFreq = dramaticNotes[stepIndex % dramaticNotes.length] * (1 + progress * 0.18);
      triggerTone(ctx, noteFreq, 0.12, 'triangle', 0.05 + progress * 0.03);
      if (stepIndex % 2 === 0) {
        triggerTone(ctx, 110 * (1 + progress * 0.12), 0.16, 'sine', 0.07);
      }
    } else {
      // Ceremonial warm bell shimmer
      const noteFreq = ceremonialNotes[stepIndex % ceremonialNotes.length];
      triggerTone(ctx, noteFreq, 0.28, 'sine', 0.055);
      if (stepIndex % 3 === 0) {
        triggerTone(ctx, noteFreq * 0.5, 0.35, 'triangle', 0.035);
      }
    }
    stepIndex += 1;
  };

  // Start immediately on user gesture
  playStep();
  rollIntervalId = setInterval(playStep, stepPeriodMs);

  return () => {
    stopRevealAudio();
  };
}

/**
 * Phát âm thanh chúc mừng vang sáng khi chốt xong điểm số trên sân khấu.
 */
export function playRevealFanfare(style: RevealMusicStyle): void {
  if (style === 'mute') return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (style === 'dramatic') {
    // Crisp game-show lock chime: C5 - E5 - G5 - C6
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((freq, idx) => {
      triggerTone(ctx, freq, idx === chord.length - 1 ? 0.65 : 0.32, 'triangle', 0.08, idx * 0.065);
    });
  } else {
    // Warm ceremonial chord bloom
    const chord = [392.0, 493.88, 587.33, 783.99];
    chord.forEach((freq, idx) => {
      triggerTone(ctx, freq, 0.75, 'sine', 0.065, idx * 0.05);
    });
  }
}
