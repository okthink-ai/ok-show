import { useMemo } from 'react';
import type { FC } from 'react';
import type { FooterProps, FooterSyncStatus } from '../types/slide.types';
import type { AnnotationIntent } from '../types/annotation.types';
import { useAppSelector } from '../store/hooks';
import { getPresentationById } from '../project/presentations';
import { resolveSlideIndex } from '../utils/resolveSlideIndex';
import MaterialIcon from './MaterialIcon';
import './Footer.css';

/**
 * The live-session indicator. The speaker needs to know, at a glance and without
 * opening a panel, whether the presenter view can still drive this screen.
 */
const SyncIndicator: FC<{ sync: FooterSyncStatus; compact?: boolean }> = ({ sync, compact = false }) => {
  const state = !sync.enabled ? 'off' : sync.status;
  const label = state === 'connected' ? `Live · ${sync.sessionId}`
    : state === 'connecting' ? 'Connecting…'
    : state === 'disconnected' ? 'Reconnecting…'
    : state === 'error' ? 'Sync error'
    : 'Sync off';
  const title = state === 'connected'
    ? `Connected to session "${sync.sessionId}". Open the presenter view.`
    : state === 'off'
      ? 'No live session. Start one so the presenter view can advance these slides.'
      : sync.error || `Speaker sync is ${label.toLowerCase()}`;

  return (
    <button
      className={`footer__sync footer__sync--${state} ${compact ? 'footer__sync--compact' : ''}`}
      onClick={state === 'off' ? sync.onStartSession : sync.onOpenPresenterView}
      title={title}
      aria-label={title}
    >
      <span className="footer__sync-dot" aria-hidden="true" />
      {!compact && <span className="footer__sync-label">{label}</span>}
    </button>
  );
};

const Footer: FC<FooterProps> = ({
  currentSlide,
  totalSlides,
  currentTemplate,
  actions = {},
  annotationNav,
  sync,
  isMobile: isMobileProp,
}) => {
  const isMobile = isMobileProp ?? false;
  const presentationId = useAppSelector((state) => state.presentation.currentPresentationId);
  const slides = useMemo(() => getPresentationById(presentationId)?.slides ?? [], [presentationId]);
  const annotationsBySlide = useMemo(() => {
    const map = new Map<number, { count: number; topIntent: AnnotationIntent | null }>();
    if (!annotationNav) return map;
    for (const a of annotationNav.annotations) {
      const slideIndex = resolveSlideIndex(slides, a.slideId, a.slideIndex);
      const existing = map.get(slideIndex);
      const intent = a.intent ?? 'change';
      const priority = (i: AnnotationIntent) => (i === 'fix' ? 3 : i === 'question' ? 2 : 1);
      if (existing) {
        existing.count++;
        if (!existing.topIntent || priority(intent) > priority(existing.topIntent)) {
          existing.topIntent = intent;
        }
      } else {
        map.set(slideIndex, { count: 1, topIntent: intent });
      }
    }
    return map;
  }, [annotationNav, slides]);

  const {
    exportPresentationId,
    onToggleFullscreen,
    isFullscreen,
    onToggleDebug,
    debugMode,
    showDebugButton,
    onToggleDeveloperTools,
    isDeveloperToolsOpen,
    onToggleStyleTweaks,
    isStyleTweakMode,
    styleTweakCount = 0,
  } = actions;

  return (
    <footer className={`footer ${isMobile ? 'footer--mobile' : ''}`}>
      {isMobile ? (
        // Mobile: keep the primary presentation controls compact.
        <>
          {onToggleDeveloperTools && (
            <button
              className={`footer__button footer__button--icon footer__mobile-developer-tools ${isDeveloperToolsOpen ? 'active' : ''}`}
              onClick={onToggleDeveloperTools}
              aria-label="Toggle developer tools"
              title={isDeveloperToolsOpen ? 'Close developer tools' : 'Open developer tools'}
            >
              <MaterialIcon name={isDeveloperToolsOpen ? 'keyboard_arrow_left' : 'keyboard_arrow_right'} size="medium" />
            </button>
          )}
          <div className="footer__center">
            <span className="footer__counter">
              {currentSlide + 1} / {totalSlides}
            </span>
            {sync && <SyncIndicator sync={sync} compact />}
          </div>
          <div className="footer__progress-bar">
            <div
              className="footer__progress-bar-fill"
              style={{ width: `${((currentSlide + 1) / totalSlides) * 100}%` }}
            />
          </div>
        </>
      ) : (
        // Desktop/Tablet: show full footer
        <>
          <div className="footer__left">
            {onToggleDeveloperTools && (
              <button
                className={`footer__button footer__button--icon ${isDeveloperToolsOpen ? 'active' : ''}`}
                onClick={onToggleDeveloperTools}
                aria-label="Toggle developer tools"
                title={isDeveloperToolsOpen ? 'Close developer tools' : 'Open developer tools'}
              >
                <MaterialIcon name={isDeveloperToolsOpen ? 'keyboard_arrow_left' : 'keyboard_arrow_right'} size="medium" />
              </button>
            )}
            {onToggleStyleTweaks && (
              <button
                className={`footer__button footer__button--icon ${isStyleTweakMode ? 'active' : ''}`}
                onClick={onToggleStyleTweaks}
                aria-label="Tweak text styles"
                aria-pressed={Boolean(isStyleTweakMode)}
                title={isStyleTweakMode ? 'Stop picking text (Esc)' : 'Tweak text styles: click any text on the slide'}
              >
                <MaterialIcon name="tune" size="medium" />
                {styleTweakCount > 0 && <span className="footer__badge">{styleTweakCount}</span>}
              </button>
            )}
          </div>

          <div className="footer__center">
            <span className="footer__counter">
              {currentSlide + 1} / {totalSlides}
            </span>
            {isDeveloperToolsOpen && currentTemplate && (
              <span className="footer__template">
                {currentTemplate}
              </span>
            )}
            {isDeveloperToolsOpen && annotationNav && annotationsBySlide.size > 0 && (
              <div className="footer__progress-dots">
                {Array.from({ length: totalSlides }, (_, i) => {
                  const slideData = annotationsBySlide.get(i);
                  const isCurrent = i === currentSlide;
                  const intentClass = slideData?.topIntent
                    ? slideData.topIntent === 'fix' ? 'footer__dot--intent-fix'
                    : slideData.topIntent === 'question' ? 'footer__dot--intent-question'
                    : 'footer__dot--intent-other'
                    : '';
                  return (
                    <button
                      key={i}
                      className={`footer__dot ${isCurrent ? 'footer__dot--current' : ''} ${slideData ? 'footer__dot--annotated' : ''} ${intentClass}`}
                      onClick={() => annotationNav.onNavigateToSlide(i)}
                      title={slideData ? `Slide ${i + 1} — ${slideData.count} annotation${slideData.count !== 1 ? 's' : ''}` : `Slide ${i + 1}`}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div className="footer__right">
            {sync && <SyncIndicator sync={sync} />}
            {exportPresentationId && (
              <button
                className="footer__button footer__button--icon"
                onClick={() => window.open(`/export?presentation=${exportPresentationId}`, '_blank')}
                aria-label="Export to PDF"
                title="Export to PDF"
              >
                <MaterialIcon name="picture_as_pdf" size="medium" />
              </button>
            )}
            {onToggleFullscreen && (
              <button
                className={`footer__button footer__button--icon ${isFullscreen ? 'active' : ''}`}
                onClick={onToggleFullscreen}
                aria-label="Toggle fullscreen"
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                <MaterialIcon name={isFullscreen ? 'fullscreen_exit' : 'fullscreen'} size="medium" />
              </button>
            )}
            {isDeveloperToolsOpen && showDebugButton && onToggleDebug && (
              <button
                className={`footer__button footer__button--icon ${debugMode ? 'active' : ''}`}
                onClick={onToggleDebug}
                aria-label="Toggle mobile preview"
                title={debugMode ? 'Hide mobile preview' : 'Show mobile preview'}
              >
                <MaterialIcon
                  name={debugMode ? 'phone_iphone' : 'smartphone'}
                  size="medium"
                />
              </button>
            )}
          </div>
        </>
      )}
    </footer>
  );
};

export default Footer;
