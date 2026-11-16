import { useState, useEffect, useRef } from 'react';

/**
 * Observes the active slide element (.slide--active) with a single ResizeObserver
 * and a single pair of scroll/resize event listeners.
 *
 * Returns the current DOMRect of the active slide so that multiple AnnotationBadge
 * components can share one observation loop instead of each creating their own.
 */
export function useSlideRect(slideId: string): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const measure = () => {
      const slideEl = document.querySelector('.slide--active') as HTMLElement | null;
      if (slideEl) {
        setRect(slideEl.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };

    measure();

    const slideEl = document.querySelector('.slide--active') as HTMLElement | null;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    if (slideEl) {
      observerRef.current = new ResizeObserver(measure);
      observerRef.current.observe(slideEl);
    }

    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure, { passive: true });

    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [slideId]);

  return rect;
}
