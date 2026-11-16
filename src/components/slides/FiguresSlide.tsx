import type { FC } from 'react';
import type { BaseSlideProps } from '../../types/slide.types';
import SlideHeader from './SlideHeader';
import './FiguresSlide.css';

interface DataPoint {
  label: string;
  value: string;
  description?: string;
}

interface FiguresSlideProps extends BaseSlideProps {
  label?: string;
  title: string;
  subtitle?: string;
  dataPoints: DataPoint[];
}

const FiguresSlide: FC<FiguresSlideProps> = ({
  orientation = 'landscape',
  label = 'Figures',
  title,
  subtitle,
  dataPoints
}) => {
  if (orientation === 'portrait') {
    return (
      <div className="figures-slide figures-slide--portrait">
        <SlideHeader orientation={orientation} label={label} title={title} subtitle={subtitle} />
        <div className="figures-slide__portrait-data">
          {dataPoints.map((point, index) => (
            <div 
              key={index} 
              className="figures-slide__portrait-data-point animate-scale-in"
              style={{ animationDelay: `${300 + index * 100}ms` }}
            >
              <div className="figures-slide__portrait-value">{point.value}</div>
              <div className="figures-slide__portrait-text">
                <div className="figures-slide__portrait-data-label">{point.label}</div>
                {point.description && (
                  <div className="figures-slide__portrait-description">{point.description}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="figures-slide figures-slide--landscape">
      <SlideHeader orientation={orientation} label={label} title={title} subtitle={subtitle} />
      <div className="figures-slide__data-grid">
        {dataPoints.map((point, index) => (
          <div 
            key={index} 
            className="figures-slide__data-point animate-scale-in"
            style={{ animationDelay: `${300 + index * 100}ms` }}
          >
            <div className="figures-slide__value">{point.value}</div>
            <div className="figures-slide__data-label">{point.label}</div>
            {point.description && (
              <div className="figures-slide__description">{point.description}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FiguresSlide;
