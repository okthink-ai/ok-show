import { useEffect, useRef } from 'react';
import type { SlideData } from '../types/slide.types';
import type { TweakTarget } from '../types/styleTweak.types';
import {
  TWEAK_HOVER_ATTR,
  TWEAK_LAYER_ID,
  elementPath,
  hierarchy,
  readStyleValues,
  roleSelector,
  textElementAt,
} from '../utils/styleTweaks';

interface UseStyleTweakPickerOptions {
  active: boolean;
  presentationId: string;
  slides: SlideData[];
  onPick: (target: TweakTarget) => void;
  onExit: () => void;
}

function slideContentOf(element: Element): { slide: HTMLElement; content: HTMLElement } | null {
  const slide = element.closest<HTMLElement>('.slide--active[data-slide-key]');
  const content = slide?.querySelector<HTMLElement>(':scope > .slide__content');
  return slide && content && content.contains(element) ? { slide, content } : null;
}

/** Read computed values with the preview layer off, so a target's original is the source's. */
function readOriginal(element: HTMLElement) {
  const layer = document.getElementById(TWEAK_LAYER_ID) as HTMLStyleElement | null;
  if (layer?.sheet) layer.sheet.disabled = true;
  try {
    return readStyleValues(window.getComputedStyle(element));
  } finally {
    if (layer?.sheet) layer.sheet.disabled = false;
  }
}

/**
 * While active, hovering slide text outlines it and clicking selects it. Clicks on
 * the slide are captured before the slide container sees them, so picking text does
 * not advance the deck. Escape leaves the mode.
 */
export function useStyleTweakPicker({ active, presentationId, slides, onPick, onExit }: UseStyleTweakPickerOptions): void {
  const latest = useRef({ presentationId, slides, onPick, onExit });
  useEffect(() => {
    latest.current = { presentationId, slides, onPick, onExit };
  });

  useEffect(() => {
    if (!active) return;
    let hovered: HTMLElement | null = null;

    const setHovered = (next: HTMLElement | null) => {
      if (next === hovered) return;
      hovered?.removeAttribute(TWEAK_HOVER_ATTR);
      hovered = next;
      hovered?.setAttribute(TWEAK_HOVER_ATTR, '');
    };

    const pickable = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const region = slideContentOf(target);
      if (!region) return null;
      const element = textElementAt(target, region.content);
      return element ? { ...region, element } : null;
    };

    const onPointerMove = (event: PointerEvent) => setHovered(pickable(event.target)?.element ?? null);

    const swallow = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !slideContentOf(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !slideContentOf(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      const picked = pickable(event.target);
      if (!picked) return;
      const { slide, content, element } = picked;
      const { presentationId: deck, slides: deckSlides, onPick: pick } = latest.current;
      const slideId = slide.dataset.slideKey ?? '';
      const slideIndex = deckSlides.findIndex((candidate) => candidate.id === slideId);
      const slideData = deckSlides[slideIndex];
      pick({
        presentationId: deck,
        slideId,
        slideIndex: Math.max(0, slideIndex),
        slideTitle: slideData?.title ?? slideId,
        slideTemplate: slideData?.template ?? 'Unknown',
        elementPath: elementPath(element, content),
        roleSelector: roleSelector(element, content),
        hierarchy: hierarchy(element, content),
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className.trim() : '',
        text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 240),
        original: readOriginal(element),
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latest.current.onExit();
    };

    document.body.classList.add('is-style-tweaking');
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('dblclick', swallow, true);
    window.addEventListener('mousedown', swallow, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      setHovered(null);
      document.body.classList.remove('is-style-tweaking');
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('dblclick', swallow, true);
      window.removeEventListener('mousedown', swallow, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [active]);
}
