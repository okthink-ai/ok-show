import type { FC, MouseEvent, TouchEvent, ReactElement } from 'react';
import { useRef, useEffect, cloneElement, isValidElement } from 'react';
import Slide from './Slide';
import Footer from './Footer';
import type { SlideData } from '../types/slide.types';
import './MobileFrame.css';

interface MobileFrameProps {
  slides: SlideData[];
  currentSlide: number;
  onSlideChange: (index: number) => void;
}

const MobileFrame: FC<MobileFrameProps> = ({
  slides,
  currentSlide,
  onSlideChange,
}) => {
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateScale = () => {
      if (!frameRef.current) return;

      const frame = frameRef.current;
      const parent = frame.parentElement;
      if (!parent) return;

      const parentWidth = parent.clientWidth;
      const parentHeight = parent.clientHeight;

      // Skip if parent has no dimensions yet
      if (parentWidth === 0 || parentHeight === 0) {
        return;
      }

      // Fixed device dimensions matching iPhone aspect ratio (~19.5:9)
      // iPhone 14 Pro: 393×852 (including frame/bezel)
      const deviceWidth = 393;
      const deviceHeight = 852;

      // Add a buffer so the device doesn't touch the edges
      const buffer = 40;
      const availableWidth = Math.max(0, parentWidth - buffer);
      const availableHeight = Math.max(0, parentHeight - buffer);

      const scaleX = availableWidth / deviceWidth;
      const scaleY = availableHeight / deviceHeight;
      const scale = Math.min(scaleX, scaleY);

      // Scale the device
      frame.style.transform = `scale(${scale})`;
    };

    // Initial scale
    updateScale();

    // Watch for parent size changes
    const parent = frameRef.current?.parentElement;
    if (!parent) return;

    const resizeObserver = new ResizeObserver(() => {
      updateScale();
    });

    resizeObserver.observe(parent);

    return () => {
      resizeObserver.disconnect();
    };
  }, [currentSlide]);

  const handleNavigation = (clientX: number, width: number) => {
    if (clientX < width * 0.3) {
      // Go Back
      if (currentSlide > 0) {
        onSlideChange(currentSlide - 1);
      }
    } else {
      // Go Forward
      if (currentSlide < slides.length - 1) {
        onSlideChange(currentSlide + 1);
      }
    }
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    handleNavigation(x, rect.width);
  };

  const handleTouch = (e: TouchEvent<HTMLDivElement>) => {
    if (!frameRef.current || e.changedTouches.length === 0) return;
    const touch = e.changedTouches[0];
    const rect = frameRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    handleNavigation(x, rect.width);
  };

  // Clone the slide content and inject orientation prop if it's a valid React element
  const slideContent = isValidElement(slides[currentSlide].content)
    ? cloneElement(slides[currentSlide].content as ReactElement<{ orientation: string }>, { orientation: 'portrait' })
    : slides[currentSlide].content;

  const slideWithOrientation = {
    ...slides[currentSlide],
    content: slideContent
  };

  return (
    <div ref={frameRef} className="mobile-frame">
      <div
        className="mobile-frame__screen"
        onClick={handleClick}
        onTouchEnd={handleTouch}
      >
        <Slide
          key={slides[currentSlide].id}
          slide={slideWithOrientation}
          aspectRatio="9:16"
          isActive={true}
          slideNumber={currentSlide + 1}
          totalSlides={slides.length}
        />
        <div className="mobile-frame__footer">
          <Footer
            currentSlide={currentSlide}
            totalSlides={slides.length}
            isMobile={true}
          />
        </div>
      </div>
    </div>
  );
};

export default MobileFrame;
