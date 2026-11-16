import { describe, expect, it } from 'vitest';
import { keepRecentCaption } from './captionState';
import { parseTranslationServerMessage } from './protocol';

describe('translation browser protocol', () => {
  it('accepts a caption snapshot and rejects malformed values', () => {
    const caption = {
      type: 'translation.caption', version: 1, sessionId: 'one', presentationId: 'demo', runId: 'run', sequence: 2,
      translatedText: 'Hola', targetLanguage: 'es', stability: 'streaming',
    };
    expect(parseTranslationServerMessage(JSON.stringify(caption))).toEqual(caption);
    expect(parseTranslationServerMessage(JSON.stringify({ ...caption, sequence: 2.5 }))).toBeNull();
    expect(parseTranslationServerMessage('[]')).toBeNull();
  });

  it('bounds long and unbroken caption text in data', () => {
    expect(keepRecentCaption(`old words ${'x'.repeat(300)}`)).toHaveLength(280);
    expect(keepRecentCaption(`${'old '.repeat(100)}new ending`, 40)).toBe('old old old old old old old new ending');
    const family = '👨‍👩‍👧‍👦';
    const bounded = keepRecentCaption(family.repeat(40), 40);
    expect(bounded).not.toContain('\ud83d\u0000');
    expect([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(bounded)].every((item) => item.segment === family)).toBe(true);
  });
});
