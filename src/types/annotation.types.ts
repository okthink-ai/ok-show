import type { ElementInfo } from '../utils/elementInfo';
import type { SparklePromptField } from './speakerNotes.types';

export type AnnotationIntent = 'fix' | 'change' | 'question';

export type AnnotationOperation =
  | 'content-change'
  | 'replace-text'
  | 'remove'
  | 'move'
  | 'adjust-layout'
  | 'insert-slide'
  | 'app-behavior'
  | 'question';

export interface AnnotationCaptureContext {
  capturedAt: number;
  revision: string;
  route: string;
  viewport: { width: number; height: number };
}

export interface TextAnchorContext {
  before: string;
  after: string;
  selector?: string;
  fullText?: string;
  rangeStart?: number;
  rangeEnd?: number;
}

// Serializable version of ElementInfo (DOM refs stripped)
export type SerializableElementInfo = Omit<ElementInfo, 'element' | 'styles'> & {
  element: null;
  styles: null;
};

export type AspectRatio = '16:9' | '9:16';
export type SlideOrderPlacement = 'before' | 'after';

export interface SlideContext {
  slideId: string;
  slideIndex: number;
  slideTemplate: string;
  slideTitle: string;
  aspectRatio: AspectRatio;
}

export interface PendingElement {
  elementInfo: SerializableElementInfo;
  capturedTextContent: string;
  capturedRenderedText?: string;
  selector?: string;
  uiContext?: string;
  /** Index of the speaker note bullet the element belongs to, when captured in the notes panel. */
  speakerNoteIndex?: number;
  slideContext: SlideContext;
  clickPosition: { x: number; y: number };
  normalizedPosition: { x: number; y: number };
}

export interface PendingCanvasText {
  source?: 'canvas' | 'practice';
  practice?: TextAnnotation['practice'];
  text: string;
  context: TextAnchorContext;
  uiContext?: string;
  slideContext: SlideContext;
  clickPosition: { x: number; y: number };
  normalizedPosition: { x: number; y: number };
}

export interface PendingOutlineAnnotation {
  slideIndex: number;
  slideId: string;
  slideTemplate: string;
  slideTitle: string;
  aspectRatio: AspectRatio;
  propPath: string;
  text: string;
  clickPosition: { x: number; y: number };
}

export interface PendingSpeakerNoteAnnotation {
  slideIndex: number;
  slideId: string;
  slideTemplate: string;
  slideTitle: string;
  aspectRatio: AspectRatio;
  normalizedPosition: { x: number; y: number };
  target: 'item' | 'range';
  noteIndex: number;
  noteSnapshot: string;
  quotedText: string;
  surroundingContext: { before: string; after: string };
  operation?: AnnotationOperation;
  rangeStart?: number;
  rangeEnd?: number;
  replacementText?: string;
}

export interface PendingSparklePromptAnnotation {
  slideIndex: number;
  slideId: string;
  slideTemplate: string;
  slideTitle: string;
  aspectRatio: AspectRatio;
  normalizedPosition: { x: number; y: number };
  field: SparklePromptField;
  promptSnapshot: string;
  quotedText: string;
  surroundingContext: { before: string; after: string };
  rangeStart: number;
  rangeEnd: number;
}

export type PendingAnnotationTarget =
  | { type: 'element'; value: PendingElement }
  | { type: 'canvas-text'; value: PendingCanvasText }
  | { type: 'outline'; value: PendingOutlineAnnotation }
  | { type: 'speaker-note'; value: PendingSpeakerNoteAnnotation }
  | { type: 'sparkle-prompt'; value: PendingSparklePromptAnnotation };

/** The complete in-progress annotation, persisted as one atomic draft. */
export interface PendingAnnotationDraft {
  presentationId: string;
  comment: string;
  target: PendingAnnotationTarget;
}

interface AnnotationBase {
  id: string;
  presentationId: string;
  slideId: string;
  slideIndex: number;
  slideTemplate: string;
  slideTitle: string;
  aspectRatio: AspectRatio;
  comment: string;
  uiContext?: string;
  intent?: AnnotationIntent;
  operation?: AnnotationOperation;
  workGroup?: string;
  dependencies?: string;
  acceptanceCriteria?: string;
  capture?: AnnotationCaptureContext;
  normalizedPosition: { x: number; y: number };
  timestamp: number;
  copiedAt?: number;
}

export interface ElementAnnotation extends AnnotationBase {
  type: 'element';
  elementInfo: SerializableElementInfo;
  selector: string;
  textContent?: string;
  renderedText?: string;
  /**
   * Index of the speaker note bullet the element belongs to, recorded when the
   * notes panel creates the annotation. Absent for elements outside the notes
   * and for annotations stored before the field existed.
   */
  speakerNoteIndex?: number;
}

export interface TextAnnotation extends AnnotationBase {
  type: 'text';
  text: string;
  /** Present when the annotation was created by editing slide text directly. */
  replacementText?: string;
  surroundingContext: TextAnchorContext;
  propPath?: string;
  source: 'canvas' | 'outline' | 'practice';
  practice?: { target: 'slide' | 'talk'; sourceLine: number; sourceEndLine: number; sourceText?: string };
}

export interface SpeakerNoteAnnotation extends AnnotationBase {
  type: 'speaker-note';
  target: 'item' | 'range';
  noteIndex: number;
  noteSnapshot: string;
  quotedText: string;
  surroundingContext: { before: string; after: string };
  rangeStart?: number;
  rangeEnd?: number;
  /** Present when the annotation was created by editing note text directly. */
  replacementText?: string;
}

export interface SparklePromptAnnotation extends AnnotationBase {
  type: 'sparkle-prompt';
  field: SparklePromptField;
  promptSnapshot: string;
  quotedText: string;
  surroundingContext: { before: string; after: string };
  rangeStart: number;
  rangeEnd: number;
}

export interface SlideOrderAnnotation extends AnnotationBase {
  type: 'slide-order';
  placement: SlideOrderPlacement;
  anchorSlideId: string;
  anchorSlideTitle: string;
  anchorSlideIndex: number;
}

export type Annotation =
  | ElementAnnotation
  | TextAnnotation
  | SpeakerNoteAnnotation
  | SparklePromptAnnotation
  | SlideOrderAnnotation;
