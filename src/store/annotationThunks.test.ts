import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import type { PendingAnnotationDraft } from '../types/annotation.types';
import annotationsReducer, { setPendingDraft } from './annotationsSlice';
import { commitAnnotation } from './annotationThunks';

describe('commitAnnotation', () => {
  it('discards a pending speaker-note draft when its presentation no longer owns the slide', async () => {
    const store = configureStore({ reducer: { annotations: annotationsReducer } });
    const staleDraft: PendingAnnotationDraft = {
      presentationId: 'demo',
      comment: 'Keep this anchored.',
      target: {
        type: 'speaker-note',
        value: {
          slideIndex: 0,
          slideId: 'removed-slide-id',
          slideTemplate: 'TitleSlide',
          slideTitle: 'Removed',
          aspectRatio: '16:9',
          normalizedPosition: { x: 0, y: 0 },
          target: 'item',
          noteIndex: 0,
          noteSnapshot: 'Old note',
          quotedText: 'Old note',
          surroundingContext: { before: '', after: '' },
        },
      },
    };
    store.dispatch(setPendingDraft(staleDraft));

    await store.dispatch(commitAnnotation('Keep this anchored.') as never);

    expect(store.getState().annotations.pendingDraft).toBeNull();
    expect(store.getState().annotations.annotations).toEqual([]);
  });

  it('commits a Sparkle prompt annotation with stable field identity', async () => {
    const store = configureStore({ reducer: { annotations: annotationsReducer } });
    const draft: PendingAnnotationDraft = {
      presentationId: 'demo',
      comment: 'Keep the main subject farther right.',
      target: {
        type: 'sparkle-prompt',
        value: {
          slideIndex: 0,
          slideId: 'demo-title',
          slideTemplate: 'TitleSlide',
          slideTitle: 'ok-show',
          aspectRatio: '16:9',
          normalizedPosition: { x: 0, y: 0 },
          field: 'imagePrompt',
          promptSnapshot: 'Place the main subject on the right side.',
          quotedText: 'main subject',
          surroundingContext: { before: 'Place the ', after: ' on the right side.' },
          rangeStart: 10,
          rangeEnd: 22,
        },
      },
    };
    store.dispatch(setPendingDraft(draft));

    await store.dispatch(commitAnnotation(draft.comment) as never);

    expect(store.getState().annotations.annotations).toEqual([
      expect.objectContaining({
        type: 'sparkle-prompt',
        slideId: 'demo-title',
        field: 'imagePrompt',
        quotedText: 'main subject',
        comment: 'Keep the main subject farther right.',
      }),
    ]);
  });

  it('preserves an explicit remove operation for a speaker-note bullet', async () => {
    const store = configureStore({ reducer: { annotations: annotationsReducer } });
    const draft: PendingAnnotationDraft = {
      presentationId: 'demo',
      comment: 'Delete this speaker-note bullet.',
      target: {
        type: 'speaker-note',
        value: {
          slideIndex: 0,
          slideId: 'demo-title',
          slideTemplate: 'TitleSlide',
          slideTitle: 'ok-show',
          aspectRatio: '16:9',
          normalizedPosition: { x: 0, y: 0 },
          target: 'item',
          noteIndex: 0,
          noteSnapshot: 'An important speaker note.',
          quotedText: 'An important speaker note.',
          surroundingContext: { before: '', after: '' },
          operation: 'remove',
        },
      },
    };
    store.dispatch(setPendingDraft(draft));

    await store.dispatch(commitAnnotation(draft.comment) as never);

    expect(store.getState().annotations.annotations).toEqual([
      expect.objectContaining({
        type: 'speaker-note',
        target: 'item',
        noteIndex: 0,
        operation: 'remove',
        quotedText: 'An important speaker note.',
      }),
    ]);
  });
});

it('commits a manuscript anchor through the same text-annotation pipeline', async () => {
  const store = configureStore({ reducer: { annotations: annotationsReducer } });
  store.dispatch(setPendingDraft({
    presentationId: 'demo', comment: 'Clarify this passage.',
    target: { type: 'canvas-text', value: {
      source: 'practice', text: 'Operational thinking',
      practice: { target: 'talk', sourceLine: 20, sourceEndLine: 22, sourceText: 'Operational thinking' },
      context: { before: '', after: '' },
      slideContext: { slideId: 'demo-title', slideIndex: 0, slideTitle: 'ok-show', slideTemplate: 'TitleSlide', aspectRatio: '16:9' },
      clickPosition: { x: 100, y: 100 }, normalizedPosition: { x: .5, y: .5 },
    } },
  }));
  await store.dispatch(commitAnnotation('Clarify this passage.') as never);
  expect(store.getState().annotations.pendingDraft).toBeNull();
  expect(store.getState().annotations.annotations).toEqual(expect.arrayContaining([expect.objectContaining({
    type: 'text', source: 'practice', comment: 'Clarify this passage.',
    practice: { target: 'talk', sourceLine: 20, sourceEndLine: 22, sourceText: 'Operational thinking' },
  })]));
});
