import { describe, expect, it } from 'vitest';
import type { Annotation, PendingAnnotationDraft } from '../types/annotation.types';
import {
  decodeAnnotationsFromStorage,
  decodePendingDraftFromStorage,
  encodeAnnotationsForStorage,
  encodePendingDraftForStorage,
} from './annotationCodec';

const base = {
  id: 'annotation-1',
  presentationId: 'demo',
  slideId: 'opening-title',
  slideIndex: 0,
  slideTemplate: 'TitleSlide',
  slideTitle: 'Opening',
  aspectRatio: '16:9' as const,
  comment: 'Review this.',
  normalizedPosition: { x: 0.5, y: 0.5 },
  timestamp: 123,
  operation: 'content-change' as const,
  workGroup: 'opening-copy',
  dependencies: 'Create the introduction first.',
  acceptanceCriteria: 'The revised copy is visible without overflow.',
  capture: {
    capturedAt: 120,
    revision: 'abc1234',
    route: '/?presentation=demo&slide=1',
    viewport: { width: 1440, height: 900 },
  },
};

const textAnnotation: Annotation = {
  ...base,
  type: 'text',
  text: 'Selected words',
  surroundingContext: { before: 'Before', after: 'After' },
  source: 'canvas',
};

const speakerNoteAnnotation: Annotation = {
  ...base,
  type: 'speaker-note',
  target: 'range',
  noteIndex: 0,
  noteSnapshot: 'A complete note.',
  quotedText: 'complete',
  surroundingContext: { before: 'A ', after: ' note.' },
  rangeStart: 2,
  rangeEnd: 10,
};

const sparklePromptAnnotation: Annotation = {
  ...base,
  type: 'sparkle-prompt',
  field: 'imagePrompt',
  promptSnapshot: 'Draw a careful axonometric loop.',
  quotedText: 'axonometric loop',
  surroundingContext: { before: 'Draw a careful ', after: '.' },
  rangeStart: 15,
  rangeEnd: 31,
};

const slideOrderAnnotation: Annotation = {
  ...base,
  type: 'slide-order',
  operation: 'move',
  comment: 'Move Opening after The Setup.',
  placement: 'after',
  anchorSlideId: 'the-setup',
  anchorSlideTitle: 'The Setup',
  anchorSlideIndex: 2,
};

const elementAnnotation: Annotation = {
  ...base,
  type: 'element',
  selector: 'p.copy',
  elementInfo: {
    componentName: 'Copy',
    tagName: 'p',
    id: '',
    className: 'copy',
    styles: null,
    element: null,
    cssFile: 'Copy.css',
    hierarchy: ['slide', 'copy'],
    overflow: {
      isOverflowingX: false,
      isOverflowingY: false,
      scrollWidth: 10,
      scrollHeight: 10,
      clientWidth: 10,
      clientHeight: 10,
    },
    parent: null,
    children: { count: 0, tags: [], hasMore: false },
    imageInfo: null,
    canvasPosition: null,
    diagnostics: [],
    serializedStyles: { display: 'block' },
  },
};

const pendingSpeakerNote: PendingAnnotationDraft = {
  presentationId: 'demo',
  comment: 'Detailed unfinished feedback',
  target: {
    type: 'speaker-note',
    value: {
      slideIndex: 0,
      slideId: 'opening-title',
      slideTemplate: 'TitleSlide',
      slideTitle: 'Opening',
      aspectRatio: '16:9',
      normalizedPosition: { x: 0, y: 0 },
      target: 'range',
      noteIndex: 0,
      noteSnapshot: 'A complete note.',
      quotedText: 'complete',
      surroundingContext: { before: 'A ', after: ' note.' },
      rangeStart: 2,
      rangeEnd: 10,
    },
  },
};

const pendingSparklePrompt: PendingAnnotationDraft = {
  presentationId: 'demo',
  comment: 'Keep the subject on the right.',
  target: {
    type: 'sparkle-prompt',
    value: {
      slideIndex: 0,
      slideId: 'opening-title',
      slideTemplate: 'TitleSlide',
      slideTitle: 'Opening',
      aspectRatio: '16:9',
      normalizedPosition: { x: 0, y: 0 },
      field: 'imagePrompt',
      promptSnapshot: 'Draw a careful axonometric loop.',
      quotedText: 'axonometric loop',
      surroundingContext: { before: 'Draw a careful ', after: '.' },
      rangeStart: 15,
      rangeEnd: 31,
    },
  },
};

const pendingElement: PendingAnnotationDraft = {
  presentationId: 'demo',
  comment: '',
  target: {
    type: 'element',
    value: {
      elementInfo: elementAnnotation.elementInfo,
      capturedTextContent: 'Selected words',
      selector: '.slide--active > p.copy',
      slideContext: {
        slideId: 'opening-title',
        slideIndex: 0,
        slideTemplate: 'TitleSlide',
        slideTitle: 'Opening',
        aspectRatio: '16:9',
      },
      clickPosition: { x: 100, y: 200 },
      normalizedPosition: { x: 0.1, y: 0.2 },
    },
  },
};

const pendingCanvasText: PendingAnnotationDraft = {
  presentationId: 'demo',
  comment: '',
  target: {
    type: 'canvas-text',
    value: {
      text: 'Selected words',
      context: { before: 'Before', after: 'After' },
      slideContext: {
        slideId: 'opening-title',
        slideIndex: 0,
        slideTemplate: 'TitleSlide',
        slideTitle: 'Opening',
        aspectRatio: '16:9',
      },
      clickPosition: { x: 100, y: 200 },
      normalizedPosition: { x: 0.1, y: 0.2 },
    },
  },
};

const pendingOutline: PendingAnnotationDraft = {
  presentationId: 'demo',
  comment: '',
  target: {
    type: 'outline',
    value: {
      slideId: 'opening-title',
      slideIndex: 0,
      slideTemplate: 'TitleSlide',
      slideTitle: 'Opening',
      aspectRatio: '16:9',
      propPath: 'title',
      text: 'Opening',
      clickPosition: { x: 100, y: 200 },
    },
  },
};

describe('annotation persistence codec', () => {
  it('round-trips every annotation variant in a versioned envelope', () => {
    const annotations = [elementAnnotation, textAnnotation, speakerNoteAnnotation, sparklePromptAnnotation, slideOrderAnnotation];
    expect(decodeAnnotationsFromStorage(encodeAnnotationsForStorage(annotations))).toEqual(annotations);
  });

  it.each([
    { variant: 'element', malformed: { ...elementAnnotation, elementInfo: { tagName: 'p' } } },
    { variant: 'text', malformed: { ...textAnnotation, surroundingContext: { before: 'missing after' } } },
    { variant: 'speaker-note', malformed: { ...speakerNoteAnnotation, surroundingContext: undefined } },
    { variant: 'sparkle-prompt', malformed: { ...sparklePromptAnnotation, field: 'soundtrackPrompt' } },
    { variant: 'slide-order', malformed: { ...slideOrderAnnotation, anchorSlideId: undefined } },
  ])('rejects a malformed $variant annotation without dropping valid siblings', ({ malformed }) => {
    expect(decodeAnnotationsFromStorage({
      version: 1,
      annotations: [textAnnotation, malformed],
    })).toEqual([textAnnotation]);
  });

  it('rejects unknown storage versions instead of trusting their schema', () => {
    expect(decodeAnnotationsFromStorage({ version: 99, annotations: [textAnnotation] })).toEqual([]);
  });

  it('migrates a valid version-one annotation envelope', () => {
    expect(decodeAnnotationsFromStorage({ version: 1, annotations: [textAnnotation] }))
      .toEqual([textAnnotation]);
  });

  it.each([
    { ...textAnnotation, operation: 'rewrite-everything' },
    { ...textAnnotation, capture: { ...base.capture, viewport: { width: -1, height: 900 } } },
    { ...textAnnotation, dependencies: ['annotation-1'] },
  ])('rejects malformed agent metadata', (malformed) => {
    expect(decodeAnnotationsFromStorage({ version: 2, annotations: [malformed] })).toEqual([]);
  });

  it.each([pendingElement, pendingCanvasText, pendingOutline, pendingSpeakerNote, pendingSparklePrompt])(
    'decodes a valid $target.type pending draft from versioned storage',
    (pendingDraft) => {
      expect(decodePendingDraftFromStorage(encodePendingDraftForStorage(pendingDraft)))
        .toEqual(pendingDraft);
    },
  );

  it('migrates a valid legacy pending draft', () => {
    expect(decodePendingDraftFromStorage(pendingSpeakerNote)).toEqual(pendingSpeakerNote);
  });

  it.each([
    { ...pendingElement, target: { ...pendingElement.target, value: { capturedTextContent: 'missing fields' } } },
    { ...pendingCanvasText, target: { ...pendingCanvasText.target, value: { ...pendingCanvasText.target.value, context: null } } },
    { ...pendingOutline, target: { ...pendingOutline.target, value: { ...pendingOutline.target.value, propPath: undefined } } },
    { ...pendingSpeakerNote, target: { type: 'speaker-note', value: { noteIndex: 0 } } },
    { ...pendingSpeakerNote, target: { ...pendingSpeakerNote.target, value: { ...pendingSpeakerNote.target.value, surroundingContext: null } } },
    { ...pendingSpeakerNote, target: { ...pendingSpeakerNote.target, value: { ...pendingSpeakerNote.target.value, rangeStart: -1 } } },
    { ...pendingSparklePrompt, target: { ...pendingSparklePrompt.target, value: { ...pendingSparklePrompt.target.value, field: 'soundtrackPrompt' } } },
  ])('rejects malformed pending draft variants', (malformed) => {
    expect(decodePendingDraftFromStorage({ version: 1, draft: malformed })).toBeNull();
  });
});

it('round-trips the speaker note index on element annotations and drafts', () => {
  const noteElement: Annotation = { ...elementAnnotation, speakerNoteIndex: 0 } as Annotation;
  expect(decodeAnnotationsFromStorage(encodeAnnotationsForStorage([noteElement]))).toEqual([noteElement]);
  expect(decodeAnnotationsFromStorage([{ ...noteElement, speakerNoteIndex: -1 }])).toEqual([]);
  expect(decodeAnnotationsFromStorage([{ ...noteElement, speakerNoteIndex: '0' }])).toEqual([]);

  if (pendingElement.target.type !== 'element') throw new Error('Expected an element draft');
  const noteDraft: PendingAnnotationDraft = {
    ...pendingElement,
    target: { type: 'element', value: { ...pendingElement.target.value, speakerNoteIndex: 2 } },
  };
  expect(decodePendingDraftFromStorage(encodePendingDraftForStorage(noteDraft))).toEqual(noteDraft);
  expect(decodePendingDraftFromStorage({
    ...noteDraft,
    target: { type: 'element', value: { ...pendingElement.target.value, speakerNoteIndex: 1.5 } },
  })).toBeNull();
});

it('round-trips practice targets and rejects incomplete manuscript anchors', () => {
  const practice: Annotation = { ...textAnnotation, source: 'practice', practice: { target: 'talk', sourceLine: 12, sourceEndLine: 16 } };
  expect(decodeAnnotationsFromStorage(encodeAnnotationsForStorage([practice]))).toEqual([practice]);
  expect(decodeAnnotationsFromStorage([{ ...practice, practice: { target: 'talk' } }])).toEqual([]);
});
