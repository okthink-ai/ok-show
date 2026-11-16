import { useEffect, useRef } from 'react';
import { topLayerHost } from '../utils/topLayerHost';

export interface InspectorRefs {
  isInspecting: boolean;
  overlay: HTMLElement | null;
  tooltip: HTMLElement | null;
  /** How many levels above the element under the cursor the user has walked
   *  with Alt+ArrowUp. Reset to 0 by any real mouse movement. */
  ancestorDepth: number;
  /** Last cursor position, used to re-derive the target on a keyboard step. */
  mousePosition: { x: number; y: number };
  /** The element the overlay currently highlights. */
  hoveredElement: HTMLElement | null;
}

/**
 * The element an inspector click should act on: the keyboard-selected ancestor
 * when the user has walked up the tree, otherwise whatever is under the cursor.
 */
export function getInspectorTarget(state: InspectorRefs, x: number, y: number): HTMLElement | null {
  if (state.ancestorDepth > 0 && state.hoveredElement) return state.hoveredElement;
  return document.elementFromPoint(x, y) as HTMLElement | null;
}

/**
 * Manages Alt key detection and the inspector overlay/tooltip DOM elements.
 *
 * Returns a ref object whose `.current` reflects live inspector state so other
 * hooks can read it without causing re-renders.
 */
export function useInspectorOverlay(
  onToggleMultiSelect?: () => void,
): React.MutableRefObject<InspectorRefs> {
  const stateRef = useRef<InspectorRefs>({
    isInspecting: false,
    overlay: null,
    tooltip: null,
    ancestorDepth: 0,
    mousePosition: { x: 0, y: 0 },
    hoveredElement: null,
  });

  useEffect(() => {
    const state = stateRef.current;

    const showOverlay = () => {
      state.isInspecting = true;
      state.ancestorDepth = 0;
      state.hoveredElement = null;
      document.body.style.cursor = 'crosshair';
      document.body.classList.add('is-inspecting-slide');

      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.border = '2px solid #4a9eff';
      overlay.style.backgroundColor = 'rgba(74, 158, 255, 0.1)';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '9999';
      overlay.style.transition = 'all 0.1s ease';
      const host = topLayerHost();
      host.appendChild(overlay);
      state.overlay = overlay;

      const tooltip = document.createElement('div');
      tooltip.style.position = 'fixed';
      tooltip.style.background = '#1a1a1a';
      tooltip.style.color = '#fff';
      tooltip.style.padding = '8px 12px';
      tooltip.style.borderRadius = '6px';
      tooltip.style.fontSize = '12px';
      tooltip.style.fontFamily = 'Monaco, monospace';
      tooltip.style.pointerEvents = 'none';
      tooltip.style.zIndex = '10000';
      tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
      tooltip.style.border = '1px solid #333';
      tooltip.style.whiteSpace = 'pre-line';
      host.appendChild(tooltip);
      state.tooltip = tooltip;
    };

    const hideOverlay = () => {
      state.isInspecting = false;
      state.ancestorDepth = 0;
      state.hoveredElement = null;
      document.body.style.cursor = '';
      document.body.classList.remove('is-inspecting-slide');

      if (state.overlay) {
        state.overlay.remove();
        state.overlay = null;
      }
      if (state.tooltip) {
        state.tooltip.remove();
        state.tooltip = null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyC') {
        e.preventDefault();
        if (onToggleMultiSelect) onToggleMultiSelect();
        return;
      }

      if (e.key === 'Alt' && !state.isInspecting) {
        showOverlay();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && state.isInspecting) {
        hideOverlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      hideOverlay();
    };
  }, [onToggleMultiSelect]);

  return stateRef;
}
