import type { FC } from 'react';
import type { BaseSlideProps } from 'ok-vibe-slides';
import SlideHeader from 'ok-vibe-slides/slides/SlideHeader';
import './QuoteSlide.css';

interface QuoteSlideProps extends BaseSlideProps {
  quote: string;
  attribution: string;
}

/** A project-local template, outside the engine's template set. */
const QuoteSlide: FC<QuoteSlideProps> = ({ orientation = 'landscape', quote, attribution }) => (
  <div className={`quote-slide quote-slide--${orientation}`}>
    <SlideHeader orientation={orientation} label="Quote" title="What customers say" />
    <blockquote className="quote-slide__quote">{quote}</blockquote>
    <p className="quote-slide__attribution">{attribution}</p>
    <img className="quote-slide__logo" src="/fixture-logo.svg" alt="Fixture logo" />
  </div>
);

export default QuoteSlide;
