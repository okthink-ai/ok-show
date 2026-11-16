import { describe, expect, it } from 'vitest';
import { parseServerSyncMessage } from './protocol';

const sparkle = { intro: { style: 'Ink', imagePrompt: 'Draw it.', motionPrompt: 'Move it.' } };
const message = (notes: unknown, sparklePrompts: unknown = sparkle) => JSON.stringify({
  type: 'notes', sessionId: 'session', presentationId: 'demo', revision: 4, notes, sparkle: sparklePrompts,
});

describe('parseServerSyncMessage notes validation', () => {
  it('accepts a record of string arrays', () => {
    expect(parseServerSyncMessage(message({ intro: ['First', 'Second'], empty: [] }))).toEqual({
      type: 'notes', sessionId: 'session', presentationId: 'demo',
      revision: 4,
      notes: { intro: ['First', 'Second'], empty: [] },
      sparkle,
    });
  });

  it.each([
    ['null', null],
    ['top-level array', []],
    ['string', 'note'],
    ['mixed record', { intro: ['valid'], next: 'invalid' }],
    ['record with a non-string entry', { intro: ['valid', 2] }],
  ])('rejects %s notes', (_label, notes) => {
    expect(parseServerSyncMessage(message(notes))).toBeNull();
  });

  it.each([
    ['missing', null],
    ['array', []],
    ['missing field', { intro: { style: 'Ink', imagePrompt: 'Draw it.' } }],
    ['non-string field', { intro: { style: 'Ink', imagePrompt: 2, motionPrompt: 'Move it.' } }],
  ])('rejects %s Sparkle prompt data', (_label, sparklePrompts) => {
    expect(parseServerSyncMessage(message({}, sparklePrompts))).toBeNull();
  });

  it('rejects notes without a valid session revision', () => {
    expect(parseServerSyncMessage(JSON.stringify({
      type: 'notes', sessionId: 'session', presentationId: 'demo', notes: {},
    }))).toBeNull();
  });
});
