// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { presentations } from './project/presentations';
import { createDebugAdapter } from './debugAdapter';
import { store } from './store/store';
import { goToSlide, selectPresentation } from './store/presentationSlice';
import { setTheme } from './store/uiSlice';

describe('debug adapter', () => {
  const adapter = createDebugAdapter(store, presentations);

  beforeEach(() => {
    store.dispatch(selectPresentation(presentations[0].id));
    store.dispatch(goToSlide({ index: 0, totalSlides: presentations[0].slides.length }));
    store.dispatch(setTheme('midnight'));
  });

  it('exposes snapshots and deliberate commands without exposing the store', () => {
    const result = adapter.goToSlide(2, presentations[0].id);
    const themed = adapter.setTheme('paper');

    expect(result.currentSlide).toBe(2);
    expect(themed.theme).toBe('paper');
    expect(adapter.getSlides(presentations[0].id)).toHaveLength(presentations[0].slides.length);
    expect(adapter).not.toHaveProperty('store');
    expect(adapter).not.toHaveProperty('dispatch');
  });

  it('rejects invalid commands at the adapter boundary', () => {
    expect(() => adapter.goToSlide(0)).toThrow('positive integer');
    expect(() => adapter.getSlides('missing')).toThrow('Unknown presentation: missing');
    expect(() => adapter.goToSlide(1, 'missing')).toThrow('Unknown presentation: missing');
    expect(() => adapter.setTheme('unknown')).toThrow('Unknown theme');
  });
});
