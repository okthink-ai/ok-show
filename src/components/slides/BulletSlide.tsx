import type { FC, ReactNode } from 'react';
import type { BaseSlideProps } from '../../types/slide.types';
import SlideHeader from './SlideHeader';
import './BulletSlide.css';

interface BulletSlideProps extends BaseSlideProps {
  label?: string;
  title: string;
  subtitle?: ReactNode;
  items: string[];
}

const BulletSlide: FC<BulletSlideProps> = ({
  orientation = 'landscape',
  label,
  title,
  subtitle,
  items
}) => {
  if (orientation === 'portrait') {
    return (
      <div className="bullet-slide bullet-slide--portrait">
        <SlideHeader orientation={orientation} label={label} title={title} subtitle={subtitle} />
        <ul className="bullet-slide__portrait-items">
          {items.map((item, index) => (
            <li 
              key={index} 
              className="bullet-slide__portrait-item animate-fade-in"
              style={{ animationDelay: `${150 + index * 60}ms` }}
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="bullet-slide bullet-slide--landscape">
      <SlideHeader orientation={orientation} label={label} title={title} subtitle={subtitle} />
      <div className="bullet-slide__items-center">
        <ul className="bullet-slide__items">
          {items.map((item, index) => (
            <li 
              key={index} 
              className="bullet-slide__item animate-fade-in"
              style={{ animationDelay: `${150 + index * 60}ms` }}
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default BulletSlide;
