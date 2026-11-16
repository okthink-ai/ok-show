import { useEffect } from 'react';

interface UseKeyboardNavigationProps {
  onNext: () => void;
  onPrevious: () => void;
  onFullscreen?: () => void;
  onDebug?: () => void;
}

export const useKeyboardNavigation = ({
  onNext,
  onPrevious,
  onFullscreen,
  onDebug,
}: UseKeyboardNavigationProps) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const el = document.activeElement;
      if (el?.closest('dialog[open]')) return;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement)?.isContentEditable) {
        return;
      }

      // Ctrl+D for debug (or Cmd+D on Mac)
      if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
        event.preventDefault();
        if (onDebug) {
          onDebug();
        }
        return;
      }

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          onNext();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          onPrevious();
          break;
        case 'f':
        case 'F':
          if (onFullscreen) {
            event.preventDefault();
            onFullscreen();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNext, onPrevious, onFullscreen, onDebug]);
};

export const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    // Fullscreen must target an element that survives navigation. Only the
    // current slide is mounted, and it is keyed by slide ID, so `.slide--active`
    // is a different element on every slide; the browser drops fullscreen as
    // soon as the element it was given leaves the document. The slide container
    // persists across slide changes and still excludes the surrounding
    // application chrome.
    const slideSurface = document.querySelector<HTMLElement>('.slide-container');
    const fullscreenTarget = slideSurface ?? document.documentElement;
    fullscreenTarget.requestFullscreen().catch((err) => {
      console.error('Error attempting to enable fullscreen:', err);
    });
  } else {
    document.exitFullscreen().catch((err) => {
      console.error('Error attempting to exit fullscreen:', err);
    });
  }
};
