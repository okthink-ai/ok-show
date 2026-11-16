import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import {
  decodeAudio,
  isPlainObject,
  keepRecentText,
  sanitizedProviderError,
  translationCapabilities,
  validTranslationConfig,
  validTranslationId,
} from './translation-protocol.mjs';
import { createTranslationAdapters } from './translation/providers/index.mjs';

const MAX_PAYLOAD_BYTES = 24 * 1024;
const MAX_MESSAGES_PER_SECOND = 30;
const MAX_AUDIO_SECONDS = 1;
const SNAPSHOT_INTERVAL_MS = 100;
const SILENCE_CLEAR_MS = 8_000;
const FINAL_HOLD_MS = 8_000;
const FINALIZATION_TIMEOUT_MS = 15_000;

function backendProvider(backend) {
  return backend.startsWith('openai') ? 'openai' : 'elevenlabs';
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function deadline(promise, milliseconds) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('Finalization timed out.'), { code: 'finalization_timeout' })), milliseconds);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

function defaultLogger(event, fields = {}) {
  console.log(`[translation] ${event}`, fields);
}

/** Deterministic adapter used only by the browser suite when explicitly enabled. */
export function createFakeTranslationAdapter({ sampleRate = 24000, chunkDurationMs = 200 } = {}) {
  return {
    sampleRate,
    chunkDurationMs,
    async connect(_config, emit, signal) {
      await Promise.resolve();
      if (signal.aborted) throw new Error('Translation startup was cancelled.');
      let chunks = 0;
      let closed = false;
      return {
        sendAudio() {
          if (closed) return;
          chunks += 1;
          emit({ type: 'translation', text: `Deterministic translated caption ${chunks}`, stability: 'streaming' });
        },
        async finish() {
          emit({ type: 'translation', text: `Deterministic translated caption ${chunks}`, stability: 'settled' });
        },
        close() { closed = true; },
      };
    },
  };
}

export function translationConfigFromEnv(env = process.env) {
  return {
    openaiApiKey: env.OPENAI_API_KEY || '',
    elevenlabsApiKey: env.ELEVENLABS_API_KEY || '',
    elevenlabsEnterpriseApiKey: env.ELEVENLABS_ENTERPRISE_API_KEY || '',
    elevenlabsVoiceId: env.ELEVENLABS_TRANSLATION_VOICE_ID || '',
    defaultProvider: env.TRANSLATION_PROVIDER || '',
  };
}

export function createTranslationService({
  controlToken = '',
  config = translationConfigFromEnv(),
  adapters = createTranslationAdapters(config),
  validPresentationId = (value) => validTranslationId(value),
  finalizationTimeoutMs = FINALIZATION_TIMEOUT_MS,
  finalHoldMs = FINAL_HOLD_MS,
  silenceClearMs = SILENCE_CLEAR_MS,
  log = defaultLogger,
} = {}) {
  const capabilities = translationCapabilities(config);
  if (process.env.OK_SHOW_TRANSLATION_TEST_MODE === 'true') {
    adapters = { ...adapters, 'openai-realtime': createFakeTranslationAdapter() };
    capabilities.backends['openai-realtime'].configured = true;
    capabilities.backends['openai-realtime'].missing = [];
    if (!capabilities.defaultBackend) capabilities.defaultBackend = 'openai-realtime';
  }
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  const clientMeta = new WeakMap();
  const sessions = new Map();

  const noteAudioDrop = (run, reason) => {
    run.droppedAudioChunks += 1;
    const now = Date.now();
    if (now - run.lastAudioDropLogAt < 5_000) return;
    log('audio_dropped', {
      backend: run.config.backend,
      runId: run.id,
      reason,
      chunks: run.droppedAudioChunks,
    });
    run.droppedAudioChunks = 0;
    run.lastAudioDropLogAt = now;
  };

  const keyFor = (sessionId, presentationId) => `${sessionId}\u0000${presentationId}`;
  const sessionFor = (sessionId, presentationId) => {
    const key = keyFor(sessionId, presentationId);
    let state = sessions.get(key);
    if (!state) {
      state = {
        key,
        sessionId,
        presentationId,
        clients: new Set(),
        producer: null,
        run: null,
        latest: null,
        sourceText: '',
        status: 'idle',
        clearTimer: undefined,
        snapshotTimer: undefined,
        pendingSnapshot: null,
      };
      sessions.set(key, state);
    }
    return state;
  };
  const broadcast = (state, message) => {
    for (const client of state.clients) send(client, message);
  };
  const status = (state, phase, extra = {}) => {
    state.status = phase;
    broadcast(state, {
      type: 'translation.status',
      version: 1,
      sessionId: state.sessionId,
      presentationId: state.presentationId,
      phase,
      runId: state.run?.id,
      ...extra,
    });
  };
  const clearTimers = (state) => {
    clearTimeout(state.clearTimer);
    clearTimeout(state.snapshotTimer);
    state.clearTimer = undefined;
    state.snapshotTimer = undefined;
    state.pendingSnapshot = null;
  };
  const clearCaption = (state, reason = 'requested') => {
    clearTimeout(state.clearTimer);
    clearTimeout(state.snapshotTimer);
    state.latest = null;
    state.sourceText = '';
    state.pendingSnapshot = null;
    broadcast(state, {
      type: 'translation.cleared', version: 1,
      sessionId: state.sessionId, presentationId: state.presentationId, reason,
    });
  };
  const scheduleClear = (state, milliseconds, reason) => {
    clearTimeout(state.clearTimer);
    state.clearTimer = setTimeout(() => clearCaption(state, reason), milliseconds);
    state.clearTimer.unref?.();
  };
  const flushSnapshot = (state) => {
    state.snapshotTimer = undefined;
    const snapshot = state.pendingSnapshot;
    state.pendingSnapshot = null;
    if (!snapshot || state.run?.id !== snapshot.runId) return;
    state.latest = snapshot;
    broadcast(state, snapshot);
  };
  const publish = (state, run, event) => {
    if (state.run !== run || run.abort.signal.aborted) return;
    if (event.type === 'source' && typeof event.text === 'string') {
      state.sourceText = keepRecentText(event.text);
      return;
    }
    if (event.type === 'warning') {
      broadcast(state, {
        type: 'translation.warning', version: 1,
        sessionId: state.sessionId, presentationId: state.presentationId,
        runId: run.id, code: String(event.code || 'provider_warning'), message: String(event.message || 'The provider reported a warning.'),
      });
      return;
    }
    if (event.type === 'error') {
      void failRun(state, run, event);
      return;
    }
    if (event.type !== 'translation' || typeof event.text !== 'string') return;
    if (!run.firstCaptionAt) {
      run.firstCaptionAt = Date.now();
      log('first_caption', { backend: run.config.backend, runId: run.id, elapsedMs: run.firstCaptionAt - run.startedAt });
    }
    const snapshot = {
      type: 'translation.caption',
      version: 1,
      sessionId: state.sessionId,
      presentationId: state.presentationId,
      runId: run.id,
      sequence: ++run.sequence,
      ...(state.sourceText ? { sourceText: state.sourceText } : {}),
      translatedText: keepRecentText(event.text),
      targetLanguage: run.config.targetLanguage,
      stability: event.stability === 'settled' ? 'settled' : 'streaming',
    };
    state.pendingSnapshot = snapshot;
    if (!state.snapshotTimer) {
      state.snapshotTimer = setTimeout(() => flushSnapshot(state), SNAPSHOT_INTERVAL_MS);
      state.snapshotTimer.unref?.();
    }
    if (state.status === 'listening') scheduleClear(state, silenceClearMs, 'silence');
  };
  const teardownRun = (state, run) => {
    if (state.run !== run) return;
    run.abort.abort();
    run.connection?.close();
    state.run = null;
    state.producer = null;
  };
  async function failRun(state, run, error) {
    if (state.run !== run) return;
    const localErrors = {
      finalization_timeout: 'Translation finalization timed out; the last words may be incomplete.',
      invalid_audio: 'The browser sent an invalid audio chunk. Translation was stopped safely.',
      invalid_api_key: 'The provider rejected its API key. Check the project .env and restart ok-show.',
      quota_or_billing: 'The provider rejected the request because of quota, billing, or rate limits.',
      provider_access: 'This account does not have access to the selected provider feature, model, or required terms.',
      provider_timeout: 'The translation provider timed out.',
    };
    const localMessage = localErrors[error?.code];
    const clean = localMessage ? { code: error.code, message: localMessage } : sanitizedProviderError(error);
    log('error', { backend: run.config.backend, runId: run.id, code: clean.code });
    teardownRun(state, run);
    status(state, 'error', clean);
    clearCaption(state, clean.code);
  }
  const stopRun = async (state, run) => {
    if (state.run !== run || run.stopping) return;
    run.stopping = true;
    status(state, 'stopping');
    if (!run.connection) {
      teardownRun(state, run);
      status(state, 'idle');
      clearCaption(state, 'startup_cancelled');
      return;
    }
    const stopAt = Date.now();
    try {
      await deadline(run.connection.finish(), finalizationTimeoutMs);
      if (state.run !== run) return;
      flushSnapshot(state);
      if (state.latest) {
        const final = { ...state.latest, sequence: ++run.sequence, stability: 'settled' };
        state.latest = final;
        broadcast(state, final);
      }
      log('stopped', { backend: run.config.backend, runId: run.id, drainMs: Date.now() - stopAt });
      teardownRun(state, run);
      status(state, 'idle');
      scheduleClear(state, finalHoldMs, 'final_hold');
    } catch (error) {
      await failRun(state, run, error);
    }
  };
  const startRun = async (state, socket, message) => {
    if (state.producer && state.producer !== socket) {
      send(socket, { type: 'translation.error', version: 1, code: 'already_active', message: 'Another tab is already capturing this presentation.' });
      return;
    }
    if (state.run) return;
    if (!validTranslationConfig(message.config)) {
      send(socket, { type: 'translation.error', version: 1, code: 'invalid_config', message: 'Choose a supported provider and an English/Spanish direction.' });
      return;
    }
    const backendCapability = capabilities.backends[message.config.backend];
    const adapter = adapters[message.config.backend];
    if (!backendCapability?.configured || !adapter) {
      const missing = backendCapability?.missing?.join(', ') || 'provider configuration';
      send(socket, { type: 'translation.error', version: 1, code: 'not_configured', message: `Set ${missing} in the project .env and restart ok-show.` });
      return;
    }
    clearTimers(state);
    clearCaption(state, 'new_run');
    const run = {
      id: randomUUID(),
      config: message.config,
      adapter,
      abort: new AbortController(),
      connection: null,
      sequence: 0,
      stopping: false,
      startedAt: Date.now(),
      firstAudioAt: 0,
      firstCaptionAt: 0,
      rateWindowAt: Date.now(),
      audioBytes: 0,
      droppedAudioChunks: 0,
      lastAudioDropLogAt: 0,
    };
    state.producer = socket;
    state.run = run;
    status(state, 'connecting', { backend: message.config.backend });
    log('connecting', { backend: message.config.backend, provider: backendProvider(message.config.backend), runId: run.id });
    try {
      run.connection = await adapter.connect(message.config, (event) => publish(state, run, event), run.abort.signal);
      if (state.run !== run || run.abort.signal.aborted) {
        run.connection.close();
        return;
      }
      log('connected', { backend: message.config.backend, runId: run.id, connectMs: Date.now() - run.startedAt });
      status(state, 'listening', {
        backend: message.config.backend,
        sampleRate: adapter.sampleRate,
        chunkDurationMs: adapter.chunkDurationMs,
      });
      send(socket, {
        type: 'translation.ready', version: 1,
        sessionId: state.sessionId, presentationId: state.presentationId,
        runId: run.id, sampleRate: adapter.sampleRate, chunkDurationMs: adapter.chunkDurationMs,
      });
    } catch (error) {
      await failRun(state, run, error);
    }
  };

  wss.on('connection', (socket) => {
    let rateWindowAt = Date.now();
    let messages = 0;
    let joined = false;
    const joinTimer = setTimeout(() => socket.close(1008, 'Join timeout'), 5_000);
    joinTimer.unref?.();
    socket.on('message', (raw) => {
      const now = Date.now();
      if (now - rateWindowAt >= 1_000) { rateWindowAt = now; messages = 0; }
      if (++messages > MAX_MESSAGES_PER_SECOND) return socket.close(1008, 'Rate limit exceeded');
      let message;
      try { message = JSON.parse(String(raw)); } catch { return socket.close(1008, 'Invalid JSON'); }
      if (!isPlainObject(message)) return socket.close(1008, 'Invalid message');
      if (!joined) {
        if (message.type !== 'translation.join'
          || message.version !== 1
          || !validTranslationId(message.sessionId, 64)
          || !validTranslationId(message.presentationId)
          || !validPresentationId(message.presentationId)
          || (controlToken && message.token !== controlToken)
          || (!controlToken && message.role === 'producer')) {
          return socket.close(1008, 'Invalid translation credentials or scope');
        }
        joined = true;
        clearTimeout(joinTimer);
        const role = message.role === 'producer' ? 'producer' : 'viewer';
        const state = sessionFor(message.sessionId, message.presentationId);
        clientMeta.set(socket, { state, role });
        state.clients.add(socket);
        send(socket, { type: 'translation.capabilities', version: 1, ...capabilities });
        send(socket, {
          type: 'translation.status', version: 1,
          sessionId: state.sessionId, presentationId: state.presentationId,
          phase: state.status, runId: state.run?.id,
        });
        if (state.latest) send(socket, state.latest);
        return;
      }
      const meta = clientMeta.get(socket);
      if (!meta) return;
      if (message.version !== 1) return socket.close(1008, 'Unsupported translation protocol version');
      const { state, role } = meta;
      if (message.type === 'translation.clear') {
        if (role !== 'producer') return send(socket, { type: 'translation.error', version: 1, code: 'forbidden', message: 'Viewer connections cannot clear captions.' });
        clearCaption(state);
        return;
      }
      if (message.type === 'translation.start') {
        if (role !== 'producer') return send(socket, { type: 'translation.error', version: 1, code: 'forbidden', message: 'Viewer connections cannot start capture.' });
        void startRun(state, socket, message);
        return;
      }
      const run = state.run;
      if (!run || state.producer !== socket || role !== 'producer' || message.runId !== run.id) return;
      if (message.type === 'translation.stop') {
        void stopRun(state, run);
        return;
      }
      if (message.type !== 'translation.audio' || state.status !== 'listening') return;
      const maximumChunk = Math.ceil(run.adapter.sampleRate * 2 * run.adapter.chunkDurationMs / 1_000);
      const audio = decodeAudio(message.audio, maximumChunk);
      if (!audio) return void failRun(state, run, { code: 'invalid_audio' });
      if (now - run.rateWindowAt >= 1_000) { run.rateWindowAt = now; run.audioBytes = 0; }
      run.audioBytes += audio.length;
      if (run.audioBytes > run.adapter.sampleRate * 2 * MAX_AUDIO_SECONDS) {
        noteAudioDrop(run, 'ingress_backpressure');
        return;
      }
      if (!run.firstAudioAt) {
        run.firstAudioAt = now;
        log('first_audio', { backend: run.config.backend, runId: run.id, elapsedMs: now - run.startedAt });
      }
      try {
        if (run.connection.sendAudio(audio) === false) noteAudioDrop(run, 'provider_backpressure');
      } catch (error) {
        if (error?.code === 'queue_pressure') noteAudioDrop(run, 'provider_backpressure');
        else void failRun(state, run, error);
      }
    });
    socket.on('close', () => {
      clearTimeout(joinTimer);
      const meta = clientMeta.get(socket);
      if (!meta) return;
      clientMeta.delete(socket);
      meta.state.clients.delete(socket);
      if (meta.state.producer === socket && meta.state.run) {
        const run = meta.state.run;
        teardownRun(meta.state, run);
        status(meta.state, 'error', { code: 'producer_disconnected', message: 'The microphone tab disconnected.' });
        clearCaption(meta.state, 'producer_disconnected');
        // Existing viewers learn that the producer dropped, while a returning
        // producer joins a restartable idle session instead of inheriting the
        // stale error state.
        meta.state.status = 'idle';
      }
      if (!meta.state.clients.size && !meta.state.run && !meta.state.latest) sessions.delete(meta.state.key);
    });
  });

  return {
    wss,
    capabilities,
    handleUpgrade: (request, socket, head) => wss.handleUpgrade(request, socket, head, (client) => wss.emit('connection', client, request)),
    close: async () => {
      for (const state of sessions.values()) {
        clearTimers(state);
        if (state.run) teardownRun(state, state.run);
      }
      for (const socket of wss.clients) socket.terminate();
      await new Promise((resolve) => wss.close(resolve));
    },
  };
}
