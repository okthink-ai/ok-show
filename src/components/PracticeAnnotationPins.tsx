import { useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useAppSelector } from '../store/hooks';
import { isPracticeAnnotation, practiceAnnotationLine } from '../practice/annotationPins';
import type { TextAnnotation } from '../types/annotation.types';

export default function PracticeAnnotationPins({ presentationId, source, contentRef, onOpenAnnotations }: {
  onOpenAnnotations?: () => void;
  presentationId: string;
  source: string;
  contentRef: RefObject<HTMLDivElement | null>;
}) {
  const annotations = useAppSelector((state) => state.annotations.annotations);
  const pinsRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => {
    const byLine = new Map<number, TextAnnotation[]>();
    for (const item of annotations) {
      if (item.presentationId !== presentationId || !isPracticeAnnotation(item)) continue;
      const line = practiceAnnotationLine(item, source);
      if (line === null) continue;
      const group = byLine.get(line) ?? [];
      group.push(item);
      byLine.set(line, group);
    }
    return Array.from(byLine, ([line, items]) => ({ line, items }));
  }, [annotations, presentationId, source]);

  useLayoutEffect(() => {
    const pins = pinsRef.current;
    const content = contentRef.current ?? pins?.parentElement;
    if (!content || !pins || groups.length === 0) return;
    let frame = 0;
    const placePins = () => {
      const origin = content.getBoundingClientRect().top;
      const blocks = Array.from(content.querySelectorAll<HTMLElement>('[data-source-line]'));
      const positions = Array.from(pins.querySelectorAll<HTMLButtonElement>('button')).map((button) => {
        const line = Number(button.dataset.annotationLine);
        const block = blocks.filter((element) => Number(element.dataset.sourceLine) <= line && Number(element.dataset.sourceEndLine) >= line)
          .sort((a, b) => (Number(a.dataset.sourceEndLine) - Number(a.dataset.sourceLine)) - (Number(b.dataset.sourceEndLine) - Number(b.dataset.sourceLine)))[0];
        return { button, top: block ? block.getBoundingClientRect().top - origin : null };
      }).sort((a, b) => (a.top ?? Infinity) - (b.top ?? Infinity));
      let previousBottom = 0;
      for (const { button, top } of positions) {
        button.hidden = top === null;
        if (top === null) continue;
        const placedTop = Math.max(top, previousBottom);
        button.style.top = `${placedTop}px`;
        previousBottom = placedTop + 44;
      }
    };
    placePins();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(placePins);
    });
    observer.observe(content);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [contentRef, groups]);

  return <div ref={pinsRef} className="practice-annotation-pins" role="group" aria-label="Practice annotation markers">
    {groups.map(({ line, items }) => <button key={line} type="button" className="practice-annotation-pin" data-annotation-line={line}
      aria-label={items.length === 1 ? `Edit annotation: ${items[0].comment}` : `Edit ${items.length} annotations at this passage`}
      title={items.map((item) => item.comment).join('\n')}
      onClick={onOpenAnnotations}>
      <span className="practice-annotation-pin__badge" aria-hidden="true">{items.length > 1 ? items.length : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="m8 3 8 0-1 6 3 3v2h-5v7l-2-2v-5H6v-2l3-3z" /></svg>}</span>
    </button>)}
  </div>;
}
