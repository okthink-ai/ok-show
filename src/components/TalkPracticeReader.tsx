import DebugProfiler from '../debug/DebugProfiler';
import { performanceRecorder } from '../debug/performance';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import PracticeAnnotations from './PracticeAnnotations';
import PracticeAnnotationPins from './PracticeAnnotationPins';
import type { CSSProperties, RefObject } from 'react';
import { useAppSelector } from '../store/hooks';
import MaterialIcon from './MaterialIcon';
import { cueAtReadingLine, resolveSlideCue } from '../practice/slideCues';
import { getManuscript } from '../practice/manuscriptRegistry';
import type { PracticePosition } from '../practice/slideCues';
import type { SlideData } from '../types/slide.types';
import './TalkPracticeReader.css';
import { attachSentenceNavigation } from '../practice/sentenceNavigation';

const EMPTY_MANUSCRIPT = { html: '', source: '' };

// Static sanitized HTML is compiled by Vite, not parsed or reconciled on the phone.
const Manuscript = memo(function Manuscript({ html }: { html: string }) {
  return <div className="talk-practice__content" dangerouslySetInnerHTML={{ __html: html }} />;
});

interface TalkPracticeReaderProps {
  presentationId: string;
  slides: SlideData[];
  currentSlide: number;
  canNavigate: boolean;
  onSlideChange: (index: number) => void;
  position: RefObject<PracticePosition>;
  onOpenAnnotations?: () => void;
  /** Live delivery hides the review tools so only reading and slide control remain. */
  presenting?: boolean;
}

export default function TalkPracticeReader({ presentationId, slides, currentSlide, canNavigate, onSlideChange, position, onOpenAnnotations, presenting = false }: TalkPracticeReaderProps) {
  const textSize = useAppSelector((state) => state.ui.practiceTextSize);
  const manuscript = getManuscript(presentationId) ?? EMPTY_MANUSCRIPT;
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const annotationOpen = useRef(false);
  const annotateButtonRef = useRef<HTMLButtonElement>(null);
  const onAnnotationOpenChange = useCallback((open: boolean) => {
    if (annotationOpen.current && !open) viewportRef.current?.focus({ preventScroll: true });
    annotationOpen.current = open;
  }, []);
  const readerNavigationRef = useRef<number | null>(null);
  const alignReaderRef = useRef<(slide: number) => void>(() => {});
  const topRef = useRef<() => void>(() => {});
  const selectedCueRef = useRef<number | null>(null);
  const [following, setFollowing] = useState(() => position.current.following);
  const latest = useRef({ currentSlide, canNavigate, onSlideChange, following });
  useEffect(() => { latest.current = { currentSlide, canNavigate, onSlideChange, following }; });

  const navigate = useCallback((index: number) => {
    const state = latest.current;
    if (!annotationOpen.current && state.canNavigate && index !== state.currentSlide) {
      readerNavigationRef.current = index;
      state.onSlideChange(index);
    }
  }, []);

  const selectCue = useCallback((element: HTMLButtonElement, index: number) => {
    const viewport = viewportRef.current;
    const cues = Array.from(contentRef.current?.querySelectorAll<HTMLElement>('[data-practice-cue]') ?? []);
    if (!viewport) return;
    selectedCueRef.current = cues.indexOf(element);
    const bounds = element.getBoundingClientRect();
    viewport.scrollTop += bounds.top + bounds.height / 2 - viewport.getBoundingClientRect().top - viewport.clientHeight / 2;
    navigate(index);
  }, [navigate]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const ids = slides.map((slide) => slide.id);
    content.querySelectorAll<HTMLElement>('a, [data-practice-href]').forEach((link) => {
      const href = link.dataset.practiceHref ?? link.getAttribute('href') ?? '';
      const index = resolveSlideCue(href, presentationId, slides.length, ids);
      if (index !== null) {
        const button = window.document.createElement('button');
        button.type = 'button';
        button.className = 'talk-practice__cue';
        button.dataset.practiceCue = String(index);
        button.dataset.practiceHref = href;
        button.setAttribute('aria-disabled', String(!latest.current.canNavigate));
        if (href.includes('slideId=')) button.textContent = `Slide ${index + 1} — ${slides[index].title ?? slides[index].id}`;
        else button.append(...Array.from(link.childNodes));
        link.replaceWith(button);
      } else if (href.includes('presentation=') && (href.includes('slide=') || href.includes('slideId='))) {
        const unavailable = window.document.createElement('span');
        unavailable.className = 'talk-practice__missing-cue';
        unavailable.dataset.practiceHref = href;
        unavailable.textContent = `${link.textContent?.replace(/ \(unavailable\)$/, '')} (unavailable)`;
        link.replaceWith(unavailable);
      }
    });
    const click = (event: MouseEvent) => {
      const cue = (event.target as Element).closest<HTMLButtonElement>('[data-practice-cue]');
      if (cue) selectCue(cue, Number(cue.dataset.practiceCue));
    };
    content.addEventListener('click', click);
    return () => content.removeEventListener('click', click);
  }, [presentationId, selectCue, slides]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    return attachSentenceNavigation(viewport, content, () => annotateButtonRef.current?.click());
  }, [presentationId, slides]);

  useEffect(() => {
    contentRef.current?.querySelectorAll('[data-practice-cue]').forEach((cue) => cue.setAttribute('aria-disabled', String(!canNavigate)));
  }, [canNavigate]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const savedPosition = position.current;
    let frame = 0;
    let scrollPending = false;
    let blocks: Array<{ element: HTMLElement; top: number; bottom: number }> = [];
    let cues: HTMLElement[] = [];
    let centers: number[] = [];
    let paintedCue = -1;
    let paintedHeight = 0;
    let layoutWidth = 0;
    let layoutHeight = 0;
    let contentHeight = 0;

    const measure = (allowNavigation: boolean) => performanceRecorder.measure('practice.measure', () => {
      // Scroll frames can arrive before ResizeObserver delivers its new geometry.
      if (viewport.clientWidth !== layoutWidth || viewport.clientHeight !== layoutHeight || content.clientHeight !== contentHeight) cacheLayout();
      const bounds = viewport.getBoundingClientRect();
      const middle = bounds.top + viewport.clientHeight / 2;
      const line = viewport.scrollTop + viewport.clientHeight / 2;
      const previous = selectedCueRef.current;
      const selected = cueAtReadingLine(centers, line, previous);
      selectedCueRef.current = selected;
      // A resize may already have highlighted this cue before the scroll event arrives.
      // Compare against the presentation in navigate(), not the previous visual highlight.
      if (allowNavigation && latest.current.following) {
        navigate(selected >= 0 ? Number(cues[selected].dataset.practiceCue) : 0);
      }
      savedPosition.scrollTop = viewport.scrollTop;

      // Find the paragraph nearest the guide, then its actual wrapped text line.
      const block = blocks.reduce<typeof blocks[number] | null>((closest, candidate) => {
        const distance = Math.max(candidate.top - line, line - candidate.bottom, 0);
        const closestDistance = closest ? Math.max(closest.top - line, line - closest.bottom, 0) : Infinity;
        return distance < closestDistance || (distance === closestDistance && candidate.bottom - candidate.top < (closest ? closest.bottom - closest.top : Infinity)) ? candidate : closest;
      }, null);
      viewport.dataset.sourceLine = block?.element.dataset.sourceLine ?? '1';
      viewport.dataset.sourceEndLine = block?.element.dataset.sourceEndLine ?? '1';
      viewport.dataset.readingText = block?.element.textContent?.trim().slice(0, 500) ?? '';
      let nearest: DOMRect | null = null;
      if (block) {
        const walker = window.document.createTreeWalker(block.element, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (!node.textContent?.trim()) continue;
          const range = window.document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (rect.height && (!nearest || Math.abs(rect.top + rect.height / 2 - middle) < Math.abs(nearest.top + nearest.height / 2 - middle))) nearest = rect;
          }
        }
      }
      const next = nearest && nearest.bottom > bounds.top && nearest.top < bounds.bottom
        ? { top: nearest.top - bounds.top, height: nearest.height } : null;
      // All geometry reads above precede writes. Only the two changed cues mutate.
      if (selected !== paintedCue) {
        for (const index of [paintedCue, selected]) if (cues[index]) {
          cues[index].dataset.active = String(index === selected);
          cues[index].setAttribute('aria-current', index === selected ? 'step' : 'false');
        }
        paintedCue = selected;
      }
      const overlay = highlightRef.current;
      if (overlay) {
        overlay.hidden = !next;
        if (next) {
          overlay.style.transform = `translateY(${next.top}px)`;
          if (next.height !== paintedHeight) { overlay.style.height = `${next.height}px`; paintedHeight = next.height; }
        }
      }
    });
    const cacheLayout = () => performanceRecorder.measure('practice.layout', () => {
      layoutWidth = viewport.clientWidth;
      layoutHeight = viewport.clientHeight;
      contentHeight = content.clientHeight;
      const origin = viewport.getBoundingClientRect().top - viewport.scrollTop;
      blocks = Array.from(content.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6,li,pre,tr')).map((element) => {
        const rect = element.getBoundingClientRect();
        return { element, top: rect.top - origin, bottom: rect.bottom - origin };
      });
      cues = Array.from(content.querySelectorAll<HTMLElement>('[data-practice-cue]'));
      centers = cues.map((cue) => {
        const rect = cue.getBoundingClientRect();
        return rect.top + rect.height / 2 - origin;
      });
    });
    const scroll = () => {
      scrollPending = true;
      savedPosition.scrollTop = viewport.scrollTop;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measure(true);
        scrollPending = false;
      });
    };
    cacheLayout();
    cues.forEach((cue) => { cue.dataset.active = 'false'; cue.setAttribute('aria-current', 'false'); });
    viewport.scrollTop = savedPosition.scrollTop;
    selectedCueRef.current = null;
    measure(false);

    const alignReader = (slide: number) => {
      const line = viewport.scrollTop + viewport.clientHeight / 2;
      const selected = cueAtReadingLine(centers, line, null);
      // Keep the exact reading position if it already belongs to this slide.
      if ((selected < 0 ? 0 : Number(cues[selected].dataset.practiceCue)) === slide) return;
      const candidates = cues.flatMap((cue, index) => Number(cue.dataset.practiceCue) === slide ? [index] : []);
      const target = candidates.reduce((nearest, index) => Math.abs(centers[index] - line) < Math.abs(centers[nearest] - line) ? index : nearest, candidates[0]);
      if (target === undefined) return;
      cancelAnimationFrame(frame);
      scrollPending = false;
      // Put the cue just past the guide's hysteresis, without publishing a navigation.
      viewport.scrollTop = Math.max(0, centers[target] - viewport.clientHeight / 2 + 12);
      selectedCueRef.current = target;
      measure(false);
    };
    alignReaderRef.current = alignReader;
    topRef.current = () => {
      cancelAnimationFrame(frame);
      scrollPending = false;
      viewport.scrollTop = 0;
      selectedCueRef.current = null;
      measure(false);
      if (latest.current.following) navigate(0);
    };
    if (latest.current.following) alignReader(latest.current.currentSlide);
    const observer = new ResizeObserver(() => {
      // A scrollTop assignment can precede delivery of its scroll event.
      const pendingScroll = scrollPending || Math.abs(viewport.scrollTop - savedPosition.scrollTop) > 1;
      cacheLayout();
      if (pendingScroll) return;
      // Reflow follows the slide rather than publishing a different slide.
      if (latest.current.following && readerNavigationRef.current === null) alignReader(latest.current.currentSlide);
      selectedCueRef.current = null;
      measure(false);
    });
    observer.observe(viewport);
    observer.observe(content);
    viewport.addEventListener('scroll', scroll, { passive: true });
    return () => {
      alignReaderRef.current = () => {};
      topRef.current = () => {};
      cancelAnimationFrame(frame);
      observer.disconnect();
      viewport.removeEventListener('scroll', scroll);
    };
  }, [navigate, position, presentationId, slides]);

  useEffect(() => {
    // A reading-driven change is an echo: do not pull the reader back to its cue.
    if (readerNavigationRef.current === currentSlide) {
      readerNavigationRef.current = null;
      return;
    }
    readerNavigationRef.current = null;
    if (latest.current.following) alignReaderRef.current(currentSlide);
  }, [currentSlide]);

  const toggleFollowing = () => {
    const enabled = !following;
    setFollowing(enabled);
    position.current.following = enabled;
    latest.current.following = enabled;
    if (enabled) {
      const cue = contentRef.current?.querySelector<HTMLElement>('[data-active="true"]');
      navigate(cue ? Number(cue.dataset.practiceCue) : 0);
    }
  };

  return (
    <section className="talk-practice" aria-label="Talk practice" style={{ '--practice-text-size': `${textSize}px` } as CSSProperties}>
      <div className="talk-practice__toolbar">
        {!canNavigate && <span className="talk-practice__connection">Slide control is disconnected</span>}
        <button type="button" className="talk-practice__follow" aria-label="Follow reading" aria-pressed={following} title={following ? 'Reading controls slides. Tap to pause.' : 'Reading freely. Tap to sync slides.'} onClick={toggleFollowing}>
          <span aria-hidden="true"><MaterialIcon name={following ? 'sync' : 'sync_disabled'} size="small" /></span>
        </button>
        <button type="button" className="talk-practice__top" aria-label="Scroll to top" title="Back to the beginning" onClick={() => topRef.current()}><span aria-hidden="true"><MaterialIcon name="vertical_align_top" size="small" /></span></button>
        {!presenting && slides[currentSlide] && <DebugProfiler id="PracticeAnnotations"><PracticeAnnotations presentationId={presentationId} totalSlides={slides.length} slide={slides[currentSlide]} slideIndex={currentSlide}
          onOpenChange={onAnnotationOpenChange} passageButtonRef={annotateButtonRef}
          capturePassage={() => {
            const selection = window.getSelection();
            const range = selection?.toString().trim() && selection.rangeCount ? selection.getRangeAt(0) : null;
            const selectedBlock = range?.startContainer.parentElement?.closest<HTMLElement>('[data-source-line]');
            const endBlock = range?.endContainer.parentElement?.closest<HTMLElement>('[data-source-line]');
            const sourceBlock = selectedBlock && contentRef.current?.contains(selectedBlock) ? selectedBlock : viewportRef.current;
            const sourceLine = Number(sourceBlock?.dataset.sourceLine) || 1;
            const sourceEndLine = Number(endBlock && contentRef.current?.contains(endBlock) ? endBlock.dataset.sourceEndLine : sourceBlock?.dataset.sourceEndLine) || sourceLine;
            return { sourceLine, sourceEndLine, preview: viewportRef.current?.dataset.readingText ?? '', text: manuscript.source.split('\n').slice(sourceLine - 1, sourceEndLine).join('\n') };
          }} /></DebugProfiler>}
      </div>
      <div className="talk-practice__reading-area">
        <div ref={viewportRef} className="talk-practice__viewport" tabIndex={0} aria-label="Talk manuscript" aria-keyshortcuts="j k Shift+j Shift+k x" title="J/K: next/previous sentence · Shift+J/K: extend selection · X: annotate · Esc: clear selection">
          <div ref={contentRef} className="talk-practice__document">
            <DebugProfiler id="Manuscript"><Manuscript html={manuscript.html} /></DebugProfiler>
            {!presenting && <PracticeAnnotationPins onOpenAnnotations={onOpenAnnotations} presentationId={presentationId} source={manuscript.source} contentRef={contentRef} />}
          </div>
        </div>
        <div ref={highlightRef} hidden className="talk-practice__highlight" data-testid="practice-reading-highlight" aria-hidden="true" />
        <div className="talk-practice__guide" aria-hidden="true" />
      </div>
    </section>
  );
}
