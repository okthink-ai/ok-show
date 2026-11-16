import type {
  AnnotationOperation,
  AspectRatio,
  PendingAnnotationDraft,
  PendingSpeakerNoteAnnotation,
  SpeakerNoteAnnotation,
} from '../types/annotation.types';
import type { SlideData } from '../types/slide.types';
import { getSurroundingContext } from './textHighlight';
import type { TextRange } from './textHighlight';

export const REPLACEMENT_COMMENT = 'Replace this bullet with the edited version.';
export const DELETION_COMMENT = 'Delete this speaker-note bullet.';
const CONTEXT_LENGTH = 48;

export type PendingSpeakerNoteDraft = PendingAnnotationDraft & {
  target: { type: 'speaker-note'; value: PendingSpeakerNoteAnnotation };
};

export function isPendingSpeakerNoteDraft(draft: PendingAnnotationDraft | null): draft is PendingSpeakerNoteDraft {
  return draft?.target.type === 'speaker-note';
}

/** Identifies which bullet a draft is for. */
export interface SpeakerNoteLocation {
  presentationId: string;
  slide: SlideData;
  slideIndex: number;
  aspectRatio: AspectRatio;
  noteIndex: number;
  note: string;
}

function baseValue(
  { slide, slideIndex, aspectRatio, noteIndex, note }: SpeakerNoteLocation,
): Omit<PendingSpeakerNoteAnnotation, 'target' | 'quotedText' | 'surroundingContext'> {
  return {
    slideIndex,
    slideId: slide.id,
    slideTemplate: slide.template ?? 'Slide',
    slideTitle: slide.title ?? `Slide ${slideIndex + 1}`,
    aspectRatio,
    normalizedPosition: { x: 0, y: 0 },
    noteIndex,
    noteSnapshot: note,
  };
}

/** A comment draft on a selected passage of a bullet, or null for a blank selection. */
export function buildRangeDraft(location: SpeakerNoteLocation, offsets: TextRange): PendingSpeakerNoteDraft | null {
  const { note, presentationId } = location;
  const quotedText = note.slice(offsets.start, offsets.end);
  if (!quotedText.trim()) return null;
  return {
    presentationId,
    comment: '',
    target: {
      type: 'speaker-note',
      value: {
        ...baseValue(location),
        target: 'range',
        quotedText,
        rangeStart: offsets.start,
        rangeEnd: offsets.end,
        surroundingContext: getSurroundingContext(note, offsets, CONTEXT_LENGTH),
      },
    },
  };
}

/** A whole-bullet replacement draft whose editor starts with `initialText`. */
export function buildReplacementDraft(location: SpeakerNoteLocation, initialText: string): PendingSpeakerNoteDraft {
  return {
    presentationId: location.presentationId,
    comment: REPLACEMENT_COMMENT,
    target: {
      type: 'speaker-note',
      value: {
        ...baseValue(location),
        target: 'item',
        quotedText: location.note,
        surroundingContext: { before: '', after: '' },
        replacementText: initialText,
      },
    },
  };
}

/** A whole-bullet removal draft. */
export function buildDeletionDraft(location: SpeakerNoteLocation): PendingSpeakerNoteDraft {
  return {
    presentationId: location.presentationId,
    comment: DELETION_COMMENT,
    target: {
      type: 'speaker-note',
      value: {
        ...baseValue(location),
        target: 'item',
        quotedText: location.note,
        surroundingContext: { before: '', after: '' },
        operation: 'remove' satisfies AnnotationOperation,
      },
    },
  };
}

/** Saved replacement annotations attached to one bullet, oldest first. */
export function replacementAnnotations(attached: SpeakerNoteAnnotation[]): SpeakerNoteAnnotation[] {
  return attached.filter((annotation) => annotation.target === 'item' && annotation.replacementText !== undefined);
}

export type ReplacementSavePlan =
  /** Nothing changed (or the editor was emptied): drop the draft. */
  | { kind: 'discard' }
  /** First replacement for this bullet: commit the draft as a new annotation. */
  | { kind: 'create' }
  /** Rewrite the newest replacement in place and drop older duplicates. */
  | { kind: 'update'; id: string; replacementText: string; removeIds: string[] }
  /** The edit restores the original bullet: remove its replacements. */
  | { kind: 'remove'; ids: string[] };

/**
 * Decides what saving an inline bullet edit does. `existing` are the bullet's
 * saved replacements, oldest first; the editor opened with the newest one.
 */
export function planReplacementSave(
  editedText: string,
  note: string,
  existing: SpeakerNoteAnnotation[],
): ReplacementSavePlan {
  const edited = editedText.trim();
  const latest = existing.at(-1);
  const shown = (latest?.replacementText ?? note).trim();
  if (!edited || edited === shown) return { kind: 'discard' };
  if (!latest) return { kind: 'create' };
  if (edited === note.trim()) return { kind: 'remove', ids: existing.map((annotation) => annotation.id) };
  return {
    kind: 'update',
    id: latest.id,
    replacementText: editedText,
    removeIds: existing.slice(0, -1).map((annotation) => annotation.id),
  };
}
