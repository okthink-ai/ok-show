import type { CSSProperties, FC } from 'react';
import type { SlideProps } from '../types/slide.types';
import './Slide.css';

const Slide: FC<SlideProps> = ({ slide, aspectRatio, isActive, slideNumber, totalSlides }) => {
  const className = `slide ${aspectRatio === '16:9' ? 'slide--landscape' : 'slide--portrait'} ${
    isActive ? 'slide--active' : ''
  } ${slide.className || ''}`;

  const style: CSSProperties = {
    ...(slide.backgroundColor ? { background: slide.backgroundColor } : {}),
    '--slide-progress': `${(slideNumber / totalSlides) * 100}%`,
  } as CSSProperties;

  return (
    <div className={className} style={style} data-slide-key={slide.id}>
      <div className="slide__content">
        {slide.content}
      </div>
      {slide.qrCode && (
        <div className="slide__qr-code" data-qr-url={slide.qrCode.url} title={slide.qrCode.url}>
          <img src={slide.qrCode.src} alt={slide.qrCode.alt} />
          <span className="slide__qr-code-label">{slide.qrCode.label ?? 'Scan me'}</span>
        </div>
      )}
    </div>
  );
};

export default Slide;
