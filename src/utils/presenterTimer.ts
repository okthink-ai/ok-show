/** Minutes and seconds, with hours only once a talk runs past an hour. */
export function formatElapsedTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${String(minutes).padStart(2, '0')}:${rest}`;
}

export interface PresenterTimerState {
  /** Epoch milliseconds when the current run started, or null while paused. */
  runningSince: number | null;
  /** Time banked by earlier runs. */
  elapsedMs: number;
}

export function timerElapsedMs(timer: PresenterTimerState, now: number): number {
  return timer.elapsedMs + (timer.runningSince === null ? 0 : Math.max(0, now - timer.runningSince));
}

/**
 * Short slides still take a breath, so no slide weighs less than this many
 * spoken words even when its notes are a single line.
 */
const MIN_SLIDE_WORDS = 20;

/**
 * Relative speaking time for each slide, estimated from its speaker notes.
 * Without notes every slide counts the same.
 */
export function slideWeights(slideIds: string[], notes: Record<string, string[]>): number[] {
  const words = slideIds.map((id) => (notes[id] ?? []).join(' ').split(/\s+/).filter(Boolean).length);
  if (!words.some(Boolean)) return slideIds.map(() => 1);
  return words.map((count) => Math.max(MIN_SLIDE_WORDS, count));
}

export type PaceState = 'idle' | 'ahead' | 'on-pace' | 'behind' | 'over';

export interface Pace {
  state: PaceState;
  /** How far ahead (positive) or behind (negative) the plan, in milliseconds. */
  deltaMs: number;
  remainingMs: number;
}

/**
 * Compare the clock with the planned window for the current slide. Inside the
 * window you are on pace; before it you are ahead, after it you are behind.
 */
export function presenterPace({ elapsedMs, targetMs, weights, slideIndex }: { elapsedMs: number; targetMs: number; weights: number[]; slideIndex: number }): Pace {
  const remainingMs = targetMs - elapsedMs;
  if (elapsedMs <= 0 || !weights.length || targetMs <= 0) return { state: 'idle', deltaMs: 0, remainingMs };
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const index = Math.max(0, Math.min(slideIndex, weights.length - 1));
  const before = weights.slice(0, index).reduce((sum, weight) => sum + weight, 0);
  const start = (before / total) * targetMs;
  const end = ((before + weights[index]) / total) * targetMs;
  if (remainingMs < 0) return { state: 'over', deltaMs: end - elapsedMs, remainingMs };
  if (elapsedMs < start) return { state: 'ahead', deltaMs: start - elapsedMs, remainingMs };
  if (elapsedMs > end) return { state: 'behind', deltaMs: end - elapsedMs, remainingMs };
  return { state: 'on-pace', deltaMs: 0, remainingMs };
}
