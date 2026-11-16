import { describe, expect, it } from 'vitest';
import { resolveSlideOrder } from './slideOrderConstraints';

const slides = ['a', 'b', 'c', 'd'].map((id) => ({ id }));

describe('resolveSlideOrder', () => {
  it('moves a slide relative to a stable anchor while preserving unaffected order', () => {
    const result = resolveSlideOrder(slides, [{ slideId: 'd', anchorSlideId: 'b', placement: 'before' }]);

    expect(result.conflict).toBe(false);
    expect(result.slides.map((slide) => slide.id)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('resolves simultaneous constraints instead of applying captured indexes sequentially', () => {
    const result = resolveSlideOrder(slides, [
      { slideId: 'a', anchorSlideId: 'd', placement: 'after' },
      { slideId: 'c', anchorSlideId: 'b', placement: 'before' },
    ]);

    expect(result.conflict).toBe(false);
    expect(result.slides.map((slide) => slide.id)).toEqual(['c', 'b', 'd', 'a']);
  });

  it.each([
    ['forward with after', { slideId: 'a', anchorSlideId: 'c', placement: 'after' as const }, ['b', 'c', 'a', 'd']],
    ['forward with before', { slideId: 'a', anchorSlideId: 'd', placement: 'before' as const }, ['b', 'c', 'a', 'd']],
    ['backward with after', { slideId: 'd', anchorSlideId: 'a', placement: 'after' as const }, ['a', 'd', 'b', 'c']],
    ['backward with before', { slideId: 'd', anchorSlideId: 'b', placement: 'before' as const }, ['a', 'd', 'b', 'c']],
  ])('moves a slide %s', (_label, constraint, expected) => {
    const result = resolveSlideOrder(slides, [constraint]);

    expect(result.conflict).toBe(false);
    expect(result.slides.map((slide) => slide.id)).toEqual(expected);
  });

  it('keeps several slides placed after the same anchor directly behind it', () => {
    const result = resolveSlideOrder(slides, [
      { slideId: 'c', anchorSlideId: 'a', placement: 'after' },
      { slideId: 'd', anchorSlideId: 'c', placement: 'after' },
    ]);

    expect(result.slides.map((slide) => slide.id)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('reports cyclic constraints and leaves the source order unchanged', () => {
    const result = resolveSlideOrder(slides, [
      { slideId: 'a', anchorSlideId: 'b', placement: 'after' },
      { slideId: 'b', anchorSlideId: 'a', placement: 'after' },
    ]);

    expect(result.conflict).toBe(true);
    expect(result.slides).toEqual(slides);
  });
});
