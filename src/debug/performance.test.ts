import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPerformanceRecorder, summarizeDurations } from './performance';

afterEach(() => vi.unstubAllGlobals());
describe('performance capture', () => {
  it('counts commits once across nested profilers and ignores inactive work', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);
    vi.stubGlobal('PerformanceObserver', undefined);
    const recorder = createPerformanceRecorder();
    recorder.onRender('App', 'mount', 100, 100, 0, 0);
    recorder.start();
    expect(() => recorder.start()).toThrow('already running');
    recorder.onRender('App', 'update', 8, 20, 1, 10);
    recorder.onRender('Child', 'update', 3, 6, 2, 10);
    recorder.onRender('App', 'update', 2, 20, 11, 15);
    expect(recorder.measure('read', () => 42)).toBe(42);
    expect(() => recorder.measure('failed', () => { throw new Error('test'); })).toThrow('test');
    const report = recorder.stop();
    expect(report.commits).toBe(2);
    expect(report.react[0]).toMatchObject({ id: 'App', count: 2, totalMs: 10, lastBaseMs: 20 });
    expect(report.spans.map((span) => span.id)).toEqual(['read', 'failed']);
    expect(cancel).toHaveBeenCalledWith(1);
    recorder.onRender('App', 'update', 100, 20, 1, 20);
    expect(recorder.report().commits).toBe(2);
    recorder.start();
    expect(recorder.report().react).toEqual([]);
    recorder.stop();
  });
  it('bounds recording memory and makes truncation visible', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('PerformanceObserver', undefined);
    const recorder = createPerformanceRecorder();
    recorder.start();
    for (let i = 0; i < 10005; i++) recorder.onRender('App', 'update', 1, 1, i, i);
    const report = recorder.stop();
    expect(report.react[0].count).toBe(10000);
    expect(report.droppedSamples).toBe(5);
  });
  it('summarizes empty and nonempty distributions', () => {
    expect(summarizeDurations([])).toEqual({ count: 0, totalMs: 0, p95Ms: 0, maxMs: 0 });
    expect(summarizeDurations([1, 2, 3, 100])).toEqual({ count: 4, totalMs: 106, p95Ms: 100, maxMs: 100 });
  });
});
