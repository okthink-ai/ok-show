import type {
  Annotation,
  AnnotationOperation,
  ElementAnnotation,
} from '../types/annotation.types';
import type { SparklePromptField } from '../types/speakerNotes.types';
import { deckFile as projectDeckFile, manuscriptFile } from '../project/paths';

/** Current source text that several annotations on the same target may share. */
export interface AnnotationSnapshot {
  key: string;
  label: string;
  value: string;
}

/** Where an annotation points: everything the review packet needs to route it. */
export interface AnnotationTargetDescription {
  /** Packet work group the annotation is filed under. */
  workGroup: string;
  /** File the agent should open. */
  source: string;
  /** Semantic target inside that source, such as `notes.mjs["intro"][2]`. */
  target: string;
  /** Short human label for the item heading. */
  label: string;
  /** Exact current source text, when the annotation captured one. */
  snapshot: AnnotationSnapshot | null;
}

const SPEAKER_NOTES_SIDEBAR_SOURCE = 'src/components/SpeakerNotesSidebar.tsx';
const PRESENTER_VIEW_SOURCE = 'src/components/SpeakerNotesView.tsx';

const SPARKLE_FIELD_LABELS: Record<SparklePromptField, string> = {
  style: 'Sparkle style',
  imagePrompt: 'Sparkle image prompt',
  motionPrompt: 'Sparkle motion prompt',
};

const SPARKLE_SNAPSHOT_LABELS: Record<SparklePromptField, string> = {
  style: 'Style snapshot',
  imagePrompt: 'Image prompt snapshot',
  motionPrompt: 'Motion prompt snapshot',
};

export function inferAnnotationOperation(annotation: Annotation): AnnotationOperation {
  if (annotation.type === 'slide-order') return 'move';
  if (annotation.operation) return annotation.operation;
  if (annotation.intent === 'question') return 'question';

  const request = annotation.comment.toLowerCase();
  const reportsFromUi = Boolean(annotation.uiContext);
  const describesUiBehavior = /\b(button|control|widget|hover|click|popup|panel|sidebar|interface|ui|should show|doesn't show|does not show|persist|interaction)\b/.test(request);
  if (reportsFromUi && describesUiBehavior) return 'app-behavior';
  if (/\b(move|relocate|transfer|reorder)\b|\bshould be moved\b/.test(request)) return 'move';
  if (/\b(add|create|insert|before|after)\b.{0,40}\b(new )?slide\b|\bnew slide\b/.test(request)) return 'insert-slide';
  if (/\b(remove|delete|drop|take out)\b/.test(request)) return 'remove';
  if (/\b(gap|spacing|space between|compact|overflow|font size|layout|align|alignment|padding|margin|row height|position|vertical|above|below)\b/.test(request)) {
    return 'adjust-layout';
  }
  if ('replacementText' in annotation && annotation.replacementText !== undefined) return 'replace-text';
  return 'content-change';
}

function uiSurfaceSlug(uiContext?: string): string {
  if (!uiContext) return 'presentation-shell';
  const context = uiContext.toLowerCase();
  if (context.startsWith('presenter view')) return 'presenter-view';
  if (context.includes('speaker notes')) return 'speaker-notes';
  if (context.includes('annotation')) return 'annotations';
  if (context.includes('outline')) return 'outline';
  if (context.includes('developer tools')) return 'developer-tools';
  return context
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'presentation-shell';
}

function isSpeakerNotesContext(uiContext?: string): boolean {
  return Boolean(uiContext?.toLowerCase().includes('speaker notes'));
}

function deckFile(annotation: Annotation, file: string): string {
  return projectDeckFile(annotation.presentationId, file);
}

/**
 * The speaker note a captured element belongs to. Annotations record the
 * index when the notes panel creates them; the selector is read only for
 * annotations stored before that field existed.
 */
function elementSpeakerNoteIndex(annotation: ElementAnnotation): number | null {
  if (annotation.speakerNoteIndex !== undefined) return annotation.speakerNoteIndex;
  if (!isSpeakerNotesContext(annotation.uiContext)) return null;
  const match = annotation.selector.match(/speaker-notes-sidebar__notes[\s\S]*?li:nth-of-type\((\d+)\)/);
  return match ? Number(match[1]) - 1 : null;
}

function describeSpeakerNote(
  annotation: Annotation,
  noteIndex: number,
  snapshotValue?: string,
): AnnotationTargetDescription {
  const target = `notes.mjs["${annotation.slideId}"][${noteIndex}]`;
  return {
    workGroup: `slide:${annotation.slideId}`,
    source: deckFile(annotation, 'notes.mjs'),
    target,
    label: `speaker note ${noteIndex + 1}`,
    snapshot: snapshotValue === undefined
      ? null
      : { key: target, label: `Speaker note ${noteIndex + 1} snapshot`, value: snapshotValue },
  };
}

function describeElement(annotation: ElementAnnotation): AnnotationTargetDescription {
  const noteIndex = elementSpeakerNoteIndex(annotation);
  if (noteIndex !== null) return describeSpeakerNote(annotation, noteIndex);

  const { elementInfo } = annotation;
  const classes = elementInfo.className && elementInfo.className !== '(no class)'
    ? `.${elementInfo.className.trim().split(/\s+/).join('.')}`
    : '';
  const element = `<${elementInfo.tagName}${classes}>`;
  const hasComponent = elementInfo.componentName !== 'Unknown';
  return {
    workGroup: annotation.uiContext ? `app:${uiSurfaceSlug(annotation.uiContext)}` : `slide:${annotation.slideId}`,
    source: elementInfo.cssFile || deckFile(annotation, 'slides.tsx or its deck-local content module'),
    target: hasComponent
      ? `${elementInfo.componentName} · ${element}`
      : `${annotation.uiContext ?? annotation.slideId} · ${element}`,
    label: hasComponent ? elementInfo.componentName : annotation.uiContext ?? elementInfo.tagName,
    snapshot: null,
  };
}

/** Describes the content an annotation points at, ignoring app-behavior routing. */
function describeContent(annotation: Annotation): AnnotationTargetDescription {
  switch (annotation.type) {
    case 'slide-order':
      return {
        workGroup: 'deck:slide-order',
        source: deckFile(annotation, 'slides.tsx'),
        target: `${annotation.slideId} · ${annotation.placement} ${annotation.anchorSlideId}`,
        label: 'slide position',
        snapshot: null,
      };

    case 'speaker-note':
      return describeSpeakerNote(annotation, annotation.noteIndex, annotation.noteSnapshot);

    case 'sparkle-prompt': {
      const target = `sparkle.mjs["${annotation.slideId}"].${annotation.field}`;
      return {
        workGroup: `slide:${annotation.slideId}:sparkle:${annotation.field}`,
        source: deckFile(annotation, 'sparkle.mjs'),
        target,
        label: SPARKLE_FIELD_LABELS[annotation.field],
        snapshot: { key: target, label: SPARKLE_SNAPSHOT_LABELS[annotation.field], value: annotation.promptSnapshot },
      };
    }

    case 'text': {
      const manuscript = manuscriptFile(annotation.presentationId);
      const fullText = annotation.surroundingContext.fullText;
      if (annotation.practice?.target === 'talk') {
        const target = `${manuscript} · captured lines ${annotation.practice.sourceLine}–${annotation.practice.sourceEndLine}`;
        return {
          workGroup: `document:${manuscript}`,
          source: `${manuscript}:${annotation.practice.sourceLine}`,
          target,
          label: `${manuscript} passage`,
          snapshot: fullText === undefined ? null : { key: target, label: `${manuscript} passage snapshot`, value: fullText },
        };
      }
      const [target, label] = annotation.practice
        ? [`${annotation.slideId} · whole slide`, 'whole slide']
        : annotation.propPath
          ? [`${annotation.slideId} · prop ${annotation.propPath}`, `slide text at ${annotation.propPath}`]
          : [`${annotation.slideId} · selected slide text`, 'selected slide text'];
      return {
        workGroup: `slide:${annotation.slideId}`,
        source: deckFile(annotation, 'slides.tsx or its deck-local content module'),
        target,
        label,
        snapshot: fullText === undefined ? null : { key: target, label: 'Slide text snapshot', value: fullText },
      };
    }

    case 'element':
      return describeElement(annotation);
  }
}

/**
 * Routes an annotation to its work group, source file, semantic target,
 * heading label, and current-source snapshot in one place, so every part of
 * the review packet agrees on where an annotation points.
 */
export function describeAnnotationTarget(
  annotation: Annotation,
  operation: AnnotationOperation = inferAnnotationOperation(annotation),
): AnnotationTargetDescription {
  const content = describeContent(annotation);
  const isManuscript = annotation.type === 'text' && annotation.practice?.target === 'talk';
  let described = content;

  if (operation === 'app-behavior' && !isManuscript && annotation.type !== 'slide-order') {
    // The selected content only reproduces the problem; the work belongs to
    // the application surface it was reported from.
    described = { ...content, workGroup: `app:${uiSurfaceSlug(annotation.uiContext)}` };
    if (annotation.uiContext?.startsWith('Presenter view')) {
      described.source = PRESENTER_VIEW_SOURCE;
      described.target = `SpeakerNotesView · ${annotation.uiContext.replace(/^Presenter view( → )?/, '') || 'page'}`;
    } else if (isSpeakerNotesContext(annotation.uiContext)) {
      described.source = SPEAKER_NOTES_SIDEBAR_SOURCE;
      described.target = annotation.type === 'element' && annotation.selector.includes('sparkle-prompt-card')
        ? 'SpeakerNotesSidebar · SparklePromptCard placement'
        : 'SpeakerNotesSidebar · speaker note controls';
    }
  }

  return annotation.workGroup ? { ...described, workGroup: annotation.workGroup } : described;
}
