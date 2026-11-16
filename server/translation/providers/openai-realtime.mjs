import WebSocket from 'ws';
import { boundedEventIds, createSocketReadyPromise, providerFailure, sendJson } from './shared.mjs';

function keepRecentVerbatim(value, maximum = 280) {
  if (value.length <= maximum) return value;
  const tail = value.slice(-maximum);
  const boundary = tail.search(/\s/u);
  return boundary >= 0 && boundary < maximum / 3 ? tail.slice(boundary + 1) : tail;
}

export function createOpenAIRealtimeAdapter({ apiKey, WebSocketImpl = WebSocket, connectTimeoutMs = 10_000 } = {}) {
  return {
    sampleRate: 24000,
    chunkDurationMs: 200,
    async connect(config, emit, signal) {
      const socket = new WebSocketImpl('wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      let translated = '';
      let finishResolve;
      let finishReject;
      let closed = false;
      let intentionalClose = false;
      const duplicate = boundedEventIds();
      const finished = new Promise((resolve, reject) => { finishResolve = resolve; finishReject = reject; });
      void finished.catch(() => undefined);
      const handle = (message) => {
        if (!message || typeof message !== 'object' || duplicate(message.event_id)) return;
        if (message.type === 'session.created') {
          sendJson(socket, { type: 'session.update', session: { audio: { output: { language: config.targetLanguage } } } });
        } else if (message.type === 'session.output_transcript.delta' && typeof message.delta === 'string') {
          translated = keepRecentVerbatim(translated + message.delta);
          emit({ type: 'translation', text: translated, stability: 'streaming' });
        } else if (message.type === 'session.closed') {
          intentionalClose = true;
          emit({ type: 'translation', text: translated, stability: 'settled' });
          finishResolve?.();
        } else if (message.type === 'error') {
          const error = Object.assign(new Error('OpenAI Realtime returned an error.'), { status: message.error?.status });
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
        isReady: (message) => message?.type === 'session.updated',
        onMessage: handle,
      });
      socket.on('message', onMessage);
      socket.on('error', (error) => { finishReject?.(error); providerFailure(emit, error); });
      socket.on('close', () => {
        if (intentionalClose) return;
        const error = new Error('OpenAI Realtime closed unexpectedly.');
        finishReject?.(error);
        providerFailure(emit, error);
      });
      return {
        sendAudio(pcm16) {
          if (socket.bufferedAmount > 48_000) throw Object.assign(new Error('OpenAI audio queue is full.'), { code: 'queue_pressure' });
          sendJson(socket, { type: 'session.input_audio_buffer.append', audio: Buffer.from(pcm16).toString('base64') });
        },
        async finish() {
          sendJson(socket, { type: 'session.close' });
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
