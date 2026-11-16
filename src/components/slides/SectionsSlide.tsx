import type { FC } from 'react';
import type { BaseSlideProps } from '../../types/slide.types';
import SlideHeader from './SlideHeader';
import './SectionsSlide.css';

interface Section {
  title: string;
  description: string;
}

interface SectionsSlideProps extends BaseSlideProps {
  label?: string;
  title: string;
  sections: Section[];
}

const SectionsSlide: FC<SectionsSlideProps> = ({
  orientation,
  label,
  title,
  sections
}) => {
  if (orientation === 'portrait') {
    return (
      <div className="sections-slide sections-slide--portrait">
        <SlideHeader orientation={orientation} label={label} title={title} />
        <div className="sections-slide__portrait-sections">
          {sections.map((section, index) => (
            <div 
              key={index} 
              className="sections-slide__portrait-section animate-slide-up"
              style={{ animationDelay: `${300 + index * 100}ms` }}
            >
              <h3 className="sections-slide__portrait-section-title">{section.title}</h3>
              <p className="sections-slide__portrait-section-description">{section.description}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="sections-slide sections-slide--landscape">
      <SlideHeader orientation={orientation} label={label} title={title} />
      <div className="sections-slide__sections">
        {sections.map((section, index) => (
          <div 
            key={index} 
            className="sections-slide__section animate-slide-up"
            style={{ animationDelay: `${300 + index * 100}ms` }}
          >
            <h3 className="sections-slide__section-title">{section.title}</h3>
            <p className="sections-slide__section-description">{section.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SectionsSlide;
