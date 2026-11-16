import type { FC } from 'react';
import type { BaseSlideProps } from '../../types/slide.types';
import SlideHeader from './SlideHeader';
import './FourImageSlide.css';

interface FourImageSlideProps extends BaseSlideProps {
  label?: string;
  title: string;
  subtitle?: string;
  images: string[];
  imageAlts?: string[];
  /** A caption under the images. */
  description?: string;
}

const FourImageSlide: FC<FourImageSlideProps> = ({
  orientation = 'landscape',
  label,
  title,
  subtitle,
  images,
  imageAlts = [],
  description,
}) => {
  const getAltText = (index: number): string => {
    return imageAlts?.[index] || `Image ${index + 1}`;
  };

  if (orientation === 'portrait') {
    return (
      <div className="four-image-slide four-image-slide--portrait">
        <SlideHeader orientation={orientation} label={label} title={title} />
        {subtitle && <p className="four-image-slide__portrait-subtitle animate-slide-up delay-200">{subtitle}</p>}

        <div className="four-image-slide__portrait-images">
          {images.map((imageUrl, index) => (
            <div 
              key={index} 
              className="four-image-slide__portrait-image-container animate-slide-up"
              style={{ animationDelay: `${300 + index * 100}ms` }}
            >
              <img 
                src={imageUrl} 
                alt={getAltText(index)}
                className="four-image-slide__portrait-image"
              />
            </div>
          ))}
        </div>
        {description && (
          <p className="four-image-slide__portrait-description animate-slide-up delay-300">{description}</p>
        )}
      </div>
    );
  }

  // Landscape layout
  return (
    <div className="four-image-slide four-image-slide--landscape">
      <SlideHeader orientation={orientation} label={label} title={title} />
      {subtitle && <p className="four-image-slide__subtitle animate-slide-up delay-200">{subtitle}</p>}

      <div className="four-image-slide__images">
        {images.map((imageUrl, index) => (
          <div 
            key={index} 
            className="four-image-slide__image-container animate-slide-up"
            style={{ animationDelay: `${300 + index * 100}ms` }}
          >
            <img 
              src={imageUrl} 
              alt={getAltText(index)}
              className="four-image-slide__image"
            />
          </div>
        ))}
      </div>
      {description && (
        <p className="four-image-slide__description animate-slide-up delay-300">{description}</p>
      )}
    </div>
  );
};

export default FourImageSlide;
