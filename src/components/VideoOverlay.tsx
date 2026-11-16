import { useState, useRef, useCallback } from 'react';
import type { FC } from 'react';
import './VideoOverlay.css';

interface VideoOverlayProps {
  src: string;
  onClose: () => void;
}

const VideoOverlay: FC<VideoOverlayProps> = ({ src, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  return (
    <div className="video-overlay" onClick={handleBackdropClick}>
      <div className="video-overlay__container">
        <video
          ref={videoRef}
          className="video-overlay__video"
          src={src}
          controls
          autoPlay
        />
      </div>
      <button className="video-overlay__close" onClick={onClose}>✕</button>
    </div>
  );
};

interface PlayButtonProps {
  label: string;
  /** A second, quieter line under the label (for example, the video length). */
  subtitle?: string;
  onClick: () => void;
  portrait?: boolean;
}

const PlayButton: FC<PlayButtonProps> = ({ label, subtitle, onClick, portrait }) => (
  <button
    className={`video-play-button${portrait ? ' video-play-button--portrait' : ''}`}
    onClick={(e) => { e.stopPropagation(); onClick(); }}
  >
    <svg className="video-play-button__icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
    <span className="video-play-button__text">
      <span className="video-play-button__label">{label}</span>
      {subtitle && <span className="video-play-button__subtitle">{subtitle}</span>}
    </span>
  </button>
);

// This hook intentionally lives beside the overlay it constructs.
// eslint-disable-next-line react-refresh/only-export-components
export function useVideoOverlay(src: string) {
  const [isOpen, setIsOpen] = useState(false);

  const overlay = isOpen ? (
    <VideoOverlay src={src} onClose={() => setIsOpen(false)} />
  ) : null;

  return {
    overlay,
    openVideo: () => setIsOpen(true),
  };
}

export { PlayButton };
export default VideoOverlay;
