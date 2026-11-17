import { useCallback, useEffect, useRef, useState } from 'react';
import { getControlToken, getSyncSession } from '../sync/usePresentationSync';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setTranslationBackend } from '../store/uiSlice';
import { prepareAudioCapture, prepareDeterministicAudioCapture, RealtimeChunkPacer } from '../translation/audioCapture';
import type { AudioCapture } from '../translation/audioCapture';
import { parseTranslationServerMessage } from '../translation/protocol';
import type { CaptionSnapshot, LiveTranslationPhase, TranslationCapabilities, TranslationConfig, TranslationFailureDisposition } from '../translation/protocol';

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 4000;
const HEALTHY_RESET_MS = 10_000;
const MAX_AUDIO_BACKLOG_MS = 500;
const CLIENT_ID_KEY = 'ok-show-translation-client-id';

export function translationRetryDelay(attempt: number, random = Math.random): number {
  const base = Math.min(RECONNECT_MIN_MS * 2 ** Math.max(0, attempt), RECONNECT_MAX_MS);
  return Math.round(base * (0.75 + random() * 0.5));
}

function translationClientId(): string {
  const existing = sessionStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(CLIENT_ID_KEY, created);
  return created;
}

function translationServerUrl(location: Location = window.location): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/translation-sync`;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

export interface LiveTranslationResult {
  phase: LiveTranslationPhase;
  connected: boolean;
  capabilities: TranslationCapabilities | null;
  caption: CaptionSnapshot | null;
  error: string;
  warning: string;
  ownership: 'none' | 'local' | 'remote';
  ownerSurface: 'deck' | 'presenter' | '';
  health: { droppedAudioChunks: number; reconnectCount: number; recoveringSince: number | null; lastCaptionAt: number | null; firstCaptionLatencyMs: number | null };
  start(config: TranslationConfig): Promise<void>;
  stop(): Promise<void>;
  clear(): void;
}

export function useLiveTranslation({ presentationId, enabled = true, surface = 'deck' }: { presentationId: string; enabled?: boolean; surface?: 'deck' | 'presenter' }): LiveTranslationResult {
  const dispatch = useAppDispatch();
  const preferredBackend = useAppSelector((state) => state.ui.translation.backend);
  const preferenceRef = useRef(preferredBackend);
  preferenceRef.current = preferredBackend;
  const [phase, setPhaseState] = useState<LiveTranslationPhase>('off');
  const [connected, setConnected] = useState(false);
  const [capabilities, setCapabilities] = useState<TranslationCapabilities | null>(null);
  const [caption, setCaption] = useState<CaptionSnapshot | null>(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [ownership, setOwnership] = useState<'none' | 'local' | 'remote'>('none');
  const [ownerSurface, setOwnerSurface] = useState<'deck' | 'presenter' | ''>('');
  const [health, setHealth] = useState({ droppedAudioChunks: 0, reconnectCount: 0, recoveringSince: null as number | null, lastCaptionAt: null as number | null, firstCaptionLatencyMs: null as number | null });
  const socketRef = useRef<WebSocket | null>(null);
  const captureRef = useRef<AudioCapture | null>(null);
  const pacerRef = useRef<RealtimeChunkPacer | null>(null);
  const startupRef = useRef<AbortController | null>(null);
  const runIdRef = useRef('');
  const desiredConfigRef = useRef<TranslationConfig | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restartAttemptRef = useRef(0);
  const healthyResetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const intentStartedAtRef = useRef(0);
  const clientIdRef = useRef('');
  const sequenceRef = useRef(-1);
  const phaseRef = useRef<LiveTranslationPhase>('off');
  const setPhase = useCallback((next: LiveTranslationPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const stopCapture = useCallback(async (flush = false) => {
    const capture = captureRef.current;
    captureRef.current = null;
    if (capture) await capture.stop(flush);
    if (!flush) {
      pacerRef.current?.clear();
      pacerRef.current = null;
    }
  }, []);

  const send = useCallback((message: object) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  const clearRestart = useCallback(() => {
    clearTimeout(restartTimerRef.current);
    restartTimerRef.current = undefined;
  }, []);

  const requestRemoteStart = useCallback((delay = 0) => {
    clearRestart();
    const attempt = () => {
      restartTimerRef.current = undefined;
      const config = desiredConfigRef.current;
      const socket = socketRef.current;
      if (!config || socket?.readyState !== WebSocket.OPEN) return;
      setPhase(phaseRef.current === 'recovering' ? 'recovering' : 'starting');
      setError('');
      socket.send(JSON.stringify({ type: 'translation.start', version: 1, config, recovery: phaseRef.current === 'recovering' }));
    };
    if (delay > 0) restartTimerRef.current = setTimeout(attempt, delay);
    else attempt();
  }, [clearRestart, setPhase]);

  const handleFailure = useCallback((failure: { disposition: TranslationFailureDisposition; message: string }) => {
    if (failure.disposition === 'retryable') {
      if (!desiredConfigRef.current) {
        setPhase('off');
        setError('');
        setWarning(failure.message);
        return;
      }
      clearTimeout(healthyResetTimerRef.current);
      setPhase('recovering');
      setError('');
      setWarning('Translation is reconnecting. Current speech will resume as soon as the provider is ready.');
      setHealth((current) => ({ ...current, reconnectCount: current.reconnectCount + 1, recoveringSince: current.recoveringSince ?? Date.now() }));
      requestRemoteStart(translationRetryDelay(restartAttemptRef.current++));
      return;
    }
    desiredConfigRef.current = null;
    clearRestart();
    if (failure.disposition === 'degraded') {
      setPhase('off');
      setError('');
      setWarning(failure.message || 'Translation ended with incomplete final output.');
      void stopCapture(false);
      return;
    }
    setPhase('blocked');
    setError(failure.message || 'Live translation stopped with an error.');
    startupRef.current?.abort();
    void stopCapture(false);
  }, [clearRestart, requestRemoteStart, setPhase, stopCapture]);

  useEffect(() => {
    if (!enabled || !presentationId) {
      setConnected(false);
      setCapabilities(null);
      return;
    }
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const sessionId = getSyncSession();
    clientIdRef.current ||= translationClientId();
    const connect = () => {
      if (disposed) return;
      const socket = new WebSocket(translationServerUrl());
      socketRef.current = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({
          type: 'translation.join', version: 1, sessionId, presentationId,
          role: 'producer', token: getControlToken(), clientId: clientIdRef.current, surface,
        }));
      };
      socket.onmessage = (event) => {
        const message = parseTranslationServerMessage(String(event.data));
        if (!message) return;
        if (message.type === 'translation.capabilities') {
          setCapabilities(message);
          setConnected(true);
          if (!preferenceRef.current && message.defaultBackend) dispatch(setTranslationBackend(message.defaultBackend));
          if (desiredConfigRef.current) {
            requestRemoteStart();
          }
          return;
        }
        if ('sessionId' in message && (message.sessionId !== sessionId || message.presentationId !== presentationId)) return;
        if (message.type === 'translation.status') {
          if (message.runId) runIdRef.current = message.runId;
          const nextOwnership = message.producerClientId
            ? message.producerClientId === clientIdRef.current ? 'local' : 'remote' : 'none';
          setOwnership(nextOwnership);
          setOwnerSurface(message.producerSurface || '');
          if (message.phase === 'error') {
            runIdRef.current = '';
            handleFailure(message);
          } else if (message.phase === 'idle') {
            runIdRef.current = '';
            if (!desiredConfigRef.current) {
              setPhase(phaseRef.current === 'blocked' ? 'blocked' : 'off');
              setOwnership('none');
              setOwnerSurface('');
              void stopCapture(false);
            }
          } else if (message.phase === 'connecting') {
            setPhase(desiredConfigRef.current ? phaseRef.current === 'recovering' ? 'recovering' : 'starting' : 'starting');
          } else if (message.phase === 'listening') {
            setPhase('live');
            setHealth((current) => ({ ...current, recoveringSince: null }));
            setError('');
            setWarning('');
          } else if (message.phase === 'stopping') {
            setPhase('stopping');
          }
          return;
        }
        if (message.type === 'translation.ready') {
          runIdRef.current = message.runId;
          sequenceRef.current = -1;
          setError('');
          setWarning('');
          void captureRef.current?.start().catch((reason: unknown) => {
            desiredConfigRef.current = null;
            setPhase('blocked');
            setError(reason instanceof Error ? reason.message : 'The microphone could not start.');
            socket.close();
          });
          return;
        }
        if (message.type === 'translation.caption') {
          if (runIdRef.current && message.runId !== runIdRef.current) return;
          if (message.runId === runIdRef.current && message.sequence <= sequenceRef.current) return;
          runIdRef.current = message.runId;
          sequenceRef.current = message.sequence;
          const receivedAt = Date.now();
          setHealth((current) => ({
            ...current,
            lastCaptionAt: receivedAt,
            firstCaptionLatencyMs: current.firstCaptionLatencyMs
              ?? (intentStartedAtRef.current > 0 ? Math.max(0, receivedAt - intentStartedAtRef.current) : null),
          }));
          if (!healthyResetTimerRef.current) {
            healthyResetTimerRef.current = setTimeout(() => {
              restartAttemptRef.current = 0;
              healthyResetTimerRef.current = undefined;
            }, HEALTHY_RESET_MS);
          }
          setCaption(message);
          return;
        }
        if (message.type === 'translation.cleared') {
          setCaption(null);
          return;
        }
        if (message.type === 'translation.warning') {
          setWarning(message.message);
          return;
        }
        if (message.type === 'translation.health') {
          setHealth((current) => ({ ...current, droppedAudioChunks: Math.max(current.droppedAudioChunks, message.droppedAudioChunks) }));
          return;
        }
        if (message.type === 'translation.error') {
          handleFailure(message);
        }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        setConnected(false);
        setCapabilities(null);
        clearRestart();
        if (desiredConfigRef.current) {
          clearTimeout(healthyResetTimerRef.current);
          healthyResetTimerRef.current = undefined;
          setPhase('recovering');
          setError('');
          setWarning('Translation is reconnecting. Current speech will resume as soon as the connection is ready.');
          setHealth((current) => ({ ...current, reconnectCount: current.reconnectCount + 1, recoveringSince: current.recoveringSince ?? Date.now() }));
        } else {
          startupRef.current?.abort();
          void stopCapture(false);
          if (phaseRef.current !== 'off' && phaseRef.current !== 'blocked') setPhase('off');
        }
        runIdRef.current = '';
        if (!disposed) {
          retry = setTimeout(connect, translationRetryDelay(restartAttemptRef.current++));
        }
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearTimeout(healthyResetTimerRef.current);
      clearRestart();
      desiredConfigRef.current = null;
      startupRef.current?.abort();
      startupRef.current = null;
      void stopCapture(false);
      socketRef.current?.close();
      socketRef.current = null;
      runIdRef.current = '';
    };
  }, [clearRestart, dispatch, enabled, handleFailure, presentationId, requestRemoteStart, setPhase, stopCapture, surface]);

  const start = useCallback(async (config: TranslationConfig) => {
    if (!connected || !capabilities || ['starting', 'live', 'recovering', 'stopping'].includes(phaseRef.current)) return;
    const backend = capabilities.backends[config.backend];
    if (!backend?.configured) {
      setPhase('blocked');
      setError(`Set ${backend?.missing.join(', ') || 'the provider environment variables'} in .env and restart ok-show.`);
      return;
    }
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const startup = new AbortController();
    startupRef.current?.abort();
    startupRef.current = startup;
    setPhase('starting');
    setError('');
    setWarning('');
    intentStartedAtRef.current = Date.now();
    restartAttemptRef.current = 0;
    setHealth({ droppedAudioChunks: 0, reconnectCount: 0, recoveringSince: null, lastCaptionAt: null, firstCaptionLatencyMs: null });
    try {
      const pacer = new RealtimeChunkPacer(
        backend.chunkDurationMs,
        Math.max(1, Math.ceil(MAX_AUDIO_BACKLOG_MS / backend.chunkDurationMs)),
        (chunk) => {
          const runId = runIdRef.current;
          const currentSocket = socketRef.current;
          if (!runId || currentSocket?.readyState !== WebSocket.OPEN) return;
          // Keep captions live rather than replaying old speech after a network
          // stall. Capture continues and the next current chunk gets a chance.
          if (currentSocket.bufferedAmount > backend.sampleRate) {
            setHealth((current) => ({ ...current, droppedAudioChunks: current.droppedAudioChunks + 1 }));
            return;
          }
          currentSocket.send(JSON.stringify({ type: 'translation.audio', version: 1, runId, audio: encodeBase64(chunk) }));
        },
      );
      pacerRef.current = pacer;
      const prepareCapture = import.meta.env.VITE_ENABLE_DEBUG_CLI === 'true'
        && new URLSearchParams(window.location.search).get('translationCapture') === 'fake'
        ? prepareDeterministicAudioCapture
        : prepareAudioCapture;
      const capture = await prepareCapture({
        outputSampleRate: backend.sampleRate,
        chunkDurationMs: backend.chunkDurationMs,
        signal: startup.signal,
        onDeviceEnded: () => {
          desiredConfigRef.current = null;
          clearRestart();
          setPhase('blocked');
          setError('The microphone device disconnected.');
          socketRef.current?.close();
        },
        onChunk: (chunk) => {
          if (!pacer.enqueue(chunk)) setHealth((current) => ({ ...current, droppedAudioChunks: current.droppedAudioChunks + 1 }));
        },
      });
      if (startup.signal.aborted) {
        await capture.stop(false);
        pacer.clear();
        return;
      }
      captureRef.current = capture;
      desiredConfigRef.current = config;
      requestRemoteStart();
    } catch (reason) {
      if (startup.signal.aborted) return;
      setPhase('blocked');
      const name = reason instanceof DOMException ? reason.name : '';
      setError(name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow it in the browser and try again.'
        : reason instanceof Error ? reason.message : 'The microphone could not be prepared.');
      await stopCapture(false);
    }
  }, [capabilities, clearRestart, connected, requestRemoteStart, setPhase, stopCapture]);

  const stop = useCallback(async () => {
    desiredConfigRef.current = null;
    clearRestart();
    if (['starting', 'recovering'].includes(phaseRef.current) && !runIdRef.current) {
      startupRef.current?.abort();
      await stopCapture(false);
      socketRef.current?.close();
      setPhase('off');
      return;
    }
    if (!runIdRef.current || !['starting', 'live', 'recovering'].includes(phaseRef.current)) return;
    setPhase('stopping');
    // stop() flushes the short final PCM chunk before tracks are released.
    await stopCapture(true);
    await pacerRef.current?.drain();
    pacerRef.current?.clear();
    pacerRef.current = null;
    send({ type: 'translation.stop', version: 1, runId: runIdRef.current });
  }, [clearRestart, send, setPhase, stopCapture]);

  const clear = useCallback(() => {
    send({ type: 'translation.clear', version: 1 });
    setCaption(null);
  }, [send]);

  return { phase, connected, capabilities, caption, error, warning, ownership, ownerSurface, health, start, stop, clear };
}
