import { useState, useEffect, useRef, useMemo } from 'react';
import Slide from './Slide';
import { defaultPresentation, getPresentationById } from '../project/presentations';
import './ExportView.css';

function ExportView() {
  // Compute slides at render time, not module load time
  const slides = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const presentationParam = params.get('presentation');
    if (presentationParam) {
      const found = getPresentationById(presentationParam);
      if (found) return found.slides;
    }
    return defaultPresentation?.slides ?? [];
  }, []);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const imageCheckRan = useRef(false);

  // Wait for fonts to load
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const waitForFonts = async () => {
      try {
        await document.fonts.ready;

        if (!isMounted) return;

        // Double-check for Safari reliability
        if (document.fonts.status === 'loaded') {
          setFontsLoaded(true);
        } else {
          // Fallback: poll until loaded
          intervalId = setInterval(() => {
            if (document.fonts.status === 'loaded') {
              if (isMounted) setFontsLoaded(true);
              if (intervalId) clearInterval(intervalId);
            }
          }, 100);

          // Timeout after 5 seconds
          timeoutId = setTimeout(() => {
            if (intervalId) clearInterval(intervalId);
            if (isMounted) setFontsLoaded(true);
          }, 5000);
        }
      } catch {
        if (isMounted) setFontsLoaded(true);
      }
    };

    waitForFonts();

    // Cleanup
    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Wait for all images to load (runs once after initial render)
  useEffect(() => {
    // Guard against running twice (StrictMode double-mount)
    if (imageCheckRan.current) return;
    imageCheckRan.current = true;

    // Small delay to ensure DOM is ready
    const checkImages = () => {
      const images = document.querySelectorAll('.export-view img') as NodeListOf<HTMLImageElement>;

      if (images.length === 0) {
        setImagesLoaded(true);
        return;
      }

      let loaded = 0;
      const total = images.length;
      const listeners: Array<{ img: HTMLImageElement; load: () => void; error: () => void }> = [];

      const checkAllLoaded = () => {
        loaded++;
        if (loaded >= total) {
          setImagesLoaded(true);
          // Clean up listeners
          listeners.forEach(({ img, load, error }) => {
            img.removeEventListener('load', load);
            img.removeEventListener('error', error);
          });
        }
      };

      images.forEach((img) => {
        if (img.complete) {
          checkAllLoaded();
        } else {
          const loadHandler = () => checkAllLoaded();
          const errorHandler = () => checkAllLoaded();

          img.addEventListener('load', loadHandler);
          img.addEventListener('error', errorHandler);

          listeners.push({ img, load: loadHandler, error: errorHandler });
        }
      });
    };

    // Run after a tick to ensure slides have rendered
    const timerId = setTimeout(checkImages, 50);

    return () => {
      clearTimeout(timerId);
    };
  }, []);

  const isReady = fontsLoaded && imagesLoaded;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="export-view">
      {/* Screen-only header with instructions */}
      <div className="export-view__header">
        <h1>Export to PDF</h1>
        <p className="export-view__status">
          {!isReady ? (
            'Loading fonts and images...'
          ) : (
            <>
              Ready to print. Press <kbd>Cmd</kbd>+<kbd>P</kbd> (Mac) or <kbd>Ctrl</kbd>+<kbd>P</kbd> (Windows).
            </>
          )}
        </p>
        <div className="export-view__instructions">
          <strong>Important settings in print dialog:</strong>
          <ul>
            <li>Destination: "Save as PDF"</li>
            <li>Layout: Landscape (should auto-detect)</li>
            <li>Margins: None</li>
            <li>
              Background graphics: <em>Enabled</em> — required for colors and gradients!
            </li>
          </ul>
        </div>
        <div className="export-view__actions">
          <button
            className="export-view__print-button"
            onClick={handlePrint}
            disabled={!isReady}
          >
            {isReady ? 'Print / Save as PDF' : 'Loading...'}
          </button>
          <a href="/" className="export-view__back-link">
            ← Back to presentation
          </a>
        </div>
      </div>

      {/* Slides container */}
      <div className="export-view__slides">
        {slides.map((slide, index) => (
          <div key={slide.id} className="export-slide">
            <Slide
              slide={slide}
              aspectRatio="16:9"
              isActive={true}
              slideNumber={index + 1}
              totalSlides={slides.length}
            />
            {/* Page number for print (separate from Slide's page number) */}
            <span className="export-slide__page-number">
              {index + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ExportView;
