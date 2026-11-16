import { describe, expect, it } from 'vitest';
import { cueAtReadingLine, preparePracticeMarkdown, resolveSlideCue } from './slideCues';

describe('manuscript slide references', () => {
  it('resolves matching links locally regardless of the source hostname', () => {
    expect(resolveSlideCue('http://old-machine:5193/?presentation=my-talk&slide=22', 'my-talk', 80)).toBe(21);
    expect(resolveSlideCue('/?slide=1&presentation=my-talk', 'my-talk', 80)).toBe(0);
  });
  it.each([
    '/?presentation=demo&slide=1', '/?presentation=my-talk&slide=0',
    '/?presentation=my-talk&slide=81', '/?presentation=my-talk&slide=2.5',
    '/?presentation=my-talk&slide=NaN', '/notes?presentation=my-talk&slide=1',
    'javascript:alert(1)', 'https://example.com/docs',
  ])('ignores unavailable or unrelated links: %s', (href) => {
    expect(resolveSlideCue(href, 'my-talk', 80)).toBeNull();
  });
});

describe('reading position slide cues', () => {
  const cues = [100, 200, 300];
  it('selects the most recent cue in document order, including large scroll jumps', () => {
    expect(cueAtReadingLine(cues, 50, null)).toBe(-1);
    expect(cueAtReadingLine(cues, 250, null)).toBe(1);
    expect(cueAtReadingLine(cues, 400, -1)).toBe(2);
    expect(cueAtReadingLine(cues, 120, 2)).toBe(0);
  });
  it('ignores small movement around a cue in either direction', () => {
    expect(cueAtReadingLine(cues, 203, 0)).toBe(0);
    expect(cueAtReadingLine(cues, 207, 0)).toBe(1);
    expect(cueAtReadingLine(cues, 197, 1)).toBe(1);
    expect(cueAtReadingLine(cues, 193, 1)).toBe(0);
  });
});

describe('stable manuscript markers', () => {
  const slides = [{ id: 'intro', title: 'Hello [world]' }, { id: 'closing', title: 'Thank you' }];
  it('renders stable IDs as cues with the current number and title', () => {
    const source = 'Before\n\n<!-- slide:closing -->\n\nAfter';
    expect(preparePracticeMarkdown(source, 'talk', slides)).toBe('Before\n\n[Slide 2 — Thank you](/?presentation=talk&slideId=closing)\n\nAfter');
    expect(resolveSlideCue('/?presentation=talk&slideId=closing', 'talk', 2, ['closing', 'intro'])).toBe(0);
    expect(resolveSlideCue('/?presentation=talk&slideId=gone', 'talk', 2, ['closing', 'intro'])).toBeNull();
  });
  it('preserves code examples and other comments', () => {
    const source = '```html\n<!-- slide:intro -->\n```\n<!-- private editorial note -->';
    expect(preparePracticeMarkdown(source, 'talk', slides)).toBe(source);
  });
  it('escapes slide titles and leaves missing IDs visibly unresolved', () => {
    expect(preparePracticeMarkdown('<!-- slide:intro -->', 'talk', slides)).toContain('Hello \\[world\\]');
    expect(preparePracticeMarkdown('<!-- slide:removed -->', 'talk', slides)).toContain('slideId=removed');
  });
});
