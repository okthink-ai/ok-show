import type { FC } from 'react';
import MaterialIcon from './MaterialIcon';
import './Footer.css';

interface PublicFooterProps {
  currentSlide: number;
  totalSlides: number;
  isMobile: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

const PublicFooter: FC<PublicFooterProps> = ({
  currentSlide,
  totalSlides,
  isMobile,
  isFullscreen,
  onToggleFullscreen,
}) => (
  <footer className={`footer ${isMobile ? 'footer--mobile' : ''}`}>
    {isMobile ? (
      <>
        <div className="footer__center">
          <span className="footer__counter">
            {currentSlide + 1} / {totalSlides}
          </span>
        </div>
        <div className="footer__progress-bar">
          <div
            className="footer__progress-bar-fill"
            style={{ width: `${((currentSlide + 1) / totalSlides) * 100}%` }}
          />
        </div>
      </>
    ) : (
      <>
        <div className="footer__left" />
        <div className="footer__center">
          <span className="footer__counter">
            {currentSlide + 1} / {totalSlides}
          </span>
        </div>
        <div className="footer__right">
          <button
            className="footer__button footer__button--icon"
            onClick={() => window.open('/export', '_blank')}
            aria-label="Export to PDF"
            title="Export to PDF"
          >
            <MaterialIcon name="picture_as_pdf" size="medium" />
          </button>
          <button
            className={`footer__button footer__button--icon ${isFullscreen ? 'active' : ''}`}
            onClick={onToggleFullscreen}
            aria-label="Toggle fullscreen"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            <MaterialIcon name={isFullscreen ? 'fullscreen_exit' : 'fullscreen'} size="medium" />
          </button>
        </div>
      </>
    )}
  </footer>
);

export default PublicFooter;
