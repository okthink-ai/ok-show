import { describe, expect, it, vi } from 'vitest';
import reducer, { markNavHintSeen, openSidebar, pausePresenterTimer, resetPresenterTimer, setDrawerWidth, setPracticeTextSize, setPresenterTalkMinutes, setTheme, startPresenterTimer, startPresenterTimerIfIdle, toggleDeveloperTools } from './uiSlice';

describe('theme state', () => {
  it('changes the active theme', () => {
    const state = reducer(undefined, setTheme('forest'));
    expect(state.theme).toBe('forest');
  });
});

describe('developer tools drawer', () => {
  it('restores the last selected section when reopened', () => {
    const opened = reducer(undefined, openSidebar('annotations'));
    const closed = reducer(opened, toggleDeveloperTools());
    expect(closed.activeSidebar).toBeNull();
    expect(reducer(closed, toggleDeveloperTools()).activeSidebar).toBe('annotations');
  });
});

describe('presenter timer', () => {
  it('banks running time on pause and clears on reset', () => {
    const running = reducer(undefined, startPresenterTimer(1_000));
    const paused = reducer(running, pausePresenterTimer(4_000));
    expect(paused.presenterTimer).toEqual({ runningSince: null, elapsedMs: 3_000 });
    expect(reducer(paused, resetPresenterTimer()).presenterTimer).toEqual({ runningSince: null, elapsedMs: 0 });
  });

  it('auto-starts only a fresh clock', () => {
    const started = reducer(undefined, startPresenterTimerIfIdle(1_000));
    expect(started.presenterTimer.runningSince).toBe(1_000);
    const paused = reducer(started, pausePresenterTimer(2_000));
    expect(reducer(paused, startPresenterTimerIfIdle(5_000)).presenterTimer).toEqual(paused.presenterTimer);
  });
});

describe('presenter preferences', () => {
  it('clamps reading size and talk length', () => {
    expect(reducer(undefined, setPracticeTextSize(100)).practiceTextSize).toBe(36);
    expect(reducer(undefined, setPracticeTextSize(4)).practiceTextSize).toBe(16);
    expect(reducer(undefined, setPresenterTalkMinutes(2)).presenterTalkMinutes).toBe(5);
    expect(reducer(undefined, setPresenterTalkMinutes(40)).presenterTalkMinutes).toBe(40);
  });
});

describe('drawer width', () => {
  it('clamps the stored width', () => {
    expect(reducer(undefined, setDrawerWidth(10)).drawerWidth).toBe(340);
    expect(reducer(undefined, setDrawerWidth(5000)).drawerWidth).toBeLessThanOrEqual(900);
    expect(reducer(undefined, setDrawerWidth(Number.NaN)).drawerWidth).toBe(reducer(undefined, { type: 'x' }).drawerWidth);
  });
});

describe('navigation hint', () => {
  it('starts unseen and is marked seen once', async () => {
    expect(reducer(undefined, { type: 'x' }).navHintSeen).toBe(false);
    const seen = reducer(undefined, markNavHintSeen());
    expect(seen.navHintSeen).toBe(true);
    expect(reducer(seen, markNavHintSeen()).navHintSeen).toBe(true);
  });

  it('restores the seen flag from storage, and tolerates unavailable storage', async () => {
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: (key: string) => (key === 'ok-show-nav-hint-seen' ? 'true' : null) });
    const restored = await import('./uiSlice');
    expect(restored.default(undefined, { type: 'x' }).navHintSeen).toBe(true);

    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
    const blocked = await import('./uiSlice');
    expect(blocked.default(undefined, { type: 'x' }).navHintSeen).toBe(false);
    vi.unstubAllGlobals();
  });

  it('is saved through the store under its documented key', async () => {
    vi.resetModules();
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
    });
    const { store } = await import('./store');
    const slice = await import('./uiSlice');
    expect(data.has(slice.NAV_HINT_SEEN_KEY)).toBe(false);
    store.dispatch(slice.markNavHintSeen());
    expect(data.get('ok-show-nav-hint-seen')).toBe('true');
    vi.unstubAllGlobals();
  });
});
