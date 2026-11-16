import { createAsyncThunk } from '@reduxjs/toolkit';
import type { RootState } from './store';
import { addAnnotation, clearPending, generateId } from './annotationsSlice';
import { getPresentationById } from '../project/presentations';
import { extractSlideText } from '../utils/slideTextExtractor';
import { createAnnotationCaptureContext } from '../utils/annotationContext';
import type { Annotation, AspectRatio, PendingAnnotationDraft } from '../types/annotation.types';

interface BaseAnnotationFields {
  slideId: string;
  slideIndex: number;
  slideTemplate: string;
  slideTitle: string;
  aspectRatio: AspectRatio;
  normalizedPosition: { x: number; y: number };
}

function buildBaseAnnotation(
  fields: BaseAnnotationFields,
  comment: string,
  presentationId: string,
): Omit<Annotation, 'type'> & { id: string; presentationId: string; timestamp: number } {
  return {
    id: generateId(),
    presentationId,
    slideId: fields.slideId,
    slideIndex: fields.slideIndex,
    slideTemplate: fields.slideTemplate,
    slideTitle: fields.slideTitle,
    aspectRatio: fields.aspectRatio,
    comment,
    normalizedPosition: fields.normalizedPosition,
    timestamp: Date.now(),
    capture: createAnnotationCaptureContext(),
  };
}

function getDraftSlideDetails(draft: PendingAnnotationDraft): {
  slideId: string;
  slideIndex: number;
  slideTemplate: string;
  slideTitle: string;
  aspectRatio: AspectRatio;
  normalizedPosition: { x: number; y: number };
} {
  if (draft.target.type === 'outline'
    || draft.target.type === 'speaker-note'
    || draft.target.type === 'sparkle-prompt') {
    const target = draft.target.value;
    return {
      slideId: target.slideId,
      slideIndex: target.slideIndex,
      slideTemplate: target.slideTemplate,
      slideTitle: target.slideTitle,
      aspectRatio: target.aspectRatio,
      normalizedPosition: { x: 0.5, y: 0.5 },
    };
  }
  const target = draft.target.value;
  return {
    slideId: target.slideContext.slideId,
    slideIndex: target.slideContext.slideIndex,
    slideTemplate: target.slideContext.slideTemplate,
    slideTitle: target.slideContext.slideTitle,
    aspectRatio: target.slideContext.aspectRatio,
    normalizedPosition: target.normalizedPosition,
  };
}

function getOwnedSlide(draft: PendingAnnotationDraft) {
  const presentation = getPresentationById(draft.presentationId);
  if (!presentation) return null;
  const details = getDraftSlideDetails(draft);
  const slide = presentation.slides[details.slideIndex];
  if (!slide || slide.id !== details.slideId) return null;
  return { presentation, slide, details };
}

export const commitAnnotation = createAsyncThunk<void, string, { state: RootState }>(
  'annotations/commitAnnotation',
  (comment, { dispatch, getState }) => {
    const draft = getState().annotations.pendingDraft;
    if (!draft) return;

    const ownedSlide = getOwnedSlide(draft);
    if (!ownedSlide) {
      // A draft from a removed or changed deck is unsafe to attach to the
      // currently open presentation, so discard it instead.
      dispatch(clearPending());
      return;
    }

    const details = ownedSlide.details;
    const finalComment = comment.trim() || draft.comment.trim();
    if (!finalComment) return;
    const base = buildBaseAnnotation(details, finalComment, draft.presentationId);

    if (draft.target.type === 'element') {
      const target = draft.target.value;
      // A speaker-note bullet is never slide text, even when the words match.
      const slideText = target.speakerNoteIndex === undefined ? extractSlideText(ownedSlide.slide) : null;
      const matched = slideText?.elements.find((element) => element.text === target.capturedTextContent);

      if (matched) {
        dispatch(addAnnotation({
          ...base,
          type: 'text',
          text: matched.text,
          uiContext: target.uiContext,
          surroundingContext: {
            before: '',
            after: '',
            selector: target.selector,
            fullText: target.capturedRenderedText || target.capturedTextContent,
            rangeStart: 0,
            rangeEnd: target.capturedTextContent.length,
          },
          propPath: matched.propPath,
          source: 'canvas',
        }));
      } else {
        const tagName = target.elementInfo.tagName;
        const firstClass = target.elementInfo.className?.split(' ')[0];
        const selector = target.selector
          || (firstClass && firstClass !== '(no class)' ? `${tagName}.${firstClass}` : tagName);

        dispatch(addAnnotation({
          ...base,
          type: 'element',
          elementInfo: target.elementInfo,
          uiContext: target.uiContext,
          selector,
          ...(target.speakerNoteIndex !== undefined && { speakerNoteIndex: target.speakerNoteIndex }),
          ...(target.capturedTextContent && { textContent: target.capturedTextContent }),
          ...(target.capturedRenderedText && { renderedText: target.capturedRenderedText }),
        }));
      }
    } else if (draft.target.type === 'canvas-text') {
      const target = draft.target.value;
      dispatch(addAnnotation({
        ...base,
        type: 'text',
        text: target.text,
        uiContext: target.uiContext,
        surroundingContext: target.context,
        source: target.source ?? 'canvas',
        ...(target.practice && { practice: target.practice }),
      }));
    } else if (draft.target.type === 'outline') {
      const target = draft.target.value;
      dispatch(addAnnotation({
        ...base,
        type: 'text',
        text: target.text,
        surroundingContext: { before: '', after: '' },
        propPath: target.propPath,
        source: 'outline',
      }));
    } else if (draft.target.type === 'speaker-note') {
      const target = draft.target.value;
      dispatch(addAnnotation({
        ...base,
        type: 'speaker-note',
        target: target.target,
        noteIndex: target.noteIndex,
        noteSnapshot: target.noteSnapshot,
        quotedText: target.quotedText,
        surroundingContext: target.surroundingContext,
        ...(target.operation !== undefined && { operation: target.operation }),
        rangeStart: target.rangeStart,
        rangeEnd: target.rangeEnd,
        replacementText: target.replacementText,
        ...(target.replacementText !== undefined && { operation: 'replace-text' as const }),
      }));
    } else {
      const target = draft.target.value;
      dispatch(addAnnotation({
        ...base,
        type: 'sparkle-prompt',
        field: target.field,
        promptSnapshot: target.promptSnapshot,
        quotedText: target.quotedText,
        surroundingContext: target.surroundingContext,
        rangeStart: target.rangeStart,
        rangeEnd: target.rangeEnd,
        uiContext: 'Developer tools drawer → Speaker notes → Sparkle',
      }));
    }
    dispatch(clearPending());
  },
);
