import type { FC } from 'react';
import type { BaseSlideProps } from '../../types/slide.types';
import SlideHeader from './SlideHeader';
import './TextWithMediaSlide.css';

interface TextWithMediaSlideProps extends BaseSlideProps {
  label?: string;
  title: string;
  content: string | string[];
  imageUrl?: string;
  imageAlt?: string;
}

const TextWithMediaSlide: FC<TextWithMediaSlideProps> = ({
  orientation = 'landscape',
  label,
  title,
  content,
  imageUrl,
  imageAlt = 'Illustration'
}) => {
  const contentArray = Array.isArray(content) ? content : [content];

  if (orientation === 'portrait') {
    return (
      <div className="text-with-media-slide text-with-media-slide--portrait">
        <SlideHeader orientation={orientation} label={label} title={title} />

        <div className="text-with-media-slide__portrait-visual animate-fade-in delay-200">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={imageAlt}
              className="text-with-media-slide__portrait-image"
            />
          ) : (
            <div className="text-with-media-slide__portrait-placeholder" />
          )}
        </div>

        <div className="text-with-media-slide__portrait-content">
          {contentArray.map((paragraph, index) => (
            <p 
              key={index} 
              className="text-with-media-slide__paragraph animate-slide-up"
              style={{ animationDelay: `${300 + index * 100}ms` }}
            >
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    );
  }

  // Landscape layout
  return (
    <div className="text-with-media-slide text-with-media-slide--landscape">
      <div className="text-with-media-slide__left">
        <SlideHeader orientation={orientation} label={label} title={title} />
        <div className="text-with-media-slide__content">
          {contentArray.map((paragraph, index) => (
            <p 
              key={index} 
              className="text-with-media-slide__paragraph animate-slide-up"
              style={{ animationDelay: `${300 + index * 100}ms` }}
            >
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      <div className="text-with-media-slide__right animate-fade-in delay-200">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={imageAlt}
            className="text-with-media-slide__image"
          />
        ) : (
          <div className="text-with-media-slide__placeholder" />
        )}
      </div>
    </div>
  );
};

export default TextWithMediaSlide;