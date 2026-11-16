import type { FC } from 'react';
import type { BaseSlideProps } from '../../types/slide.types';
import SlideHeader from './SlideHeader';
import './ThreePanelSlide.css';

interface Panel {
  /** Material Icons name shown above the title, such as `rocket_launch`. */
  icon?: string;
  title: string;
  subtitle?: string;
  description?: string;
  imageUrl?: string;
  /** CSS color for the icon and title, such as `var(--color-brand-teal)`. Defaults to the accent color. */
  color?: string;
}

interface ThreePanelSlideProps extends BaseSlideProps {
  label?: string;
  title: string;
  subtitle?: string;
  panels: Panel[];
}

const accentStyle = (panel: Panel) => (panel.color ? { color: panel.color } : undefined);

const ThreePanelSlide: FC<ThreePanelSlideProps> = ({
  orientation = 'landscape',
  label,
  title,
  subtitle,
  panels
}) => {
  if (orientation === 'portrait') {
    return (
      <div className="three-panel-slide three-panel-slide--portrait">
        <SlideHeader orientation={orientation} label={label} title={title} />
        {subtitle && <p className="three-panel-slide__portrait-subtitle animate-slide-up delay-200">{subtitle}</p>}

        <div className="three-panel-slide__portrait-panels">
          {panels.map((panel, index) => (
            <div 
              key={index} 
              className="three-panel-slide__portrait-panel animate-slide-up"
              style={{ animationDelay: `${300 + index * 100}ms` }}
            >
              {panel.imageUrl && (
                <div className="three-panel-slide__portrait-panel-image">
                  <img src={panel.imageUrl} alt={panel.title} />
                </div>
              )}
              <div className="three-panel-slide__portrait-content-container">
                <div className="three-panel-slide__portrait-panel-header">
                  {panel.icon && <span className="three-panel-slide__portrait-panel-icon material-icons" style={accentStyle(panel)} aria-hidden="true">{panel.icon}</span>}
                  <h3 className="three-panel-slide__portrait-panel-title" style={accentStyle(panel)}>{panel.title}</h3>
                </div>
                {panel.subtitle && (
                  <p className="three-panel-slide__portrait-panel-subtitle">{panel.subtitle}</p>
                )}
                {panel.description && (
                  <p className="three-panel-slide__portrait-panel-description">{panel.description}</p>
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
    <div className="three-panel-slide three-panel-slide--landscape">
      <SlideHeader orientation={orientation} label={label} title={title} />
      {subtitle && <p className="three-panel-slide__subtitle animate-slide-up delay-200">{subtitle}</p>}

      <div className="three-panel-slide__panels">
        {panels.map((panel, index) => (
          <div 
            key={index} 
            className="three-panel-slide__panel animate-slide-up"
            style={{ animationDelay: `${300 + index * 100}ms` }}
          >
            {panel.imageUrl && (
              <div className="three-panel-slide__panel-image">
                <img src={panel.imageUrl} alt={panel.title} />
              </div>
            )}
            <div className="three-panel-slide__content-container">
              {panel.icon && <span className="three-panel-slide__panel-icon material-icons" style={accentStyle(panel)} aria-hidden="true">{panel.icon}</span>}
              <h3 className="three-panel-slide__panel-title" style={accentStyle(panel)}>{panel.title}</h3>
              {panel.subtitle && (
                <p className="three-panel-slide__panel-subtitle">{panel.subtitle}</p>
              )}
              {panel.description && (
                <p className="three-panel-slide__panel-description">{panel.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ThreePanelSlide;
