import type { FC, KeyboardEvent } from 'react';
import type {
  AspectRatio,
  PendingAnnotationDraft,
  PendingSparklePromptAnnotation,
  SparklePromptAnnotation,
} from '../types/annotation.types';
import type { SlideData } from '../types/slide.types';
import { hasAuthoredSparkleImage } from '../types/speakerNotes.types';
import type { SparklePromptField, SparklePromptInfo } from '../types/speakerNotes.types';
import { resolveSparklePromptAnchor } from '../utils/sparklePromptAnnotations';
import { getSelectionOffsets, getSurroundingContext, renderHighlightedText } from '../utils/textHighlight';
import MaterialIcon from './MaterialIcon';
import './SparklePromptCard.css';

interface SparklePromptCardProps {
  presentationId: string;
  slide: SlideData;
  slideIndex: number;
  aspectRatio: AspectRatio;
  prompt: SparklePromptInfo;
  annotations?: SparklePromptAnnotation[];
  pendingDraft?: PendingAnnotationDraft | null;
  onSetPendingDraft?: (draft: PendingAnnotationDraft) => void;
  onUpdatePendingComment?: (comment: string) => void;
  onCommitPendingDraft?: (comment: string) => void;
  onClearPendingDraft?: () => void;
  onUpdateComment?: (id: string, comment: string) => void;
  onRemoveAnnotation?: (id: string) => void;
}

const FIELD_LABELS: Record<SparklePromptField, string> = {
  style: 'Style',
  imagePrompt: 'Image prompt',
  motionPrompt: 'Motion prompt',
};

const FIELD_ORDER: SparklePromptField[] = ['style', 'imagePrompt', 'motionPrompt'];
const CONTEXT_LENGTH = 64;

function isSparkleDraft(draft: PendingAnnotationDraft | null | undefined): draft is PendingAnnotationDraft & {
  target: { type: 'sparkle-prompt'; value: PendingSparklePromptAnnotation };
} {
  return draft?.target.type === 'sparkle-prompt';
}

const SparklePromptCard: FC<SparklePromptCardProps> = ({
  presentationId,
  slide,
  slideIndex,
  aspectRatio,
  prompt,
  annotations = [],
  pendingDraft,
  onSetPendingDraft,
  onUpdatePendingComment,
  onCommitPendingDraft,
  onClearPendingDraft,
  onUpdateComment,
  onRemoveAnnotation,
}) => {
  const activeDraft = isSparkleDraft(pendingDraft)
    && pendingDraft.presentationId === presentationId
    && pendingDraft.target.value.slideId === slide.id
    ? pendingDraft
    : null;
  const hasImage = hasAuthoredSparkleImage(prompt);

  const startDraft = (element: HTMLElement, field: SparklePromptField) => {
    if (!onSetPendingDraft) return;
    const offsets = getSelectionOffsets(element);
    if (!offsets) return;
    const promptSnapshot = prompt[field];
    const quotedText = promptSnapshot.slice(offsets.start, offsets.end);
    if (!quotedText.trim()) return;
    onSetPendingDraft({
      presentationId,
      comment: '',
      target: {
        type: 'sparkle-prompt',
        value: {
          slideIndex,
          slideId: slide.id,
          slideTemplate: slide.template ?? 'Slide',
          slideTitle: slide.title ?? `Slide ${slideIndex + 1}`,
          aspectRatio,
          normalizedPosition: { x: 0, y: 0 },
          field,
          promptSnapshot,
          quotedText,
          rangeStart: offsets.start,
          rangeEnd: offsets.end,
          surroundingContext: getSurroundingContext(promptSnapshot, offsets, CONTEXT_LENGTH),
        },
      },
    });
  };

  const saveDraft = () => {
    const comment = activeDraft?.comment.trim();
    if (!comment || !onCommitPendingDraft) return;
    onCommitPendingDraft(comment);
    window.getSelection()?.removeAllRanges();
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') onClearPendingDraft?.();
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      saveDraft();
    }
  };

  return (
    <details className={`sparkle-prompt-card sparkle-prompt-card--${hasImage ? 'available' : 'unavailable'}`}>
      <summary>
        <span><MaterialIcon name="auto_awesome" size="small" /> Sparkle</span>
      </summary>
      <div className="sparkle-prompt-card__fields">
        {FIELD_ORDER.map((field) => {
          const fieldAnnotations = annotations.filter((annotation) => annotation.field === field);
          const resolved = fieldAnnotations.map((annotation) => ({
            annotation,
            anchor: resolveSparklePromptAnchor(annotation, prompt[field]),
          }));
          const ranges = resolved.filter((item) => item.anchor.resolved).map((item) => item.anchor);
          const drafting = activeDraft?.target.value.field === field;
          return (
            <section key={field} className="sparkle-prompt-card__field">
              <h4>{FIELD_LABELS[field]}</h4>
              <p onMouseUp={(event) => startDraft(event.currentTarget, field)}>
                {renderHighlightedText(prompt[field], ranges)}
              </p>
              {drafting && (
                <div className="sparkle-prompt-card__draft">
                  <span>Selected text: “{activeDraft.target.value.quotedText}”</span>
                  <textarea
                    autoFocus
                    value={activeDraft.comment}
                    onChange={(event) => onUpdatePendingComment?.(event.currentTarget.value)}
                    onKeyDown={handleDraftKeyDown}
                    placeholder="What should change?"
                    rows={3}
                  />
                  <div>
                    <button type="button" onClick={onClearPendingDraft}>Cancel</button>
                    <button type="button" onClick={saveDraft} disabled={!activeDraft.comment.trim()}>Add annotation</button>
                  </div>
                </div>
              )}
              {resolved.map(({ annotation, anchor }) => (
                <div key={annotation.id} className={`sparkle-prompt-card__annotation ${anchor.resolved ? '' : 'sparkle-prompt-card__annotation--unresolved'}`}>
                  <span>{anchor.resolved ? `“${annotation.quotedText}”` : `Unresolved: “${annotation.quotedText}”`}</span>
                  <textarea
                    defaultValue={annotation.comment}
                    rows={2}
                    onBlur={(event) => onUpdateComment?.(annotation.id, event.currentTarget.value)}
                  />
                  {onRemoveAnnotation && (
                    <button type="button" onClick={() => onRemoveAnnotation(annotation.id)} aria-label="Remove Sparkle prompt annotation">
                      <MaterialIcon name="delete" size="small" />
                    </button>
                  )}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </details>
  );
};

export default SparklePromptCard;
