import { describe, expect, it } from 'vitest';
import type { SpeakerNoteAnnotation } from '../types/annotation.types';
import { findSmallestTextReplacement, resolveSpeakerNoteAnchor } from './speakerNoteAnnotations';

function annotation(overrides: Partial<SpeakerNoteAnnotation> = {}): SpeakerNoteAnnotation {
  return {
    id: 'note-1',
    type: 'speaker-note',
    presentationId: 'demo',
    slideId: 'slide-1',
    slideIndex: 0,
    slideTemplate: 'TitleSlide',
    slideTitle: 'Title',
    aspectRatio: '16:9',
    comment: 'Slow down here',
    normalizedPosition: { x: 0, y: 0 },
    timestamp: 1,
    target: 'range',
    noteIndex: 0,
    noteSnapshot: 'Say the important phrase clearly.',
    quotedText: 'important phrase',
    surroundingContext: { before: 'Say the ', after: ' clearly.' },
    rangeStart: 8,
    rangeEnd: 24,
    ...overrides,
  };
}

describe('resolveSpeakerNoteAnchor', () => {
  it('reattaches a selected quote after its note moves', () => {
    expect(resolveSpeakerNoteAnchor(annotation(), [
      'A new opening note.',
      'Say the important phrase clearly.',
    ])).toEqual({ resolved: true, noteIndex: 1, start: 8, end: 24 });
  });

  it('uses surrounding context to choose between repeated quotes', () => {
    const notes = ['Important phrase first; say the important phrase clearly.'];
    expect(resolveSpeakerNoteAnchor(annotation({
      noteSnapshot: notes[0],
      surroundingContext: { before: 'first; say the ', after: ' clearly.' },
      rangeStart: 32,
      rangeEnd: 48,
    }), notes)).toEqual({ resolved: true, noteIndex: 0, start: 32, end: 48 });
  });

  it('flags a range when its quote no longer exists', () => {
    expect(resolveSpeakerNoteAnchor(annotation(), ['The wording was completely replaced.']).resolved).toBe(false);
  });

  it('reattaches whole-note annotations only when the note still exists', () => {
    const item = annotation({ target: 'item', quotedText: 'Whole note', noteSnapshot: 'Whole note' });
    expect(resolveSpeakerNoteAnchor(item, ['Another note', 'Whole note']).noteIndex).toBe(1);
    expect(resolveSpeakerNoteAnchor(item, ['Rewritten note']).resolved).toBe(false);
  });
});

describe('findSmallestTextReplacement', () => {
  it('isolates only the changed wording', () => {
    expect(findSmallestTextReplacement('Welcome the audience.', 'Greet the audience.')).toEqual({
      start: 0,
      end: 7,
      replacementText: 'Greet',
    });
  });

  it('supports insertion, deletion, and unchanged text', () => {
    expect(findSmallestTextReplacement('Say this.', 'Say only this.')).toEqual({ start: 4, end: 4, replacementText: 'only ' });
    expect(findSmallestTextReplacement('Say only this.', 'Say this.')).toEqual({ start: 4, end: 9, replacementText: '' });
    expect(findSmallestTextReplacement('Same', 'Same')).toBeNull();
  });
});
