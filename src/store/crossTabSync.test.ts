import { describe, expect, it } from 'vitest';
import type { Annotation } from '../types/annotation.types';
import { ANNOTATIONS_KEY, replaceAnnotations } from './annotationsSlice';
import reducer from './annotationsSlice';
import { encodeAnnotationsForStorage } from './annotationCodec';
import { annotationsFromStorageEvent } from './crossTabSync';

const note: Annotation = {
  id: 'a1',
  presentationId: 'demo',
  slideId: 'opening-title',
  slideIndex: 0,
  slideTemplate: 'TitleSlide',
  slideTitle: 'Opening',
  aspectRatio: '16:9',
  comment: 'Review this.',
  normalizedPosition: { x: 0.5, y: 0.5 },
  timestamp: 123,
  type: 'text',
  text: 'Selected words',
  surroundingContext: { before: 'Before', after: 'After' },
  source: 'canvas',
};

const event = (newValue: string | null, key = ANNOTATIONS_KEY) => ({ key, newValue });

describe('cross-tab annotation sync', () => {
  it('ignores other keys, removed keys, and malformed values', () => {
    expect(annotationsFromStorageEvent(event('[]', 'other'), [])).toBeNull();
    expect(annotationsFromStorageEvent(event(null), [])).toBeNull();
    expect(annotationsFromStorageEvent(event('{not json'), [])).toBeNull();
    expect(annotationsFromStorageEvent(event('"junk"'), [note])).toEqual([]);
  });

  it('returns the incoming list and ignores a value equal to the current list', () => {
    const stored = JSON.stringify(encodeAnnotationsForStorage([note]));
    const incoming = annotationsFromStorageEvent(event(stored), []);
    expect(incoming?.map(a => a.id)).toEqual(['a1']);
    expect(annotationsFromStorageEvent(event(stored), incoming ?? [])).toBeNull();
  });

  it('replaces the list in the slice', () => {
    const state = reducer(undefined, replaceAnnotations([note]));
    expect(state.annotations).toEqual([note]);
  });
});
