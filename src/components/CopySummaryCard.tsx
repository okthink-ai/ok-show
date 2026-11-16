import type { FC, KeyboardEvent as ReactKeyboardEvent, MouseEvent } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Annotation } from '../types/annotation.types';
import { formatAnnotations } from '../utils/annotationClipboard';
import { summarizeAnnotations } from '../utils/annotationSummary';
import MaterialIcon from './MaterialIcon';
import './CopySummaryCard.css';

const CLOSE_AFTER_COPY_MS = 1200;
const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

interface CopySummaryCardProps {
  annotations: Annotation[];
  presentationId: string;
  /** Deck length, for "slides annotated". Omitted when the caller does not know it. */
  totalSlides?: number;
  /**
   * Copies the exact packet shown in the preview. Returns false when the
   * clipboard refused it; the card then stays open and says so.
   */
  onCopy: (packet: string) => boolean | void | Promise<boolean | void>;
  onClose: () => void;
}

/**
 * Confirmation step before copying the review packet: what is in it, the exact
 * Markdown, and one Copy button. Modal: focus is trapped, Escape closes, and
 * focus returns to whatever opened it.
 */
const CopySummaryCard: FC<CopySummaryCardProps> = ({ annotations, presentationId, totalSlides, onCopy, onClose }) => {
  const titleId = useId();
  const [showPreview, setShowPreview] = useState(false);
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const packet = useMemo(() => formatAnnotations(annotations, presentationId), [annotations, presentationId]);
  const summary = useMemo(() => summarizeAnnotations(annotations), [annotations]);

  // Escape closes. Capturing on window keeps it from also reaching handlers
  // behind the dialog, such as an inline editor that cancels on Escape.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // Move focus in on open and back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (status !== 'copied') return;
    const timer = window.setTimeout(() => onCloseRef.current(), CLOSE_AFTER_COPY_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  const trapTab = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const handleCopy = async () => {
    try {
      const result = await onCopy(packet);
      setStatus(result === false ? 'failed' : 'copied');
    } catch { setStatus('failed'); }
  };

  const slidesLabel = totalSlides ? `${summary.slidesAnnotated} / ${totalSlides}` : String(summary.slidesAnnotated);

  return createPortal(
    <div className="copy-summary-overlay" onClick={handleBackdropClick} role="presentation">
      <div
        className="copy-summary-card"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
      >
        <div className="copy-summary-card__header">
          <h2 className="copy-summary-card__title" id={titleId}>
            <span aria-hidden="true"><MaterialIcon name="summarize" size="small" className="copy-summary-card__title-icon" /></span>
            Copy review packet
          </h2>
          <button className="copy-summary-card__close" onClick={onClose} aria-label="Close" type="button">
            <span aria-hidden="true"><MaterialIcon name="close" size="small" /></span>
          </button>
        </div>

        <div className="copy-summary-card__body">
          <div className="copy-summary-card__stats">
            <div className="copy-summary-card__stat-group">
              <div className="copy-summary-card__stat-label">Annotations</div>
              <div className="copy-summary-card__stat-value copy-summary-card__stat-value--accent" data-testid="copy-summary-total">{summary.total}</div>
            </div>
            <div className="copy-summary-card__stat-group">
              <div className="copy-summary-card__stat-label">Slides annotated</div>
              <div className="copy-summary-card__stat-value" data-testid="copy-summary-slides">{slidesLabel}</div>
            </div>
          </div>

          <div className="copy-summary-card__divider" />
          <div className="copy-summary-card__section-label">By target</div>
          <ul className="copy-summary-card__breakdown" aria-label="Annotations by target">
            {summary.byKind.map(row => (
              <li className="copy-summary-card__breakdown-row" key={row.kind} data-kind={row.kind}>
                <span aria-hidden="true"><MaterialIcon name={row.icon} size="small" className="copy-summary-card__breakdown-icon" /></span>
                <span className="copy-summary-card__breakdown-name">{row.label}</span>
                <span className="copy-summary-card__breakdown-count">{row.count}</span>
              </li>
            ))}
            {summary.byKind.length === 0 && <li className="copy-summary-card__empty-row">No annotations yet</li>}
          </ul>

          {summary.byIntent.length > 0 && (
            <>
              <div className="copy-summary-card__divider" />
              <div className="copy-summary-card__section-label">By intent</div>
              <ul className="copy-summary-card__breakdown" aria-label="Annotations by intent">
                {summary.byIntent.map(row => (
                  <li className="copy-summary-card__breakdown-row" key={row.intent ?? 'none'} data-intent={row.intent ?? 'none'}>
                    <span className={`copy-summary-card__intent-dot copy-summary-card__intent-dot--${row.intent ?? 'none'}`} />
                    <span className="copy-summary-card__breakdown-name">{row.label}</span>
                    <span className="copy-summary-card__breakdown-count">{row.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="copy-summary-card__divider" />
          <button
            className="copy-summary-card__preview-toggle"
            onClick={() => setShowPreview(value => !value)}
            aria-expanded={showPreview}
            type="button"
          >
            <span aria-hidden="true"><MaterialIcon name={showPreview ? 'expand_less' : 'expand_more'} size="small" /></span>
            {showPreview ? 'Hide preview' : 'Show preview'}
          </button>
          {showPreview && (
            <pre className="copy-summary-card__preview" aria-label="Packet preview" tabIndex={0}>{packet}</pre>
          )}
        </div>

        <div className="copy-summary-card__actions">
          <span className="copy-summary-card__status">{status === 'failed' && <span role="alert">Copy failed</span>}</span>
          <button className="copy-summary-card__btn copy-summary-card__btn--secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="copy-summary-card__btn copy-summary-card__btn--primary"
            onClick={() => void handleCopy()}
            disabled={annotations.length === 0 || status === 'copied'}
            type="button"
          >
            {status === 'copied'
              ? <><span aria-hidden="true"><MaterialIcon name="check" size="small" /></span>Copied</>
              : <><span aria-hidden="true"><MaterialIcon name="content_copy" size="small" /></span>Copy to clipboard</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CopySummaryCard;
