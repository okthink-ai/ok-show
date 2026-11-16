import { memo, cloneElement, isValidElement, useEffect, useRef, useState } from 'react';
import type { CSSProperties, FC, ReactElement } from 'react';
import type { SlideData } from '../types/slide.types';
import Slide from './Slide';

interface SlideReviewPreviewProps {
  slide: SlideData;
  slideNumber: number;
  totalSlides: number;
}

const SlideReviewPreview: FC<SlideReviewPreviewProps> = ({ slide, slideNumber, totalSlides }) => {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const updateScale = () => setScale(surface.clientWidth / 1920);
    updateScale();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateScale);
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    for (const video of surface.querySelectorAll('video')) video.pause();
  }, []);

  const content = isValidElement(slide.content)
    ? cloneElement(slide.content as ReactElement<{ orientation?: string }>, { orientation: 'landscape' })
    : slide.content;

  return (
    <div className="slide-review-preview" ref={surfaceRef}>
      <div
        className="slide-review-preview__canvas"
        style={{ '--slide-review-scale': scale } as CSSProperties}
      >
        <Slide slide={{ ...slide, content }} aspectRatio="16:9" isActive={false} slideNumber={slideNumber} totalSlides={totalSlides} />
      </div>
    </div>
  );
};

export default memo(SlideReviewPreview);
