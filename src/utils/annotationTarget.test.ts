import { describe, expect, it } from 'vitest';
import type {
  ElementAnnotation,
  SlideOrderAnnotation,
  SparklePromptAnnotation,
  SpeakerNoteAnnotation,
  TextAnnotation,
} from '../types/annotation.types';
import { describeAnnotationTarget } from './annotationTarget';

const base = {
  id: 'annotation-1',
  presentationId: 'demo',
  slideId: 'intro',
  slideIndex: 0,
  slideTemplate: 'TitleSlide',
  slideTitle: 'Intro',
  aspectRatio: '16:9' as const,
  comment: 'Reword this.',
  normalizedPosition: { x: 0.5, y: 0.5 },
  timestamp: 1,
};

const element: ElementAnnotation = {
  ...base,
  type: 'element',
  selector: '.slide--active > h1.title',
  elementInfo: {
    componentName: 'TitleSlide',
    tagName: 'h1',
    id: '',
    className: 'title title--large',
    cssFile: 'src/components/slides/TitleSlide.css',
    hierarchy: [],
    styles: null,
    element: null,
    overflow: {
      isOverflowingX: false,
      isOverflowingY: false,
      scrollWidth: 0,
      scrollHeight: 0,
      clientWidth: 0,
      clientHeight: 0,
    },
    parent: null,
    children: { count: 0, tags: [], hasMore: false },
    imageInfo: null,
    canvasPosition: null,
    diagnostics: [],
    serializedStyles: {},
  },
};

const notesContext = 'Developer tools drawer → Speaker notes';

const speakerNote: SpeakerNoteAnnotation = {
  ...base,
  type: 'speaker-note',
  target: 'item',
  noteIndex: 1,
  noteSnapshot: 'Second note.',
  quotedText: 'Second note.',
  surroundingContext: { before: '', after: '' },
};

describe('describeAnnotationTarget', () => {
  it('describes a slide element by component and stylesheet', () => {
    expect(describeAnnotationTarget(element, 'adjust-layout')).toEqual({
      workGroup: 'slide:intro',
      source: 'src/components/slides/TitleSlide.css',
      target: 'TitleSlide · <h1.title.title--large>',
      label: 'TitleSlide',
      snapshot: null,
    });
  });

  it('files app UI elements under their app surface', () => {
    const described = describeAnnotationTarget({ ...element, uiContext: 'Presentation footer' }, 'content-change');
    expect(described.workGroup).toBe('app:presentation-footer');
  });

  it('describes a speaker note with its snapshot', () => {
    expect(describeAnnotationTarget(speakerNote, 'content-change')).toEqual({
      workGroup: 'slide:intro',
      source: 'src/data/presentations/demo/notes.mjs',
      target: 'notes.mjs["intro"][1]',
      label: 'speaker note 2',
      snapshot: { key: 'notes.mjs["intro"][1]', label: 'Speaker note 2 snapshot', value: 'Second note.' },
    });
  });

  it('routes a note element by its recorded index even without a numbered selector', () => {
    const described = describeAnnotationTarget({
      ...element,
      uiContext: notesContext,
      selector: '.developer-tools-drawer > ul.speaker-notes-sidebar__notes > li > p',
      speakerNoteIndex: 0,
    }, 'content-change');
    expect(described).toMatchObject({
      workGroup: 'slide:intro',
      source: 'src/data/presentations/demo/notes.mjs',
      target: 'notes.mjs["intro"][0]',
      label: 'speaker note 1',
    });
  });

  it('prefers the recorded index over a legacy selector position', () => {
    const described = describeAnnotationTarget({
      ...element,
      uiContext: notesContext,
      selector: '.speaker-notes-sidebar__notes > li:nth-of-type(3) > p',
      speakerNoteIndex: 4,
    }, 'content-change');
    expect(described.target).toBe('notes.mjs["intro"][4]');
  });

  it('falls back to the selector position for annotations stored without an index', () => {
    const described = describeAnnotationTarget({
      ...element,
      uiContext: notesContext,
      selector: '.speaker-notes-sidebar__notes > li:nth-of-type(3) > p',
    }, 'content-change');
    expect(described.target).toBe('notes.mjs["intro"][2]');
  });

  it('routes app-behavior requests in the notes panel to the sidebar component', () => {
    const fromNote = describeAnnotationTarget({ ...speakerNote, uiContext: notesContext }, 'app-behavior');
    expect(fromNote).toMatchObject({
      workGroup: 'app:speaker-notes',
      source: 'src/components/SpeakerNotesSidebar.tsx',
      target: 'SpeakerNotesSidebar · speaker note controls',
      label: 'speaker note 2',
    });
    // The snapshot stays keyed by content, so notes on one bullet still share it.
    expect(fromNote.snapshot?.key).toBe('notes.mjs["intro"][1]');

    const fromCard = describeAnnotationTarget({
      ...element,
      uiContext: notesContext,
      selector: '.developer-tools-drawer > details.sparkle-prompt-card',
    }, 'app-behavior');
    expect(fromCard.target).toBe('SpeakerNotesSidebar · SparklePromptCard placement');
  });

  it('routes presenter page requests to the presenter view component', () => {
    const presenterElement = { ...element, uiContext: 'Presenter view → Navigation and timer', selector: '.speaker-notes > footer > button' };
    expect(describeAnnotationTarget(presenterElement, 'app-behavior')).toMatchObject({
      workGroup: 'app:presenter-view',
      source: 'src/components/SpeakerNotesView.tsx',
      target: 'SpeakerNotesView · Navigation and timer',
    });
    expect(describeAnnotationTarget(presenterElement, 'adjust-layout').workGroup).toBe('app:presenter-view');
    // A presenter note bullet is still the deck's speaker note.
    expect(describeAnnotationTarget({ ...presenterElement, uiContext: 'Presenter view → Notes', speakerNoteIndex: 1 }, 'content-change'))
      .toMatchObject({ source: 'src/data/presentations/demo/notes.mjs', target: 'notes.mjs["intro"][1]' });
  });

  it('keeps manuscript passages in their document group even for app-behavior requests', () => {
    const passage: TextAnnotation = {
      ...base,
      type: 'text',
      text: 'A passage.',
      source: 'practice',
      surroundingContext: { before: '', after: '', fullText: 'A passage.' },
      practice: { target: 'talk', sourceLine: 12, sourceEndLine: 14 },
    };
    expect(describeAnnotationTarget(passage, 'app-behavior')).toEqual({
      workGroup: 'document:src/data/presentations/demo/manuscript.md',
      source: 'src/data/presentations/demo/manuscript.md:12',
      target: 'src/data/presentations/demo/manuscript.md · captured lines 12–14',
      label: 'src/data/presentations/demo/manuscript.md passage',
      snapshot: {
        key: 'src/data/presentations/demo/manuscript.md · captured lines 12–14',
        label: 'src/data/presentations/demo/manuscript.md passage snapshot',
        value: 'A passage.',
      },
    });
  });

  it('describes slide text by prop path', () => {
    const text: TextAnnotation = {
      ...base,
      type: 'text',
      text: 'Intro',
      source: 'outline',
      propPath: 'title',
      surroundingContext: { before: '', after: '' },
    };
    expect(describeAnnotationTarget(text, 'content-change')).toMatchObject({
      workGroup: 'slide:intro',
      target: 'intro · prop title',
      label: 'slide text at title',
      snapshot: null,
    });
  });

  it('describes Sparkle prompt fields', () => {
    const sparkle: SparklePromptAnnotation = {
      ...base,
      type: 'sparkle-prompt',
      field: 'imagePrompt',
      promptSnapshot: 'Draw a loop.',
      quotedText: 'loop',
      surroundingContext: { before: 'Draw a ', after: '.' },
      rangeStart: 7,
      rangeEnd: 11,
    };
    expect(describeAnnotationTarget(sparkle, 'content-change')).toEqual({
      workGroup: 'slide:intro:sparkle:imagePrompt',
      source: 'src/data/presentations/demo/sparkle.mjs',
      target: 'sparkle.mjs["intro"].imagePrompt',
      label: 'Sparkle image prompt',
      snapshot: { key: 'sparkle.mjs["intro"].imagePrompt', label: 'Image prompt snapshot', value: 'Draw a loop.' },
    });
  });

  it('describes slide-order constraints', () => {
    const order: SlideOrderAnnotation = {
      ...base,
      type: 'slide-order',
      placement: 'after',
      anchorSlideId: 'outro',
      anchorSlideTitle: 'Outro',
      anchorSlideIndex: 4,
    };
    expect(describeAnnotationTarget(order)).toEqual({
      workGroup: 'deck:slide-order',
      source: 'src/data/presentations/demo/slides.tsx',
      target: 'intro · after outro',
      label: 'slide position',
      snapshot: null,
    });
  });

  it('lets an explicit work group override routing', () => {
    expect(describeAnnotationTarget({ ...speakerNote, workGroup: 'notes-pass' }, 'content-change').workGroup)
      .toBe('notes-pass');
  });
});
