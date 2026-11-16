import { describe, expect, it } from 'vitest';
import type { SpeakerNoteAnnotation } from '../types/annotation.types';
import {
  DELETION_COMMENT,
  REPLACEMENT_COMMENT,
  buildDeletionDraft,
  buildRangeDraft,
  buildReplacementDraft,
  planReplacementSave,
  replacementAnnotations,
} from './speakerNoteDrafts';
import type { SpeakerNoteLocation } from './speakerNoteDrafts';

const NOTE = 'Open with the customer story.';

const location: SpeakerNoteLocation = {
  presentationId: 'demo',
  slide: { id: 'opening', title: 'Opening', template: 'TitleSlide', content: null },
  slideIndex: 0,
  aspectRatio: '16:9',
  noteIndex: 2,
  note: NOTE,
};

function replacement(id: string, replacementText: string): SpeakerNoteAnnotation {
  return {
    id,
    type: 'speaker-note',
    presentationId: 'demo',
    slideId: 'opening',
    slideIndex: 0,
    slideTemplate: 'TitleSlide',
    slideTitle: 'Opening',
    aspectRatio: '16:9',
    comment: REPLACEMENT_COMMENT,
    normalizedPosition: { x: 0, y: 0 },
    timestamp: 1,
    target: 'item',
    noteIndex: 2,
    noteSnapshot: NOTE,
    quotedText: NOTE,
    surroundingContext: { before: '', after: '' },
    replacementText,
  };
}

describe('speaker-note draft builders', () => {
  it('builds a range draft with quoted text and context', () => {
    const draft = buildRangeDraft(location, { start: 14, end: 22 });
    expect(draft?.target.value).toMatchObject({
      target: 'range',
      slideId: 'opening',
      noteIndex: 2,
      quotedText: 'customer',
      rangeStart: 14,
      rangeEnd: 22,
      surroundingContext: { before: 'Open with the ', after: ' story.' },
    });
  });

  it('ignores a whitespace-only selection', () => {
    expect(buildRangeDraft(location, { start: 4, end: 5 })).toBeNull();
  });

  it('builds replacement and deletion drafts for the whole bullet', () => {
    expect(buildReplacementDraft(location, 'Edited')).toMatchObject({
      comment: REPLACEMENT_COMMENT,
      target: { value: { target: 'item', quotedText: NOTE, replacementText: 'Edited' } },
    });
    const deletion = buildDeletionDraft(location);
    expect(deletion).toMatchObject({
      comment: DELETION_COMMENT,
      target: { value: { target: 'item', operation: 'remove' } },
    });
    expect(deletion.target.value).not.toHaveProperty('replacementText');
  });
});

describe('planReplacementSave', () => {
  it('creates the first replacement for a bullet', () => {
    expect(planReplacementSave('A new opening.', NOTE, [])).toEqual({ kind: 'create' });
  });

  it('discards an unchanged or empty edit', () => {
    expect(planReplacementSave(` ${NOTE} `, NOTE, [])).toEqual({ kind: 'discard' });
    expect(planReplacementSave('   ', NOTE, [])).toEqual({ kind: 'discard' });
    expect(planReplacementSave('A', NOTE, [replacement('r1', 'A')])).toEqual({ kind: 'discard' });
  });

  it('updates the existing replacement instead of adding another', () => {
    expect(planReplacementSave('B', NOTE, [replacement('r1', 'A')])).toEqual({
      kind: 'update',
      id: 'r1',
      replacementText: 'B',
      removeIds: [],
    });
  });

  it('keeps the newest of several saved replacements and drops the rest', () => {
    expect(planReplacementSave('C', NOTE, [replacement('r1', 'A'), replacement('r2', 'B')])).toEqual({
      kind: 'update',
      id: 'r2',
      replacementText: 'C',
      removeIds: ['r1'],
    });
  });

  it('removes the replacements when the edit restores the original bullet', () => {
    expect(planReplacementSave(NOTE, NOTE, [replacement('r1', 'A'), replacement('r2', 'B')])).toEqual({
      kind: 'remove',
      ids: ['r1', 'r2'],
    });
  });

  it('selects only whole-bullet replacements', () => {
    const deletion: SpeakerNoteAnnotation = { ...replacement('d1', ''), replacementText: undefined, operation: 'remove' };
    const range: SpeakerNoteAnnotation = { ...replacement('x1', ''), replacementText: undefined, target: 'range' };
    expect(replacementAnnotations([deletion, replacement('r1', 'A'), range]).map((item) => item.id)).toEqual(['r1']);
  });
});
