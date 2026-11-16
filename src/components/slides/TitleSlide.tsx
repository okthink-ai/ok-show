import type { FC, ReactNode } from 'react';
import type { BaseSlideProps } from '../../types/slide.types';
import './TitleSlide.css';

interface FounderDetail {
  name: string;
  email: string;
}

interface TitleSlideProps extends BaseSlideProps {
  title: string;
  subtitle: string;
  brandName?: string;
  brandContent?: ReactNode;
  company?: string;
  date?: string;
  founderDetails?: FounderDetail[];
  background?: ReactNode;
}

const TitleSlide: FC<TitleSlideProps> = ({
  orientation = 'landscape',
  // The title remains part of the shared slide API; this template displays brandName/brandContent instead.
  title,
  subtitle,
  brandName,
  company,
  date,
  founderDetails,
  brandContent,
  background
}) => {
  void title;
  const renderFounderDetails = (isPortrait: boolean) => {
    if (!founderDetails || founderDetails.length === 0) {
      return (
        <div className="animate-fade-in delay-500" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          {company && <span className={isPortrait ? "title-slide__portrait-company" : "title-slide__company"}>{company}</span>}
          {date && <span className={isPortrait ? "title-slide__portrait-date" : "title-slide__date"}>{date}</span>}
        </div>
      );
    }

    return (
      <div className={`${isPortrait ? "title-slide__portrait-founder-details" : "title-slide__founder-details"} animate-fade-in delay-500`}>
        {founderDetails.map((founder, index) => (
          <div key={index} className={isPortrait ? "title-slide__portrait-founder" : "title-slide__founder"}>
            <span className={isPortrait ? "title-slide__portrait-founder-name" : "title-slide__founder-name"}>{founder.name}</span>
            <span className={isPortrait ? "title-slide__portrait-founder-title" : "title-slide__founder-title"}>Co-Founder</span>
            <a href={`mailto:${founder.email}`} className={isPortrait ? "title-slide__portrait-founder-email" : "title-slide__founder-email"}>{founder.email}</a>
          </div>
        ))}
      </div>
    );
  };


  if (orientation === 'portrait') {
    return (
      <div className="title-slide title-slide--portrait">
        <div className="title-slide__portrait-content">
          {brandContent ? (
            <div className="title-slide__brand-content animate-fade-in delay-80">{brandContent}</div>
          ) : brandName ? (
            <h1 className="title-slide__portrait-brand animate-fade-in delay-80">{brandName}</h1>
          ) : null}
          <p className="title-slide__portrait-subtitle animate-slide-up delay-300">{subtitle}</p>
        </div>
        <div className="title-slide__portrait-footer">
          {renderFounderDetails(true)}
        </div>
      </div>
    );
  }

  // Landscape layout
  return (
    <div className="title-slide title-slide--landscape">
      {background && (
        <div className="title-slide__background">{background}</div>
      )}
      <div className="title-slide__title-block">
        {brandContent ? (
          <div className="title-slide__brand-content animate-fade-in delay-80">{brandContent}</div>
        ) : brandName ? (
          <h1 className="title-slide__brand animate-fade-in delay-80">{brandName}</h1>
        ) : null}
        <p className="title-slide__subtitle animate-slide-up delay-300">{subtitle}</p>
      </div>
      <div className="title-slide__footer">
        <div className="title-slide__footer-left">
          {renderFounderDetails(false)}
        </div>
      </div>
    </div>
  );
};

export default TitleSlide;
