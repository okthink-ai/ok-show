import type { FC } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import type { SlideData } from '../types/slide.types';
import type { Annotation } from '../types/annotation.types';
import { extractSlideText } from '../utils/slideTextExtractor';
import './OutlineSidebar.css';

interface OutlineSidebarProps {
  slides: SlideData[];
  currentSlide: number;
  onSlideClick: (index: number) => void;
  onClose: () => void;
  isMultiSelectMode: boolean;
  annotations: Annotation[];
  onAnnotateFromOutline: (slideIndex: number, propPath: string, text: string) => void;
}

interface OutlineSlideCardProps {
  slide: SlideData;
  index: number;
  isCurrent: boolean;
  isMultiSelectMode: boolean;
  annotations: Annotation[];
  onSlideClick: (index: number) => void;
  onAnnotateFromOutline: (slideIndex: number, propPath: string, text: string) => void;
  cardRef?: React.RefObject<HTMLDivElement | null>;
}

const OutlineSlideCard: FC<OutlineSlideCardProps> = ({
  slide,
  index,
  isCurrent,
  isMultiSelectMode,
  annotations,
  onSlideClick,
  onAnnotateFromOutline,
  cardRef,
}) => {
  const textContent = extractSlideText(slide);
  const slideAnnotations = annotations.filter(a => a.slideIndex === index);

  // Pre-compute a propPath → annotation map so each element lookup is O(1)
  // instead of scanning the full annotation array for every text element.
  const outlineAnnotationMap = useMemo(() => {
    const map = new Map<string, Annotation>();
    for (const a of slideAnnotations) {
      if (a.type === 'text' && a.source === 'outline' && a.propPath) {
        map.set(a.propPath, a);
      }
    }
    return map;
  }, [slideAnnotations]);

  return (
    <div
      ref={cardRef}
      className={`outline-card ${isCurrent ? 'outline-card--current' : ''}`}
    >
      <div
        className="outline-card__header"
        onClick={() => onSlideClick(index)}
      >
        <span className="outline-card__number">{index + 1}</span>
        <span className="outline-card__template">
          {textContent?.template ?? slide.template ?? 'Slide'}
        </span>
      </div>

      {textContent && textContent.elements.length > 0 && (
        <div className="outline-card__body">
          {textContent.elements.map((element) => {
            const matchingAnnotation = outlineAnnotationMap.get(element.propPath);
            const hasAnnotation = Boolean(matchingAnnotation);
            const annotationNumber = matchingAnnotation
              ? annotations.indexOf(matchingAnnotation) + 1
              : null;

            return (
              <span
                key={element.propPath}
                className={[
                  'outline-text',
                  `outline-text--${element.role}`,
                  isMultiSelectMode ? 'outline-text--annotatable' : '',
                  hasAnnotation ? 'outline-text--annotated' : '',
                ].filter(Boolean).join(' ')}
                onClick={
                  isMultiSelectMode
                    ? () => onAnnotateFromOutline(index, element.propPath, element.text)
                    : undefined
                }
              >
                {hasAnnotation && annotationNumber !== null && (
                  <span className="outline-text__badge">{annotationNumber}</span>
                )}
                {element.role === 'body' && (
                  <span className="outline-text__bullet">•</span>
                )}
                {element.text}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

const OutlineSidebar: FC<OutlineSidebarProps> = ({
  slides,
  currentSlide,
  onSlideClick,
  onClose,
  isMultiSelectMode,
  annotations,
  onAnnotateFromOutline,
}) => {
  const currentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentSlide]);

  return (
    <div className="outline-sidebar">
      <div className="outline-sidebar__header">
        <h3 className="outline-sidebar__title">Outline</h3>
        <button className="outline-sidebar__close" onClick={onClose}>×</button>
      </div>
      <div className="outline-sidebar__content">
        {slides.map((slide, index) => (
          <OutlineSlideCard
            key={slide.id}
            slide={slide}
            index={index}
            isCurrent={index === currentSlide}
            isMultiSelectMode={isMultiSelectMode}
            annotations={annotations}
            onSlideClick={onSlideClick}
            onAnnotateFromOutline={onAnnotateFromOutline}
            cardRef={index === currentSlide ? currentRef : undefined}
          />
        ))}
      </div>
    </div>
  );
};

export default OutlineSidebar;
