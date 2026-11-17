import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, FC } from 'react';
import { textDirection } from '../translation/captionState';
import { recentCaptionLines } from '../translation/captionLayout';
import type { CaptionSnapshot } from '../translation/protocol';
import type { CaptionLayoutLine } from '../translation/captionLayout';
import './LiveCaptionOverlay.css';

interface LiveCaptionOverlayProps {
  caption: CaptionSnapshot | null;
  visible: boolean;
  fontSize: number;
  preview?: boolean;
  condensed?: boolean;
}

const LiveCaptionOverlay: FC<LiveCaptionOverlayProps> = ({ caption, visible, fontSize, preview = false, condensed = false }) => {
  const [announcement, setAnnouncement] = useState('');
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const animationRef = useRef({ runId: '', text: '', newFromOrdinal: 0 });
  const [lines, setLines] = useState<CaptionLayoutLine[]>([]);
  const useMeasuredLines = !preview || condensed;
  useEffect(() => {
    if (!caption?.translatedText) { setAnnouncement(''); return; }
    const timeout = window.setTimeout(() => setAnnouncement(caption.translatedText), 1000);
    return () => window.clearTimeout(timeout);
  }, [caption?.translatedText]);
  useLayoutEffect(() => {
    const paragraph = paragraphRef.current;
    if (!paragraph || !caption?.translatedText || !useMeasuredLines) {
      setLines([]);
      return;
    }
    let cancelled = false;
    const layout = () => {
      const style = getComputedStyle(paragraph);
      const width = paragraph.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context) context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const approximateCharacterWidth = Number.parseFloat(style.fontSize) * 0.55;
      const next = recentCaptionLines(caption.translatedText, width, (value) => context?.measureText(value).width ?? value.length * approximateCharacterWidth);
      if (!cancelled) setLines(next);
    };
    layout();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(layout);
    observer?.observe(paragraph);
    void document.fonts?.ready.then(layout);
    return () => { cancelled = true; observer?.disconnect(); };
  }, [caption?.translatedText, condensed, fontSize, preview, useMeasuredLines]);
  if (!visible || !caption?.translatedText) return null;
  const previous = animationRef.current;
  const currentWordCount = [...caption.translatedText.matchAll(/\S+/gu)].length;
  if (previous.runId !== caption.runId || previous.text !== caption.translatedText) {
    const appending = previous.runId === caption.runId && caption.translatedText.startsWith(previous.text);
    animationRef.current = {
      runId: caption.runId,
      text: caption.translatedText,
      newFromOrdinal: previous.runId === '' ? 0
        : appending ? [...previous.text.matchAll(/\S+/gu)].length : Math.max(0, currentWordCount - 1),
    };
  }
  const newFromOrdinal = animationRef.current.newFromOrdinal;
  let animatedWord = 0;
  const measuredText = lines.flatMap((line, lineIndex) => [
    ...(lineIndex > 0 ? [<br key={`line-${line.words[0]?.start ?? lineIndex}`} />] : []),
    ...line.words.map((word) => {
      const isNew = word.ordinal >= newFromOrdinal;
      const order = isNew ? animatedWord++ : 0;
      return <span
        className={`live-caption-overlay__word${isNew ? ' live-caption-overlay__word--new' : ''}`}
        style={isNew ? { '--caption-word-order': Math.min(order, 6) } as CSSProperties : undefined}
        key={`${caption.runId}:${word.ordinal}:${word.part}`}
      >{word.spaceBefore ? ' ' : ''}{word.text}</span>;
    }),
  ]);
  return (
    <div
      className={`live-caption-overlay${preview ? ' live-caption-overlay--preview' : ''}`}
      style={{ '--caption-font-size': `${fontSize}px` } as CSSProperties}
      lang={caption.targetLanguage}
      dir={textDirection(caption.targetLanguage)}
      data-stability={caption.stability}
    >
      <p ref={paragraphRef} aria-hidden="true"><span className="live-caption-overlay__text">{useMeasuredLines ? measuredText : caption.translatedText}</span></p>
      <span className="live-caption-overlay__sr" aria-live="polite">{announcement}</span>
    </div>
  );
};

export default LiveCaptionOverlay;
