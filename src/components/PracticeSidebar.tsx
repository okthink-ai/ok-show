import type { RefObject } from 'react';
import { hasManuscript } from '../practice/manuscriptRegistry';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setPracticeTextSize, openSidebar, READING_SIZE_MAX, READING_SIZE_MIN, READING_SIZE_STEP } from '../store/uiSlice';
import type { PracticePosition } from '../practice/slideCues';
import type { SlideData } from '../types/slide.types';
import TalkPracticeReader from './TalkPracticeReader';
import './PracticeSidebar.css';

interface PracticeSidebarProps {
  presentationId: string;
  slides: SlideData[];
  currentSlide: number;
  onSlideChange: (index: number) => void;
  position: RefObject<PracticePosition>;
}

export default function PracticeSidebar(props: PracticeSidebarProps) {
  const dispatch = useAppDispatch();
  const textSize = useAppSelector(state => state.ui.practiceTextSize);
  return (
    <section className="practice-sidebar" aria-label="Practice sidebar">
      <header className="practice-sidebar__header">
        <h2>Practice</h2>
        {hasManuscript(props.presentationId) && <div role="group" aria-label="Practice text size">
          <button type="button" aria-label="Decrease practice text size" disabled={textSize <= READING_SIZE_MIN} onClick={() => dispatch(setPracticeTextSize(textSize - READING_SIZE_STEP))}>A−</button>
          <button type="button" aria-label="Increase practice text size" disabled={textSize >= READING_SIZE_MAX} onClick={() => dispatch(setPracticeTextSize(textSize + READING_SIZE_STEP))}>A+</button>
        </div>}
      </header>
      {hasManuscript(props.presentationId)
        ? <TalkPracticeReader {...props} canNavigate onOpenAnnotations={() => dispatch(openSidebar('annotations'))} />
        : <p className="practice-sidebar__empty">This presentation has no practice manuscript. Add <code>manuscript.md</code> to its deck folder to rehearse here.</p>}
    </section>
  );
}
