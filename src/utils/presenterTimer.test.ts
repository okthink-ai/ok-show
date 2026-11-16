import { describe, expect, it } from 'vitest';
import { formatElapsedTime, presenterPace, slideWeights, timerElapsedMs } from './presenterTimer';

describe('formatElapsedTime', () => {
  it.each([
    [0, '00:00'],
    [65, '01:05'],
    [2400, '40:00'],
    [3661, '1:01:01'],
    [-1, '00:00'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatElapsedTime(seconds)).toBe(expected);
  });
});

describe('timerElapsedMs', () => {
  it('adds the running stretch to banked time', () => {
    expect(timerElapsedMs({ runningSince: 1_000, elapsedMs: 5_000 }, 4_000)).toBe(8_000);
    expect(timerElapsedMs({ runningSince: null, elapsedMs: 5_000 }, 4_000)).toBe(5_000);
  });
});

describe('slideWeights', () => {
  it('weighs slides by spoken words with a floor for short notes', () => {
    const words = (count: number) => [Array.from({ length: count }, () => 'word').join(' ')];
    expect(slideWeights(['a', 'b', 'c'], { a: words(100), b: words(3) })).toEqual([100, 20, 20]);
  });

  it('treats every slide the same without notes', () => {
    expect(slideWeights(['a', 'b'], {})).toEqual([1, 1]);
  });
});

describe('presenterPace', () => {
  // Four equal slides over 40 minutes: each slide owns a 10-minute window.
  const base = { targetMs: 40 * 60_000, weights: [1, 1, 1, 1] };
  const minutes = (value: number) => value * 60_000;

  it('is idle before the clock starts', () => {
    expect(presenterPace({ ...base, elapsedMs: 0, slideIndex: 0 }).state).toBe('idle');
  });

  it('is on pace inside the current slide window', () => {
    expect(presenterPace({ ...base, elapsedMs: minutes(15), slideIndex: 1 })).toEqual({ state: 'on-pace', deltaMs: 0, remainingMs: minutes(25) });
  });

  it('is ahead when the slide arrives before its window', () => {
    expect(presenterPace({ ...base, elapsedMs: minutes(18), slideIndex: 2 })).toMatchObject({ state: 'ahead', deltaMs: minutes(2) });
  });

  it('is behind when the clock has passed the slide window', () => {
    expect(presenterPace({ ...base, elapsedMs: minutes(23), slideIndex: 1 })).toMatchObject({ state: 'behind', deltaMs: -minutes(3) });
  });

  it('is over once the talk length has passed', () => {
    expect(presenterPace({ ...base, elapsedMs: minutes(42), slideIndex: 3 })).toMatchObject({ state: 'over', remainingMs: -minutes(2) });
  });
});
