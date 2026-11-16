import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SlideContainer from './SlideContainer';

const slides = [0, 1, 2, 3].map((n) => ({ id: `s${n}`, content: <p>Slide {n}</p> }));

function setup(opts: { annotating: boolean; surface?: string; current?: number }) {
  const store = configureStore({
    reducer: {
      annotations: () => ({ isMultiSelectMode: opts.annotating }),
      ui: () => ({ isFullscreen: false }),
    },
  });
  const onSlideChange = vi.fn();
  const ui = (current: number) => (
    <Provider store={store}>
      <div data-app-surface={opts.surface}>
        <SlideContainer slides={slides} aspectRatio="16:9" currentSlide={current} onSlideChange={onSlideChange} />
      </div>
    </Provider>
  );
  const view = render(ui(opts.current ?? 0));
  const text = () => view.container.querySelector('p') as HTMLElement;
  return { view, ui, onSlideChange, text };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('SlideContainer click-to-advance', () => {
  it('advances immediately without delay in the public deck', () => {
    const { onSlideChange, text } = setup({ annotating: true, surface: 'presentation' });
    fireEvent.click(text(), { detail: 1 });
    fireEvent.click(text(), { detail: 2 });
    expect(onSlideChange).toHaveBeenCalledTimes(2);
  });

  it('delays text clicks in the authoring app and uses the current slide when the timer fires', () => {
    const { view, ui, onSlideChange, text } = setup({ annotating: true, surface: 'authoring' });
    fireEvent.click(text(), { detail: 1 });
    expect(onSlideChange).not.toHaveBeenCalled();
    view.rerender(ui(2));
    act(() => { vi.advanceTimersByTime(250); });
    expect(onSlideChange).toHaveBeenCalledWith(3);
  });

  it('cancels the pending click when the text is double-clicked for editing', () => {
    const { onSlideChange, text } = setup({ annotating: false, surface: 'authoring' });
    fireEvent.click(text(), { detail: 1 });
    fireEvent.doubleClick(text());
    act(() => { vi.advanceTimersByTime(250); });
    expect(onSlideChange).not.toHaveBeenCalled();
  });
});
