import { expect, it } from 'vitest';
import type { TextAnnotation } from '../types/annotation.types';
import { practiceAnnotationLine } from './annotationPins';

const annotation = { text: 'Original passage.', practice: { target: 'talk', sourceLine: 3, sourceEndLine: 3 } } as TextAnnotation;
it('keeps a pin attached when lines are inserted before its captured passage', () => {
  expect(practiceAnnotationLine(annotation, '# Talk\n\nNew introduction.\n\nOriginal passage.')).toBe(5);
});
it('chooses the closest occurrence of a repeated passage', () => {
  expect(practiceAnnotationLine(annotation, 'Original passage.\n\nOriginal passage.')).toBe(3);
});
it('does not silently move a removed passage pin to unrelated text', () => {
  expect(practiceAnnotationLine(annotation, '# Talk\n\nSomething else.')).toBeNull();
});
it('anchors whole-slide requests to the reading passage and supports older records', () => {
  const slide = { ...annotation, text: 'Slide title', practice: { ...annotation.practice!, target: 'slide' as const, sourceText: 'Original passage.' } };
  expect(practiceAnnotationLine(slide, '# Talk\n\nNew introduction.\n\nOriginal passage.')).toBe(5);
  expect(practiceAnnotationLine({ ...slide, practice: { ...slide.practice, sourceText: undefined } }, '# Talk')).toBe(3);
});
