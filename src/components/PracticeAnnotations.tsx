import { useEffect, useState } from 'react';
import { manuscriptFile } from '../project/paths';
import type { MouseEvent, RefObject } from 'react';
import type { SlideData } from '../types/slide.types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { clearPending, markAnnotationsCopied, setPendingDraft, updatePendingComment } from '../store/annotationsSlice';
import { commitAnnotation } from '../store/annotationThunks';
import { CommentPopup } from './CommentPopup';
import MaterialIcon from './MaterialIcon';
import { copyText } from '../utils/copyText';
import CopySummaryCard from './CopySummaryCard';

export interface PracticePassage { text: string; sourceLine: number; sourceEndLine: number; preview: string }

/** Practice supplies a source anchor; editing and saving use the shared annotation flow. */
export default function PracticeAnnotations({ presentationId, totalSlides, slide, slideIndex, capturePassage, onOpenChange, passageButtonRef }: {
  passageButtonRef?: RefObject<HTMLButtonElement | null>;
  presentationId: string;
  totalSlides?: number;
  slide: SlideData;
  slideIndex: number;
  capturePassage: () => PracticePassage;
  onOpenChange: (open: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const all = useAppSelector(state => state.annotations.annotations);
  const annotations = all.filter(item => item.presentationId === presentationId);
  const [copyStatus, setCopyStatus] = useState('');
  useEffect(() => {
    if (!copyStatus) return;
    const timer = window.setTimeout(() => setCopyStatus(''), 1800);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);
  const [confirmingCopy, setConfirmingCopy] = useState(false);
  const copy = async (packet: string) => {
    try {
      const copied = await copyText(packet);
      if (copied) dispatch(markAnnotationsCopied({ annotations, copiedAt: Date.now() }));
      setCopyStatus(copied ? 'Copied' : 'Copy failed');
      return copied;
    }
    catch { setCopyStatus('Copy failed'); return false; }
  };
  const pending = useAppSelector(state => state.annotations.pendingDraft);
  const draft = pending?.presentationId === presentationId && pending.target.type === 'canvas-text' && pending.target.value.source === 'practice' ? pending : null;
  const target = draft?.target.type === 'canvas-text' ? draft.target.value : null;
  useEffect(() => { onOpenChange(Boolean(draft)); }, [draft, onOpenChange]);

  const open = (event: MouseEvent<HTMLButtonElement>) => {
    if (pending) return; // Never overwrite a draft from another annotation surface.
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.detail === 0 ? { x: bounds.left, y: bounds.bottom } : { x: event.clientX, y: event.clientY };
    const passage = capturePassage();
    const selected = window.getSelection();
    const selectionInReader = selected?.anchorNode?.parentElement?.closest('.talk-practice__content');
    const text = selectionInReader && selected?.toString().trim() || passage.text;
    dispatch(setPendingDraft({ presentationId, comment: '', target: { type: 'canvas-text', value: {
      source: 'practice',
      text,
      context: { before: '', after: '', fullText: passage.text },
      practice: { target: 'talk', sourceLine: passage.sourceLine, sourceEndLine: passage.sourceEndLine, sourceText: passage.text },
      slideContext: { slideId: slide.id, slideIndex: slideIndex, slideTitle: slide.title ?? slide.id, slideTemplate: slide.template ?? 'Unknown', aspectRatio: '16:9' },
      clickPosition: position, normalizedPosition: { x: .5, y: .5 },
    } } }));
  };
  return <>
    <button ref={passageButtonRef} type="button" aria-label="Annotate passage" title="Annotate selected text or the current passage" disabled={Boolean(pending) && !draft} onClick={event => open(event)}><MaterialIcon name="add_comment" size="small" /></button>
    <button type="button" className="talk-practice__copy" disabled={!annotations.length} onClick={() => setConfirmingCopy(true)} aria-label={`Copy annotations (${annotations.length})`}>
      <MaterialIcon name="content_copy" size="small" /><span>{copyStatus || 'Copy annotations'} ({annotations.length})</span>
    </button>
    <span className="talk-practice__copy-status" role="status">{copyStatus}</span>
    {confirmingCopy && <CopySummaryCard annotations={annotations} presentationId={presentationId} totalSlides={totalSlides} onCopy={copy} onClose={() => setConfirmingCopy(false)} />}
    {draft && target && <CommentPopup position={target.clickPosition} initialComment={draft.comment}
      onCommentChange={comment => dispatch(updatePendingComment(comment))}
      onConfirm={comment => { void dispatch(commitAnnotation(comment)); }}
      onCancel={() => dispatch(clearPending())}
      context={{ slideNumber: target.slideContext.slideIndex + 1, slideTemplate: target.practice?.target === 'talk' ? `${manuscriptFile(presentationId)}:${target.practice.sourceLine}` : target.slideContext.slideTemplate, layout: 'desktop', selectedText: target.text }} />}
  </>;
}
