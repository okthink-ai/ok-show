import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasManuscript } from '../practice/manuscriptRegistry';
import type { FC, RefObject } from 'react';
import type {
  Annotation,
  AspectRatio,
  PendingAnnotationDraft,
  SpeakerNoteAnnotation,
  SlideOrderAnnotation,
  SparklePromptAnnotation,
} from '../types/annotation.types';
import type { SlideData } from '../types/slide.types';
import { EMPTY_SPARKLE_PROMPT, type SparklePromptMap } from '../types/speakerNotes.types';
import type { SyncStatus } from '../sync/usePresentationSync';
import { resolveSpeakerNoteAnchor } from '../utils/speakerNoteAnnotations';
import { resolveSlideOrder } from '../utils/slideOrderConstraints';
import { isPendingSpeakerNoteDraft } from '../utils/speakerNoteDrafts';
import type { TextRange } from '../utils/textHighlight';
import { useFollowScroll } from '../hooks/useFollowScroll';
import MaterialIcon from './MaterialIcon';
import SlideReorderList from './SlideReorderList';
import type { SlideOrderRequest } from './SlideReorderList';
import SpeakerNoteItem from './SpeakerNoteItem';
import SparklePromptCard from './SparklePromptCard';
import TalkPracticeReader from './TalkPracticeReader';
import PracticeAnnotationsPanel from './PracticeAnnotationsPanel';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { updateReplacementText } from '../store/annotationsSlice';
import type { PracticePosition } from '../practice/slideCues';
import './SpeakerNotesSidebar.css';

export type { SlideOrderRequest } from './SlideReorderList';

interface SpeakerNotesSidebarProps {
  presentationId: string;
  slides: SlideData[];
  notes: Record<string, string[]>;
  sparklePrompts: SparklePromptMap;
  status: SyncStatus;
  error: string;
  currentSlide: number;
  aspectRatio: AspectRatio;
  annotations: Annotation[];
  pendingDraft: PendingAnnotationDraft | null;
  /**
   * Practice reading position shared with other Practice views. When omitted,
   * the sidebar keeps its own.
   */
  practicePosition?: RefObject<PracticePosition>;
  onSlideChange: (index: number) => void;
  onSetPendingDraft: (draft: PendingAnnotationDraft) => void;
  onUpdatePendingComment: (comment: string) => void;
  onUpdatePendingReplacementText: (replacementText: string) => void;
  onCommitPendingDraft: (comment: string) => void;
  onCreateSpeakerNoteDeletion: (draft: PendingAnnotationDraft) => void;
  onCreateSlideOrderAnnotation: (request: SlideOrderRequest) => void;
  onClearPendingDraft: () => void;
  onUpdateComment: (id: string, comment: string) => void;
  onRemoveAnnotation: (id: string) => void;
  onClose: () => void;
}

type ReviewMode = 'notes' | 'slides' | 'practice' | 'annotations';

const MODE_TITLES: Record<ReviewMode, string> = {
  notes: 'Speaker notes',
  slides: 'Slide previews',
  practice: 'Practice the talk',
  annotations: 'Annotations',
};

const SpeakerNotesSidebar: FC<SpeakerNotesSidebarProps> = ({
  presentationId,
  slides,
  notes,
  sparklePrompts,
  status,
  error,
  currentSlide,
  aspectRatio,
  annotations,
  pendingDraft,
  practicePosition: sharedPracticePosition,
  onSlideChange,
  onSetPendingDraft,
  onUpdatePendingComment,
  onUpdatePendingReplacementText,
  onCommitPendingDraft,
  onCreateSpeakerNoteDeletion,
  onCreateSlideOrderAnnotation,
  onClearPendingDraft,
  onUpdateComment,
  onRemoveAnnotation,
  onClose,
}) => {
  const dispatch = useAppDispatch();
  const [reviewMode, setSelectedMode] = useState<ReviewMode>('notes');
  const setReviewMode = useCallback((mode: ReviewMode) => setSelectedMode(mode), []);
  const annotationCount = useAppSelector(state => state.annotations.annotations.filter(item => item.presentationId === presentationId).length);
  const ownPracticePosition = useRef<PracticePosition>({ scrollTop: 0, following: true });
  const practicePosition = sharedPracticePosition ?? ownPracticePosition;
  const [dragError, setDragError] = useState('');
  const isLocked = status === 'error';
  const showsSlideList = (reviewMode === 'notes' && !isLocked) || reviewMode === 'slides';
  const { listRef, registerCard, following, pauseFollowing, resumeFollowing } = useFollowScroll({
    currentSlide,
    enabled: showsSlideList,
    viewKey: reviewMode,
    resetKey: presentationId,
    onSlideChange,
  });

  const speakerNoteDraft = pendingDraft?.presentationId === presentationId
    && isPendingSpeakerNoteDraft(pendingDraft)
    ? pendingDraft
    : null;
  const draft = speakerNoteDraft?.target.value ?? null;
  const draftComment = speakerNoteDraft?.comment ?? '';
  const noteAnnotations = useMemo(
    () => annotations.filter((annotation): annotation is SpeakerNoteAnnotation => annotation.type === 'speaker-note'),
    [annotations],
  );
  const sparkleAnnotations = useMemo(
    () => annotations.filter((annotation): annotation is SparklePromptAnnotation => annotation.type === 'sparkle-prompt'),
    [annotations],
  );
  const slideOrderAnnotations = useMemo(
    () => annotations.filter((annotation): annotation is SlideOrderAnnotation => annotation.type === 'slide-order'),
    [annotations],
  );
  const previewOrder = useMemo(
    () => resolveSlideOrder(slides, slideOrderAnnotations),
    [slideOrderAnnotations, slides],
  );

  const resolvedById = useMemo(() => {
    const resolved = new Map<string, ReturnType<typeof resolveSpeakerNoteAnchor>>();
    for (const annotation of noteAnnotations) {
      resolved.set(annotation.id, resolveSpeakerNoteAnchor(annotation, notes[annotation.slideId] ?? []));
    }
    return resolved;
  }, [noteAnnotations, notes]);

  // Reset only when the presentation changes, not on mount: the practice
  // position may be shared with a Practice view that is still reading.
  const previousPresentationId = useRef(presentationId);
  useEffect(() => {
    if (previousPresentationId.current === presentationId) return;
    previousPresentationId.current = presentationId;
    setSelectedMode('notes');
    practicePosition.current = { scrollTop: 0, following: true };
  }, [practicePosition, presentationId]);

  const handleUpdateReplacementText = useCallback((id: string, replacementText: string) => {
    dispatch(updateReplacementText({ id, replacementText }));
  }, [dispatch]);

  const renderNotesCard = (slide: SlideData, slideIndex: number) => {
    const slideNotes = notes[slide.id] ?? [];
    const slideAnnotations = noteAnnotations.filter((annotation) => annotation.slideId === slide.id);
    const slideSparkleAnnotations = sparkleAnnotations.filter((annotation) => annotation.slideId === slide.id);
    const unresolved = slideAnnotations.filter((annotation) => !resolvedById.get(annotation.id)?.resolved);
    const notesBody = status === 'connecting' && !Object.keys(notes).length
      ? <p className="speaker-notes-sidebar__empty">Loading private notes…</p>
      : !slideNotes.length
        ? <p className="speaker-notes-sidebar__empty">No speaker notes for this slide.</p>
        : (
          <ul className="speaker-notes-sidebar__notes">
            {slideNotes.map((note, noteIndex) => {
              const attached = slideAnnotations.filter((annotation) => {
                const resolved = resolvedById.get(annotation.id);
                return resolved?.resolved && resolved.noteIndex === noteIndex;
              });
              const ranges = attached.flatMap((annotation): TextRange[] => {
                const resolved = resolvedById.get(annotation.id);
                return annotation.target === 'range' && resolved?.resolved
                  ? [{ start: resolved.start, end: resolved.end }]
                  : [];
              });
              const noteDraft = draft?.slideIndex === slideIndex && draft.noteIndex === noteIndex ? draft : null;
              return (
                <SpeakerNoteItem
                  key={`${slide.id}-${noteIndex}`}
                  presentationId={presentationId}
                  slide={slide}
                  slideIndex={slideIndex}
                  aspectRatio={aspectRatio}
                  noteIndex={noteIndex}
                  note={note}
                  attached={attached}
                  ranges={ranges}
                  draft={noteDraft}
                  draftComment={draftComment}
                  onSetPendingDraft={onSetPendingDraft}
                  onUpdatePendingComment={onUpdatePendingComment}
                  onUpdatePendingReplacementText={onUpdatePendingReplacementText}
                  onCommitPendingDraft={onCommitPendingDraft}
                  onClearPendingDraft={onClearPendingDraft}
                  onCreateSpeakerNoteDeletion={onCreateSpeakerNoteDeletion}
                  onUpdateComment={onUpdateComment}
                  onUpdateReplacementText={handleUpdateReplacementText}
                  onRemoveAnnotation={onRemoveAnnotation}
                />
              );
            })}
          </ul>
        );

    return (
      <article
        key={slide.id}
        ref={(element) => registerCard(slideIndex, element)}
        className={`speaker-notes-sidebar__slide ${slideIndex === currentSlide ? 'speaker-notes-sidebar__slide--current' : ''}`}
        data-slide-index={slideIndex}
        data-slide-id={slide.id}
      >
        <button type="button" className="speaker-notes-sidebar__slide-heading" onClick={() => onSlideChange(slideIndex)}>
          <span>{String(slideIndex + 1).padStart(2, '0')}</span>
          <strong>{slide.title ?? slide.id}</strong>
        </button>
        <SparklePromptCard
          presentationId={presentationId}
          slide={slide}
          slideIndex={slideIndex}
          aspectRatio={aspectRatio}
          prompt={sparklePrompts[slide.id] ?? EMPTY_SPARKLE_PROMPT}
          annotations={slideSparkleAnnotations}
          pendingDraft={pendingDraft}
          onSetPendingDraft={onSetPendingDraft}
          onUpdatePendingComment={onUpdatePendingComment}
          onCommitPendingDraft={onCommitPendingDraft}
          onClearPendingDraft={onClearPendingDraft}
          onUpdateComment={onUpdateComment}
          onRemoveAnnotation={onRemoveAnnotation}
        />
        {notesBody}
        {unresolved.length > 0 && (
          <div className="speaker-notes-sidebar__unresolved">
            <strong><MaterialIcon name="warning" size="small" /> Unresolved after note changes</strong>
            {unresolved.map((annotation) => (
              <div key={annotation.id}>
                <span>“{annotation.quotedText}”</span>
                <textarea
                  defaultValue={annotation.comment}
                  rows={2}
                  onBlur={(event) => onUpdateComment(annotation.id, event.currentTarget.value)}
                />
                <button type="button" onClick={() => onRemoveAnnotation(annotation.id)}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </article>
    );
  };

  const renderBody = () => {
    if (reviewMode === 'annotations') {
      return (
        <PracticeAnnotationsPanel presentationId={presentationId} slides={slides}
          onClose={() => setReviewMode('practice')} onSlideChange={onSlideChange} />
      );
    }
    if (reviewMode === 'practice') {
      return (
        <TalkPracticeReader presentationId={presentationId} slides={slides} currentSlide={currentSlide}
          canNavigate onSlideChange={onSlideChange} position={practicePosition} onOpenAnnotations={() => setReviewMode('annotations')} />
      );
    }
    if (!showsSlideList) {
      return (
        <div className="speaker-notes-sidebar__locked">
          <MaterialIcon name="lock" size="large" />
          <h3>Speaker notes are locked</h3>
          <p>{error || 'Open this presentation with a valid notes token to review its private speaker notes.'}</p>
        </div>
      );
    }
    return (
      <div
        className="speaker-notes-sidebar__list"
        ref={listRef}
        onWheel={pauseFollowing}
        onTouchStart={pauseFollowing}
        onPointerDown={pauseFollowing}
      >
        {reviewMode === 'slides' ? (
          <SlideReorderList
            slides={slides}
            previewSlides={previewOrder.slides}
            slideOrderAnnotations={slideOrderAnnotations}
            currentSlide={currentSlide}
            listRef={listRef}
            registerCard={registerCard}
            onDragStart={pauseFollowing}
            onDragError={setDragError}
            onSlideChange={onSlideChange}
            onCreateSlideOrderAnnotation={onCreateSlideOrderAnnotation}
            onRemoveAnnotation={onRemoveAnnotation}
          />
        ) : slides.map((slide, slideIndex) => renderNotesCard(slide, slideIndex))}
      </div>
    );
  };

  return (
    <section className="speaker-notes-sidebar" aria-label="Speaker notes review">
      <header className="speaker-notes-sidebar__header">
        <div>
          <span className="speaker-notes-sidebar__eyebrow">Review</span>
          <h2>{MODE_TITLES[reviewMode]}</h2>
        </div>
        <button type="button" className="speaker-notes-sidebar__icon-button" onClick={onClose} aria-label="Close speaker notes">
          <MaterialIcon name="close" size="small" />
        </button>
      </header>

      <div className="speaker-notes-sidebar__mode-switch" role="tablist" aria-label="Review content">
        <button
          type="button"
          role="tab"
          aria-label="Notes"
          aria-selected={reviewMode === 'notes'}
          onClick={() => setReviewMode('notes')}
        >
          <MaterialIcon name="speaker_notes" size="small" /> Notes
        </button>
        <button
          type="button"
          role="tab"
          aria-label="Slides"
          aria-selected={reviewMode === 'slides'}
          onClick={() => setReviewMode('slides')}
        >
          <MaterialIcon name="view_carousel" size="small" /> Slides
        </button>
        {hasManuscript(presentationId) && (
          <button type="button" role="tab" aria-selected={reviewMode === 'practice'} onClick={() => setReviewMode('practice')}>Practice</button>
        )}
        <button type="button" role="tab" aria-selected={reviewMode === 'annotations'} onClick={() => setReviewMode('annotations')}>Annotations ({annotationCount})</button>
      </div>

      {(reviewMode === 'notes' || reviewMode === 'slides') && (
        <div className="speaker-notes-sidebar__toolbar">
          {reviewMode === 'notes' ? (
            <span className={`speaker-notes-sidebar__status speaker-notes-sidebar__status--${status}`} aria-live="polite">
              <span />{error || status}
            </span>
          ) : (
            <span className="speaker-notes-sidebar__slide-count">{slides.length} slides · drag previews to move them</span>
          )}
          {showsSlideList && (
            <button
              type="button"
              className={`speaker-notes-sidebar__resume ${following ? 'speaker-notes-sidebar__resume--active' : ''}`}
              onClick={following ? pauseFollowing : resumeFollowing}
              aria-pressed={following}
            >
              Follow slides
            </button>
          )}
        </div>
      )}

      {reviewMode === 'slides' && (dragError || previewOrder.conflict) && (
        <p className="speaker-notes-sidebar__drag-error" role="alert">
          {dragError || 'The saved slide-order annotations conflict. Remove one of the cyclic moves to preview the order.'}
        </p>
      )}

      {renderBody()}
    </section>
  );
};

export default SpeakerNotesSidebar;
