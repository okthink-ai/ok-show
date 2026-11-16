import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

interface UseFollowScrollOptions {
  currentSlide: number;
  /** True while the scrollable slide list is rendered and should follow the deck. */
  enabled: boolean;
  /** Changing this (for example, the list's view mode) re-scrolls to the current card. */
  viewKey: string;
  /** Changing this (for example, the presentation id) turns following back on. */
  resetKey: string;
  /** Called with the card index nearest the top after the user scrolls the list. */
  onSlideChange: (index: number) => void;
}

export interface FollowScroll {
  listRef: RefObject<HTMLDivElement | null>;
  /** Ref callback for the card that represents `index`. */
  registerCard: (index: number, element: HTMLElement | null) => void;
  following: boolean;
  pauseFollowing: () => void;
  resumeFollowing: () => void;
}

/**
 * Keeps a scrollable list of per-slide cards in step with the deck.
 *
 * While following, the current slide's card scrolls into view. Explicit user
 * input pauses following (call `pauseFollowing` from wheel, touch, and pointer
 * handlers), after which scrolling the list navigates the deck to the card
 * nearest the top. The effects depend on `enabled`, `viewKey`, and
 * `currentSlide`, never on `onSlideChange` identity.
 */
export function useFollowScroll({
  currentSlide,
  enabled,
  viewKey,
  resetKey,
  onSlideChange,
}: UseFollowScrollOptions): FollowScroll {
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<number, HTMLElement>());
  const [following, setFollowing] = useState(true);
  const followingRef = useRef(true);
  const currentSlideRef = useRef(currentSlide);
  const onSlideChangeRef = useRef(onSlideChange);

  useEffect(() => {
    onSlideChangeRef.current = onSlideChange;
  }, [onSlideChange]);

  useEffect(() => {
    currentSlideRef.current = currentSlide;
  }, [currentSlide]);

  useEffect(() => {
    followingRef.current = true;
    setFollowing(true);
  }, [resetKey]);

  useEffect(() => {
    if (!following || !enabled) return;
    cardRefs.current.get(currentSlide)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [currentSlide, following, enabled, viewKey]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !enabled) return;
    let frame = 0;
    const handleScroll = () => {
      // Smooth scrolling caused by follow mode must never become a new slide
      // navigation source. Explicit wheel/touch/pointer input pauses follow
      // before its resulting scroll event reaches this handler.
      if (followingRef.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (followingRef.current) return;
        const listTop = list.getBoundingClientRect().top;
        let closestIndex = currentSlideRef.current;
        let closestDistance = Number.POSITIVE_INFINITY;
        for (const [index, card] of cardRefs.current) {
          const distance = Math.abs(card.getBoundingClientRect().top - listTop - 8);
          if (distance < closestDistance) {
            closestIndex = index;
            closestDistance = distance;
          }
        }
        if (closestIndex !== currentSlideRef.current) onSlideChangeRef.current(closestIndex);
      });
    };
    list.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      list.removeEventListener('scroll', handleScroll);
    };
  }, [enabled]);

  const registerCard = useCallback((index: number, element: HTMLElement | null) => {
    if (element) cardRefs.current.set(index, element);
    else cardRefs.current.delete(index);
  }, []);

  const pauseFollowing = useCallback(() => {
    if (followingRef.current) {
      followingRef.current = false;
      setFollowing(false);
    }
  }, []);

  const resumeFollowing = useCallback(() => {
    followingRef.current = true;
    setFollowing(true);
    cardRefs.current.get(currentSlideRef.current)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  return { listRef, registerCard, following, pauseFollowing, resumeFollowing };
}
