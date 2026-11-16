import { useCallback, useMemo } from 'react';
import PublicFooter from './components/PublicFooter';
import SlideContainer from './components/SlideContainer';
import { presentations } from './project/presentations';
import { useFullscreenSync } from './hooks/useFullscreenSync';
import { toggleFullscreen, useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { useResponsiveLayout } from './hooks/useResponsiveLayout';
import { useUrlSync } from './hooks/useUrlSync';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { goToSlide, nextSlide, previousSlide } from './store/presentationSlice';
import './App.css';

function PublicApp() {
  const dispatch = useAppDispatch();
  const { isMobile, aspectRatio, isFullscreen } = useAppSelector((state) => state.ui);
  const { currentPresentationId, currentSlide } = useAppSelector((state) => state.presentation);
  const currentPresentation = presentations.find((presentation) => presentation.id === currentPresentationId)
    ?? presentations[0]
    ?? null;
  const slides = useMemo(() => currentPresentation?.slides ?? [], [currentPresentation]);
  const safeSlide = slides.length > 0 ? Math.min(currentSlide, slides.length - 1) : 0;
  const totalSlides = slides.length;

  useResponsiveLayout();
  useFullscreenSync();
  useUrlSync({ includePresentation: false });

  const handleNext = useCallback(() => dispatch(nextSlide(totalSlides)), [dispatch, totalSlides]);
  const handlePrevious = useCallback(() => dispatch(previousSlide()), [dispatch]);

  useKeyboardNavigation({
    onNext: handleNext,
    onPrevious: handlePrevious,
    onFullscreen: toggleFullscreen,
  });

  if (!currentPresentation || slides.length === 0) {
    return (
      <div className="app">
        <div className="app__content">
          <div className="app__main">
            <p>No presentation available.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app" data-app-surface="presentation">
      <div className="app__content">
        <div className="app__main">
          <SlideContainer
            slides={slides}
            aspectRatio={aspectRatio}
            currentSlide={safeSlide}
            onSlideChange={(index) => dispatch(goToSlide({ index, totalSlides }))}
          />
        </div>
      </div>

      {!isFullscreen && (
        <PublicFooter
          currentSlide={safeSlide}
          totalSlides={totalSlides}
          isMobile={isMobile}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      )}
    </div>
  );
}

export default PublicApp;
