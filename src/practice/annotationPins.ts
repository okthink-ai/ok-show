import type { Annotation, TextAnnotation } from '../types/annotation.types';

export function isPracticeAnnotation(annotation: Annotation): annotation is TextAnnotation {
  return annotation.type === 'text' && annotation.source === 'practice' && Boolean(annotation.practice);
}

// Keep pins with their captured passage when edits above it move source lines.
// Older whole-slide annotations only have a line number; keep supporting them.
export function practiceAnnotationLine(annotation: TextAnnotation, source: string): number | null {
  const anchor = annotation.practice;
  if (!anchor) return null;
  const snapshot = anchor.sourceText ?? (anchor.target === 'talk' ? annotation.text : '');
  if (!snapshot.trim()) return anchor.sourceLine;
  let nearest: number | null = null;
  let offset = source.indexOf(snapshot);
  while (offset !== -1) {
    const line = source.slice(0, offset).split('\n').length;
    if (nearest === null || Math.abs(line - anchor.sourceLine) < Math.abs(nearest - anchor.sourceLine)) nearest = line;
    offset = source.indexOf(snapshot, offset + snapshot.length);
  }
  return nearest;
}
