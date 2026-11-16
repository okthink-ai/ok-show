import type { FC, ReactNode } from 'react';
import type { BaseSlideProps } from '../../types/slide.types';
import SlideHeader from './SlideHeader';
import './StatementSlide.css';

interface StatementSlideProps extends BaseSlideProps {
  label?: string;
  title: string | ReactNode;
  subtitle: string | ReactNode;
  /** `compact` sets a long title one step smaller. */
  titleSize?: 'default' | 'compact';
  /** Call to action under the subtitle, such as a link styled with `statement-slide__cta`. */
  cta?: ReactNode;
  /** Content pinned to the bottom of the slide, such as a logo or names. */
  footer?: ReactNode;
}

const StatementSlide: FC<StatementSlideProps> = ({
  orientation = 'landscape',
  label,
  title,
  subtitle,
  titleSize = 'default',
  cta,
  footer,
}) => {
  const titleSizeClass = titleSize === 'compact' ? ' statement-slide__title--compact' : '';

  if (orientation === 'portrait') {
    return (
      <div className="statement-slide statement-slide--portrait">
        {label && <SlideHeader orientation={orientation} label={label} title="" />}
        <div className="statement-slide__portrait-content">
          <h2 className={`statement-slide__portrait-title${titleSizeClass} animate-scale-in delay-100`}>{title}</h2>
          <p className="statement-slide__portrait-subtitle animate-slide-up delay-300">{subtitle}</p>
          {cta && <div className="statement-slide__cta-container animate-slide-up delay-400">{cta}</div>}
        </div>
        {footer && <div className="statement-slide__footer statement-slide__footer--portrait animate-fade-in delay-500">{footer}</div>}
      </div>
    );
  }

  return (
    <div className="statement-slide statement-slide--landscape">
      {label && <SlideHeader orientation={orientation} label={label} title="" />}
      <div className="statement-slide__content">
        <h2 className={`statement-slide__title${titleSizeClass} animate-scale-in delay-100`}>{title}</h2>
        <p className="statement-slide__subtitle animate-slide-up delay-300">{subtitle}</p>
        {cta && <div className="statement-slide__cta-container animate-slide-up delay-400">{cta}</div>}
      </div>
      {footer && <div className="statement-slide__footer animate-fade-in delay-500">{footer}</div>}
    </div>
  );
};

export default StatementSlide;
