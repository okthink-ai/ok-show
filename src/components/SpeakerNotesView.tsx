import { memo, useMemo, cloneElement, isValidElement, useEffect, useRef, useState } from 'react';
import { hasManuscript } from '../practice/manuscriptRegistry';
import type { CSSProperties, PointerEvent, ReactElement } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { READING_SIZE_MAX, READING_SIZE_MIN, READING_SIZE_STEP, TALK_MINUTES_MAX, TALK_MINUTES_MIN, setPracticeTextSize, setPresenterPresenting, setPresenterReadingMode, setPresenterShowNext, setPresenterTalkMinutes, startPresenterTimerIfIdle } from '../store/uiSlice';
import { goToSlide, nextSlide, previousSlide } from '../store/presentationSlice';
import { presentations } from '../project/presentations';
import { useKeyboardNavigation } from '../hooks/useKeyboardNavigation';
import { useAnnotationActions } from '../hooks/useAnnotationActions';
import { useInspectorMode } from '../hooks/useInspectorMode';
import { usePresentationSync } from '../sync/usePresentationSync';
import { useLiveTranslation } from '../hooks/useLiveTranslation';
import type { SlideData } from '../types/slide.types';
import Slide from './Slide';
import MaterialIcon from './MaterialIcon';
import PresenterTimer, { PresenterPaceLabel, PresenterTimeBar } from './PresenterTimer';
import { SlidePreviewContext } from './slidePreviewContext';
import DebugProfiler from '../debug/DebugProfiler';
import TalkPracticeReader from './TalkPracticeReader';
import PracticeAnnotationsPanel from './PracticeAnnotationsPanel';
import PendingAnnotationPopup from './PendingAnnotationPopup';
import LiveTranslationPanel from './LiveTranslationPanel';
import type { PracticePosition } from '../practice/slideCues';
import './SpeakerNotesView.css';

import { slideWeights } from '../utils/presenterTimer';

/** Warm-to-cool inks, in order, for the visited part of the slide strip. */
const PROGRESS_INKS = ['#f09040', '#e07060', '#c85888', '#a050b0', '#7050c8', '#4890a8', '#3878e8'];
/** A first connect usually lands within this, so the banner only appears for a real wait. */
const BANNER_DELAY_MS = 1_000;
const NOTES_RELOAD_HINT_MS = 4_000;
const SWIPE_MIN_PX = 48;

const SlidePreview = memo(function SlidePreview({ slide, slideNumber, totalSlides, current = false }: { slide: SlideData; slideNumber: number; totalSlides: number; current?: boolean }) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const updateScale = () => setScale(surface.clientWidth / 1920);
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);

  const content = useMemo(() => isValidElement(slide.content)
    ? cloneElement(slide.content as ReactElement<{ orientation?: string }>, { orientation: 'landscape' })
    : slide.content, [slide]);
  return (
    <div className={`speaker-notes__preview-frame ${current ? 'speaker-notes__preview-frame--current' : ''}`}>
      <div className="speaker-notes__preview-surface" ref={surfaceRef}>
        <div className="speaker-notes__preview-canvas" style={{ '--preview-scale': scale } as CSSProperties}>
          <SlidePreviewContext value={true}><Slide slide={{ ...slide, content }} aspectRatio="16:9" isActive slideNumber={slideNumber} totalSlides={totalSlides} /></SlidePreviewContext>
        </div>
      </div>
    </div>
  );
});


/** True once `active` has held for `delayMs`; resets as soon as it drops. */
function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) { setShown(false); return; }
    const timeout = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(timeout);
  }, [active, delayMs]);
  return active && shown;
}

function NotesPlaceholder({ notesLoaded, slideId }: { notesLoaded: boolean; slideId: string }) {
  const slow = useDelayedFlag(!notesLoaded, NOTES_RELOAD_HINT_MS);
  if (notesLoaded) {
    return <p className="speaker-notes__empty">No notes written for this slide. <code>{slideId}</code></p>;
  }
  return <div className="speaker-notes__empty" role="status">
    <p>Waiting for notes…</p>
    {slow && <button type="button" className="speaker-notes__reload" onClick={() => window.location.reload()}>Reload</button>}
  </div>;
}

export default function SpeakerNotesView() {
  const dispatch = useAppDispatch();
  const { currentPresentationId, currentSlide } = useAppSelector((state) => state.presentation);
  const showNext = useAppSelector((state) => state.ui.presenterShowNext);
  const readingSize = useAppSelector((state) => state.ui.practiceTextSize);
  const talkMinutes = useAppSelector((state) => state.ui.presenterTalkMinutes);
  const presenting = useAppSelector((state) => state.ui.presenterPresenting);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const jumpRef = useRef<HTMLDialogElement>(null);
  const theme = useAppSelector((state) => state.ui.theme);
  const presentation = presentations.find((item) => item.id === currentPresentationId) ?? presentations[0];
  const slides = useMemo(() => presentation?.slides ?? [], [presentation]);
  const safeSlide = slides.length ? Math.min(currentSlide, slides.length - 1) : 0;
  const current = slides[safeSlide];
  const next = slides[safeSlide + 1];
  const { status, error, notes, notesLoaded } = usePresentationSync({ dispatch, presentationId: presentation?.id ?? '', slideIndex: safeSlide, totalSlides: slides.length, theme, role: 'notes', canNavigate: true });
  const liveTranslation = useLiveTranslation({ presentationId: presentation?.id ?? '', surface: 'presenter' });
  const notesRef = useRef<HTMLElement>(null);
  const annotationCount = useAppSelector(state => state.annotations.annotations.filter(item => item.presentationId === presentation.id).length);
  const storedReadingMode = useAppSelector((state) => state.ui.presenterReadingMode);
  // Presenting hides the review tools, so a remembered Annotations tab falls back to notes.
  const readingMode = presenting && storedReadingMode === 'annotations' ? 'notes' : storedReadingMode;
  const setReadingMode = (mode: 'notes' | 'practice' | 'annotations') => dispatch(setPresenterReadingMode(mode));
  const practicePosition = useRef<PracticePosition>({ scrollTop: 0, following: true });
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const weights = useMemo(() => slideWeights(slides.map((slide) => slide.id), notes), [slides, notes]);

  useEffect(() => {
    notesRef.current?.scrollTo({ top: 0 });
  }, [current?.id]);

  const connected = status === 'connected';
  // The first connect gets a moment before it counts as a problem; a lost link shows at once.
  const bannerVisible = useDelayedFlag(status !== 'connected', status === 'connecting' ? BANNER_DELAY_MS : 0);
  const currentNotes = notes[current?.id] ?? [];
  const goTo = (index: number) => {
    if (!connected) return;
    navigator.vibrate?.(10);
    dispatch(goToSlide({ index, totalSlides: slides.length }));
  };
  const previous = () => {
    if (!connected || safeSlide === 0) return;
    navigator.vibrate?.(10);
    dispatch(previousSlide());
  };
  const advance = () => {
    if (!connected || safeSlide >= slides.length - 1) return;
    navigator.vibrate?.(10);
    dispatch(startPresenterTimerIfIdle(Date.now()));
    dispatch(nextSlide(slides.length));
  };
  useKeyboardNavigation({ onNext: advance, onPrevious: previous });

  // The same Alt inspector as the deck: Alt-hover to inspect, Alt-click to
  // annotate the presenter UI or the slide preview (Alt+C switches clicks to
  // copying debug info). Previews are always landscape. Double-click text
  // editing stays off here.
  const isMultiSelectMode = useAppSelector((state) => state.annotations.isMultiSelectMode);
  const { handleAnnotateElement, handleAnnotateText, handleCommit, handleCommentCancel, handleToggleMultiSelect, lastPopupDismissRef }
    = useAnnotationActions(slides, safeSlide, '16:9', presentation?.id ?? '');
  useInspectorMode({
    currentSlide: safeSlide,
    totalSlides: slides.length,
    aspectRatio: '16:9',
    slides,
    isMultiSelectMode,
    onAnnotate: handleAnnotateElement,
    onAnnotateText: handleAnnotateText,
    onToggleMultiSelect: handleToggleMultiSelect,
    lastPopupDismissRef,
  });

  const startSwipe = (event: PointerEvent) => { swipeStart.current = { x: event.clientX, y: event.clientY }; };
  const endSwipe = (event: PointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) advance(); else previous();
  };

  const openJump = () => {
    jumpRef.current?.showModal();
    jumpRef.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'center' });
  };

  if (!presentation || !current) return <main className="speaker-notes"><p>No slides available.</p></main>;

  const statusLabel = error || status;
  const bannerText = status === 'error' && error ? error : status === 'connecting' ? 'Connecting — taps won’t reach the screen yet' : 'Reconnecting — taps won’t reach the screen';

  return (
    <main className={`speaker-notes${showNext ? '' : ' speaker-notes--current-only'}${readingMode !== 'notes' ? ' speaker-notes--practice' : ''}`} data-testid="speaker-notes-view" data-presenting={presenting}>
      <h1 className="speaker-notes__sr-only">{presentation.title}</h1>
      {bannerVisible && <p className="speaker-notes__banner" role="alert"><MaterialIcon name="wifi_off" size="small" />{bannerText}</p>}
      <section className="speaker-notes__grid">
        <aside className="speaker-notes__left-column">
          <div className="speaker-notes__bar">
            <div className="speaker-notes__reading-modes" role="tablist" aria-label="Speaker reading mode">
              <button type="button" role="tab" aria-selected={readingMode === 'notes'} onClick={() => setReadingMode('notes')}>Notes</button>
              {hasManuscript(presentation.id) && <button type="button" role="tab" aria-selected={readingMode === 'practice'} onClick={() => setReadingMode('practice')}>Practice</button>}
              {!presenting && <button type="button" role="tab" className="speaker-notes__annotations-tab" aria-selected={readingMode === 'annotations'} aria-label={`Annotations (${annotationCount})`} title="Annotations" onClick={() => setReadingMode('annotations')}>
                <MaterialIcon name="chat_bubble_outline" size="small" /><span aria-hidden="true">{annotationCount}</span>
              </button>}
            </div>
            <div className="speaker-notes__text-size" role="group" aria-label="Reading size">
              <button type="button" aria-label="Decrease reading size" title="Smaller text" disabled={readingSize <= READING_SIZE_MIN} onClick={() => dispatch(setPracticeTextSize(readingSize - READING_SIZE_STEP))}>
                <MaterialIcon name="text_decrease" size="small" />
              </button>
              <button type="button" aria-label="Increase reading size" title="Larger text" disabled={readingSize >= READING_SIZE_MAX} onClick={() => dispatch(setPracticeTextSize(readingSize + READING_SIZE_STEP))}>
                <MaterialIcon name="text_increase" size="small" />
              </button>
            </div>
            <span className={`speaker-notes__status speaker-notes__status--${status}`} role="img" aria-label={statusLabel} title={statusLabel} />
            <button type="button" className="speaker-notes__settings-button" aria-label="Presenter settings" onClick={() => settingsRef.current?.showModal()}>
              <MaterialIcon name="settings" size="small" />
            </button>
          </div>
          <LiveTranslationPanel runtime={liveTranslation} compact />
          {readingMode === 'annotations' ? <PracticeAnnotationsPanel presentationId={presentation.id} slides={slides} onClose={() => setReadingMode('practice')} onSlideChange={connected ? goTo : undefined} /> : readingMode === 'practice' && hasManuscript(presentation.id) ? (
            <DebugProfiler id="PracticeReader"><TalkPracticeReader presentationId={presentation.id} slides={slides} currentSlide={safeSlide}
              canNavigate={connected} onSlideChange={(index) => dispatch(goToSlide({ index, totalSlides: slides.length }))}
              position={practicePosition} onOpenAnnotations={() => setReadingMode('annotations')} presenting={presenting} /></DebugProfiler>
          ) : (
          <article ref={notesRef} className="speaker-notes__notes" aria-label="Speaker notes" tabIndex={0} style={{ '--reading-size': `${readingSize}px` } as CSSProperties}>
            <h2 className="speaker-notes__sr-only">{current.title ?? `Slide ${safeSlide + 1}`}</h2>
            {currentNotes.length ? (
              <ul>{currentNotes.map((note, index) => <li key={note} data-speaker-note-index={index}>{note}</li>)}</ul>
            ) : <NotesPlaceholder notesLoaded={notesLoaded} slideId={current.id} />}
          </article>
          )}
        </aside>
        <section className="speaker-notes__right-column" aria-label="Slide previews and navigation">
          <div className="speaker-notes__current" aria-label="Current slide" onPointerDown={startSwipe} onPointerUp={endSwipe} onPointerCancel={() => { swipeStart.current = null; }}>
            <DebugProfiler id="CurrentSlidePreview"><SlidePreview key={current.id} slide={current} slideNumber={safeSlide + 1} totalSlides={slides.length} current /></DebugProfiler>
          </div>
          <footer className="speaker-notes__footer">
            <div className="speaker-notes__footer-left">
              <div className="speaker-notes__toolbar">
                <DebugProfiler id="PresenterTimer"><PresenterTimer /></DebugProfiler>
                <nav className="speaker-notes__controls" aria-label="Slide navigation">
                  <button type="button" onClick={previous} disabled={!connected || safeSlide === 0} aria-label="Previous slide" title="Previous slide">
                    <MaterialIcon name="arrow_back" size="small" />
                  </button>
                  <button type="button" onClick={advance} disabled={!connected || safeSlide === slides.length - 1} className="speaker-notes__advance" aria-label="Next slide" title="Next slide">
                    <MaterialIcon name="arrow_forward" size="small" />
                  </button>
                </nav>
              </div>
              <div className="speaker-notes__progress" aria-hidden="true">
                {slides.map((slide, index) => (
                  <span key={slide.id} data-current={index === safeSlide} data-visited={index <= safeSlide}
                    style={{ flexGrow: weights[index], '--ink': PROGRESS_INKS[Math.floor((index / slides.length) * PROGRESS_INKS.length)] } as CSSProperties} />
                ))}
              </div>
              <PresenterTimeBar talkMinutes={talkMinutes} weights={weights} slideIndex={safeSlide} />
            </div>
            <div className="speaker-notes__next" aria-label={showNext ? 'Next slide preview' : 'Slide count'}>
              {showNext && (next ? <DebugProfiler id="NextSlidePreview"><SlidePreview key={next.id} slide={next} slideNumber={safeSlide + 2} totalSlides={slides.length} /></DebugProfiler> : <div className="speaker-notes__end">End of presentation</div>)}
              <PresenterPaceLabel talkMinutes={talkMinutes} weights={weights} slideIndex={safeSlide} />
              <button type="button" className="speaker-notes__slide-count" aria-live="polite" aria-haspopup="dialog" title="Jump to a slide" onClick={openJump}>{safeSlide + 1} out of {slides.length}</button>
            </div>
          </footer>
        </section>
      </section>
      <dialog ref={settingsRef} className="speaker-notes__settings" aria-label="Presenter settings">
        <h2>Presenter settings</h2>
        <label><input type="checkbox" checked={showNext} onChange={(event) => dispatch(setPresenterShowNext(event.target.checked))} /> Show next slide</label>
        <label><input type="checkbox" checked={presenting} onChange={(event) => dispatch(setPresenterPresenting(event.target.checked))} /> Presenting — hide review tools</label>
        <label className="speaker-notes__talk-length">
          <span>Talk length</span>
          {/* Commit on blur so typing "40" never clamps the interim "4". */}
          <input key={talkMinutes} type="number" inputMode="numeric" min={TALK_MINUTES_MIN} max={TALK_MINUTES_MAX} step={5} defaultValue={talkMinutes}
            onBlur={(event) => { const minutes = event.target.valueAsNumber; if (Number.isFinite(minutes)) dispatch(setPresenterTalkMinutes(minutes)); else event.target.value = String(talkMinutes); }}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
          <span>min</span>
        </label>
        <button type="button" onClick={() => settingsRef.current?.close()}>Done</button>
      </dialog>
      <dialog ref={jumpRef} className="speaker-notes__jump" aria-label="Jump to slide" onClick={(event) => { if (event.target === event.currentTarget) jumpRef.current?.close(); }}>
        <h2>Jump to slide</h2>
        <ol>
          {slides.map((slide, index) => (
            <li key={slide.id}>
              <button type="button" aria-current={index === safeSlide ? 'step' : undefined} disabled={!connected}
                onClick={() => { goTo(index); jumpRef.current?.close(); }}>
                <span>{index + 1}</span>{slide.title ?? slide.id}
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="speaker-notes__jump-close" onClick={() => jumpRef.current?.close()}>Close</button>
      </dialog>
      <PendingAnnotationPopup presentationId={presentation.id} onConfirm={handleCommit} onCancel={handleCommentCancel} />
    </main>
  );
}
