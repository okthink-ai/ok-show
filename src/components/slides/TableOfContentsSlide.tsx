import type { FC } from 'react';
import type { BaseSlideProps } from '../../types/slide.types';
import './TableOfContentsSlide.css';

interface TableOfContentsItem {
  number: string;
  title: string;
}

interface TableOfContentsSlideProps extends BaseSlideProps {
  subtitle?: string;
  title: string;
  items: TableOfContentsItem[];
  description?: string;
}

const TableOfContentsSlide: FC<TableOfContentsSlideProps> = ({ 
  orientation,
  subtitle = 'Subtitle',
  title, 
  items,
  description
}) => {
  if (orientation === 'portrait') {
    return (
      <div className="toc-slide toc-slide--portrait">
        <div className="toc-slide__portrait-header">
          <span className="toc-slide__portrait-subtitle animate-fade-in">{subtitle}</span>
          <h2 className="toc-slide__portrait-title animate-slide-up delay-100">{title}</h2>
        </div>
        
        <div className="toc-slide__portrait-list">
          {items.map((item, index) => (
            <div 
              key={index} 
              className="toc-slide__portrait-item animate-slide-in-right"
              style={{ animationDelay: `${300 + index * 100}ms` }}
            >
              <span className="toc-slide__portrait-number">{item.number}</span>
              <span className="toc-slide__portrait-item-title">{item.title}</span>
            </div>
          ))}
        </div>
        
        {description && (
          <p className="toc-slide__portrait-description animate-fade-in delay-500">{description}</p>
        )}
      </div>
    );
  }

  // Landscape layout
  return (
    <div className="toc-slide toc-slide--landscape">
      <div className="toc-slide__left">
        <div className="toc-slide__header">
          <span className="toc-slide__subtitle animate-fade-in">{subtitle}</span>
          <h2 className="toc-slide__title animate-slide-up delay-100">{title}</h2>
        </div>
        {description && (
          <p className="toc-slide__description animate-fade-in delay-500">{description}</p>
        )}
      </div>
      
      <div className="toc-slide__right">
        <div className="toc-slide__list">
          {items.map((item, index) => (
            <div 
              key={index} 
              className="toc-slide__item animate-slide-in-right"
              style={{ animationDelay: `${300 + index * 100}ms` }}
            >
              <span className="toc-slide__number">{item.number}</span>
              <span className="toc-slide__item-title">{item.title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TableOfContentsSlide;