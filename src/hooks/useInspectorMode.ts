import type { MutableRefObject } from 'react';
import type { TextAnchorContext } from '../types/annotation.types';
import type { SlideData } from '../types/slide.types';
import type { ElementInfo } from '../utils/elementInfo';
import { useInspectorOverlay } from './useInspectorOverlay';
import { useInspectorHover } from './useInspectorHover';
import { useInspectorClickCopy } from './useInspectorClickCopy';
import { useInspectorAnnotate } from './useInspectorAnnotate';

interface UseInspectorModeOptions {
  currentSlide: number;
  totalSlides: number;
  aspectRatio: '16:9' | '9:16';
  slides: SlideData[];
  isMultiSelectMode?: boolean;
  onAnnotate?: (elementInfo: ElementInfo, clickPosition: { x: number; y: number }) => void;
  onAnnotateText?: (text: string, context: TextAnchorContext, clickPosition: { x: number; y: number }, uiContext?: string) => void;
  onTextReplacement?: (
    text: string,
    replacementText: string,
    context: { before: string; after: string; selector: string },
    clickPosition: { x: number; y: number },
  ) => void;
  onToggleMultiSelect?: () => void;
  /** Timestamp ref set by CommentPopup when it dismisses — used to skip the
   *  annotation for that same click without swallowing it globally. */
  lastPopupDismissRef?: MutableRefObject<number>;
}

/**
 * Inspector Mode hook - Hold Alt to inspect slide elements
 *
 * Features:
 * - Hover to see element info (component, styles, dimensions)
 * - Click to copy comprehensive debug info to clipboard
 * - Automatic diagnostics for common layout issues
 *
 * See docs/inspector-mode.md for full documentation.
 *
 * Composed of focused sub-hooks:
 * - useInspectorOverlay   — Alt key detection + overlay/tooltip DOM lifecycle
 * - useInspectorHover     — Mouse tracking and overlay positioning
 * - useInspectorClickCopy — Click-to-clipboard (normal inspector mode)
 * - useInspectorAnnotate  — Click-to-annotate (multi-select annotation mode)
 *
 * Clipboard formatting lives in utils/inspectorClipboard.ts as a pure function.
 */
export function useInspectorMode({
  currentSlide,
  totalSlides,
  aspectRatio,
  slides,
  isMultiSelectMode,
  onAnnotate,
  onAnnotateText,
  onTextReplacement,
  onToggleMultiSelect,
  lastPopupDismissRef,
}: UseInspectorModeOptions): void {
  const stateRef = useInspectorOverlay(onToggleMultiSelect);

  useInspectorHover(stateRef);

  useInspectorClickCopy({
    stateRef,
    currentSlide,
    totalSlides,
    aspectRatio,
    slides,
    isMultiSelectMode,
  });

  useInspectorAnnotate({
    stateRef,
    isMultiSelectMode,
    onAnnotate,
    onAnnotateText,
    onTextReplacement,
    lastPopupDismissRef,
  });
}
