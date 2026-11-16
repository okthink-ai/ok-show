import { useRef } from 'react';
import type { FC, KeyboardEvent } from 'react';
import type {
  AspectRatio,
  PendingAnnotationDraft,
  PendingSpeakerNoteAnnotation,
  SpeakerNoteAnnotation,
} from '../types/annotation.types';
import type { SlideData } from '../types/slide.types';
import {
  REPLACEMENT_COMMENT,
  buildDeletionDraft,
  buildRangeDraft,
  buildReplacementDraft,
  planReplacementSave,
  replacementAnnotations,
} from '../utils/speakerNoteDrafts';
import type { SpeakerNoteLocation } from '../utils/speakerNoteDrafts';
import { getSelectionOffsets, renderHighlightedText } from '../utils/textHighlight';
import type { TextRange } from '../utils/textHighlight';
import MaterialIcon from './MaterialIcon';

interface SpeakerNoteItemProps {
  presentationId: string;
  slide: SlideData;
  slideIndex: number;
  aspectRatio: AspectRatio;
  noteIndex: number;
  note: string;
  /** Saved annotations whose anchors resolve to this bullet. */
  attached: SpeakerNoteAnnotation[];
  /** Resolved character ranges of this bullet's range annotations. */
  ranges: TextRange[];
  /** The pending speaker-note draft, when it targets this bullet. */
  draft: PendingSpeakerNoteAnnotation | null;
  draftComment: string;
  onSetPendingDraft: (draft: PendingAnnotationDraft) => void;
  onUpdatePendingComment: (comment: string) => void;
  onUpdatePendingReplacementText: (replacementText: string) => void;
  onCommitPendingDraft: (comment: string) => void;
  onClearPendingDraft: () => void;
  onCreateSpeakerNoteDeletion: (draft: PendingAnnotationDraft) => void;
  onUpdateComment: (id: string, comment: string) => void;
  onUpdateReplacementText: (id: string, replacementText: string) => void;
  onRemoveAnnotation: (id: string) => void;
}

/**
 * One speaker-note bullet: select text to comment on a passage, double-click
 * to rewrite the bullet inline, or mark it for deletion.
 */
const SpeakerNoteItem: FC<SpeakerNoteItemProps> = ({
  presentationId,
  slide,
  slideIndex,
  aspectRatio,
  noteIndex,
  note,
  attached,
  ranges,
  draft,
  draftComment,
  onSetPendingDraft,
  onUpdatePendingComment,
  onUpdatePendingReplacementText,
  onCommitPendingDraft,
  onClearPendingDraft,
  onCreateSpeakerNoteDeletion,
  onUpdateComment,
  onUpdateReplacementText,
  onRemoveAnnotation,
}) => {
  // Set when Escape cancels the inline editor, so the blur that follows as
  // the editor unmounts cannot save the abandoned text.
  const cancelledEditRef = useRef(false);
  const location: SpeakerNoteLocation = { presentationId, slide, slideIndex, aspectRatio, noteIndex, note };

  const itemMarked = attached.some(
    (annotation) => annotation.target === 'item' && annotation.operation !== 'remove',
  );
  const markedForDeletion = attached.some(
    (annotation) => annotation.target === 'item' && annotation.operation === 'remove',
  );
  const replacements = replacementAnnotations(attached);
  const replacementAnnotation = replacements.at(-1);
  const drafting = draft !== null && draft.replacementText === undefined;
  const replacing = draft?.target === 'item' && draft.replacementText !== undefined;
  const displayedNote = replacing
    ? draft.replacementText ?? note
    : replacementAnnotation?.replacementText ?? note;

  const startRangeDraft = (element: HTMLElement) => {
    const offsets = getSelectionOffsets(element);
    if (!offsets) return;
    const rangeDraft = buildRangeDraft(location, offsets);
    if (rangeDraft) onSetPendingDraft(rangeDraft);
  };

  const startReplacementDraft = () => {
    onSetPendingDraft(buildReplacementDraft(location, displayedNote));
    window.getSelection()?.removeAllRanges();
  };

  const saveReplacementDraft = () => {
    if (cancelledEditRef.current) return;
    if (!draft || draft.target !== 'item' || draft.replacementText === undefined) return;
    const plan = planReplacementSave(draft.replacementText, note, replacements);
    switch (plan.kind) {
      case 'discard':
        onClearPendingDraft();
        return;
      case 'create':
        onCommitPendingDraft(REPLACEMENT_COMMENT);
        return;
      case 'update':
        onUpdateReplacementText(plan.id, plan.replacementText);
        plan.removeIds.forEach(onRemoveAnnotation);
        onClearPendingDraft();
        return;
      case 'remove':
        plan.ids.forEach(onRemoveAnnotation);
        onClearPendingDraft();
    }
  };

  const cancelReplacementDraft = () => {
    cancelledEditRef.current = true;
    onClearPendingDraft();
  };

  const saveDraft = () => {
    const comment = draftComment.trim();
    if (!draft || !comment) return;
    onCommitPendingDraft(comment);
    window.getSelection()?.removeAllRanges();
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      onClearPendingDraft();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      saveDraft();
    }
  };

  return (
    <li
      data-speaker-note-index={noteIndex}
      className={[
        itemMarked && 'speaker-notes-sidebar__note--marked',
        markedForDeletion && 'speaker-notes-sidebar__note--deleted',
      ].filter(Boolean).join(' ')}
    >
      <div className="speaker-notes-sidebar__note-row">
        {replacing ? (
          <textarea
            autoFocus
            className="speaker-notes-sidebar__inline-edit"
            value={draft.replacementText ?? ''}
            onChange={(event) => onUpdatePendingReplacementText(event.target.value)}
            onFocus={() => { cancelledEditRef.current = false; }}
            onBlur={saveReplacementDraft}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                cancelReplacementDraft();
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            rows={Math.max(2, (draft.replacementText ?? '').split('\n').length)}
            aria-label={`Edit speaker note ${noteIndex + 1} on slide ${slideIndex + 1}`}
          />
        ) : (
          <>
            <p
              className={replacementAnnotation ? 'speaker-notes-sidebar__note-replacement' : undefined}
              onMouseUp={(event) => startRangeDraft(event.currentTarget)}
              onDoubleClick={startReplacementDraft}
              onTouchEnd={(event) => {
                const element = event.currentTarget;
                window.setTimeout(() => startRangeDraft(element), 0);
              }}
            >
              {replacementAnnotation ? displayedNote : renderHighlightedText(note, ranges)}
            </p>
            <button
              type="button"
              className="speaker-notes-sidebar__delete-note"
              onClick={(event) => {
                event.stopPropagation();
                onCreateSpeakerNoteDeletion(buildDeletionDraft(location));
              }}
              aria-label={`Annotate speaker note ${noteIndex + 1} on slide ${slideIndex + 1} for deletion`}
              title="Annotate bullet for deletion"
            >
              <MaterialIcon name="delete" size="small" />
            </button>
          </>
        )}
      </div>
      {drafting && (
        <div className="speaker-notes-sidebar__draft">
          <span>Selected text: “{draft.quotedText}”</span>
          {(draft.surroundingContext.before || draft.surroundingContext.after) && (
            <small className="speaker-notes-sidebar__draft-context">
              {draft.surroundingContext.before && `…${draft.surroundingContext.before}`}
              <mark>{draft.quotedText}</mark>
              {draft.surroundingContext.after && `${draft.surroundingContext.after}…`}
            </small>
          )}
          <textarea
            autoFocus
            value={draftComment}
            onChange={(event) => onUpdatePendingComment(event.target.value)}
            onKeyDown={handleDraftKeyDown}
            placeholder="What should change?"
            rows={3}
          />
          <div>
            <button type="button" onClick={onClearPendingDraft}>Cancel</button>
            <button type="button" onClick={saveDraft} disabled={!draftComment.trim()}>Add annotation</button>
          </div>
        </div>
      )}
      {attached.filter(
        (annotation) => annotation.replacementText === undefined && annotation.operation !== 'remove',
      ).map((annotation) => (
        <div key={annotation.id} className="speaker-notes-sidebar__annotation">
          <span>{annotation.target === 'range' ? `“${annotation.quotedText}”` : 'Whole bullet'}</span>
          <textarea
            defaultValue={annotation.comment}
            rows={2}
            onBlur={(event) => onUpdateComment(annotation.id, event.currentTarget.value)}
          />
          <button type="button" onClick={() => onRemoveAnnotation(annotation.id)} aria-label="Remove speaker-note annotation">
            <MaterialIcon name="delete" size="small" />
          </button>
        </div>
      ))}
    </li>
  );
};

export default SpeakerNoteItem;
