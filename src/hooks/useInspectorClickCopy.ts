import { useEffect } from 'react';
import type { SlideData } from '../types/slide.types';
import { getElementInfo } from '../utils/elementInfo';
import { formatInspectorClipboard } from '../utils/inspectorClipboard';
import { getInspectorTarget, type InspectorRefs } from './useInspectorOverlay';

interface UseInspectorClickCopyOptions {
  stateRef: React.MutableRefObject<InspectorRefs>;
  currentSlide: number;
  totalSlides: number;
  aspectRatio: '16:9' | '9:16';
  slides: SlideData[];
  isMultiSelectMode?: boolean;
}

/**
 * Handles clicks in inspector mode (when NOT in multi-select mode).
 * Formats element info and copies it to the clipboard.
 */
export function useInspectorClickCopy({
  stateRef,
  currentSlide,
  totalSlides,
  aspectRatio,
  slides,
  isMultiSelectMode,
}: UseInspectorClickCopyOptions): void {
  useEffect(() => {
    const handleClick = async (e: MouseEvent) => {
      const { isInspecting, tooltip } = stateRef.current;

      // This hook only handles the copy-to-clipboard path
      if (isMultiSelectMode || !isInspecting) return;

      const selection = window.getSelection();
      if (e.altKey && selection && !selection.isCollapsed && selection.toString().trim()) return;

      e.preventDefault();
      e.stopPropagation();

      const element = getInspectorTarget(stateRef.current, e.clientX, e.clientY);
      if (!element) return;

      const info = getElementInfo(element);
      const copyText = formatInspectorClipboard(info, {
        currentSlide,
        totalSlides,
        aspectRatio,
        slides,
      });

      try {
        await navigator.clipboard.writeText(copyText);

        if (tooltip) {
          const originalText = tooltip.textContent;
          tooltip.textContent = '✓ Copied to clipboard!';
          tooltip.style.background = '#22c55e';

          setTimeout(() => {
            if (tooltip) {
              tooltip.textContent = originalText;
              tooltip.style.background = '#1a1a1a';
            }
          }, 1000);
        }
      } catch (err) {
        console.error('Failed to copy:', err);
        if (tooltip) {
          tooltip.textContent = '✗ Failed to copy';
          tooltip.style.background = '#ef4444';

          setTimeout(() => {
            if (tooltip) {
              tooltip.style.background = '#1a1a1a';
            }
          }, 1000);
        }
      }
    };

    window.addEventListener('click', handleClick, true);
    return () => window.removeEventListener('click', handleClick, true);
  }, [stateRef, currentSlide, totalSlides, aspectRatio, slides, isMultiSelectMode]);
}
