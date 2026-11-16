import type { FC } from 'react';
import type { Presentation } from '../types/slide.types';
import MaterialIcon from './MaterialIcon';
import './PresentationSidebar.css';

interface PresentationSidebarProps {
  presentations: Presentation[];
  currentPresentationId: string;
  onPresentationSelect: (id: string) => void;
}

const PresentationSidebar: FC<PresentationSidebarProps> = ({
  presentations,
  currentPresentationId,
  onPresentationSelect,
}) => {
  return (
    <div className="presentation-sidebar">
      <div className="presentation-sidebar__header">
        <h3 className="presentation-sidebar__title">Presentations</h3>
      </div>
      <div className="presentation-sidebar__content">
        {presentations.map((presentation) => (
          <button
            key={presentation.id}
            className={`presentation-sidebar__item ${
              presentation.id === currentPresentationId ? 'presentation-sidebar__item--active' : ''
            }`}
            onClick={() => onPresentationSelect(presentation.id)}
          >
            <div className="presentation-sidebar__icon">
              <MaterialIcon name="slideshow" size="medium" />
            </div>
            <div className="presentation-sidebar__details">
              <div className="presentation-sidebar__name">{presentation.title}</div>
              <div className="presentation-sidebar__meta">
                {presentation.slides.length} slides
                {presentation.date && ` · ${presentation.date}`}
              </div>
              {presentation.description && (
                <div className="presentation-sidebar__description">
                  {presentation.description}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default PresentationSidebar;
