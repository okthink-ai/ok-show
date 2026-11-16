import { describe, expect, it } from 'vitest';
import type { TextAnnotation } from '../types/annotation.types';
import { decodeAnnotationsFromStorage, encodeAnnotationsForStorage } from './annotationCodec';
import reducer, { addAnnotation, clearAll, clearCopiedAnnotations, markAnnotationsCopied, updateComment, updateRequestMetadata } from './annotationsSlice';

function annotation(id: string, presentationId: string): TextAnnotation {
  return {
    id,
    presentationId,
    slideId: 'slide-1',
    slideIndex: 0,
    slideTemplate: 'TitleSlide',
    slideTitle: 'Slide',
    aspectRatio: '16:9',
    comment: 'Comment',
    normalizedPosition: { x: 0.5, y: 0.5 },
    timestamp: 1,
    type: 'text',
    text: 'Text',
    surroundingContext: { before: '', after: '' },
    source: 'canvas',
  };
}

describe('clearAll', () => {
  it('removes only annotations owned by the requested presentation', () => {
    let state = reducer(undefined, addAnnotation(annotation('loop-1', 'demo')));
    state = reducer(state, addAnnotation(annotation('other-1', 'other-deck')));
    state = reducer(state, addAnnotation(annotation('loop-2', 'demo')));

    const cleared = reducer(state, clearAll('demo'));

    expect(cleared.annotations).toEqual([annotation('other-1', 'other-deck')]);
  });
});

describe('agent request metadata', () => {
  it('updates one metadata field without erasing the others', () => {
    let state = reducer(undefined, addAnnotation({
      ...annotation('loop-1', 'demo'),
      workGroup: 'about-me',
      dependencies: 'Create the slide first.',
    }));

    state = reducer(state, updateRequestMetadata({
      id: 'loop-1',
      metadata: { operation: 'insert-slide' },
    }));

    expect(state.annotations[0]).toMatchObject({
      operation: 'insert-slide',
      workGroup: 'about-me',
      dependencies: 'Create the slide first.',
    });
  });
});


describe('clipboard history', () => {
  it('persists copied status and clears only copied annotations in this deck', () => {
    const first = annotation('copied', 'demo');
    const other = annotation('other', 'other-deck');
    let state = reducer(undefined, addAnnotation(first));
    state = reducer(state, addAnnotation(annotation('new', 'demo')));
    state = reducer(state, addAnnotation(other));
    state = reducer(state, markAnnotationsCopied({ annotations: [first, other], copiedAt: 100 }));
    const restored = decodeAnnotationsFromStorage(JSON.parse(JSON.stringify(encodeAnnotationsForStorage(state.annotations))));
    expect(restored.find(item => item.id === 'copied')?.copiedAt).toBe(100);
    state = reducer({ ...state, annotations: restored }, clearCopiedAnnotations('demo'));
    expect(state.annotations.map(item => item.id)).toEqual(['new', 'other']);
  });

  it('invalidates copied status when the request changes, but not for a no-op edit', () => {
    const first = annotation('copied', 'demo');
    let state = reducer(undefined, addAnnotation(first));
    state = reducer(state, markAnnotationsCopied({ annotations: [first], copiedAt: 100 }));
    state = reducer(state, updateComment({ id: first.id, comment: first.comment }));
    expect(state.annotations[0].copiedAt).toBe(100);
    state = reducer(state, updateComment({ id: first.id, comment: 'Changed after copying' }));
    expect(state.annotations[0].copiedAt).toBeUndefined();
    state = reducer(state, markAnnotationsCopied({ annotations: state.annotations, copiedAt: 200 }));
    state = reducer(state, updateRequestMetadata({ id: first.id, metadata: { operation: 'remove' } }));
    expect(state.annotations[0].copiedAt).toBeUndefined();
  });

  it('does not mark new or edited annotations as copied when an older clipboard write completes', () => {
    const first = annotation('editing', 'demo');
    let state = reducer(undefined, addAnnotation(first));
    state = reducer(state, updateComment({ id: first.id, comment: 'New text' }));
    state = reducer(state, addAnnotation(annotation('new', 'demo')));
    state = reducer(state, markAnnotationsCopied({ annotations: [first], copiedAt: 100 }));
    expect(state.annotations.every(item => item.copiedAt === undefined)).toBe(true);
    expect(reducer(state, clearCopiedAnnotations('demo')).annotations).toHaveLength(2);
  });
});
