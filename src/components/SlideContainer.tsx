import type { FC, MouseEvent, ReactElement } from 'react';
import { useRef, useEffect, cloneElement, isValidElement } from 'react';
import type { SlideContainerProps, SlideOrientation } from '../types/slide.types';
import { useAppSelector } from '../store/hooks';
import { getVideoPreloadSources } from '../utils/videoPreload';
import NavigationHint from './NavigationHint';
import Slide from './Slide';
import './SlideContainer.css';

const SlideContainer: FC<SlideContainerProps> = ({
  slides,
  aspectRatio,
  currentSlide,
  onSlideChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const slidesContainerRef = useRef<HTMLDivElement>(null);
  const videoPreloadersRef = useRef(new Map<string, HTMLVideoElement>());
  const isFullscreen = useAppSelector((state) => state.ui.isFullscreen);
  const clickTimerRef = useRef<number | null>(null);
  // The delayed click fires later, so it must read the slide as it is then.
  const latestRef = useRef({ currentSlide, slideCount: slides.length, onSlideChange });
  latestRef.current = { currentSlide, slideCount: slides.length, onSlideChange };

  const clearClickTimer = () => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  };

  useEffect(() => () => clearClickTimer(), []);

  useEffect(() => {
    const wantedSources = new Set(getVideoPreloadSources(slides, currentSlide));

    for (const [source, preloader] of videoPreloadersRef.current) {
      if (wantedSources.has(source)) continue;
      preloader.removeAttribute('src');
      preloader.load();
      videoPreloadersRef.current.delete(source);
    }

    for (const source of wantedSources) {
      if (videoPreloadersRef.current.has(source)) continue;
      const preloader = document.createElement('video');
      preloader.preload = 'auto';
      preloader.muted = true;
      preloader.playsInline = true;
      preloader.src = source;
      preloader.load();
      videoPreloadersRef.current.set(source, preloader);
    }
  }, [currentSlide, slides]);

  useEffect(() => () => {
    for (const preloader of videoPreloadersRef.current.values()) {
      preloader.removeAttribute('src');
      preloader.load();
    }
    videoPreloadersRef.current.clear();
  }, []);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current || !slidesContainerRef.current) return;

      const container = containerRef.current;
      const slidesContainer = slidesContainerRef.current;

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      // Skip if container has no dimensions yet
      if (containerWidth === 0 || containerHeight === 0) {
        return;
      }

      // On mobile viewports (< 768px), use native viewport sizing for portrait slides
      const isMobileViewport = window.innerWidth < 768;
      if (isMobileViewport && aspectRatio === '9:16') {
        // Remove scaling, just center the slide
        slidesContainer.style.transform = `translate(-50%, -50%)`;
        return;
      }

      const slideWidth = aspectRatio === '16:9' ? 1920 : 1080;
      const slideHeight = aspectRatio === '16:9' ? 1080 : 1920;

      // The buffer keeps the slide off the edges of the windowed app chrome.
      // Fullscreen has no chrome to clear, so the slide takes the whole screen
      // instead of sitting inside a letterbox the buffer widened.
      const buffer = isFullscreen ? 0 : 80; // 40px on each side
      const availableWidth = Math.max(0, containerWidth - buffer);
      const availableHeight = Math.max(0, containerHeight - buffer);

      const scaleX = availableWidth / slideWidth;
      const scaleY = availableHeight / slideHeight;
      const scale = Math.min(scaleX, scaleY);

      // Center and scale the slides
      slidesContainer.style.transform = `translate(-50%, -50%) scale(${scale})`;
    };

    // Initial scale
    updateScale();

    // Watch for container size changes (sidebar toggles, window resize, etc.)
    const resizeObserver = new ResizeObserver(() => {
      updateScale();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [aspectRatio, currentSlide, isFullscreen]);

  const handleNavigation = (clientX: number, width: number) => {
    const { currentSlide: current, slideCount, onSlideChange: change } = latestRef.current;
    const isMobile = window.innerWidth < 768;

    // Mobile "stories" behavior: left 30% goes back, the rest goes forward.
    if (isMobile && clientX < width * 0.3) {
      if (current > 0) change(current - 1);
      return;
    }
    // Desktop: click anywhere to advance.
    if (current < slideCount - 1) change(current + 1);
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const target = e.target instanceof HTMLElement ? e.target : null;
    // Only the authoring app has double-click text editing (always on there,
    // independent of multi-select), so only it waits to see whether a click on
    // slide text is the first half of a double click. The public deck never
    // delays a click, so quick successive clicks each advance a slide.
    const delaysTextClicks = !containerRef.current.closest('[data-app-surface="presentation"]');
    const isSlideText = Boolean(
      delaysTextClicks
      && target?.closest('.slide--active')
      && target.textContent?.trim()
      && !target.closest('button, a, input, textarea, select, .slide__page-number'),
    );

    if (!isSlideText) {
      clearClickTimer();
      handleNavigation(x, rect.width);
      return;
    }

    // Give the annotation hook time to receive a genuine text double-click,
    // while preserving click-to-advance for ordinary clicks on text.
    if (e.detail > 1) {
      clearClickTimer();
      return;
    }
    clearClickTimer();
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      handleNavigation(x, rect.width);
    }, 250);
  };

  const handleDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target?.closest('.slide--active') && target.textContent?.trim()) {
      clearClickTimer();
    }
  };

  const orientation: SlideOrientation = aspectRatio === '16:9' ? 'landscape' : 'portrait';
  
  // Clone the slide content and inject orientation prop if it's a valid React element
  const slideContent = isValidElement(slides[currentSlide].content) 
    ? cloneElement(slides[currentSlide].content as ReactElement<{ orientation: string }>, { orientation })
    : slides[currentSlide].content;

  const slideWithOrientation = {
    ...slides[currentSlide],
    content: slideContent
  };
  

  return (
    <>
    <div 
      ref={containerRef} 
      className={`slide-container slide-container--${aspectRatio === '16:9' ? 'landscape' : 'portrait'}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      // removing onTouchEnd to rely on onClick for now to avoid complexity, 
      // or we can keep it if we want faster response. 
      // If we use onClick, it works on mobile too (with 300ms delay).
      // Let's use onClick for simplicity unless responsiveness is critical.
    >
      <div 
        ref={slidesContainerRef}
        className="slides-wrapper"
      >
        <Slide
          key={slides[currentSlide].id}
          slide={slideWithOrientation}
          aspectRatio={aspectRatio}
          isActive={true}
          slideNumber={currentSlide + 1}
          totalSlides={slides.length}
        />
      </div>
    </div>
    {/* A sibling, so a tap that dismisses the hint is not also a slide tap. */}
    <NavigationHint isFirstSlide={currentSlide === 0} />
    </>
  );
};

export default SlideContainer;
