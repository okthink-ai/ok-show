import type { FC, CSSProperties } from 'react';
import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import './AnnotationBadge.css';

interface AnnotationBadgeProps {
  number: number;
  isText: boolean;
  intent?: 'fix' | 'change' | 'question';
  comment: string;
  normalizedPosition: { x: number; y: number };
  selector?: string;
  /** Shared DOMRect of .slide--active, provided by the parent via useSlideRect */
  slideRect: DOMRect | null;
  isNew?: boolean;
  onBadgeClick?: () => void;
}

interface BadgePosition {
  x: number;
  y: number;
}

const INTENT_COLORS: Record<string, string> = {
  fix: '#ef4444',
  change: '#f59e0b',
  question: '#3b82f6',
};

const getColor = (intent?: string): string =>
  intent ? (INTENT_COLORS[intent] ?? 'var(--color-surface-active)') : 'var(--color-surface-active)';

const AnnotationBadge: FC<AnnotationBadgeProps> = ({
  number,
  isText,
  intent,
  comment,
  normalizedPosition,
  selector,
  slideRect,
  isNew = false,
  onBadgeClick,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  // Derive position from the shared slideRect — no independent DOM observation needed
  const position = useMemo((): BadgePosition | null => {
    if (!slideRect) return null;

    // If a selector is given, try to snap to the element's top-right corner
    if (selector) {
      const slideEl = document.querySelector('.slide--active') as HTMLElement | null;
      if (slideEl) {
        try {
          const targetEl = slideEl.querySelector(selector) as HTMLElement | null;
          if (targetEl) {
            const targetRect = targetEl.getBoundingClientRect();
            return { x: targetRect.right, y: targetRect.top };
          }
        } catch { /* selector may not be valid CSS (e.g. "(no class)") */ }
      }
    }

    // Fall back to normalized position
    return {
      x: slideRect.left + normalizedPosition.x * slideRect.width,
      y: slideRect.top + normalizedPosition.y * slideRect.height,
    };
  }, [slideRect, normalizedPosition, selector]);

  // Trigger entrance visibility after mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!position) return null;

  const label = isText ? 'T' : String(number);
  const color = getColor(intent);
  const truncatedComment = comment.length > 60 ? `${comment.slice(0, 60)}…` : comment;

  const style: CSSProperties & { '--badge-color': string; '--badge-index': number } = {
    left: position.x,
    top: position.y,
    '--badge-color': color,
    '--badge-index': number,
  };

  const badgeClassNames = [
    'annotation-badge',
    isNew ? 'annotation-badge--new' : '',
    isVisible ? 'annotation-badge--visible' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div
      className={badgeClassNames}
      style={style}
      onClick={onBadgeClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onBadgeClick?.();
        }
      }}
      aria-label={`Annotation ${label}: ${comment}`}
    >
      <span className="annotation-badge__label">{label}</span>
      <div className="annotation-badge__tooltip" role="tooltip">
        {truncatedComment}
      </div>
    </div>,
    document.body
  );
};

export default AnnotationBadge;
