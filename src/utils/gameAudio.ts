// Web Audio API Synthesizer for Mountain Climb Game Sound Effects

let gameAudioCtx: AudioContext | null = null;
let isGameAudioMuted = false;

export function setGameAudioMuted(muted: boolean): void {
  isGameAudioMuted = muted;
}

export function getGameAudioMuted(): boolean {
  return isGameAudioMuted;
}

function getCtx(): AudioContext | null {
  if (isGameAudioMuted || typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!gameAudioCtx || gameAudioCtx.state === 'closed') {
    gameAudioCtx = new AudioCtx();
  }
  if (gameAudioCtx.state === 'suspended') {
    void gameAudioCtx.resume().catch(() => {});
  }
  return gameAudioCtx;
}

function playTone(
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
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.001, peakGain),
    startAt + Math.min(0.025, durationSec * 0.25)
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationSec + 0.02);
}

export function playGameStartChime(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const notes = [392.0, 493.88, 587.33, 783.99];
  notes.forEach((f, idx) => {
    playTone(ctx, f, 0.24, 'triangle', 0.07, idx * 0.075);
  });
}

export function playPetClimbSound(stepsDelta: number): void {
  const ctx = getCtx();
  if (!ctx) return;
  const hops = Math.max(1, Math.min(4, stepsDelta));
  const scale = [523.25, 587.33, 659.25, 783.99, 880.0];
  for (let i = 0; i < hops; i++) {
    playTone(ctx, scale[i], 0.16, 'triangle', 0.075, i * 0.075);
  }
}

export function playGameWrongSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  playTone(ctx, 240, 0.16, 'sawtooth', 0.04, 0);
  playTone(ctx, 185, 0.24, 'sawtooth', 0.045, 0.11);
}

export function playTickWarningSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  playTone(ctx, 880, 0.055, 'sine', 0.03, 0);
}

export function playSummitAnchorSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const chord = [523.25, 659.25, 783.99, 1046.5];
  chord.forEach((f, idx) => {
    playTone(ctx, f, 0.35, 'sine', 0.065, idx * 0.06);
  });
}

export function playVictoryFanfareSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const sequence = [
    { f: 523.25, d: 0.14, t: 0 },
    { f: 659.25, d: 0.14, t: 0.1 },
    { f: 783.99, d: 0.14, t: 0.2 },
    { f: 1046.5, d: 0.55, t: 0.32 },
    { f: 783.99, d: 0.18, t: 0.48 },
    { f: 1046.5, d: 0.75, t: 0.64 },
  ];
  sequence.forEach((n) => {
    playTone(ctx, n.f, n.d, 'triangle', 0.08, n.t);
  });
}
