import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { topLayerHost } from '../utils/topLayerHost';
import './CommentPopup.css';

export interface CommentPopupContext {
  slideNumber: number;
  slideTemplate: string;
  layout: 'desktop' | 'mobile';
  selectedText?: string;
  surroundingContext?: { before: string; after: string };
}

interface CommentPopupProps {
  position: { x: number; y: number };
  onConfirm: (comment: string) => void;
  onCancel: () => void;
  initialComment?: string;
  onCommentChange?: (comment: string) => void;
  context?: CommentPopupContext;
}

const POPUP_WIDTH = 280;
const POPUP_HEIGHT = 280;
const EDGE_MARGIN = 12;

function clampPosition(x: number, y: number): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const clampedX = Math.min(x, vw - POPUP_WIDTH - EDGE_MARGIN);
  const clampedY = Math.min(y, vh - POPUP_HEIGHT - EDGE_MARGIN);

  return {
    x: Math.max(EDGE_MARGIN, clampedX),
    y: Math.max(EDGE_MARGIN, clampedY),
  };
}

export function CommentPopup({
  position,
  onConfirm,
  onCancel,
  initialComment = '',
  onCommentChange,
  context,
}: CommentPopupProps) {
  const [comment, setComment] = useState(initialComment);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  // Chosen once, so the popup stays put if a dialog opens behind it.
  const [host] = useState(topLayerHost);

  const clampedPos = clampPosition(position.x, position.y);

  // Auto-focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [comment]);

  // Click-outside to cancel. The inspector's click handler checks
  // lastPopupDismissRef to skip re-triggering an annotation for this same
  // click, so we no longer need to swallow the event globally here.
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onCancel();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onCancel]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (comment.trim()) {
        onConfirm(comment.trim());
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  return createPortal(
    <div
      ref={popupRef}
      className="comment-popup"
      style={{ left: clampedPos.x, top: clampedPos.y }}
    >
      <label className="comment-popup__label">What should change?</label>

      {context && (
        <div className="comment-popup__context">
          <span>Slide {context.slideNumber}</span>
          <span className="comment-popup__context-sep">/</span>
          <span>{context.slideTemplate}</span>
          <span className="comment-popup__context-sep">/</span>
          <span>{context.layout}</span>
        </div>
      )}

      {context?.selectedText && (
        <div className="comment-popup__selection">
          <span className="comment-popup__selection-label">Selected text</span>
          <blockquote>“{context.selectedText}”</blockquote>
          {(context.surroundingContext?.before || context.surroundingContext?.after) && (
            <p>
              {context.surroundingContext.before && `…${context.surroundingContext.before}`}
              <mark>{context.selectedText}</mark>
              {context.surroundingContext.after && `${context.surroundingContext.after}…`}
            </p>
          )}
        </div>
      )}

      <textarea
        ref={textareaRef}
        className="comment-popup__textarea"
        rows={3}
        value={comment}
        onChange={(e) => {
          setComment(e.target.value);
          onCommentChange?.(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Describe the change…"
      />

      <p className="comment-popup__hint">Enter to confirm · Esc to cancel</p>
    </div>,
    host
  );
}
