import type { FC, ReactElement } from 'react';
import { isValidElement } from 'react';
import type { SlideData } from '../types/slide.types';
import './SlideInfoSidebar.css';

interface SlideInfoSidebarProps {
  slides: SlideData[];
  currentSlide: number;
  aspectRatio: '16:9' | '9:16';
  onClose?: () => void;
}

const SlideInfoSidebar: FC<SlideInfoSidebarProps> = ({
  slides,
  currentSlide,
  aspectRatio,
}) => {
  const currentSlideData = slides[currentSlide];

  const getSlideProps = () => {
    if (!currentSlideData) return null;

    const propsMap: Record<string, unknown> = {};

    const content = currentSlideData.content;
    if (isValidElement(content)) {
      const element = content as ReactElement;
      if (element.props) {
        Object.entries(element.props).forEach(([key, value]) => {
          if (key !== 'orientation' && key !== 'children') {
            propsMap[key] = value;
          }
        });
      }
    }

    return {
      template: currentSlideData.template,
      title: currentSlideData.title,
      id: currentSlideData.id,
      props: propsMap
    };
  };

  const slideProps = getSlideProps();

  const formatValue = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
      return value.map((item, i) =>
        typeof item === 'object' ? `[${i}]: ${JSON.stringify(item)}` : `• ${item}`
      ).join('\n');
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  return (
    <div className="slide-info-sidebar">
      <div className="slide-info-sidebar__header">
        <div className="slide-info-sidebar__branding">
          Built with <span className="slide-info-sidebar__brand">ok-vibe-slides</span>
        </div>
        <h3 className="slide-info-sidebar__title">Slide Info</h3>
      </div>
      <div className="slide-info-sidebar__content">
        {slideProps ? (
          <>
            <div className="slide-info-sidebar__section">
              <div className="slide-info-sidebar__label">Slide</div>
              <div className="slide-info-sidebar__value slide-info-sidebar__value--highlight">
                {currentSlide + 1} of {slides.length}
              </div>
            </div>

            <div className="slide-info-sidebar__section">
              <div className="slide-info-sidebar__label">Template</div>
              <div className="slide-info-sidebar__value slide-info-sidebar__value--template">
                {slideProps.template}
              </div>
            </div>

            <div className="slide-info-sidebar__section">
              <div className="slide-info-sidebar__label">Title</div>
              <div className="slide-info-sidebar__value">
                {slideProps.title}
              </div>
            </div>

            <div className="slide-info-sidebar__section">
              <div className="slide-info-sidebar__label">ID</div>
              <div className="slide-info-sidebar__value slide-info-sidebar__value--mono">
                {slideProps.id}
              </div>
            </div>

            <div className="slide-info-sidebar__section">
              <div className="slide-info-sidebar__label">Aspect Ratio</div>
              <div className="slide-info-sidebar__value">
                {aspectRatio} ({aspectRatio === '16:9' ? '1920×1080' : '1080×1920'})
              </div>
            </div>

            {Object.keys(slideProps.props).length > 0 && (
              <div className="slide-info-sidebar__props">
                <div className="slide-info-sidebar__props-header">Component Props</div>
                {Object.entries(slideProps.props).map(([key, value]) => (
                  <div key={key} className="slide-info-sidebar__prop">
                    <div className="slide-info-sidebar__prop-key">{key}</div>
                    <div className="slide-info-sidebar__prop-value">
                      {formatValue(value)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="slide-info-sidebar__empty">No slide data available</div>
        )}

        <div className="slide-info-sidebar__hint">
          <strong>Tip:</strong> Hold <kbd>Alt</kbd> to inspect individual elements
        </div>
      </div>
    </div>
  );
};

export default SlideInfoSidebar;
