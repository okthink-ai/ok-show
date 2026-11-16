import { useCallback, useEffect, useRef, useState } from 'react';
import { getControlToken, getSyncSession } from '../sync/usePresentationSync';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setTranslationBackend } from '../store/uiSlice';
import { prepareAudioCapture, prepareDeterministicAudioCapture, RealtimeChunkPacer } from '../translation/audioCapture';
import type { AudioCapture } from '../translation/audioCapture';
import { parseTranslationServerMessage } from '../translation/protocol';
import type { CaptionSnapshot, TranslationCapabilities, TranslationConfig, TranslationPhase } from '../translation/protocol';

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 4000;
const HISTORY_LIMIT = 40;
const FATAL_TRANSLATION_CODES = new Set([
  'already_active',
  'forbidden',
  'invalid_api_key',
  'invalid_audio',
  'invalid_config',
  'not_configured',
  'provider_access',
  'quota_or_billing',
]);

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
  phase: TranslationPhase;
  connected: boolean;
  capabilities: TranslationCapabilities | null;
  caption: CaptionSnapshot | null;
  history: CaptionSnapshot[];
  error: string;
  warning: string;
  start(config: TranslationConfig): Promise<void>;
  stop(): Promise<void>;
  clear(): void;
}

export function useLiveTranslation({ presentationId, enabled = true }: { presentationId: string; enabled?: boolean }): LiveTranslationResult {
  const dispatch = useAppDispatch();
  const preferredBackend = useAppSelector((state) => state.ui.translation.backend);
  const preferenceRef = useRef(preferredBackend);
  preferenceRef.current = preferredBackend;
  const [phase, setPhase] = useState<TranslationPhase>('idle');
  const [connected, setConnected] = useState(false);
  const [capabilities, setCapabilities] = useState<TranslationCapabilities | null>(null);
  const [caption, setCaption] = useState<CaptionSnapshot | null>(null);
  const [history, setHistory] = useState<CaptionSnapshot[]>([]);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const captureRef = useRef<AudioCapture | null>(null);
  const pacerRef = useRef<RealtimeChunkPacer | null>(null);
  const startupRef = useRef<AbortController | null>(null);
  const runIdRef = useRef('');
  const desiredConfigRef = useRef<TranslationConfig | null>(null);
  const remoteStartPendingRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restartDelayRef = useRef(RECONNECT_MIN_MS);
  const sequenceRef = useRef(-1);
  const phaseRef = useRef<TranslationPhase>('idle');
  phaseRef.current = phase;

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
      if (!config || remoteStartPendingRef.current || socket?.readyState !== WebSocket.OPEN) return;
      remoteStartPendingRef.current = true;
      setPhase('connecting');
      setError('');
      socket.send(JSON.stringify({ type: 'translation.start', version: 1, config }));
    };
    if (delay > 0) restartTimerRef.current = setTimeout(attempt, delay);
    else attempt();
  }, [clearRestart]);

  useEffect(() => {
    if (!enabled || !presentationId) {
      setConnected(false);
      setCapabilities(null);
      return;
    }
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = RECONNECT_MIN_MS;
    const sessionId = getSyncSession();
    const connect = () => {
      if (disposed) return;
      const socket = new WebSocket(translationServerUrl());
      socketRef.current = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({
          type: 'translation.join', version: 1, sessionId, presentationId,
          role: 'producer', token: getControlToken(),
        }));
      };
      socket.onmessage = (event) => {
        const message = parseTranslationServerMessage(String(event.data));
        if (!message) return;
        if (message.type === 'translation.capabilities') {
          setCapabilities(message);
          setConnected(true);
          delay = RECONNECT_MIN_MS;
          if (!preferenceRef.current && message.defaultBackend) dispatch(setTranslationBackend(message.defaultBackend));
          if (desiredConfigRef.current) {
            remoteStartPendingRef.current = false;
            requestRemoteStart();
          }
          return;
        }
        if ('sessionId' in message && (message.sessionId !== sessionId || message.presentationId !== presentationId)) return;
        if (message.type === 'translation.status') {
          if (message.runId) runIdRef.current = message.runId;
          setPhase(message.phase);
          if (message.phase === 'error') {
            runIdRef.current = '';
            remoteStartPendingRef.current = false;
            if (desiredConfigRef.current && !FATAL_TRANSLATION_CODES.has(message.code || '')) {
              setPhase('connecting');
              setError('');
              setWarning('Translation is reconnecting. Current speech will resume as soon as the provider is ready.');
              requestRemoteStart(restartDelayRef.current);
              restartDelayRef.current = Math.min(restartDelayRef.current * 2, RECONNECT_MAX_MS);
            } else {
              desiredConfigRef.current = null;
              clearRestart();
              setError(message.message || 'Live translation stopped with an error.');
              startupRef.current?.abort();
              void stopCapture(false);
            }
          } else if (message.phase === 'idle') {
            runIdRef.current = '';
            remoteStartPendingRef.current = false;
            if (!desiredConfigRef.current) void stopCapture(false);
          } else if (message.phase === 'listening') {
            restartDelayRef.current = RECONNECT_MIN_MS;
            setError('');
            setWarning('');
          }
          return;
        }
        if (message.type === 'translation.ready') {
          runIdRef.current = message.runId;
          remoteStartPendingRef.current = false;
          restartDelayRef.current = RECONNECT_MIN_MS;
          sequenceRef.current = -1;
          setError('');
          setWarning('');
          void captureRef.current?.start().catch((reason: unknown) => {
            desiredConfigRef.current = null;
            setPhase('error');
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
          setCaption(message);
          if (message.stability === 'settled') {
            setHistory((current) => [...current.filter((item) => item.runId !== message.runId || item.sequence !== message.sequence), message].slice(-HISTORY_LIMIT));
          }
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
        if (message.type === 'translation.error') {
          desiredConfigRef.current = null;
          remoteStartPendingRef.current = false;
          clearRestart();
          setPhase('error');
          setError(message.message);
          startupRef.current?.abort();
          void stopCapture(false);
        }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        setConnected(false);
        setCapabilities(null);
        remoteStartPendingRef.current = false;
        clearRestart();
        if (desiredConfigRef.current) {
          setPhase('connecting');
          setError('');
          setWarning('Translation is reconnecting. Current speech will resume as soon as the connection is ready.');
        } else {
          startupRef.current?.abort();
          void stopCapture(false);
          if (phaseRef.current !== 'idle') setPhase('idle');
        }
        runIdRef.current = '';
        if (!disposed) {
          retry = setTimeout(connect, delay);
          delay = Math.min(delay * 2, RECONNECT_MAX_MS);
        }
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearRestart();
      desiredConfigRef.current = null;
      remoteStartPendingRef.current = false;
      startupRef.current?.abort();
      startupRef.current = null;
      void stopCapture(false);
      socketRef.current?.close();
      socketRef.current = null;
      runIdRef.current = '';
    };
  }, [clearRestart, dispatch, enabled, presentationId, requestRemoteStart, stopCapture]);

  const start = useCallback(async (config: TranslationConfig) => {
    if (!connected || !capabilities || phaseRef.current === 'connecting' || phaseRef.current === 'listening' || phaseRef.current === 'stopping') return;
    const backend = capabilities.backends[config.backend];
    if (!backend?.configured) {
      setPhase('error');
      setError(`Set ${backend?.missing.join(', ') || 'the provider environment variables'} in .env and restart ok-show.`);
      return;
    }
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const startup = new AbortController();
    startupRef.current?.abort();
    startupRef.current = startup;
    setPhase('connecting');
    setError('');
    setWarning('');
    try {
      const pacer = new RealtimeChunkPacer(
        backend.chunkDurationMs,
        Math.ceil(1000 / backend.chunkDurationMs),
        (chunk) => {
          const runId = runIdRef.current;
          const currentSocket = socketRef.current;
          if (!runId || currentSocket?.readyState !== WebSocket.OPEN) return;
          // Keep captions live rather than replaying old speech after a network
          // stall. Capture continues and the next current chunk gets a chance.
          if (currentSocket.bufferedAmount > backend.sampleRate * 2) return;
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
          remoteStartPendingRef.current = false;
          clearRestart();
          setError('The microphone device disconnected.');
          socketRef.current?.close();
        },
        onChunk: (chunk) => { pacer.enqueue(chunk); },
      });
      if (startup.signal.aborted) {
        await capture.stop(false);
        pacer.clear();
        return;
      }
      captureRef.current = capture;
      desiredConfigRef.current = config;
      remoteStartPendingRef.current = false;
      requestRemoteStart();
    } catch (reason) {
      if (startup.signal.aborted) return;
      setPhase('error');
      const name = reason instanceof DOMException ? reason.name : '';
      setError(name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow it in the browser and try again.'
        : reason instanceof Error ? reason.message : 'The microphone could not be prepared.');
      await stopCapture(false);
    }
  }, [capabilities, clearRestart, connected, requestRemoteStart, stopCapture]);

  const stop = useCallback(async () => {
    desiredConfigRef.current = null;
    remoteStartPendingRef.current = false;
    clearRestart();
    if (phaseRef.current === 'connecting' && !runIdRef.current) {
      startupRef.current?.abort();
      await stopCapture(false);
      socketRef.current?.close();
      setPhase('idle');
      return;
    }
    if (!runIdRef.current || !['connecting', 'listening'].includes(phaseRef.current)) return;
    setPhase('stopping');
    // stop() flushes the short final PCM chunk before tracks are released.
    await stopCapture(true);
    await pacerRef.current?.drain();
    pacerRef.current?.clear();
    pacerRef.current = null;
    send({ type: 'translation.stop', version: 1, runId: runIdRef.current });
  }, [clearRestart, send, stopCapture]);

  const clear = useCallback(() => {
    send({ type: 'translation.clear', version: 1 });
    setCaption(null);
  }, [send]);

  return { phase, connected, capabilities, caption, history, error, warning, start, stop, clear };
}
