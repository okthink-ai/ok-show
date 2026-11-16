import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveTranslation } from './useLiveTranslation';

const mocks = vi.hoisted(() => ({
  captureStart: vi.fn(async () => undefined),
  captureStop: vi.fn(async () => undefined),
  dispatch: vi.fn(),
  prepareCapture: vi.fn(),
}));

vi.mock('../store/hooks', () => ({
  useAppDispatch: () => mocks.dispatch,
  useAppSelector: (select: (state: unknown) => unknown) => select({ ui: { translation: { backend: 'openai-realtime' } } }),
}));

vi.mock('../translation/audioCapture', async (importOriginal) => ({
  ...await importOriginal<typeof import('../translation/audioCapture')>(),
  prepareAudioCapture: mocks.prepareCapture,
}));

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  sent: object[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  url: string | URL;

  constructor(url: string | URL) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  message(value: object) {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent);
  }

  send(value: string) {
    this.sent.push(JSON.parse(value));
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const capabilities = {
  type: 'translation.capabilities',
  version: 1,
  defaultBackend: 'openai-realtime',
  backends: {
    'openai-realtime': { configured: true, missing: [], sampleRate: 24000, chunkDurationMs: 200, supportsSourcePreview: false },
    'elevenlabs-scribe': { configured: false, missing: ['ELEVENLABS_API_KEY'], sampleRate: 16000, chunkDurationMs: 100, supportsSourcePreview: true },
    'elevenlabs-realtime': { configured: false, missing: ['ELEVENLABS_ENTERPRISE_API_KEY'], sampleRate: 16000, chunkDurationMs: 100, supportsSourcePreview: true },
  },
  languagePairs: [
    { sourceLanguage: 'en', targetLanguage: 'es' },
    { sourceLanguage: 'es', targetLanguage: 'en' },
  ],
};

const status = (phase: string, values: object = {}) => ({
  type: 'translation.status', version: 1, sessionId: 'default', presentationId: 'demo', phase, ...values,
});

describe('useLiveTranslation continuity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    mocks.captureStart.mockClear();
    mocks.captureStop.mockClear();
    mocks.prepareCapture.mockReset().mockResolvedValue({
      inputSampleRate: 48000,
      start: mocks.captureStart,
      stop: mocks.captureStop,
    });
    window.history.replaceState({}, '', '/?session=default&token=test-token');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('keeps capture active and restarts after transport and transient provider failures', async () => {
    const { result, unmount } = renderHook(() => useLiveTranslation({ presentationId: 'demo' }));
    const first = FakeWebSocket.instances[0];
    act(() => {
      first.open();
      first.message(capabilities);
      first.message(status('idle'));
    });

    await act(async () => result.current.start({ backend: 'openai-realtime', sourceLanguage: 'en', targetLanguage: 'es' }));
    expect(first.sent).toContainEqual(expect.objectContaining({ type: 'translation.start' }));
    act(() => {
      first.message(status('connecting', { runId: 'run-1' }));
      first.message(status('listening', { runId: 'run-1' }));
      first.message({ type: 'translation.ready', version: 1, sessionId: 'default', presentationId: 'demo', runId: 'run-1', sampleRate: 24000, chunkDurationMs: 200 });
    });
    expect(result.current.phase).toBe('listening');
    expect(mocks.captureStart).toHaveBeenCalledTimes(1);

    act(() => first.close());
    expect(result.current.phase).toBe('connecting');
    expect(mocks.captureStop).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(500));
    const second = FakeWebSocket.instances[1];
    act(() => {
      second.open();
      second.message(capabilities);
      second.message(status('idle'));
    });
    expect(second.sent).toContainEqual(expect.objectContaining({ type: 'translation.start' }));
    act(() => {
      second.message(status('listening', { runId: 'run-2' }));
      second.message({ type: 'translation.ready', version: 1, sessionId: 'default', presentationId: 'demo', runId: 'run-2', sampleRate: 24000, chunkDurationMs: 200 });
    });
    expect(result.current.phase).toBe('listening');

    const startsBeforeFailure = second.sent.filter((message) => 'type' in message && message.type === 'translation.start').length;
    act(() => second.message(status('error', { runId: 'run-2', code: 'provider_error', message: 'Temporary provider failure.' })));
    expect(result.current.phase).toBe('connecting');
    expect(result.current.error).toBe('');
    expect(mocks.captureStop).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(second.sent.filter((message) => 'type' in message && message.type === 'translation.start')).toHaveLength(startsBeforeFailure + 1);

    unmount();
  });
});
