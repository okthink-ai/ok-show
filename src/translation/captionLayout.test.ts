import { describe, expect, it } from 'vitest';
import { recentCaptionLines } from './captionLayout';

const characters = (value: string) => value.length;

describe('recentCaptionLines', () => {
  it('returns the latest two complete measured lines', () => {
    const lines = recentCaptionLines('one two three four five six seven eight nine', 14, characters);
    expect(lines.map((line) => line.text)).toEqual(['seven eight', 'nine']);
    expect(lines.every((line) => characters(line.text) <= 14)).toBe(true);
  });

  it('splits a word that is wider than a line without clipping it', () => {
    const lines = recentCaptionLines('before extraordinarilylongword', 8, characters, 10);
    expect(lines.map((line) => line.text)).toEqual(['before', 'extraord', 'inarilyl', 'ongword']);
  });

  it('returns no lines when no usable width is available', () => {
    expect(recentCaptionLines('caption', 0, characters)).toEqual([]);
  });
});
