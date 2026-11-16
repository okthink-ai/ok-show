import { useState, useRef, useCallback } from 'react';
import type { FC, ReactNode } from 'react';
import type { BaseSlideProps } from '../../types/slide.types';
import SlideHeader from './SlideHeader';
import './VideoSlide.css';

interface VideoSlideProps extends BaseSlideProps {
  label?: string;
  title: string;
  subtitle?: string;
  videoUrl: string;
  description?: ReactNode;
}

const VideoSlide: FC<VideoSlideProps> = ({
  orientation = 'landscape',
  label,
  title,
  subtitle,
  videoUrl,
  description,
}) => {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPlaying(true);
    requestAnimationFrame(() => videoRef.current?.play());
  }, []);

  const videoPlayer = (
    <div className="video-slide__player animate-fade-in delay-300">
      <div className="video-slide__player-inner">
        <video
          ref={videoRef}
          className="video-slide__video"
          src={videoUrl}
          controls={playing}
          preload="metadata"
        />
        {!playing && (
          <div className="video-slide__poster" onClick={handlePlay}>
            <div className="video-slide__play-icon">
              <svg viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (description && orientation === 'landscape') {
    return (
      <div className="video-slide video-slide--landscape video-slide--with-desc">
        <SlideHeader orientation={orientation} label={label} title={title} subtitle={subtitle} />
        {videoPlayer}
        <div className="video-slide__description video-slide__description--landscape animate-slide-up delay-300">
          {description}
        </div>
      </div>
    );
  }

  return (
    <div className={`video-slide video-slide--${orientation}`}>
      <SlideHeader orientation={orientation} label={label} title={title} subtitle={subtitle} />
      {description ? (
        <div className="video-slide__body video-slide__body--portrait">
          {videoPlayer}
          <div className="video-slide__description video-slide__description--portrait animate-slide-up delay-300">
            {description}
          </div>
        </div>
      ) : (
        videoPlayer
      )}
    </div>
  );
};

export default VideoSlide;
