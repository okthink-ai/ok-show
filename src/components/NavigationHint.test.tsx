import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import uiReducer, { setResponsiveState } from '../store/uiSlice';
import NavigationHint from './NavigationHint';

function setup({ mobile = true, firstSlide = true, seen = false } = {}) {
  const store = configureStore({ reducer: { ui: uiReducer } });
  if (seen) store.dispatch({ type: 'ui/markNavHintSeen' });
  store.dispatch(setResponsiveState({ isMobile: mobile, aspectRatio: mobile ? '9:16' : '16:9', showDebugButton: !mobile }));
  const view = render(<Provider store={store}><NavigationHint isFirstSlide={firstSlide} /></Provider>);
  return { store, ...view };
}

const hint = () => screen.queryByTestId('nav-hint');
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('NavigationHint', () => {
  it('appears after a short delay, is marked seen, and leaves by itself', () => {
    const { store } = setup();
    expect(hint()).toBeNull();
    advance(399);
    expect(hint()).toBeNull();
    advance(1);
    expect(hint()).not.toBeNull();
    expect(screen.getByText('Tap to go back')).toBeInTheDocument();
    expect(screen.getByText('Tap to advance')).toBeInTheDocument();
    expect(store.getState().ui.navHintSeen).toBe(true);

    advance(3000);
    expect(hint()).toHaveClass('nav-hint--exiting');
    advance(500);
    expect(hint()).toBeNull();
  });

  it('dismisses on tap', () => {
    setup();
    advance(400);
    fireEvent.click(hint()!);
    expect(hint()).toHaveClass('nav-hint--exiting');
    advance(500);
    expect(hint()).toBeNull();
  });

  it('stays hidden once seen, on desktop, and off the first slide', () => {
    setup({ seen: true });
    advance(5000);
    expect(hint()).toBeNull();
    cleanup();
    setup({ mobile: false });
    advance(5000);
    expect(hint()).toBeNull();
    cleanup();
    setup({ firstSlide: false });
    advance(5000);
    expect(hint()).toBeNull();
  });

  it('does not come back after dismissal, even if the slide changes back', () => {
    const { rerender, store } = setup();
    advance(400);
    advance(3000);
    advance(500);
    expect(hint()).toBeNull();
    rerender(<Provider store={store}><NavigationHint isFirstSlide={false} /></Provider>);
    rerender(<Provider store={store}><NavigationHint isFirstSlide /></Provider>);
    advance(5000);
    expect(hint()).toBeNull();
  });
});
