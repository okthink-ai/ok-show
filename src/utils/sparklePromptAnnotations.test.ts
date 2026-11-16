import { describe, expect, it } from 'vitest';
import type { SparklePromptAnnotation } from '../types/annotation.types';
import { resolveSparklePromptAnchor } from './sparklePromptAnnotations';

const annotation: SparklePromptAnnotation = {
  id: 'sparkle-annotation',
  type: 'sparkle-prompt',
  presentationId: 'demo',
  slideId: 'vocabulary-pile-up',
  slideIndex: 2,
  slideTemplate: 'VocabularySlide',
  slideTitle: 'Too Many New Things',
  aspectRatio: '16:9',
  field: 'imagePrompt',
  promptSnapshot: 'Put the confused developer on the right.',
  quotedText: 'confused developer',
  surroundingContext: { before: 'Put the ', after: ' on the right.' },
  rangeStart: 8,
  rangeEnd: 26,
  normalizedPosition: { x: 0, y: 0 },
  comment: 'Make the expression more puzzled.',
  timestamp: 1,
};

describe('resolveSparklePromptAnchor', () => {
  it('uses the original exact range while the prompt is unchanged', () => {
    expect(resolveSparklePromptAnchor(annotation, annotation.promptSnapshot)).toEqual({
      resolved: true,
      start: 8,
      end: 26,
    });
  });

  it('reanchors quoted text after the prompt changes', () => {
    expect(resolveSparklePromptAnchor(annotation, 'In the scene, put the confused developer on the right.')).toEqual({
      resolved: true,
      start: 22,
      end: 40,
    });
  });

  it('reports an unresolved annotation when its quoted text is gone', () => {
    expect(resolveSparklePromptAnchor(annotation, 'Put the workstation on the right.')).toEqual({
      resolved: false,
      start: 8,
      end: 26,
    });
  });
});
