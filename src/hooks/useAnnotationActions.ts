import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useAppDispatch } from '../store/hooks';
import {
  toggleMultiSelect,
  setPendingDraft,
  clearPending,
} from '../store/annotationsSlice';
import type { AspectRatio, PendingAnnotationDraft, PendingElement, TextAnchorContext } from '../types/annotation.types';
import { commitAnnotation } from '../store/annotationThunks';
import type { SlideData } from '../types/slide.types';
import type { ElementInfo } from '../utils/elementInfo';
import { getAppUiContext, getSpeakerNoteIndex, getStableElementSelector } from '../utils/annotationContext';

export interface AnnotationActions {
  handleAnnotateElement: (elementInfo: ElementInfo, clickPosition: { x: number; y: number }) => void;
  handleAnnotateText: (text: string, context: TextAnchorContext, clickPosition: { x: number; y: number }, uiContext?: string) => void;
  handleAnnotateFromOutline: (slideIndex: number, propPath: string, text: string) => void;
  handleCommit: (comment: string) => void;
  handleCommentCancel: () => void;
  handleToggleMultiSelect: () => void;
  lastPopupDismissRef: MutableRefObject<number>;
}

function getNormalizedClickPosition(clickPosition: { x: number; y: number }): { x: number; y: number } {
  const slideEl = document.querySelector('.slide--active') as HTMLElement | null;
  const slideRect = slideEl?.getBoundingClientRect();
  if (!slideRect) return { x: 0.5, y: 0.5 };
  return {
    x: (clickPosition.x - slideRect.left) / slideRect.width,
    y: (clickPosition.y - slideRect.top) / slideRect.height,
  };
}

function detectAspectRatio(clickPosition: { x: number; y: number }, fallback: AspectRatio): AspectRatio {
  const el = document.elementFromPoint(clickPosition.x, clickPosition.y);
  if (el?.closest('.mobile-frame')) return '9:16';
  return fallback;
}

export function useAnnotationActions(
  slides: SlideData[],
  currentSlide: number,
  aspectRatio: AspectRatio,
  presentationId: string,
): AnnotationActions {
  const dispatch = useAppDispatch();
  const lastPopupDismissRef = useRef<number>(0);

  const handleAnnotateElement = useCallback(
    (elementInfo: ElementInfo, clickPosition: { x: number; y: number }) => {
      const slide = slides[currentSlide];
      if (!slide) return;
      const normalizedPosition = getNormalizedClickPosition(clickPosition);
      const speakerNoteIndex = getSpeakerNoteIndex(elementInfo.element);
      const pending: PendingElement = {
        elementInfo: { ...elementInfo, element: null, styles: null },
        capturedTextContent: elementInfo.element?.textContent?.trim() || '',
        capturedRenderedText: elementInfo.element?.innerText?.trim() || undefined,
        selector: elementInfo.element ? getStableElementSelector(elementInfo.element) : undefined,
        uiContext: getAppUiContext(elementInfo.element),
        ...(speakerNoteIndex !== undefined && { speakerNoteIndex }),
        slideContext: {
          slideId: slide.id,
          slideIndex: currentSlide,
          slideTemplate: slide.template || 'Unknown',
          slideTitle: slide.title || '',
          aspectRatio: detectAspectRatio(clickPosition, aspectRatio),
        },
        clickPosition,
        normalizedPosition,
      };
      const draft: PendingAnnotationDraft = {
        presentationId,
        comment: '',
        target: { type: 'element', value: pending },
      };
      dispatch(setPendingDraft(draft));
    },
    [slides, currentSlide, aspectRatio, dispatch, presentationId],
  );

  const handleAnnotateText = useCallback(
    (text: string, context: TextAnchorContext, clickPosition: { x: number; y: number }, uiContext?: string) => {
      const slide = slides[currentSlide];
      if (!slide) return;
      const normalizedPosition = getNormalizedClickPosition(clickPosition);
      dispatch(setPendingDraft({
        presentationId,
        comment: '',
        target: {
          type: 'canvas-text',
          value: {
            text,
            context,
            uiContext,
            slideContext: {
              slideId: slide.id,
              slideIndex: currentSlide,
              slideTemplate: slide.template || 'Unknown',
              slideTitle: slide.title || '',
              aspectRatio: detectAspectRatio(clickPosition, aspectRatio),
            },
            clickPosition,
            normalizedPosition,
          },
        },
      }));
    },
    [slides, currentSlide, aspectRatio, dispatch, presentationId],
  );

  const handleAnnotateFromOutline = useCallback(
    (slideIndex: number, propPath: string, text: string) => {
      const slide = slides[slideIndex];
      if (!slide) return;
      dispatch(setPendingDraft({
        presentationId,
        comment: '',
        target: {
          type: 'outline',
          value: {
            slideIndex,
            slideId: slide.id,
            slideTemplate: slide.template || 'Unknown',
            slideTitle: slide.title || '',
            aspectRatio,
            propPath,
            text,
            clickPosition: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
          },
        },
      }));
    },
    [slides, aspectRatio, dispatch, presentationId],
  );

  const handleCommit = useCallback((comment: string) => {
    dispatch(commitAnnotation(comment));
  }, [dispatch]);

  const handleCommentCancel = useCallback(() => {
    lastPopupDismissRef.current = Date.now();
    dispatch(clearPending());
  }, [dispatch]);

  const handleToggleMultiSelect = useCallback(() => {
    dispatch(toggleMultiSelect());
  }, [dispatch]);

  return {
    handleAnnotateElement,
    handleAnnotateText,
    handleAnnotateFromOutline,
    handleCommit,
    handleCommentCancel,
    handleToggleMultiSelect,
    lastPopupDismissRef,
  };
}
