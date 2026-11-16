import { describe, expect, it } from 'vitest';
import type {
  Annotation,
  ElementAnnotation,
  SpeakerNoteAnnotation,
  SlideOrderAnnotation,
  SparklePromptAnnotation,
  TextAnnotation,
} from '../types/annotation.types';
import { formatAnnotations, inferAnnotationOperation } from './annotationClipboard';

const base = {
  id: 'annotation-stable-id',
  presentationId: 'demo',
  slideId: 'about-me',
  slideIndex: 1,
  slideTemplate: 'AboutMeSlide',
  slideTitle: 'About Me',
  aspectRatio: '16:9' as const,
  comment: 'Make the rows more compact but preserve the font sizes.',
  normalizedPosition: { x: 0.4, y: 0.5 },
  timestamp: 200,
  capture: {
    capturedAt: 150,
    revision: '126d61c',
    route: '/?presentation=demo&slide=2',
    viewport: { width: 1440, height: 900 },
  },
};

const elementAnnotation: ElementAnnotation = {
  ...base,
  type: 'element',
  selector: '.slide--active > ul.about-me__list',
  textContent: `Staff engineer\n${'Full untruncated qualification '.repeat(8)}`,
  elementInfo: {
    componentName: 'AboutMeSlide',
    tagName: 'ul',
    id: '',
    className: 'about-me__list',
    cssFile: 'src/data/presentations/demo/narrative.css',
    hierarchy: ['slide', 'about-me', 'about-me__list'],
    styles: null,
    element: null,
    overflow: {
      isOverflowingX: false,
      isOverflowingY: true,
      scrollWidth: 600,
      scrollHeight: 510,
      clientWidth: 600,
      clientHeight: 500,
    },
    parent: {
      tagName: 'div',
      className: 'about-me__body',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-start',
      alignItems: 'stretch',
      gap: '32px',
      width: '800px',
      height: '700px',
    },
    children: { count: 4, tags: ['li', 'li', 'li', 'li'], hasMore: false },
    imageInfo: null,
    canvasPosition: { x: 100, y: 220, width: 900, height: 500, scale: 0.75 },
    diagnostics: ['min-height: auto on flex item'],
    serializedStyles: {
      display: 'flex',
      flexDirection: 'column',
      gap: '28px',
      fontSize: '43px',
      lineHeight: '43px',
    },
  },
};

function occurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}

describe('annotation agent packet formatting', () => {
  it('leads with a readable plan and request while preserving exact multiline diagnostics', () => {
    const packet = formatAnnotations([elementAnnotation], 'demo');

    expect(packet).toContain('# Annotation review — `demo`');
    expect(packet).toContain('- **Packet format:** v2');
    expect(packet).toContain('- **Captured revision:** `126d61c`');
    expect(packet).toContain('## Work plan');
    expect(packet).toContain('### A1 — Adjust layout or styling · AboutMeSlide');
    expect(packet).toContain('> Make the rows more compact but preserve the font sizes.');
    expect(packet).toContain('- **Target:** `AboutMeSlide · <ul.about-me__list>`');
    expect(packet).toContain('```text\nStaff engineer\nFull untruncated qualification');
    expect(packet).toContain('#### Layout evidence');
    expect(packet).toContain('<details>\n<summary>Capture evidence</summary>');
    expect(packet).toContain('```css\n.slide--active > ul.about-me__list\n```');
    expect(packet).not.toContain('Hierarchy:');
    expect(packet).not.toContain('...');
    expect(packet.indexOf('> Make the rows')).toBeLessThan(packet.indexOf('#### Layout evidence'));
  });

  it('uses explicit coordination metadata and separates text anchors into fenced blocks', () => {
    const annotation: TextAnnotation = {
      ...base,
      type: 'text',
      text: 'Alex',
      comment: 'Use her full name.',
      operation: 'replace-text',
      workGroup: 'about-me-content',
      dependencies: 'Create the About Me slide first.',
      acceptanceCriteria: 'The sentence reads naturally with its punctuation.',
      replacementText: 'my cofounder Alex Rivera',
      surroundingContext: {
        before: 'Building Acme with ',
        after: ', including Widgets',
        selector: '.slide--active > p.about-me__company',
        fullText: 'Building Acme with Alex, including Widgets',
        rangeStart: 19,
        rangeEnd: 23,
      },
      source: 'canvas',
    };

    const packet = formatAnnotations([annotation], 'demo');
    expect(packet).toContain('## 1. `about-me-content`');
    expect(packet).toContain('- **Operation:** Replace text');
    expect(packet).toContain('**Depends on:**\n\n> Create the About Me slide first.');
    expect(packet).toContain('**Done when:**\n\n> The sentence reads naturally with its punctuation.');
    expect(packet).toContain('**Selected text · characters 19..23:**');
    expect(packet).toContain('```text\nBuilding Acme with Alex, including Widgets\n```');
    expect(packet).toContain('```text\nmy cofounder Alex Rivera\n```');
  });

  it('groups reusable UI requests separately from slide content', () => {
    const annotation: TextAnnotation = {
      ...base,
      type: 'text',
      text: 'A selected speaker note',
      comment: 'When I click this, the annotation popup should show the selected text.',
      uiContext: 'Developer tools drawer → Speaker notes',
      surroundingContext: { before: '', after: '' },
      source: 'canvas',
    };

    expect(inferAnnotationOperation(annotation)).toBe('app-behavior');
    const packet = formatAnnotations([annotation], 'demo');
    expect(packet).toContain('`app:speaker-notes`');
    expect(packet).toContain('The selected UI content is reproduction context');
  });

  it('normalizes speaker notes to semantic source targets', () => {
    const annotation: SpeakerNoteAnnotation = {
      ...base,
      type: 'speaker-note',
      target: 'range',
      noteIndex: 2,
      noteSnapshot: 'Before the selected note text and after it.',
      quotedText: 'selected note text',
      surroundingContext: { before: 'Before the ', after: ' and after it.' },
      rangeStart: 11,
      rangeEnd: 29,
    };

    const packet = formatAnnotations([annotation], 'demo');
    expect(packet).toContain('- **Target:** `notes.mjs["about-me"][2]`');
    expect(packet).toContain('#### Current speaker note');
    expect(packet).toContain('**Selected note text · characters 11..29:**');
    expect(packet).toContain('```text\nBefore the selected note text and after it.\n```');
  });

  it('normalizes inspector-captured note elements without promoting their DOM path', () => {
    const annotation: ElementAnnotation = {
      ...elementAnnotation,
      uiContext: 'Developer tools drawer → Speaker notes',
      selector: '.speaker-notes-sidebar__notes > li:nth-of-type(3) > div > p',
      comment: 'Delete this note.',
    };

    const packet = formatAnnotations([annotation], 'demo');
    expect(packet).toContain('- **Target:** `notes.mjs["about-me"][2]`');
    expect(packet).toContain('## 1. `slide:about-me`');
    expect(packet).toContain('```css\n.speaker-notes-sidebar__notes > li:nth-of-type(3) > div > p\n```');
  });

  it('routes a lone note bullet by its recorded note index, not its selector', () => {
    const annotation: ElementAnnotation = {
      ...elementAnnotation,
      uiContext: 'Developer tools drawer → Speaker notes',
      selector: '.developer-tools-drawer > section.speaker-notes-sidebar > ul.speaker-notes-sidebar__notes > li > div > p',
      speakerNoteIndex: 0,
      comment: 'Shorten this',
      elementInfo: { ...elementAnnotation.elementInfo, cssFile: 'src/components/SpeakerNotesSidebar.css' },
    };

    const packet = formatAnnotations([annotation], 'demo');
    expect(packet).toContain('## 1. `slide:about-me`');
    expect(packet).toContain('### A1 — Edit content · speaker note 1');
    expect(packet).toContain('- **Target:** `notes.mjs["about-me"][0]`');
    expect(packet).toContain('- **Primary source:** `src/data/presentations/demo/notes.mjs`');
    expect(packet).not.toContain('app:speaker-notes');
    expect(packet).not.toContain('- **Source:** `src/components/SpeakerNotesSidebar.css`');
  });

  it('quotes multi-line free-text fields so they cannot open headings or code blocks', () => {
    const doneWhen = '# Title fits on one line\n```\nThe expected title';
    const dependsOn = '## Do A3 first\n```ts';
    const first: TextAnnotation = {
      ...base,
      type: 'text',
      text: 'Alex',
      comment: 'Tighten the title.',
      uiContext: '# Reported\n```',
      dependencies: dependsOn,
      acceptanceCriteria: doneWhen,
      surroundingContext: { before: '', after: '' },
      source: 'canvas',
    };
    const second: TextAnnotation = { ...first, id: 'second', slideId: 'launch-day', comment: 'Second request.' };
    delete second.acceptanceCriteria;
    delete second.dependencies;
    delete second.uiContext;

    const packet = formatAnnotations([first, second], 'demo');
    expect(packet).toContain('**Done when:**\n\n> # Title fits on one line\n> ```\n> The expected title');
    expect(packet).toContain('**Depends on:**\n\n> ## Do A3 first\n> ```ts');
    expect(packet).toContain('**Reported from:**\n\n> # Reported\n> ```');

    const lines = packet.split('\n');
    expect(lines).not.toContain('# Title fits on one line');
    expect(lines).not.toContain('## Do A3 first');
    // Every unquoted fence line must be paired, so no fence swallows later items.
    const openFences: string[] = [];
    for (const line of lines) {
      const fence = line.match(/^(`{3,})/)?.[1];
      if (!fence) continue;
      if (openFences.at(-1) === fence && line === fence) openFences.pop();
      else openFences.push(fence);
    }
    expect(openFences).toEqual([]);
    expect(packet).toContain('### A2 — Edit content · selected slide text');
    expect(packet).toContain('> Second request.');
  });

  it('exports Sparkle fields semantically and shows the selected range', () => {
    const annotation: SparklePromptAnnotation = {
      ...base,
      type: 'sparkle-prompt',
      field: 'motionPrompt',
      promptSnapshot: 'Lock the camera and preserve the exact typography.',
      quotedText: 'preserve the exact typography',
      surroundingContext: { before: 'Lock the camera and ', after: '.' },
      rangeStart: 20,
      rangeEnd: 49,
    };

    const packet = formatAnnotations([annotation], 'demo');
    expect(packet).toContain('- **Target:** `sparkle.mjs["about-me"].motionPrompt`');
    expect(packet).toContain('`slide:about-me:sparkle:motionPrompt`');
    expect(packet).toContain('**Selected prompt text · characters 20..49:**');
  });

  it('groups slide moves as stable relative-order constraints', () => {
    const first: SlideOrderAnnotation = {
      ...base,
      type: 'slide-order',
      operation: 'move',
      placement: 'after',
      anchorSlideId: 'launch-day',
      anchorSlideTitle: 'Launch Day',
      anchorSlideIndex: 6,
      comment: 'Move “About Me” after “Launch Day”.',
    };
    const second: SlideOrderAnnotation = {
      ...first,
      id: 'second-move',
      slideId: 'vocabulary-pile-up',
      slideIndex: 2,
      slideTitle: 'Too Many New Things',
      placement: 'before',
      comment: 'Move “Too Many New Things” before “Launch Day”.',
    };

    const packet = formatAnnotations([first, second], 'demo');
    expect(packet).toContain('`deck:slide-order`');
    expect(packet).toContain('simultaneous relative-order constraint');
    expect(packet).toContain('- **Target:** `about-me · after launch-day`');
    expect(packet).toContain('- **Target:** `vocabulary-pile-up · before launch-day`');
    expect(packet).toContain('- **Anchor:** `Launch Day (launch-day)`');
    expect(packet).toContain('- **Primary source:** `src/data/presentations/demo/slides.tsx`');
  });

  it('prints a repeated Sparkle snapshot once for its whole work group', () => {
    const prompt = 'Scene and story:\n\nA developer organizes a crowd of small bots.';
    const first: SparklePromptAnnotation = {
      ...base,
      id: 'sparkle-1',
      type: 'sparkle-prompt',
      field: 'imagePrompt',
      promptSnapshot: prompt,
      quotedText: 'Scene and story:',
      surroundingContext: { before: '', after: '\n\nA developer' },
      rangeStart: 0,
      rangeEnd: 16,
      comment: 'Start directly with the visual description.',
    };
    const second: SparklePromptAnnotation = {
      ...first,
      id: 'sparkle-2',
      quotedText: 'A developer',
      surroundingContext: { before: 'Scene and story:\n\n', after: ' organizes' },
      rangeStart: 18,
      rangeEnd: 29,
      comment: 'Make these two developers.',
    };

    const packet = formatAnnotations([first, second], 'demo');
    expect(packet).toContain('### Shared current source');
    expect(packet).toContain('exact snapshot shared by A1 and A2');
    expect(packet).toContain('```text\nScene and story:\n\nA developer organizes a crowd of small bots.\n```');
    expect(occurrences(packet, prompt)).toBe(1);
    expect(packet).toContain('> Start directly with the visual description.');
    expect(packet).toContain('> Make these two developers.');
  });

  it('does not duplicate rendered and DOM text when they are identical', () => {
    const annotation: ElementAnnotation = {
      ...elementAnnotation,
      renderedText: elementAnnotation.textContent,
    };
    const packet = formatAnnotations([annotation], 'demo');
    expect(packet).toContain('#### Current rendered text');
    expect(packet).not.toContain('#### DOM text anchor');
  });

  it.each([
    ['Before this slide, add a slide with my qualifications.', 'insert-slide'],
    ['Remove this speaker note.', 'remove'],
    ['Move these notes to the new slide.', 'move'],
    ['Give me a trash button on hover that I can click to delete this note.', 'app-behavior'],
  ] as const)('infers %s as %s', (comment, operation) => {
    const annotation: Annotation = {
      ...elementAnnotation,
      comment,
      ...(operation === 'app-behavior' && { uiContext: 'Developer tools drawer → Speaker notes' }),
    };
    expect(inferAnnotationOperation(annotation)).toBe(operation);
  });
});

it('exports practice manuscript edits with the source passage and captured line locator', () => {
  const annotation: TextAnnotation = {
    ...base, type: 'text', source: 'practice', comment: 'Explain this with an example.',
    text: 'A **source** passage.', surroundingContext: { before: '', after: '', fullText: 'A **source** passage.' },
    practice: { target: 'talk', sourceLine: 42, sourceEndLine: 44 },
  };
  const packet = formatAnnotations([annotation], base.presentationId);
  expect(packet).toContain('src/data/presentations/demo/manuscript.md:42');
  expect(packet).toContain('captured lines 42–44');
  expect(packet).toContain('A **source** passage.');
  expect(packet).toContain(base.slideId);
  expect(packet).toContain(annotation.comment);
});
