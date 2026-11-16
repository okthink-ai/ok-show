import WebSocket from 'ws';
import { createSocketReadyPromise, keepRecentText, providerFailure, sendJson } from './shared.mjs';

export function appendElevenLabsFragment(current, fragment) {
  if (typeof fragment !== 'string' || !fragment) return current;
  if (!current || /^\s|^[,.;:!?)}\]]/u.test(fragment) || /\s$/u.test(current) || /[({[¿¡]$/u.test(current)) return current + fragment;
  if (/^['’]/u.test(fragment)) return current + fragment;
  return `${current} ${fragment}`;
}

export function createElevenLabsRealtimeAdapter({ apiKey, voiceId, WebSocketImpl = WebSocket, connectTimeoutMs = 10_000 } = {}) {
  return {
    sampleRate: 16000,
    chunkDurationMs: 100,
    async connect(config, emit, signal) {
      const url = new URL('wss://api.elevenlabs.io/v1/translation/realtime');
      url.search = new URLSearchParams({
        source_language: config.sourceLanguage,
        target_language: config.targetLanguage,
        voice_id: voiceId,
        input_format: 'pcm_16000',
        output_format: 'pcm_16000',
        eagerness: 'high',
      }).toString();
      const socket = new WebSocketImpl(url, { headers: { 'xi-api-key': apiKey } });
      let translated = '';
      let finishResolve;
      let finishReject;
      let closed = false;
      let intentionalClose = false;
      const finished = new Promise((resolve, reject) => { finishResolve = resolve; finishReject = reject; });
      void finished.catch(() => undefined);
      const handle = (message) => {
        if (!message || typeof message !== 'object') return;
        if (message.message_type === 'partial_transcript' && typeof message.text === 'string') {
          emit({ type: 'source', text: message.text, stability: 'streaming' });
        } else if (message.message_type === 'final_transcript' && typeof message.text === 'string') {
          emit({ type: 'source', text: message.text, stability: 'settled' });
        } else if (message.message_type === 'translation' && typeof message.text === 'string') {
          translated = keepRecentText(appendElevenLabsFragment(translated, message.text));
          emit({ type: 'translation', text: translated, stability: 'streaming' });
        } else if (message.message_type === 'status' && message.status === 'stopped') {
          intentionalClose = true;
          emit({ type: 'translation', text: translated, stability: 'settled' });
          finishResolve?.();
        } else if (typeof message.error === 'string') {
          const error = new Error('ElevenLabs Realtime returned an error.');
          finishReject?.(error);
          providerFailure(emit, error);
        }
      };
      const onMessage = (raw) => {
        let message;
        try { message = JSON.parse(String(raw)); } catch { return; }
        handle(message);
      };
      await createSocketReadyPromise(socket, {
        timeoutMs: connectTimeoutMs,
        signal,
        isReady: (message) => message?.message_type === 'status' && message.status === 'started',
        onMessage: handle,
      });
      socket.on('message', onMessage);
      socket.on('error', (error) => { finishReject?.(error); providerFailure(emit, error); });
      socket.on('close', () => {
        if (intentionalClose) return;
        const error = new Error('ElevenLabs Realtime closed unexpectedly.');
        finishReject?.(error);
        providerFailure(emit, error);
      });
      return {
        sendAudio(pcm16) {
          if (socket.bufferedAmount > 32_000) throw Object.assign(new Error('ElevenLabs audio queue is full.'), { code: 'queue_pressure' });
          sendJson(socket, { message_type: 'input_audio_chunk', audio_base_64: Buffer.from(pcm16).toString('base64') });
        },
        async finish() {
          sendJson(socket, { message_type: 'end_of_stream' });
          await finished;
        },
        close() {
          if (closed) return;
          closed = true;
          intentionalClose = true;
          finishResolve?.();
          socket.close();
        },
      };
    },
  };
}
