import { useState } from 'react';
import { manuscriptFile } from '../project/paths';
import type { FC, KeyboardEvent } from 'react';
import type { Annotation, AnnotationOperation } from '../types/annotation.types';
import CopySummaryCard from './CopySummaryCard';
import './AnnotationsSidebar.css';

const OPERATION_OPTIONS: Array<{ value: AnnotationOperation; label: string }> = [
  { value: 'content-change', label: 'Content change' },
  { value: 'replace-text', label: 'Replace text' },
  { value: 'remove', label: 'Remove' },
  { value: 'move', label: 'Move' },
  { value: 'adjust-layout', label: 'Layout / style' },
  { value: 'insert-slide', label: 'Insert slide' },
  { value: 'app-behavior', label: 'Application behavior' },
  { value: 'question', label: 'Question' },
];

interface AnnotationRequestMetadata {
  operation?: AnnotationOperation;
  workGroup?: string;
  dependencies?: string;
  acceptanceCriteria?: string;
}

interface AnnotationsSidebarProps {
  annotations: Annotation[];
  presentationId: string;
  /** Deck length, shown on the copy confirmation. */
  totalSlides?: number;
  onRemove: (id: string) => void;
  onUpdateComment: (id: string, comment: string) => void;
  onUpdateMetadata: (id: string, metadata: AnnotationRequestMetadata) => void;
  onClearAll: () => void;
  /** Copies the packet the confirmation card previewed; false reports a failed copy. */
  onCopyAll: (packet: string) => boolean | void | Promise<boolean | void>;
  onClearCopied?: () => void;
  onClose: () => void;
  onNavigateToSlide?: (slideIndex: number) => void;
  resolveSlideIndex?: (slideId: string, capturedIndex: number) => number;
}

const AnnotationsSidebar: FC<AnnotationsSidebarProps> = ({
  annotations,
  presentationId,
  totalSlides,
  onRemove,
  onUpdateComment,
  onUpdateMetadata,
  onClearAll,
  onCopyAll,
  onClearCopied,
  onClose,
  onNavigateToSlide,
  resolveSlideIndex,
}) => {
  const [copyStatus, setCopyStatus] = useState('');
  const [confirmingCopy, setConfirmingCopy] = useState(false);
  const copiedCount = annotations.filter(annotation => annotation.copiedAt !== undefined).length;
  const elementCount = annotations.filter((annotation) => annotation.type === 'element').length;
  const textCount = annotations.filter((annotation) => annotation.type === 'text').length;
  const speakerNoteCount = annotations.filter((annotation) => annotation.type === 'speaker-note').length;
  const sparklePromptCount = annotations.filter((annotation) => annotation.type === 'sparkle-prompt').length;
  const slideOrderCount = annotations.filter((annotation) => annotation.type === 'slide-order').length;
  const slideCount = new Set(annotations.map((annotation) => annotation.slideId)).size;

  const handleCopyAll = async (packet: string) => {
    let result: boolean | void = false;
    try { result = await onCopyAll(packet); } catch { result = false; }
    setCopyStatus(result === false ? 'Copy failed' : 'Copied');
    window.setTimeout(() => setCopyStatus(''), 1500);
    return result;
  };

  const handleCommentKeyDown = (
    e: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      (e.currentTarget as HTMLTextAreaElement).blur();
    }
  };

  const handleCommentBlur = (
    e: React.FocusEvent<HTMLTextAreaElement>,
    id: string,
  ) => {
    onUpdateComment(id, e.currentTarget.value);
  };

  return (
    <div className="annotations-sidebar">
      <div className="annotations-sidebar__header">
        <div className="annotations-sidebar__header-left">
          <span className="annotations-sidebar__title">
            Annotations ({annotations.length})
          </span>
        </div>
        <div className="annotations-sidebar__header-right">
          <button
            className="annotations-sidebar__close-btn"
            onClick={onClose}
            title="Close annotations"
          >
            ×
          </button>
        </div>
      </div>

      <div className="annotations-sidebar__list">
        {annotations.length === 0 ? (
          <div className="annotations-sidebar__empty">
            No annotations yet. Click on slide elements to annotate.
          </div>
        ) : (
          annotations.map((annotation, index) => {
            const currentSlideIndex = resolveSlideIndex?.(annotation.slideId, annotation.slideIndex)
              ?? annotation.slideIndex;
            return (
              <div key={annotation.id} className="annotations-sidebar__card">
                <div className="annotations-sidebar__card-header">
                  <div className="annotations-sidebar__card-meta">
                    <span className="annotations-sidebar__card-number">#{index + 1}</span>
                  </div>
                  <button
                    className="annotations-sidebar__remove-btn"
                    onClick={() => onRemove(annotation.id)}
                    title="Remove annotation"
                  >
                    ×
                  </button>
                </div>

                <button
                  className="annotations-sidebar__slide-info"
                  onClick={() => onNavigateToSlide?.(currentSlideIndex)}
                  title={`Go to slide ${currentSlideIndex + 1}`}
                >
                  Slide {currentSlideIndex + 1} / {annotation.slideTemplate}
                </button>

                {annotation.type === 'text' && annotation.practice ? (
                  <div className="annotations-sidebar__text">
                    <strong>{annotation.practice.target === 'talk' ? `${manuscriptFile(annotation.presentationId)}:${annotation.practice.sourceLine}` : 'Whole slide'}</strong>
                    <p>{annotation.text}</p>
                  </div>
                ) : annotation.type === 'slide-order' ? (
                  <div className="annotations-sidebar__text-annotation">
                    <span className="annotations-sidebar__context">Slide order · stable relative position</span>
                    <span className="annotations-sidebar__selected-text">
                      Move {annotation.slideTitle} {annotation.placement} {annotation.anchorSlideTitle}
                    </span>
                    <span className="annotations-sidebar__context">
                      {annotation.slideId} → {annotation.anchorSlideId}
                    </span>
                  </div>
                ) : annotation.type === 'element' ? (
                  <div className="annotations-sidebar__element-info">
                    {annotation.uiContext && (
                      <div className="annotations-sidebar__context">UI: {annotation.uiContext}</div>
                    )}
                    <div className="annotations-sidebar__element-selector">
                      <span className="annotations-sidebar__element-tag">
                        &lt;{annotation.elementInfo.tagName}
                        {annotation.elementInfo.className && annotation.elementInfo.className !== '(no class)'
                          ? ` class="${annotation.elementInfo.className.split(' ').slice(0, 2).join(' ')}"`
                          : ''}&gt;
                      </span>
                      {annotation.elementInfo.componentName !== 'Unknown' && (
                        <span className="annotations-sidebar__component-name">
                          {annotation.elementInfo.componentName}
                        </span>
                      )}
                    </div>
                    {annotation.textContent && (
                      <div className="annotations-sidebar__text-preview">
                        {annotation.textContent.slice(0, 80)}
                        {annotation.textContent.length > 80 && '…'}
                      </div>
                    )}
                  </div>
                ) : annotation.type === 'speaker-note' ? (
                  <div className="annotations-sidebar__text-annotation">
                    <span className="annotations-sidebar__context">
                      Speaker note {annotation.noteIndex + 1} · {annotation.target === 'range' ? 'selected text' : 'whole item'}
                    </span>
                    <span className="annotations-sidebar__selected-text">
                      &ldquo;{annotation.quotedText}&rdquo;
                    </span>
                    {annotation.replacementText !== undefined && (
                      <span className="annotations-sidebar__replacement-text">
                        Replace with &ldquo;{annotation.replacementText}&rdquo;
                      </span>
                    )}
                  </div>
                ) : annotation.type === 'sparkle-prompt' ? (
                  <div className="annotations-sidebar__text-annotation">
                    <span className="annotations-sidebar__context">
                      Sparkle · {annotation.field === 'imagePrompt'
                        ? 'image prompt'
                        : annotation.field === 'motionPrompt' ? 'motion prompt' : 'style'}
                    </span>
                    <span className="annotations-sidebar__selected-text">
                      &ldquo;{annotation.quotedText}&rdquo;
                    </span>
                  </div>
                ) : (
                  <div className="annotations-sidebar__text-annotation">
                    {annotation.surroundingContext.before && (
                      <span className="annotations-sidebar__context annotations-sidebar__context--before">
                        {annotation.surroundingContext.before}
                      </span>
                    )}
                    <span className="annotations-sidebar__selected-text">
                      &ldquo;{annotation.text}&rdquo;
                    </span>
                    {annotation.replacementText !== undefined && (
                      <span className="annotations-sidebar__replacement-text">
                        Replace with &ldquo;{annotation.replacementText}&rdquo;
                      </span>
                    )}
                    {annotation.surroundingContext.after && (
                      <span className="annotations-sidebar__context annotations-sidebar__context--after">
                        {annotation.surroundingContext.after}
                      </span>
                    )}
                  </div>
                )}

                <textarea
                  className="annotations-sidebar__comment"
                  defaultValue={annotation.comment}
                  placeholder="Add a comment…"
                  rows={2}
                  onBlur={(e) => handleCommentBlur(e, annotation.id)}
                  onKeyDown={handleCommentKeyDown}
                />

                <details className="annotations-sidebar__agent-context">
                  <summary>Agent context</summary>
                  <label>
                    <span>Operation</span>
                    <select
                      value={annotation.operation ?? ''}
                      onChange={(event) => onUpdateMetadata(annotation.id, {
                        operation: event.currentTarget.value
                          ? event.currentTarget.value as AnnotationOperation
                          : undefined,
                      })}
                    >
                      <option value="">Infer from request</option>
                      {OPERATION_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Work group</span>
                    <input
                      defaultValue={annotation.workGroup ?? ''}
                      placeholder="e.g. about-me-slide"
                      onBlur={(event) => onUpdateMetadata(annotation.id, { workGroup: event.currentTarget.value })}
                    />
                  </label>
                  <label>
                    <span>Depends on</span>
                    <input
                      defaultValue={annotation.dependencies ?? ''}
                      placeholder="e.g. create the new About Me slide first"
                      onBlur={(event) => onUpdateMetadata(annotation.id, { dependencies: event.currentTarget.value })}
                    />
                  </label>
                  <label>
                    <span>Done when</span>
                    <textarea
                      defaultValue={annotation.acceptanceCriteria ?? ''}
                      placeholder="Optional acceptance criteria"
                      rows={2}
                      onBlur={(event) => onUpdateMetadata(annotation.id, { acceptanceCriteria: event.currentTarget.value })}
                    />
                  </label>
                </details>

              </div>
            );
          })
        )}
      </div>

      {annotations.length > 0 && (
        <>
          <div className="annotations-sidebar__stats" aria-label="Annotation statistics">
            <span><strong>{annotations.length}</strong> total</span>
            <span><strong>{slideCount}</strong> slides</span>
            <span><strong>{elementCount}</strong> elements</span>
            <span><strong>{textCount + speakerNoteCount + sparklePromptCount}</strong> text</span>
            <span><strong>{slideOrderCount}</strong> moves</span>
          </div>
          <div className="annotations-sidebar__footer">
            {onClearCopied && <button
              className="annotations-sidebar__footer-btn"
              disabled={copiedCount === 0}
              onClick={onClearCopied}
            >Clear copied ({copiedCount})</button>}
            <button
              className="annotations-sidebar__footer-btn annotations-sidebar__footer-btn--danger"
              onClick={onClearAll}
            >
              Clear All
            </button>
            <button
              className="annotations-sidebar__footer-btn annotations-sidebar__footer-btn--primary"
              onClick={() => setConfirmingCopy(true)}
            >
              {copyStatus || `Copy All (${annotations.length})`}
            </button>
          </div>
        </>
      )}
      {confirmingCopy && (
        <CopySummaryCard
          annotations={annotations}
          presentationId={presentationId}
          totalSlides={totalSlides}
          onCopy={handleCopyAll}
          onClose={() => setConfirmingCopy(false)}
        />
      )}
    </div>
  );
};

export default AnnotationsSidebar;
