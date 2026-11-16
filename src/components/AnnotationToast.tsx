import type { FC } from 'react';
import { useEffect, useRef } from 'react';
import MaterialIcon from './MaterialIcon';
import './AnnotationToast.css';

interface AnnotationToastProps {
  count: number;
  onClick: () => void;
}

const AnnotationToast: FC<AnnotationToastProps> = ({ count, onClick }) => {
  const countRef = useRef<HTMLSpanElement>(null);
  const prevCountRef = useRef<number>(count);

  useEffect(() => {
    if (count !== prevCountRef.current && countRef.current) {
      const el = countRef.current;
      // Remove then re-add the class to restart the animation
      el.classList.remove('annotation-toast__count--pulse');
      // Force reflow
      void el.offsetWidth;
      el.classList.add('annotation-toast__count--pulse');
    }
    prevCountRef.current = count;
  }, [count]);

  return (
    <button
      className="annotation-toast"
      onClick={onClick}
      aria-label={`${count} annotation${count !== 1 ? 's' : ''}. Click to open summary.`}
      type="button"
    >
      <MaterialIcon name="edit_note" size="small" className="annotation-toast__icon" />
      <span
        ref={countRef}
        className="annotation-toast__count"
        onAnimationEnd={() => {
          countRef.current?.classList.remove('annotation-toast__count--pulse');
        }}
      >
        {count}
      </span>
    </button>
  );
};

export default AnnotationToast;
