import { afterEach, describe, expect, it, vi } from 'vitest';
import { RealtimeChunkPacer, StreamingPcm16Encoder } from './audioCapture';

afterEach(() => vi.useRealTimers());

function samples(chunks: Uint8Array[]): number[] {
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const view = new DataView(bytes.buffer);
  return Array.from({ length: bytes.length / 2 }, (_, index) => view.getInt16(index * 2, true));
}

describe('StreamingPcm16Encoder', () => {
  it.each([
    [48000, 16000, 100, 4800, 1600],
    [44100, 16000, 100, 4410, 1600],
    [48000, 24000, 200, 9600, 4800],
    [44100, 24000, 200, 8820, 4800],
  ])('resamples %i Hz to paced %i Hz chunks', (inputRate, outputRate, duration, inputCount, expected) => {
    const encoder = new StreamingPcm16Encoder(inputRate, outputRate, duration);
    const input = Float32Array.from({ length: inputCount }, (_, index) => Math.sin(index / 20) * 0.5);
    const chunks = [
      ...encoder.push([input.slice(0, 127)]),
      ...encoder.push([input.slice(127, 811)]),
      ...encoder.push([input.slice(811)]),
      ...encoder.flush(),
    ];
    expect(samples(chunks)).toHaveLength(expected);
    expect(chunks).toHaveLength(1);
  });

  it('downmixes, clamps, writes little-endian PCM16, preserves silence, and flushes a short tail', () => {
    const encoder = new StreamingPcm16Encoder(16000, 16000, 100);
    const chunks = [
      ...encoder.push([new Float32Array([2, -2, 0, 1]), new Float32Array([2, -2, 0, -1])]),
      ...encoder.flush(),
    ];
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(8);
    expect(samples(chunks)).toEqual([32767, -32768, 0, 0]);
    expect([...chunks[0].slice(0, 4)]).toEqual([255, 127, 0, 128]);
  });

  it('paces queued chunks and drops the oldest audio beyond one second', async () => {
    vi.useFakeTimers();
    const sent: number[] = [];
    const pacer = new RealtimeChunkPacer(200, 5, (chunk) => sent.push(chunk[0]));
    for (let value = 1; value <= 5; value += 1) expect(pacer.enqueue(Uint8Array.of(value))).toBe(true);
    expect(pacer.enqueue(Uint8Array.of(6))).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([2]);
    await vi.advanceTimersByTimeAsync(800);
    await pacer.drain();
    expect(sent).toEqual([2, 3, 4, 5, 6]);
  });
});
