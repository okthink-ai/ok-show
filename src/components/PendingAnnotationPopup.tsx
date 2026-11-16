import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { updatePendingComment } from '../store/annotationsSlice';
import type { PendingAnnotationDraft } from '../types/annotation.types';
import { CommentPopup } from './CommentPopup';
import type { CommentPopupContext } from './CommentPopup';

interface PendingAnnotationPopupProps {
  presentationId: string;
  onConfirm: (comment: string) => void;
  onCancel: () => void;
}

/**
 * Where the shared popup opens. Practice passages, speaker-note bullets, and
 * Sparkle fields carry their own inline editors, so they get no popup here.
 */
function popupPosition(draft: PendingAnnotationDraft): { x: number; y: number } | null {
  const { target } = draft;
  if (target.type === 'speaker-note' || target.type === 'sparkle-prompt') return null;
  if (target.type === 'canvas-text' && target.value.source === 'practice') return null;
  return target.value.clickPosition;
}

function popupContext(draft: PendingAnnotationDraft): CommentPopupContext | undefined {
  const { target } = draft;
  switch (target.type) {
    case 'speaker-note':
    case 'sparkle-prompt':
      return undefined;
    case 'outline':
      return {
        slideNumber: target.value.slideIndex + 1,
        slideTemplate: target.value.slideTemplate,
        layout: target.value.aspectRatio === '9:16' ? 'mobile' : 'desktop',
        selectedText: target.value.text,
      };
    case 'element':
      return {
        slideNumber: target.value.slideContext.slideIndex + 1,
        slideTemplate: target.value.slideContext.slideTemplate,
        layout: target.value.slideContext.aspectRatio === '9:16' ? 'mobile' : 'desktop',
        selectedText: target.value.capturedTextContent,
      };
    default:
      return {
        slideNumber: target.value.slideContext.slideIndex + 1,
        slideTemplate: target.value.slideContext.slideTemplate,
        layout: target.value.slideContext.aspectRatio === '9:16' ? 'mobile' : 'desktop',
        selectedText: target.value.text,
        surroundingContext: target.value.context,
      };
  }
}

/** The comment popup for an inspector or outline annotation that is still a draft. */
export default function PendingAnnotationPopup({ presentationId, onConfirm, onCancel }: PendingAnnotationPopupProps) {
  const dispatch = useAppDispatch();
  const draft = useAppSelector(state => state.annotations.pendingDraft);
  const handleChange = useCallback((comment: string) => dispatch(updatePendingComment(comment)), [dispatch]);
  if (!draft || draft.presentationId !== presentationId) return null;
  const position = popupPosition(draft);
  if (!position) return null;
  return (
    <CommentPopup
      position={position}
      onConfirm={onConfirm}
      onCancel={onCancel}
      initialComment={draft.comment}
      onCommentChange={handleChange}
      context={popupContext(draft)}
    />
  );
}
