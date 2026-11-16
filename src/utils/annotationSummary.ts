import type { Annotation, AnnotationIntent } from '../types/annotation.types';

export type AnnotationKind =
  | 'element'
  | 'slide-text'
  | 'outline-text'
  | 'manuscript'
  | 'speaker-note'
  | 'sparkle-prompt'
  | 'slide-order';

/** Display order, label, and Material icon for each annotation target. */
export const ANNOTATION_KINDS: ReadonlyArray<{ kind: AnnotationKind; label: string; icon: string }> = [
  { kind: 'element', label: 'Slide element', icon: 'ads_click' },
  { kind: 'slide-text', label: 'Slide text', icon: 'text_fields' },
  { kind: 'outline-text', label: 'Outline text', icon: 'list_alt' },
  { kind: 'speaker-note', label: 'Speaker note', icon: 'speaker_notes' },
  { kind: 'sparkle-prompt', label: 'Sparkle field', icon: 'auto_awesome' },
  { kind: 'manuscript', label: 'Manuscript passage', icon: 'menu_book' },
  { kind: 'slide-order', label: 'Slide order', icon: 'swap_vert' },
];

export const ANNOTATION_INTENTS: ReadonlyArray<{ intent: AnnotationIntent | null; label: string }> = [
  { intent: 'fix', label: 'Fix' },
  { intent: 'change', label: 'Change' },
  { intent: 'question', label: 'Question' },
  { intent: null, label: 'Untagged' },
];

export function annotationKind(annotation: Annotation): AnnotationKind {
  if (annotation.type !== 'text') return annotation.type;
  if (annotation.source === 'outline') return 'outline-text';
  if (annotation.source === 'practice') return 'manuscript';
  return 'slide-text';
}

export interface AnnotationSummary {
  total: number;
  slidesAnnotated: number;
  byKind: Array<{ kind: AnnotationKind; label: string; icon: string; count: number }>;
  byIntent: Array<{ intent: AnnotationIntent | null; label: string; count: number }>;
}

/** Counts shown on the copy card. Targets and intents with no annotations are omitted. */
export function summarizeAnnotations(annotations: Annotation[]): AnnotationSummary {
  const kindCounts = new Map<AnnotationKind, number>();
  const intentCounts = new Map<AnnotationIntent | null, number>();
  for (const annotation of annotations) {
    const kind = annotationKind(annotation);
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
    const intent = annotation.intent ?? null;
    intentCounts.set(intent, (intentCounts.get(intent) ?? 0) + 1);
  }
  return {
    total: annotations.length,
    slidesAnnotated: new Set(annotations.map(annotation => annotation.slideId)).size,
    byKind: ANNOTATION_KINDS
      .map(entry => ({ ...entry, count: kindCounts.get(entry.kind) ?? 0 }))
      .filter(entry => entry.count > 0),
    byIntent: ANNOTATION_INTENTS
      .map(entry => ({ ...entry, count: intentCounts.get(entry.intent) ?? 0 }))
      .filter(entry => entry.count > 0),
  };
}
