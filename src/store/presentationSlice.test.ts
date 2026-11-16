import { describe, expect, it } from 'vitest';
import reducer, { goToSlide, nextSlide, previousSlide } from './presentationSlice';

const initial = { currentPresentationId: 'demo', currentSlide: 0 };

describe('presentation navigation', () => {
  it('navigates and clamps at both ends', () => {
    let state = reducer(initial, nextSlide(3));
    expect(state.currentSlide).toBe(1);
    state = reducer(state, goToSlide({ index: 99, totalSlides: 3 }));
    expect(state.currentSlide).toBe(2);
    state = reducer(state, nextSlide(3));
    expect(state.currentSlide).toBe(2);
    state = reducer(state, previousSlide());
    expect(state.currentSlide).toBe(1);
  });
});
