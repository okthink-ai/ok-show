import { useEffect, useRef, type MutableRefObject } from 'react';
import { getElementInfo } from '../utils/elementInfo';
import type { ElementInfo } from '../utils/elementInfo';
import type { TextAnchorContext } from '../types/annotation.types';
import { getInspectorTarget, type InspectorRefs } from './useInspectorOverlay';
import { getAppUiContext, getStableElementSelector } from '../utils/annotationContext';

interface UseInspectorAnnotateOptions {
  stateRef: React.MutableRefObject<InspectorRefs>;
  isMultiSelectMode?: boolean;
  onAnnotate?: (elementInfo: ElementInfo, clickPosition: { x: number; y: number }) => void;
  onAnnotateText?: (
    text: string,
    context: TextAnchorContext,
    clickPosition: { x: number; y: number },
    uiContext?: string,
  ) => void;
  onTextReplacement?: (
    text: string,
    replacementText: string,
    context: { before: string; after: string; selector: string },
    clickPosition: { x: number; y: number },
  ) => void;
  /** Timestamp ref set by CommentPopup when it dismisses — used to skip the
   *  annotation for that same click without swallowing it globally. */
  lastPopupDismissRef?: MutableRefObject<number>;
}

function getSlideTextTarget(target: EventTarget | null): HTMLElement | null {
  const element = target instanceof HTMLElement
    ? target
    : target instanceof Text
      ? target.parentElement
      : null;
  const slide = element?.closest('.slide--active');
  if (!element || !slide || element.closest('button, a, input, textarea, select, .slide__page-number')) return null;
  return element.textContent?.trim() ? element : null;
}

function getEditableText(element: HTMLElement): string {
  const readNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node instanceof HTMLBRElement) return '\n';
    return Array.from(node.childNodes).map(readNode).join('');
  };

  return readNode(element).trim();
}

function getScaledPixelValue(value: string, scale: number): string {
  const pixels = Number.parseFloat(value);
  return Number.isFinite(pixels) ? `${pixels * scale}px` : value;
}

function createTextEditor(element: HTMLElement, slide: HTMLElement, value: string): HTMLTextAreaElement {
  const editor = document.createElement('textarea');
  const rect = element.getBoundingClientRect();
  const slideRect = slide.getBoundingClientRect();
  const elementStyles = window.getComputedStyle(element);
  const slideStyles = window.getComputedStyle(slide);
  const scale = slide.offsetWidth > 0 ? slideRect.width / slide.offsetWidth : 1;

  editor.className = 'slide-text-editor';
  editor.setAttribute('aria-label', 'Edit slide text');
  editor.value = value;
  Object.assign(editor.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    color: elementStyles.color,
    backgroundColor: slideStyles.backgroundColor,
    fontFamily: elementStyles.fontFamily,
    fontSize: getScaledPixelValue(elementStyles.fontSize, scale),
    fontStyle: elementStyles.fontStyle,
    fontWeight: elementStyles.fontWeight,
    letterSpacing: getScaledPixelValue(elementStyles.letterSpacing, scale),
    lineHeight: getScaledPixelValue(elementStyles.lineHeight, scale),
    textAlign: elementStyles.textAlign,
    textTransform: elementStyles.textTransform,
  });
  document.body.appendChild(editor);
  return editor;
}

function getSelectionContext(root: HTMLElement, range: Range): TextAnchorContext {
  const beforeRange = document.createRange();
  beforeRange.selectNodeContents(root);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  const throughRange = document.createRange();
  throughRange.selectNodeContents(root);
  throughRange.setEnd(range.endContainer, range.endOffset);
  const fullText = root.textContent || '';
  const start = beforeRange.toString().length;
  const end = throughRange.toString().length;
  return {
    before: fullText.slice(Math.max(0, start - 100), start),
    after: fullText.slice(end, end + 100),
    fullText,
    rangeStart: start,
    rangeEnd: end,
    selector: getStableElementSelector(root),
  };
}

function getElementTextContext(
  slide: HTMLElement,
  element: HTMLElement,
): { before: string; after: string; selector: string } {
  const range = document.createRange();
  range.selectNodeContents(element);
  return {
    ...getSelectionContext(slide, range),
    selector: getStableElementSelector(element),
  };
}

/**
 * Handles inspector annotations, Alt-drag text selection, and direct slide-text edits.
 * Clicks in multi-select mode still detect text selections and element targets,
 * while Alt-drag works without requiring the multi-select toggle.
 */
export function useInspectorAnnotate({
  stateRef,
  isMultiSelectMode,
  onAnnotate,
  onAnnotateText,
  onTextReplacement,
  lastPopupDismissRef,
}: UseInspectorAnnotateOptions): void {
  const skipClickRef = useRef(false);
  const editingRef = useRef<{
    editor: HTMLTextAreaElement;
    original: string;
    replacement: string;
    position: { x: number; y: number };
    context: { before: string; after: string; selector: string };
  } | null>(null);

  useEffect(() => {
    // Without a replacement handler there is nowhere to send an edit, so
    // double-click keeps its normal meaning (the presenter page passes none).
    if (!onTextReplacement) return;
    const finishEditing = (commit: boolean) => {
      const editing = editingRef.current;
      if (!editing) return;
      editingRef.current = null;
      editing.editor.remove();
      const replacementText = editing.replacement.trim();
      if (commit && replacementText && replacementText !== editing.original) {
        onTextReplacement(editing.original, replacementText, editing.context, editing.position);
      }
    };

    const handleDoubleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || editingRef.current) return;
      const element = getSlideTextTarget(event.target);
      if (!element) return;
      const slide = element.closest('.slide--active');
      if (!(slide instanceof HTMLElement)) return;
      event.preventDefault();
      const original = getEditableText(element);
      const editor = createTextEditor(element, slide, original);
      editingRef.current = {
        editor,
        original,
        replacement: original,
        position: { x: event.clientX, y: event.clientY },
        context: getElementTextContext(slide, element),
      };
      editor.addEventListener('input', () => {
        if (editingRef.current?.editor === editor) {
          editingRef.current.replacement = editor.value;
        }
      });
      editor.focus();
      editor.select();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!editingRef.current) return;
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        finishEditing(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finishEditing(false);
      }
    };

    const handleBlur = (event: FocusEvent) => {
      if (event.target === editingRef.current?.editor) finishEditing(true);
    };
    window.addEventListener('dblclick', handleDoubleClick, true);
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusout', handleBlur, true);
    return () => {
      finishEditing(false);
      window.removeEventListener('dblclick', handleDoubleClick, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusout', handleBlur, true);
    };
  }, [onTextReplacement]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (skipClickRef.current) {
        skipClickRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // If the CommentPopup was just dismissed by this same click, skip
      // annotation for this event but do NOT swallow it — let it propagate
      // to whatever the user was actually clicking on.
      if (lastPopupDismissRef && Date.now() - lastPopupDismissRef.current < 100) return;

      const state = stateRef.current;

      // This hook only handles the multi-select annotation path
      if (!isMultiSelectMode || !state.isInspecting) return;

      e.preventDefault();
      e.stopPropagation();

      const element = getInspectorTarget(state, e.clientX, e.clientY);
      if (!element) return;

      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim()) {
        // Text selection path
        const selectedText = selection.toString().trim();
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const fullText = container.textContent || '';

        // Compute the character offset of the selection start within the
        // container's full text using a TreeWalker, so that duplicate
        // occurrences of the selected text don't cause the wrong context to
        // be captured.
        let selStart = 0;
        if (container.nodeType === Node.TEXT_NODE) {
          // The start container IS the text node — startOffset is the char index.
          selStart = range.startOffset;
        } else {
          // Walk all text nodes inside the container that come before the
          // range's start node, accumulating their lengths.
          const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
          let offset = 0;
          while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node === range.startContainer) {
              offset += range.startOffset;
              break;
            }
            offset += (node.textContent || '').length;
          }
          selStart = offset;
        }

        const before = fullText.substring(Math.max(0, selStart - 100), selStart);
        const after = fullText.substring(
          selStart + selectedText.length,
          selStart + selectedText.length + 100,
        );

        if (onAnnotateText) {
          const anchorElement = container instanceof HTMLElement ? container : container.parentElement;
          onAnnotateText(selectedText, {
            before,
            after,
            fullText,
            rangeStart: selStart,
            rangeEnd: selStart + selectedText.length,
            selector: anchorElement ? getStableElementSelector(anchorElement) : undefined,
          }, { x: e.clientX, y: e.clientY }, getAppUiContext(element));
        }
      } else {
        // Element click path
        const info = getElementInfo(element);
        if (onAnnotate) {
          onAnnotate(info, { x: e.clientX, y: e.clientY });
        }
      }

      // Tear down inspector state so the comment popup can appear
      state.isInspecting = false;
      document.body.style.cursor = '';
      if (state.overlay) {
        state.overlay.remove();
        state.overlay = null;
      }
      if (state.tooltip) {
        state.tooltip.remove();
        state.tooltip = null;
      }
    };

    window.addEventListener('click', handleClick, true);
    return () => window.removeEventListener('click', handleClick, true);
  }, [stateRef, isMultiSelectMode, onAnnotate, onAnnotateText, lastPopupDismissRef]);

  useEffect(() => {
    const handleMouseUp = (event: MouseEvent) => {
      if (!event.altKey || !onAnnotateText) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      const anchor = selection.anchorNode instanceof Element
        ? selection.anchorNode
        : selection.anchorNode?.parentElement;
      const slide = anchor?.closest('.slide--active');
      if (!(slide instanceof HTMLElement)) return;
      const text = selection.toString().trim();
      if (!text) return;
      const context = getSelectionContext(slide, range);
      onAnnotateText(text, context, { x: event.clientX, y: event.clientY });
      skipClickRef.current = true;
      window.setTimeout(() => { skipClickRef.current = false; }, 500);
    };

    window.addEventListener('mouseup', handleMouseUp, true);
    return () => window.removeEventListener('mouseup', handleMouseUp, true);
  }, [onAnnotateText]);
}
