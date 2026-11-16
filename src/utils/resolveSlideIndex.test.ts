import { describe, expect, it } from 'vitest';
import { resolveSlideIndex } from './resolveSlideIndex';

const slides = [{ id: 'a' }, { id: 'new' }, { id: 'pricing' }];

describe('resolveSlideIndex', () => {
  it('follows the slide ID after slides are inserted or moved', () => {
    expect(resolveSlideIndex(slides, 'pricing', 1)).toBe(2);
  });
  it('falls back to the captured index when the slide is gone', () => {
    expect(resolveSlideIndex(slides, 'deleted', 1)).toBe(1);
  });
});
