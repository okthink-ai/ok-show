import { useEffect, useState } from 'react';
import type { CSSProperties, FC } from 'react';
import { textDirection } from '../translation/captionState';
import type { CaptionSnapshot } from '../translation/protocol';
import './LiveCaptionOverlay.css';

interface LiveCaptionOverlayProps {
  caption: CaptionSnapshot | null;
  visible: boolean;
  fontSize: number;
  preview?: boolean;
}

const LiveCaptionOverlay: FC<LiveCaptionOverlayProps> = ({ caption, visible, fontSize, preview = false }) => {
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (!caption?.translatedText) { setAnnouncement(''); return; }
    const timeout = window.setTimeout(() => setAnnouncement(caption.translatedText), 1000);
    return () => window.clearTimeout(timeout);
  }, [caption?.translatedText]);
  if (!visible || !caption?.translatedText) return null;
  return (
    <div
      className={`live-caption-overlay${preview ? ' live-caption-overlay--preview' : ''}`}
      style={{ '--caption-font-size': `${fontSize}px` } as CSSProperties}
      lang={caption.targetLanguage}
      dir={textDirection(caption.targetLanguage)}
      data-stability={caption.stability}
    >
      <p aria-hidden="true">{caption.translatedText}</p>
      <span className="live-caption-overlay__sr" aria-live="polite">{announcement}</span>
    </div>
  );
};

export default LiveCaptionOverlay;
