import type { FC, ReactNode } from 'react';
import type { BaseSlideProps } from '../../types/slide.types';
import './SlideHeader.css';

interface SlideHeaderProps extends BaseSlideProps {
  label?: string;
  title: string;
  subtitle?: ReactNode;
}

const SlideHeader: FC<SlideHeaderProps> = ({ orientation, label, title, subtitle }) => {
  if (orientation === 'portrait') {
    return (
      <div className="slide-header slide-header--portrait">
        {label && <span className="slide-header__portrait-label animate-fade-in">{label}</span>}
        {title && <h2 className="slide-header__portrait-title animate-fade-in delay-80">{title}</h2>}
        {subtitle && <p className="slide-header__portrait-subtitle animate-slide-up delay-200">{subtitle}</p>}
      </div>
    );
  }

  return (
    <div className="slide-header slide-header--landscape">
      {label && <span className="slide-header__label animate-fade-in">{label}</span>}
      {title && <h2 className="slide-header__title animate-fade-in delay-80">{title}</h2>}
      {subtitle && <p className="slide-header__subtitle animate-slide-up delay-200">{subtitle}</p>}
    </div>
  );
};

export default SlideHeader;
