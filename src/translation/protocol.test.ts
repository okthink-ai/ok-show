import { describe, expect, it } from 'vitest';
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

  it('requires failure dispositions and accepts bounded health diagnostics', () => {
    const failure = { type: 'translation.error', version: 1, code: 'provider_timeout', message: 'Retrying.', disposition: 'retryable' };
    expect(parseTranslationServerMessage(JSON.stringify(failure))).toEqual(failure);
    expect(parseTranslationServerMessage(JSON.stringify({ ...failure, disposition: undefined }))).toBeNull();
    const status = { ...failure, type: 'translation.status', sessionId: 'one', presentationId: 'demo', phase: 'error' };
    expect(parseTranslationServerMessage(JSON.stringify(status))).toEqual(status);
    expect(parseTranslationServerMessage(JSON.stringify({ ...status, disposition: undefined }))).toBeNull();
    const health = { type: 'translation.health', version: 1, sessionId: 'one', presentationId: 'demo', runId: 'run', droppedAudioChunks: 3 };
    expect(parseTranslationServerMessage(JSON.stringify(health))).toEqual(health);
  });
});
