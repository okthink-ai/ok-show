import { memo, useRef, useState } from 'react';
import type { FC, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { SlideOrderAnnotation, SlideOrderPlacement } from '../types/annotation.types';
import type { SlideData } from '../types/slide.types';
import { resolveSlideOrder } from '../utils/slideOrderConstraints';
import MaterialIcon from './MaterialIcon';
import SlideReviewPreview from './SlideReviewPreview';

export interface SlideOrderRequest {
  slideIndex: number;
  anchorSlideId: string;
  placement: SlideOrderPlacement;
}

interface ReorderDraft {
  slideId: string;
  anchorSlideId: string;
  placement: SlideOrderPlacement;
}

interface SlideDropTarget {
  slideId: string;
  placement: SlideOrderPlacement;
}

interface SlideReorderListProps {
  /** Slides in deck order. */
  slides: SlideData[];
  /** Slides in the order the saved slide-order annotations produce. */
  previewSlides: SlideData[];
  slideOrderAnnotations: SlideOrderAnnotation[];
  currentSlide: number;
  /** The scrolling list these cards render into; dragging near its edges scrolls it. */
  listRef: RefObject<HTMLDivElement | null>;
  registerCard: (slideIndex: number, element: HTMLElement | null) => void;
  onDragStart: () => void;
  onDragError: (message: string) => void;
  onSlideChange: (index: number) => void;
  onCreateSlideOrderAnnotation: (request: SlideOrderRequest) => void;
  onRemoveAnnotation: (id: string) => void;
}

/**
 * Slide preview cards in proposed order. Each card can be dragged, or moved
 * with the Reorder form, to add a stable-ID slide-order annotation.
 */
const SlideReorderList: FC<SlideReorderListProps> = ({
  slides,
  previewSlides,
  slideOrderAnnotations,
  currentSlide,
  listRef,
  registerCard,
  onDragStart,
  onDragError,
  onSlideChange,
  onCreateSlideOrderAnnotation,
  onRemoveAnnotation,
}) => {
  const [reorderDraft, setReorderDraft] = useState<ReorderDraft | null>(null);
  const [draggingSlideId, setDraggingSlideId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<SlideDropTarget | null>(null);
  const draggingSlideIdRef = useRef<string | null>(null);
  const dropTargetRef = useRef<SlideDropTarget | null>(null);

  const startReorderDraft = (slideIndex: number) => {
    const slide = slides[slideIndex];
    if (!slide || slides.length < 2) return;
    const previewIndex = previewSlides.findIndex((candidate) => candidate.id === slide.id);
    const nextSlide = previewSlides[previewIndex + 1];
    const previousSlide = previewSlides[previewIndex - 1];
    const anchor = nextSlide ?? previousSlide;
    if (!anchor) return;
    setReorderDraft({
      slideId: slide.id,
      anchorSlideId: anchor.id,
      placement: nextSlide ? 'before' : 'after',
    });
  };

  const saveReorderDraft = (slideIndex: number) => {
    if (!reorderDraft || reorderDraft.slideId !== slides[slideIndex]?.id) return;
    onCreateSlideOrderAnnotation({
      slideIndex,
      anchorSlideId: reorderDraft.anchorSlideId,
      placement: reorderDraft.placement,
    });
    setReorderDraft(null);
  };

  const clearSlideDrag = () => {
    draggingSlideIdRef.current = null;
    dropTargetRef.current = null;
    setDraggingSlideId(null);
    setDropTarget(null);
  };

  const startSlideDrag = (slideId: string) => {
    onDragStart();
    draggingSlideIdRef.current = slideId;
    dropTargetRef.current = null;
    setDraggingSlideId(slideId);
    setDropTarget(null);
    onDragError('');
  };

  const updateSlideDropTarget = (clientY: number, targetSlideId: string, bounds: DOMRect) => {
    const sourceSlideId = draggingSlideIdRef.current;
    if (!sourceSlideId || sourceSlideId === targetSlideId) return;
    const placement: SlideOrderPlacement = clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
    if (dropTarget?.slideId !== targetSlideId || dropTarget.placement !== placement) {
      dropTargetRef.current = { slideId: targetSlideId, placement };
      setDropTarget({ slideId: targetSlideId, placement });
    }
  };

  const commitSlideDrop = (slideId: string, anchorSlideId: string, placement: SlideOrderPlacement) => {
    const slideIndex = slides.findIndex((slide) => slide.id === slideId);
    if (slideIndex < 0 || slideId === anchorSlideId) {
      clearSlideDrag();
      return;
    }

    const proposedConstraints = [
      ...slideOrderAnnotations.filter((annotation) => annotation.slideId !== slideId),
      { slideId, anchorSlideId, placement },
    ];
    if (resolveSlideOrder(slides, proposedConstraints).conflict) {
      onDragError('That move conflicts with another slide-order annotation. Remove the conflicting move first.');
      clearSlideDrag();
      return;
    }

    onCreateSlideOrderAnnotation({ slideIndex, anchorSlideId, placement });
    clearSlideDrag();
  };

  const handleSlideDragPointerDown = (event: ReactPointerEvent<HTMLElement>, slideId: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    startSlideDrag(slideId);
  };

  const handleSlideDragPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!draggingSlideIdRef.current) return;
    event.preventDefault();
    const list = listRef.current;
    if (list) {
      const listBounds = list.getBoundingClientRect();
      if (event.clientY < listBounds.top + 48) list.scrollBy({ top: -32 });
      else if (event.clientY > listBounds.bottom - 48) list.scrollBy({ top: 32 });
    }

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('.speaker-notes-sidebar__slide[data-slide-id]');
    const targetSlideId = target?.dataset.slideId;
    if (!target || !targetSlideId || targetSlideId === draggingSlideIdRef.current) {
      dropTargetRef.current = null;
      setDropTarget(null);
      return;
    }
    updateSlideDropTarget(event.clientY, targetSlideId, target.getBoundingClientRect());
  };

  const handleSlideDragPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const slideId = draggingSlideIdRef.current;
    const activeDropTarget = dropTargetRef.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (slideId && activeDropTarget) {
      commitSlideDrop(slideId, activeDropTarget.slideId, activeDropTarget.placement);
    } else {
      clearSlideDrag();
    }
  };

  return (
    <>
      {previewSlides.map((slide, displayIndex) => {
        const slideIndex = slides.findIndex((candidate) => candidate.id === slide.id);
        const displaySlideNumber = displayIndex + 1;
        const label = slide.title ?? slide.id;
        return (
          <article
            key={slide.id}
            ref={(element) => registerCard(slideIndex, element)}
            className={`speaker-notes-sidebar__slide ${slideIndex === currentSlide ? 'speaker-notes-sidebar__slide--current' : ''} ${draggingSlideId === slide.id ? 'speaker-notes-sidebar__slide--dragging' : ''} ${dropTarget?.slideId === slide.id ? `speaker-notes-sidebar__slide--drop-${dropTarget.placement}` : ''}`}
            data-slide-index={slideIndex}
            data-slide-id={slide.id}
            data-preview-index={displayIndex}
          >
            <button type="button" className="speaker-notes-sidebar__slide-heading" onClick={() => onSlideChange(slideIndex)}>
              <span>{String(displaySlideNumber).padStart(2, '0')}</span>
              <strong>{label}</strong>
            </button>
            <div className="speaker-notes-sidebar__preview-review">
              <button
                type="button"
                className="speaker-notes-sidebar__preview-button"
                onClick={() => onSlideChange(slideIndex)}
                aria-label={`Go to slide ${displaySlideNumber}: ${label}`}
              >
                <SlideReviewPreview slide={slide} slideNumber={displaySlideNumber} totalSlides={slides.length} />
              </button>
              <div className="speaker-notes-sidebar__preview-actions">
                <span>{slide.template ?? 'Slide'}</span>
                <span
                  className="speaker-notes-sidebar__drag-hint"
                  onPointerDown={(event) => handleSlideDragPointerDown(event, slide.id)}
                  onPointerMove={handleSlideDragPointerMove}
                  onPointerUp={handleSlideDragPointerUp}
                  onPointerCancel={clearSlideDrag}
                  title={`Drag ${label} to a new position`}
                >
                  <MaterialIcon name="drag_indicator" size="small" /> Drag to move
                </span>
                <button
                  type="button"
                  onClick={() => startReorderDraft(slideIndex)}
                  disabled={slides.length < 2}
                  aria-label={`Reorder slide ${displaySlideNumber}: ${label}`}
                >
                  <MaterialIcon name="swap_vert" size="small" /> Reorder
                </button>
              </div>
              {reorderDraft?.slideId === slide.id && (
                <div className="speaker-notes-sidebar__reorder-draft">
                  <strong>Place this slide</strong>
                  <div>
                    <select
                      value={reorderDraft.placement}
                      onChange={(event) => setReorderDraft({
                        ...reorderDraft,
                        placement: event.currentTarget.value as SlideOrderPlacement,
                      })}
                      aria-label={`Position for ${label}`}
                    >
                      <option value="before">Before</option>
                      <option value="after">After</option>
                    </select>
                    <select
                      value={reorderDraft.anchorSlideId}
                      onChange={(event) => setReorderDraft({
                        ...reorderDraft,
                        anchorSlideId: event.currentTarget.value,
                      })}
                      aria-label={`Anchor slide for ${label}`}
                    >
                      {slides.filter((candidate) => candidate.id !== slide.id).map((candidate) => {
                        const actualIndex = previewSlides.findIndex((item) => item.id === candidate.id);
                        return (
                          <option key={candidate.id} value={candidate.id}>
                            {String(actualIndex + 1).padStart(2, '0')} · {candidate.title ?? candidate.id}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <small>Saved by stable slide IDs. A new move for this slide replaces its previous move.</small>
                  <div className="speaker-notes-sidebar__reorder-buttons">
                    <button type="button" onClick={() => setReorderDraft(null)}>Cancel</button>
                    <button type="button" onClick={() => saveReorderDraft(slideIndex)}>Add reorder annotation</button>
                  </div>
                </div>
              )}
              {slideOrderAnnotations.filter((annotation) => annotation.slideId === slide.id).map((annotation) => (
                <div key={annotation.id} className="speaker-notes-sidebar__order-annotation">
                  <span>
                    Move {annotation.placement} {annotation.anchorSlideTitle}
                    <small>{annotation.slideId} → {annotation.anchorSlideId}</small>
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveAnnotation(annotation.id)}
                    aria-label={`Remove reorder annotation for ${label}`}
                  >
                    <MaterialIcon name="delete" size="small" />
                  </button>
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </>
  );
};

export default memo(SlideReorderList);
