import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSyncServerUrl,
  isPresentationSyncRequested,
  NAVIGATION_RESPONSE_TIMEOUT_MS,
  usePresentationSync,
} from './usePresentationSync';

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();

  constructor(url: string | URL) {
    void url;
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  close(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code, reason: '' } as CloseEvent);
  }
}

function sentMessages(socket: FakeWebSocket) {
  return socket.send.mock.calls.map(([payload]) => JSON.parse(String(payload)));
}

function sentNavigations(socket: FakeWebSocket) {
  return sentMessages(socket).filter((message) => message.type === 'navigate');
}

function navigatedSlides(dispatch: ReturnType<typeof vi.fn>) {
  return dispatch.mock.calls
    .map(([action]) => action as { type: string; payload: { index: number } })
    .filter((action) => action.type === 'presentation/goToSlide')
    .map((action) => action.payload.index);
}

function demoState(slideIndex: number, revision: number) {
  return {
    type: 'state', sessionId: 'default',
    state: { presentationId: 'demo', slideIndex, totalSlides: 4, theme: 'midnight', revision, updatedAt: revision },
  };
}

describe('usePresentationSync reconnect backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('backs off repeated short-lived connections and resets after valid state', () => {
    const dispatch = vi.fn();
    const { unmount } = renderHook(() => usePresentationSync({
      dispatch: dispatch as never, presentationId: 'demo', slideIndex: 0,
      totalSlides: 1, theme: 'midnight',
    }));

    const first = FakeWebSocket.instances[0];
    act(() => { first.open(); first.close(); });
    act(() => { vi.advanceTimersByTime(249); });
    expect(FakeWebSocket.instances).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(1); });

    const second = FakeWebSocket.instances[1];
    act(() => { second.open(); second.close(); vi.advanceTimersByTime(499); });
    expect(FakeWebSocket.instances).toHaveLength(2);
    act(() => { vi.advanceTimersByTime(1); });

    const third = FakeWebSocket.instances[2];
    act(() => {
      third.open();
      third.message({
        type: 'state', sessionId: 'default',
        state: { presentationId: 'demo', slideIndex: 0, totalSlides: 1, theme: 'midnight', revision: 1, updatedAt: 1 },
      });
      third.close();
      vi.advanceTimersByTime(249);
    });
    expect(FakeWebSocket.instances).toHaveLength(3);
    act(() => { vi.advanceTimersByTime(1); });
    expect(FakeWebSocket.instances).toHaveLength(4);
    unmount();
  });

  it('stays disconnected without opening a socket when disabled', () => {
    const { result } = renderHook(() => usePresentationSync({
      dispatch: vi.fn() as never, presentationId: 'demo', slideIndex: 0,
      totalSlides: 1, theme: 'midnight', enabled: false,
    }));

    expect(result.current.status).toBe('disconnected');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('does not expose notes after the active presentation changes', () => {
    const dispatch = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ presentationId }) => usePresentationSync({
        dispatch: dispatch as never,
        presentationId,
        slideIndex: 0,
        totalSlides: 1,
        theme: 'midnight',
        role: 'notes',
      }),
      { initialProps: { presentationId: 'demo' } },
    );
    const socket = FakeWebSocket.instances[0];
    act(() => {
      socket.open();
      socket.message({
        type: 'notes', sessionId: 'default', presentationId: 'demo',
        revision: 1,
        notes: { 'shared-slide-id': ['Private demo note'] },
        sparkle: { 'shared-slide-id': { style: 'Ink', imagePrompt: 'Draw it.', motionPrompt: 'Move it.' } },
      });
    });
    expect(result.current.notes).toEqual({ 'shared-slide-id': ['Private demo note'] });
    expect(result.current.sparklePrompts).toEqual({
      'shared-slide-id': { style: 'Ink', imagePrompt: 'Draw it.', motionPrompt: 'Move it.' },
    });

    rerender({ presentationId: 'another-deck' });
    expect(result.current.notes).toEqual({});
    expect(result.current.sparklePrompts).toEqual({});
    unmount();
  });

  it('requests notes at the server revision without publishing notes-client navigation', () => {
    const dispatch = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ presentationId, slideIndex }) => usePresentationSync({
        dispatch: dispatch as never,
        presentationId,
        slideIndex,
        totalSlides: 4,
        theme: 'midnight',
        role: 'notes',
        applyRemoteState: false,
      }),
      { initialProps: { presentationId: 'keynote', slideIndex: 0 } },
    );
    const socket = FakeWebSocket.instances[0];

    act(() => {
      socket.open();
      socket.message({
        type: 'state', sessionId: 'default',
        state: { presentationId: 'demo', slideIndex: 3, totalSlides: 13, theme: 'light', revision: 6, updatedAt: 1 },
      });
    });

    expect(result.current.status).toBe('connected');
    expect(dispatch).not.toHaveBeenCalled();
    expect(socket.send.mock.calls.map(([payload]) => JSON.parse(String(payload)))).toEqual([
      expect.objectContaining({ type: 'join', role: 'notes' }),
      { type: 'request-notes', presentationId: 'keynote', baseRevision: 6 },
    ]);

    act(() => {
      socket.message({
        type: 'notes', sessionId: 'default', presentationId: 'keynote', revision: 6,
        notes: { title: ['Requested notes'] },
        sparkle: { title: { style: 'Ink', imagePrompt: 'Draw it.', motionPrompt: 'Move it.' } },
      });
    });
    expect(result.current.notes).toEqual({ title: ['Requested notes'] });
    expect(result.current.sparklePrompts).toEqual({
      title: { style: 'Ink', imagePrompt: 'Draw it.', motionPrompt: 'Move it.' },
    });

    rerender({ presentationId: 'keynote', slideIndex: 1 });
    expect(socket.send).toHaveBeenCalledTimes(2);

    rerender({ presentationId: 'demo', slideIndex: 1 });
    expect(JSON.parse(String(socket.send.mock.calls.at(-1)?.[0]))).toEqual({
      type: 'request-notes', presentationId: 'demo', baseRevision: 6,
    });
    expect(socket.send.mock.calls.map(([payload]) => JSON.parse(String(payload)).type)).not.toContain('navigate');
    unmount();
  });

  it('lets the presenter view drive the session while still requesting notes', () => {
    const dispatch = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ slideIndex }) => usePresentationSync({
        dispatch: dispatch as never,
        presentationId: 'demo',
        slideIndex,
        totalSlides: 4,
        theme: 'midnight',
        role: 'notes',
        canNavigate: true,
      }),
      { initialProps: { slideIndex: 0 } },
    );
    const socket = FakeWebSocket.instances[0];

    act(() => {
      socket.open();
      socket.message({
        type: 'state', sessionId: 'default',
        state: { presentationId: 'demo', slideIndex: 0, totalSlides: 4, theme: 'midnight', revision: 2, updatedAt: 1 },
      });
    });

    rerender({ slideIndex: 1 });

    const sent = socket.send.mock.calls.map(([payload]) => JSON.parse(String(payload)));
    expect(sent).toContainEqual({ type: 'request-notes', presentationId: 'demo', baseRevision: 2 });
    expect(sent).toContainEqual(expect.objectContaining({ type: 'navigate', slideIndex: 1, baseRevision: 2 }));
    unmount();
  });

  it('does not download the notes again for navigation revisions', () => {
    const dispatch = vi.fn();
    const { rerender, unmount } = renderHook(({ slideIndex }) => usePresentationSync({
      dispatch: dispatch as never, presentationId: 'demo', slideIndex, totalSlides: 4,
      theme: 'midnight', role: 'notes', canNavigate: true,
    }), { initialProps: { slideIndex: 0 } });
    const socket = FakeWebSocket.instances[0];
    act(() => {
      socket.open();
      socket.message({ type: 'state', sessionId: 'default', state: { presentationId: 'demo', slideIndex: 0, totalSlides: 4, theme: 'midnight', revision: 1, updatedAt: 1 } });
      socket.message({ type: 'notes', sessionId: 'default', presentationId: 'demo', revision: 1, notes: {}, sparkle: {} });
    });
    for (let index = 1; index < 4; index++) {
      rerender({ slideIndex: index });
      act(() => socket.message({ type: 'state', sessionId: 'default', state: { presentationId: 'demo', slideIndex: index, totalSlides: 4, theme: 'midnight', revision: index + 1, updatedAt: index + 1 } }));
    }
    expect(socket.send.mock.calls.map(([payload]) => JSON.parse(String(payload))).filter((message) => message.type === 'request-notes')).toHaveLength(1);
    unmount();
  });

  it('keeps the newest local slide when navigations outrun their echoes', () => {
    const dispatch = vi.fn();
    const { rerender, unmount } = renderHook(({ slideIndex }) => usePresentationSync({
      dispatch: dispatch as never, presentationId: 'demo', slideIndex, totalSlides: 4,
      theme: 'midnight', role: 'notes', canNavigate: true,
    }), { initialProps: { slideIndex: 1 } });
    const socket = FakeWebSocket.instances[0];
    act(() => { socket.open(); socket.message(demoState(1, 2)); });
    dispatch.mockClear();

    // Two quick moves before the first echo returns: only the first goes out.
    rerender({ slideIndex: 2 });
    rerender({ slideIndex: 3 });
    expect(sentNavigations(socket)).toEqual([
      expect.objectContaining({ slideIndex: 2, baseRevision: 2 }),
    ]);

    // The echo for slide 3 (index 2) must not pull the deck back; the latest
    // position is published on top of the echoed revision instead.
    act(() => socket.message(demoState(2, 3)));
    expect(navigatedSlides(dispatch)).not.toContain(2);
    expect(sentNavigations(socket).at(-1)).toMatchObject({ slideIndex: 3, baseRevision: 3 });

    act(() => socket.message(demoState(3, 4)));
    expect(navigatedSlides(dispatch)).not.toContain(2);
    expect(sentNavigations(socket)).toHaveLength(2);

    // With nothing pending, another screen's navigation is followed as before.
    act(() => socket.message(demoState(0, 5)));
    expect(navigatedSlides(dispatch).at(-1)).toBe(0);
    expect(sentNavigations(socket)).toHaveLength(2);
    unmount();
  });

  it('resends the local slide after a stale rejection and ignores superseded answers', () => {
    const dispatch = vi.fn();
    const { rerender, unmount } = renderHook(({ slideIndex }) => usePresentationSync({
      dispatch: dispatch as never, presentationId: 'demo', slideIndex, totalSlides: 4,
      theme: 'midnight',
    }), { initialProps: { slideIndex: 0 } });
    const socket = FakeWebSocket.instances[0];
    act(() => { socket.open(); socket.message(demoState(0, 2)); });
    dispatch.mockClear();

    rerender({ slideIndex: 1 });
    expect(sentNavigations(socket).at(-1)).toMatchObject({ slideIndex: 1, baseRevision: 2 });

    // Another screen moved first, so the server answers with its state (stale
    // rejection). The local slide is resent at the new revision, not dropped.
    act(() => socket.message(demoState(3, 3)));
    expect(navigatedSlides(dispatch)).toEqual([]);
    expect(sentNavigations(socket).at(-1)).toMatchObject({ slideIndex: 1, baseRevision: 3 });

    // A late answer at a revision the resend already built on is ignored.
    act(() => socket.message(demoState(3, 3)));
    expect(navigatedSlides(dispatch)).toEqual([]);
    expect(sentNavigations(socket)).toHaveLength(2);

    act(() => socket.message(demoState(1, 4)));
    expect(navigatedSlides(dispatch)).toEqual([1]);
    expect(sentNavigations(socket)).toHaveLength(2);
    unmount();
  });

  it('stops waiting for a navigation the server never answers', () => {
    const dispatch = vi.fn();
    const { rerender, unmount } = renderHook(({ slideIndex }) => usePresentationSync({
      dispatch: dispatch as never, presentationId: 'demo', slideIndex, totalSlides: 4,
      theme: 'midnight',
    }), { initialProps: { slideIndex: 0 } });
    const socket = FakeWebSocket.instances[0];
    act(() => { socket.open(); socket.message(demoState(0, 2)); });

    rerender({ slideIndex: 1 });
    rerender({ slideIndex: 2 });
    expect(sentNavigations(socket)).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(NAVIGATION_RESPONSE_TIMEOUT_MS); });
    expect(sentNavigations(socket).at(-1)).toMatchObject({ slideIndex: 2, baseRevision: 2 });
    unmount();
  });

  it('forgets a pending navigation when the connection is replaced', () => {
    const dispatch = vi.fn();
    const { rerender, unmount } = renderHook(({ slideIndex }) => usePresentationSync({
      dispatch: dispatch as never, presentationId: 'demo', slideIndex, totalSlides: 4,
      theme: 'midnight',
    }), { initialProps: { slideIndex: 0 } });
    const first = FakeWebSocket.instances[0];
    act(() => { first.open(); first.message(demoState(0, 2)); });
    rerender({ slideIndex: 1 });
    act(() => { first.close(); vi.advanceTimersByTime(250); });

    const second = FakeWebSocket.instances[1];
    act(() => { second.open(); second.message(demoState(1, 3)); });
    rerender({ slideIndex: 2 });
    expect(sentNavigations(second)).toEqual([expect.objectContaining({ slideIndex: 2, baseRevision: 3 })]);
    unmount();
  });

  it('requests presentation sync only for an explicit session or configured server', () => {
    expect(isPresentationSyncRequested(new URL('https://slides.test/') as unknown as Location, undefined)).toBe(false);
    expect(isPresentationSyncRequested(new URL('https://slides.test/?session=demo') as unknown as Location, undefined)).toBe(true);
    expect(isPresentationSyncRequested(new URL('https://slides.test/') as unknown as Location, 'wss://sync.test')).toBe(true);
  });

  it('uses the Vite origin for the default sync WebSocket', () => {
    expect(getSyncServerUrl(new URL('http://localhost:5199/') as unknown as Location, undefined))
      .toBe('ws://localhost:5199/speaker-sync');
    expect(getSyncServerUrl(new URL('https://slides.test:7443/') as unknown as Location, undefined))
      .toBe('wss://slides.test:7443/speaker-sync');
    expect(getSyncServerUrl(new URL('https://slides.test/') as unknown as Location, 'wss://sync.test'))
      .toBe('wss://sync.test');
  });

  it('adopts the revision before reporting an unknown presentation', () => {
    const dispatch = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ slideIndex }) => usePresentationSync({
        dispatch: dispatch as never, presentationId: 'demo', slideIndex,
        totalSlides: 2, theme: 'midnight',
      }),
      { initialProps: { slideIndex: 0 } },
    );
    const socket = FakeWebSocket.instances[0];

    act(() => {
      socket.open();
      socket.message({
        type: 'state', sessionId: 'default',
        state: { presentationId: 'removed', slideIndex: 0, totalSlides: 1, theme: 'midnight', revision: 7, updatedAt: 1 },
      });
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('removed');

    rerender({ slideIndex: 1 });
    expect(JSON.parse(String(socket.send.mock.calls.at(-1)?.[0]))).toMatchObject({
      type: 'navigate', baseRevision: 7, slideIndex: 1,
    });
    unmount();
  });

  it('joins with blocked storage and removes only the token from the URL', () => {
    window.history.replaceState({}, '', '/?session=rehearsal&token=secret&slide=2#notes');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    const { unmount } = renderHook(() => usePresentationSync({
      dispatch: vi.fn() as never, presentationId: 'demo', slideIndex: 0,
      totalSlides: 1, theme: 'midnight',
    }));
    const socket = FakeWebSocket.instances[0];

    act(() => socket.open());

    const join = JSON.parse(String(socket.send.mock.calls[0]?.[0]));
    expect(join).toMatchObject({ type: 'join', sessionId: 'rehearsal', token: 'secret' });
    expect(join.clientId).toBeTruthy();
    expect(window.location.search).toBe('?session=rehearsal&slide=2');
    expect(window.location.hash).toBe('#notes');
    unmount();
  });
});
