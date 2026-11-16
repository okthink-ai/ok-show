import type {
  Annotation,
  PendingAnnotationDraft,
  SerializableElementInfo,
} from '../types/annotation.types';

const STORAGE_VERSION = 4;
const LEGACY_STORAGE_VERSIONS = new Set([1, 2, 3]);

interface AnnotationStorageEnvelope {
  version: typeof STORAGE_VERSION;
  annotations: Annotation[];
}

interface PendingDraftStorageEnvelope {
  version: typeof STORAGE_VERSION;
  draft: PendingAnnotationDraft;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isOptionalNonNegativeInteger(value: unknown): value is number | undefined {
  return value === undefined || isNonNegativeInteger(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(isString);
}

function isPoint(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function isTextContext(value: unknown): boolean {
  return isRecord(value)
    && isString(value.before)
    && isString(value.after)
    && isOptionalString(value.selector)
    && isOptionalString(value.fullText)
    && isOptionalNonNegativeInteger(value.rangeStart)
    && isOptionalNonNegativeInteger(value.rangeEnd);
}

function isAspectRatio(value: unknown): value is '16:9' | '9:16' {
  return value === '16:9' || value === '9:16';
}

function isSparklePromptField(value: unknown): boolean {
  return value === 'style' || value === 'imagePrompt' || value === 'motionPrompt';
}

function isSlideOrderPlacement(value: unknown): boolean {
  return value === 'before' || value === 'after';
}

function isOperation(value: unknown): boolean {
  return value === undefined || [
    'content-change',
    'replace-text',
    'remove',
    'move',
    'adjust-layout',
    'insert-slide',
    'app-behavior',
    'question',
  ].includes(String(value));
}

function isCaptureContext(value: unknown): boolean {
  return value === undefined || (isRecord(value)
    && isFiniteNumber(value.capturedAt)
    && isString(value.revision)
    && isString(value.route)
    && isRecord(value.viewport)
    && isNonNegativeInteger(value.viewport.width)
    && isNonNegativeInteger(value.viewport.height));
}

function isOverflowInfo(value: unknown): boolean {
  return isRecord(value)
    && typeof value.isOverflowingX === 'boolean'
    && typeof value.isOverflowingY === 'boolean'
    && isFiniteNumber(value.scrollWidth)
    && isFiniteNumber(value.scrollHeight)
    && isFiniteNumber(value.clientWidth)
    && isFiniteNumber(value.clientHeight);
}

function isParentInfo(value: unknown): boolean {
  return value === null || (isRecord(value)
    && isString(value.tagName)
    && isString(value.className)
    && isString(value.display)
    && isString(value.flexDirection)
    && isString(value.justifyContent)
    && isString(value.alignItems)
    && isString(value.gap)
    && isString(value.width)
    && isString(value.height));
}

function isChildrenInfo(value: unknown): boolean {
  return isRecord(value)
    && isNonNegativeInteger(value.count)
    && isStringArray(value.tags)
    && typeof value.hasMore === 'boolean';
}

function isImageInfo(value: unknown): boolean {
  return value === null || (isRecord(value)
    && isFiniteNumber(value.naturalWidth)
    && isFiniteNumber(value.naturalHeight)
    && isString(value.aspectRatio)
    && isString(value.objectFit)
    && isString(value.objectPosition)
    && isString(value.src));
}

function isCanvasPosition(value: unknown): boolean {
  return value === null || (isRecord(value)
    && isFiniteNumber(value.x)
    && isFiniteNumber(value.y)
    && isFiniteNumber(value.width)
    && isFiniteNumber(value.height)
    && isFiniteNumber(value.scale));
}

function decodeElementInfo(value: unknown): SerializableElementInfo | null {
  if (!isRecord(value)) return null;
  const normalized: UnknownRecord = { ...value, element: null, styles: null };
  if (!isString(normalized.componentName)
    || !isString(normalized.tagName)
    || !isString(normalized.id)
    || !isString(normalized.className)
    || !(normalized.cssFile === null || isString(normalized.cssFile))
    || !isStringArray(normalized.hierarchy)
    || !isOverflowInfo(normalized.overflow)
    || !isParentInfo(normalized.parent)
    || !isChildrenInfo(normalized.children)
    || !isImageInfo(normalized.imageInfo)
    || !isCanvasPosition(normalized.canvasPosition)
    || !isStringArray(normalized.diagnostics)
    || !isStringRecord(normalized.serializedStyles)) return null;
  return normalized as unknown as SerializableElementInfo;
}

function hasAnnotationBase(value: UnknownRecord): boolean {
  return isString(value.id)
    && isString(value.presentationId)
    && isString(value.slideId)
    && isNonNegativeInteger(value.slideIndex)
    && isString(value.slideTemplate)
    && isString(value.slideTitle)
    && isAspectRatio(value.aspectRatio)
    && isString(value.comment)
    && isOptionalString(value.uiContext)
    && (value.intent === undefined || ['fix', 'change', 'question'].includes(String(value.intent)))
    && isOperation(value.operation)
    && isOptionalString(value.workGroup)
    && isOptionalString(value.dependencies)
    && isOptionalString(value.acceptanceCriteria)
    && isCaptureContext(value.capture)
    && isPoint(value.normalizedPosition)
    && isFiniteNumber(value.timestamp)
    && (value.copiedAt === undefined || isFiniteNumber(value.copiedAt));
}

function decodeAnnotation(value: unknown): Annotation | null {
  if (!isRecord(value) || !hasAnnotationBase(value)) return null;
  if (value.type === 'element') {
    const elementInfo = decodeElementInfo(value.elementInfo);
    if (!elementInfo
      || !isString(value.selector)
      || !isOptionalString(value.textContent)
      || !isOptionalString(value.renderedText)
      || !isOptionalNonNegativeInteger(value.speakerNoteIndex)) return null;
    return { ...value, elementInfo } as unknown as Annotation;
  }
  if (value.type === 'text') {
    if (!isString(value.text)
      || !isOptionalString(value.replacementText)
      || !isTextContext(value.surroundingContext)
      || !isOptionalString(value.propPath)
      || (value.source !== 'canvas' && value.source !== 'outline' && value.source !== 'practice')
      || (value.source === 'practice' && (!isRecord(value.practice)
        || !['slide', 'talk'].includes(String(value.practice.target))
        || !isNonNegativeInteger(value.practice.sourceLine)
        || !isOptionalString(value.practice.sourceText)
        || !isNonNegativeInteger(value.practice.sourceEndLine)))) return null;
    return value as unknown as Annotation;
  }
  if (value.type === 'speaker-note') {
    if ((value.target !== 'item' && value.target !== 'range')
      || !isNonNegativeInteger(value.noteIndex)
      || !isString(value.noteSnapshot)
      || !isString(value.quotedText)
      || !isTextContext(value.surroundingContext)
      || !isOptionalNonNegativeInteger(value.rangeStart)
      || !isOptionalNonNegativeInteger(value.rangeEnd)
      || !isOptionalString(value.replacementText)) return null;
    return value as unknown as Annotation;
  }
  if (value.type === 'sparkle-prompt') {
    if (!isSparklePromptField(value.field)
      || !isString(value.promptSnapshot)
      || !isString(value.quotedText)
      || !isTextContext(value.surroundingContext)
      || !isNonNegativeInteger(value.rangeStart)
      || !isNonNegativeInteger(value.rangeEnd)) return null;
    return value as unknown as Annotation;
  }
  if (value.type === 'slide-order') {
    if (!isSlideOrderPlacement(value.placement)
      || !isString(value.anchorSlideId)
      || !isString(value.anchorSlideTitle)
      || !isNonNegativeInteger(value.anchorSlideIndex)) return null;
    return value as unknown as Annotation;
  }
  return null;
}

function hasSlideFields(value: UnknownRecord): boolean {
  return isString(value.slideId)
    && isNonNegativeInteger(value.slideIndex)
    && isString(value.slideTemplate)
    && isString(value.slideTitle)
    && isAspectRatio(value.aspectRatio);
}

function hasSlideContext(value: unknown): boolean {
  return isRecord(value) && hasSlideFields(value);
}

function decodePendingDraft(value: unknown): PendingAnnotationDraft | null {
  if (!isRecord(value)
    || !isString(value.presentationId)
    || !isString(value.comment)
    || !isRecord(value.target)
    || !isRecord(value.target.value)) return null;

  const target: UnknownRecord = value.target;
  const targetValue = target.value as UnknownRecord;
  if (target.type === 'element') {
    const elementInfo = decodeElementInfo(targetValue.elementInfo);
    if (!elementInfo
      || !isString(targetValue.capturedTextContent)
      || !isOptionalString(targetValue.capturedRenderedText)
      || !isOptionalString(targetValue.selector)
      || !isOptionalString(targetValue.uiContext)
      || !isOptionalNonNegativeInteger(targetValue.speakerNoteIndex)
      || !hasSlideContext(targetValue.slideContext)
      || !isPoint(targetValue.clickPosition)
      || !isPoint(targetValue.normalizedPosition)) return null;
    return {
      ...value,
      target: { ...target, value: { ...targetValue, elementInfo } },
    } as unknown as PendingAnnotationDraft;
  }
  if (target.type === 'canvas-text') {
    if (targetValue.source !== undefined && targetValue.source !== 'canvas' && targetValue.source !== 'practice') return null;
    if (targetValue.source === 'practice' && (!isRecord(targetValue.practice)
      || !['slide', 'talk'].includes(String(targetValue.practice.target))
      || !isNonNegativeInteger(targetValue.practice.sourceLine)
      || !isNonNegativeInteger(targetValue.practice.sourceEndLine)
      || !isOptionalString(targetValue.practice.sourceText))) return null;
    if (!isString(targetValue.text)
      || !isTextContext(targetValue.context)
      || !isOptionalString(targetValue.uiContext)
      || !hasSlideContext(targetValue.slideContext)
      || !isPoint(targetValue.clickPosition)
      || !isPoint(targetValue.normalizedPosition)) return null;
    return value as unknown as PendingAnnotationDraft;
  }
  if (target.type === 'outline') {
    if (!hasSlideFields(targetValue)
      || !isString(targetValue.propPath)
      || !isString(targetValue.text)
      || !isPoint(targetValue.clickPosition)) return null;
    return value as unknown as PendingAnnotationDraft;
  }
  if (target.type === 'speaker-note') {
    if (!hasSlideFields(targetValue)
      || !isPoint(targetValue.normalizedPosition)
      || (targetValue.target !== 'item' && targetValue.target !== 'range')
      || !isNonNegativeInteger(targetValue.noteIndex)
      || !isString(targetValue.noteSnapshot)
      || !isString(targetValue.quotedText)
      || !isTextContext(targetValue.surroundingContext)
      || !isOperation(targetValue.operation)
      || !isOptionalNonNegativeInteger(targetValue.rangeStart)
      || !isOptionalNonNegativeInteger(targetValue.rangeEnd)
      || !isOptionalString(targetValue.replacementText)) return null;
    return value as unknown as PendingAnnotationDraft;
  }
  if (target.type === 'sparkle-prompt') {
    if (!hasSlideFields(targetValue)
      || !isPoint(targetValue.normalizedPosition)
      || !isSparklePromptField(targetValue.field)
      || !isString(targetValue.promptSnapshot)
      || !isString(targetValue.quotedText)
      || !isTextContext(targetValue.surroundingContext)
      || !isNonNegativeInteger(targetValue.rangeStart)
      || !isNonNegativeInteger(targetValue.rangeEnd)) return null;
    return value as unknown as PendingAnnotationDraft;
  }
  return null;
}

export function decodeAnnotationsFromStorage(value: unknown): Annotation[] {
  const candidates = Array.isArray(value)
    ? value
    : isRecord(value)
      && (value.version === STORAGE_VERSION || LEGACY_STORAGE_VERSIONS.has(Number(value.version)))
      && Array.isArray(value.annotations)
      ? value.annotations
      : [];
  return candidates.flatMap((candidate) => {
    const annotation = decodeAnnotation(candidate);
    return annotation ? [annotation] : [];
  });
}

export function encodeAnnotationsForStorage(annotations: Annotation[]): AnnotationStorageEnvelope {
  return { version: STORAGE_VERSION, annotations };
}

export function decodePendingDraftFromStorage(value: unknown): PendingAnnotationDraft | null {
  const candidate = isRecord(value)
    && (value.version === STORAGE_VERSION || LEGACY_STORAGE_VERSIONS.has(Number(value.version)))
    ? value.draft
    : value;
  return decodePendingDraft(candidate);
}

export function encodePendingDraftForStorage(draft: PendingAnnotationDraft): PendingDraftStorageEnvelope {
  return { version: STORAGE_VERSION, draft };
}
