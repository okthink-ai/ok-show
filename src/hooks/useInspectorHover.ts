import { useEffect } from 'react';
import { getElementInfo } from '../utils/elementInfo';
import type { InspectorRefs } from './useInspectorOverlay';

/**
 * Walk up from `element` by `depth` levels, stopping at the document root.
 * Returns the element reached and the number of steps actually taken, so the
 * caller can clamp its stored depth instead of counting past the root.
 */
function walkUp(element: HTMLElement, depth: number): { element: HTMLElement; depth: number } {
  let current = element;
  let taken = 0;
  while (taken < depth) {
    const parent = current.parentElement;
    if (!parent || parent === document.documentElement) break;
    current = parent;
    taken += 1;
  }
  return { element: current, depth: taken };
}

/**
 * Tracks mouse movement and updates the inspector overlay position and
 * tooltip text while inspector mode is active.
 *
 * While Alt is held, ArrowUp and ArrowDown walk the DOM hierarchy above the
 * element under the cursor. The target is always re-derived from the last
 * cursor position, so ArrowDown simply un-walks the same ancestor chain and
 * any real mouse movement snaps the selection back to the cursor.
 */
export function useInspectorHover(
  stateRef: React.MutableRefObject<InspectorRefs>,
): void {
  useEffect(() => {
    // Renders the overlay box and tooltip text for one element. getElementInfo
    // triggers getComputedStyle and layout reads (scrollWidth, clientWidth,
    // etc.) which cause style recalculation, so callers skip it when the
    // element is unchanged rather than running it at mousemove frequency.
    const render = (element: HTMLElement) => {
      const { overlay, tooltip } = stateRef.current;
      if (!overlay || !tooltip) return;

      stateRef.current.hoveredElement = element;

      const info = getElementInfo(element);
      const rect = element.getBoundingClientRect();

      // Build overflow warning
      let overflowWarning = '';
      if (info.overflow.isOverflowingX || info.overflow.isOverflowingY) {
        const axes: string[] = [];
        if (info.overflow.isOverflowingX) axes.push('X');
        if (info.overflow.isOverflowingY) axes.push('Y');
        overflowWarning = `\n⚠️ OVERFLOW (${axes.join(', ')})`;
      }

      const depth = stateRef.current.ancestorDepth;
      const depthLine = depth > 0 ? `\n↑ ${depth} level${depth === 1 ? '' : 's'} up` : '';

      // Build tooltip text
      const s = info.styles;
      const tooltipText = `${info.componentName}${overflowWarning}${depthLine}
<${info.tagName}${info.id}>
${s?.display} | ${s?.width} × ${s?.height}
flex: ${s?.flexGrow} ${s?.flexShrink} ${s?.flexBasis}
min: ${s?.minWidth} × ${s?.minHeight}

Alt+↑/↓ to change level · Click to copy`;

      // Position overlay to match the highlighted element
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;

      tooltip.textContent = tooltipText;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const state = stateRef.current;

      // Recorded even outside inspector mode so Alt+arrow works immediately,
      // before the user has moved the mouse again.
      state.mousePosition = { x: e.clientX, y: e.clientY };

      const { isInspecting, overlay, tooltip } = state;
      if (!isInspecting || !overlay || !tooltip) return;

      const element = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
      if (!element) return;

      // Real cursor movement always re-anchors to the deepest element, so the
      // highlight cannot drift away from what the user is pointing at.
      const depthChanged = state.ancestorDepth !== 0;
      state.ancestorDepth = 0;

      if (element !== state.hoveredElement || depthChanged) render(element);

      // Always update tooltip position to follow the cursor smoothly
      tooltip.style.left = `${e.clientX + 15}px`;
      tooltip.style.top = `${e.clientY + 15}px`;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const state = stateRef.current;
      if (!state.isInspecting || !state.overlay || !state.tooltip) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

      // Never steal arrow keys from an active inline editor or form field.
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '')) return;

      const { x, y } = state.mousePosition;
      const deepest = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!deepest) return;

      e.preventDefault();
      e.stopPropagation();

      const requested = e.key === 'ArrowUp'
        ? state.ancestorDepth + 1
        : Math.max(0, state.ancestorDepth - 1);

      const { element, depth } = walkUp(deepest, requested);
      if (depth === state.ancestorDepth && element === state.hoveredElement) return;

      state.ancestorDepth = depth;
      render(element);
    };

    // Pressing Alt creates a fresh, empty overlay (useInspectorOverlay registers
    // its keydown listener first, so the overlay exists by the time this runs).
    // Draw the element under the last known cursor position right away so a
    // release and re-press over the same element does not leave it blank.
    const handleAltDown = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      const state = stateRef.current;
      const { isInspecting, overlay, tooltip, hoveredElement } = state;
      if (!isInspecting || !overlay || !tooltip || hoveredElement) return;
      const { x, y } = state.mousePosition;
      const element = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!element) return;
      render(element);
      tooltip.style.left = `${x + 15}px`;
      tooltip.style.top = `${y + 15}px`;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keydown', handleAltDown);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keydown', handleAltDown);
    };
  }, [stateRef]);
}
