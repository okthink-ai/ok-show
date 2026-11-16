import type { ProfilerOnRenderCallback } from 'react';

interface RenderSample { id: string; phase: string; actualMs: number; baseMs: number; commitTime: number }
const MAX_SAMPLES = 10000;
const round = (value: number) => Math.round(value * 100) / 100;
export function summarizeDurations(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: values.length, totalMs: round(values.reduce((a, b) => a + b, 0)),
    p95Ms: round(sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? 0), maxMs: round(sorted.at(-1) ?? 0) };
}

/** Bounded, opt-in recording. No observers or animation loop run outside a capture. */
export function createPerformanceRecorder() {
  let active = false;
  let started = 0;
  let ended = 0;
  let frame = 0;
  let lastFrame = 0;
  let observer: PerformanceObserver | undefined;
  let renders: RenderSample[] = [];
  let frames: number[] = [];
  let tasks: number[] = [];
  let spans: Record<string, number[]> = {};
  let dropped = 0;
  let longTasksSupported = false;
  const append = <T,>(list: T[], value: T) => { if (list.length < MAX_SAMPLES) list.push(value); else dropped++; };
  const collectTasks = (entries: PerformanceEntry[]) => {
    entries.filter((entry) => entry.startTime >= started).forEach((entry) => append(tasks, entry.duration));
  };
  const onRender: ProfilerOnRenderCallback = (id, phase, actualMs, baseMs, _start, commitTime) => {
    if (active) append(renders, { id, phase, actualMs, baseMs, commitTime });
  };
  const report = () => ({
    active, durationMs: round((active ? performance.now() : ended) - started), droppedSamples: dropped,
    react: Object.entries(renders.reduce<Record<string, RenderSample[]>>((groups, sample) => { (groups[sample.id] ??= []).push(sample); return groups; }, {})).map(([id, samples]) => ({
      id, ...summarizeDurations(samples!.map((sample) => sample.actualMs)),
      mounts: samples!.filter((sample) => sample.phase === 'mount').length,
      renderedCommits: samples!.filter((sample) => sample.actualMs > 0).length,
      lastBaseMs: round(samples!.at(-1)?.baseMs ?? 0),
    })).sort((a, b) => b.totalMs - a.totalMs),
    commits: new Set(renders.map((sample) => sample.commitTime)).size,
    frames: { ...summarizeDurations(frames), overBudget: frames.filter((ms) => ms > 20).length, budgetMs: 20 },
    longTasks: { supported: longTasksSupported, ...summarizeDurations(tasks) },
    spans: Object.entries(spans).map(([id, values]) => ({ id, ...summarizeDurations(values) })),
    caveats: 'Development React timings include StrictMode/profiling overhead. Nested boundaries overlap; do not sum them. Frame gaps include browser scheduling, not only React. CPU throttling is a simulation, not a phone measurement.',
  });
  const stop = () => {
    if (active) {
      ended = performance.now();
      active = false;
      cancelAnimationFrame(frame);
      if (observer) collectTasks(observer.takeRecords());
      observer?.disconnect();
    }
    return report();
  };
  return {
    onRender,
    start() {
      if (active) throw new Error('A performance capture is already running. Stop it first.');
      renders = []; frames = []; tasks = []; spans = {}; dropped = 0; lastFrame = 0;
      started = performance.now(); ended = started; active = true;
      const tick = (now: number) => {
        if (!active) return;
        if (lastFrame) append(frames, now - lastFrame);
        lastFrame = now;
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      longTasksSupported = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask');
      if (longTasksSupported) {
        observer = new PerformanceObserver((list) => collectTasks(list.getEntries()));
        observer.observe({ type: 'longtask' });
      }
      return { active };
    },
    stop, report,
    measure<T>(id: string, action: () => T): T {
      if (!active) return action();
      const start = performance.now();
      try { return action(); } finally { append(spans[id] ??= [], performance.now() - start); }
    },
  };
}
export const performanceRecorder = createPerformanceRecorder();
