import type { FC } from 'react';
import type { BaseSlideProps } from '../../types/slide.types';
import SlideHeader from './SlideHeader';
import './FourPanelSlide.css';

interface Panel {
  title: string;
  subtitle?: string;
  description?: string;
  imageUrl?: string;
}

interface FourPanelSlideProps extends BaseSlideProps {
  label?: string;
  title: string;
  subtitle?: string;
  panels: Panel[];
}

const FourPanelSlide: FC<FourPanelSlideProps> = ({
  orientation = 'landscape',
  label,
  title,
  subtitle,
  panels
}) => {
  if (orientation === 'portrait') {
    return (
      <div className="four-panel-slide four-panel-slide--portrait">
        <SlideHeader orientation={orientation} label={label} title={title} />
        {subtitle && <p className="four-panel-slide__portrait-subtitle animate-slide-up delay-200">{subtitle}</p>}

        <div className="four-panel-slide__portrait-panels">
          {panels.map((panel, index) => (
            <div 
              key={index} 
              className="four-panel-slide__portrait-panel animate-slide-up"
              style={{ animationDelay: `${300 + index * 100}ms` }}
            >
              {panel.imageUrl && (
                <div className="four-panel-slide__portrait-panel-image">
                  <img src={panel.imageUrl} alt={panel.title} />
                </div>
              )}
              <div className="four-panel-slide__portrait-content-container">
                <h3 className="four-panel-slide__portrait-panel-title">{panel.title}</h3>
                {panel.subtitle && (
                  <p className="four-panel-slide__portrait-panel-subtitle">{panel.subtitle}</p>
                )}
                {panel.description && (
                  <p className="four-panel-slide__portrait-panel-description">{panel.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Landscape layout
  return (
    <div className="four-panel-slide four-panel-slide--landscape">
      <SlideHeader orientation={orientation} label={label} title={title} />
      {subtitle && <p className="four-panel-slide__subtitle animate-slide-up delay-200">{subtitle}</p>}

      <div className="four-panel-slide__panels">
        {panels.map((panel, index) => (
          <div 
            key={index} 
            className="four-panel-slide__panel animate-slide-up"
            style={{ animationDelay: `${300 + index * 100}ms` }}
          >
            {panel.imageUrl && (
              <div className="four-panel-slide__panel-image">
                <img src={panel.imageUrl} alt={panel.title} />
              </div>
            )}
            <div className="four-panel-slide__content-container">
              <h3 className="four-panel-slide__panel-title">{panel.title}</h3>
              {panel.subtitle && (
                <p className="four-panel-slide__panel-subtitle">{panel.subtitle}</p>
              )}
              {panel.description && (
                <p className="four-panel-slide__panel-description">{panel.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FourPanelSlide;
