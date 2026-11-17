// @vitest-environment node
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { createSyncServer } from './sync-server.mjs';
import { translationConfigFromEnv } from './translation-service.mjs';

type Server = ReturnType<typeof createSyncServer>;
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function connect(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

async function until(socket: WebSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const listener = (raw: WebSocket.RawData) => {
      const message = JSON.parse(String(raw));
      if (message.type !== type) return;
      socket.off('message', listener);
      resolve(message);
    };
    socket.on('message', listener);
  });
}

async function untilPhase(socket: WebSocket, phase: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const listener = (raw: WebSocket.RawData) => {
      const message = JSON.parse(String(raw));
      if (message.type !== 'translation.status' || message.phase !== phase) return;
      socket.off('message', listener);
      resolve(message);
    };
    socket.on('message', listener);
  });
}

function fakeAdapter(onConnect = () => undefined) {
  return {
    sampleRate: 24000,
    chunkDurationMs: 200,
    async connect(_config: unknown, emit: (event: object) => void) {
      onConnect();
      let count = 0;
      return {
        sendAudio() { emit({ type: 'translation', text: `caption ${++count}`, stability: 'streaming' }); },
        async finish() { emit({ type: 'translation', text: `caption ${count}`, stability: 'settled' }); },
        close() {},
      };
    },
  };
}

async function serverFor(adapter = fakeAdapter(), translationServiceOptions: Record<string, unknown> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'translation-service-'));
  const stateFile = join(directory, 'state.json');
  const server = createSyncServer({
    port: 0,
    host: '127.0.0.1',
    stateFile,
    controlToken: 'test-token',
    presentationIds: ['demo', 'second'],
    translationConfig: { openaiApiKey: 'sentinel' },
    translationAdapters: { 'openai-realtime': adapter },
    translationLog: () => undefined,
    translationServiceOptions,
  });
  servers.push(server);
  const address = await server.listen() as { port: number };
  return { server, stateFile, url: `ws://127.0.0.1:${address.port}` };
}

function joinTranslation(socket: WebSocket, values: Partial<Record<string, unknown>> = {}) {
  socket.send(JSON.stringify({
    type: 'translation.join', version: 1, sessionId: 'session-one', presentationId: 'demo',
    role: 'producer', token: 'test-token', ...values,
  }));
}

async function authenticate(socket: WebSocket, values: Partial<Record<string, unknown>> = {}) {
  const capabilities = until(socket, 'translation.capabilities');
  const status = until(socket, 'translation.status');
  joinTranslation(socket, values);
  return { capabilities: await capabilities, status: await status };
}

describe('translation service', () => {
  it('reads the default provider from TRANSLATION_PROVIDER', () => {
    expect(translationConfigFromEnv({
      TRANSLATION_PROVIDER: 'openai',
    })).toMatchObject({ defaultProvider: 'openai' });
  });

  it('authenticates and validates scope before a paid adapter can open', async () => {
    let connections = 0;
    const { url } = await serverFor(fakeAdapter(() => { connections += 1; }));
    const socket = await connect(`${url}/translation-sync`);
    const closed = new Promise<{ code: number; reason: string }>((resolve) => socket.once('close', (code, reason) => resolve({ code, reason: String(reason) })));
    joinTranslation(socket, { token: 'wrong' });
    await expect(closed).resolves.toMatchObject({ code: 1008 });
    expect(connections).toBe(0);

    const unknown = await connect(`${url}/translation-sync`);
    const unknownClosed = new Promise<number>((resolve) => unknown.once('close', resolve));
    joinTranslation(unknown, { presentationId: 'unknown' });
    await expect(unknownClosed).resolves.toBe(1008);
    expect(connections).toBe(0);
  });

  it('enforces producer permissions and one owner per session/deck', async () => {
    const { url } = await serverFor();
    const owner = await connect(`${url}/translation-sync`);
    await authenticate(owner, { clientId: 'presenter-owner', surface: 'presenter' });
    const ownerReady = until(owner, 'translation.ready');
    owner.send(JSON.stringify({ type: 'translation.start', version: 1, config: { backend: 'openai-realtime', sourceLanguage: 'en', targetLanguage: 'es' } }));
    const ready = await ownerReady;
    expect(ready.sampleRate).toBe(24000);

    const other = await connect(`${url}/translation-sync`);
    const otherJoin = await authenticate(other);
    expect(otherJoin.status).toMatchObject({ producerClientId: 'presenter-owner', producerSurface: 'presenter' });
    const alreadyActive = until(other, 'translation.error');
    other.send(JSON.stringify({ type: 'translation.start', version: 1, config: { backend: 'openai-realtime', sourceLanguage: 'en', targetLanguage: 'es' } }));
    await expect(alreadyActive).resolves.toMatchObject({ code: 'already_active' });

    const viewer = await connect(`${url}/translation-sync`);
    await authenticate(viewer, { role: 'viewer' });
    const forbidden = until(viewer, 'translation.error');
    viewer.send(JSON.stringify({ type: 'translation.clear', version: 1 }));
    await expect(forbidden).resolves.toMatchObject({ code: 'forbidden' });
    owner.close(); other.close(); viewer.close();
  });

  it('broadcasts bounded snapshots, reconnects from the latest snapshot, and never persists captions', async () => {
    const { url, stateFile } = await serverFor();
    const owner = await connect(`${url}/translation-sync`);
    await authenticate(owner);
    const ownerReady = until(owner, 'translation.ready');
    owner.send(JSON.stringify({ type: 'translation.start', version: 1, config: { backend: 'openai-realtime', sourceLanguage: 'en', targetLanguage: 'es' } }));
    const ready = await ownerReady;
    const audio = Buffer.alloc(9600).toString('base64');
    owner.send(JSON.stringify({ type: 'translation.audio', version: 1, runId: ready.runId, audio }));
    const caption = await until(owner, 'translation.caption');
    expect(caption).toMatchObject({ translatedText: 'caption 1', sequence: 1, targetLanguage: 'es' });

    const viewer = await connect(`${url}/translation-sync`);
    const viewerCaption = until(viewer, 'translation.caption');
    await authenticate(viewer, { role: 'viewer' });
    await expect(viewerCaption).resolves.toMatchObject({ runId: ready.runId, translatedText: 'caption 1' });

    const stopping = untilPhase(owner, 'stopping');
    const idle = untilPhase(owner, 'idle');
    owner.send(JSON.stringify({ type: 'translation.stop', version: 1, runId: ready.runId }));
    await expect(stopping).resolves.toMatchObject({ phase: 'stopping' });
    await expect(idle).resolves.toMatchObject({ phase: 'idle' });
    await expect(readFile(stateFile, 'utf8').catch((error: NodeJS.ErrnoException) => error.code)).resolves.not.toContain('caption');
    owner.close(); viewer.close();
  });

  it('drops overloaded audio and keeps the translation run listening', async () => {
    let delivered = 0;
    let closed = 0;
    const adapter = {
      sampleRate: 24000,
      chunkDurationMs: 200,
      async connect(_config: unknown, emit: (event: object) => void) {
        return {
          sendAudio() {
            delivered += 1;
            emit({ type: 'translation', text: `accepted ${delivered}`, stability: 'streaming' });
            return true;
          },
          async finish() {},
          close() { closed += 1; },
        };
      },
    };
    const { url } = await serverFor(adapter);
    const owner = await connect(`${url}/translation-sync`);
    await authenticate(owner);
    const readyMessage = until(owner, 'translation.ready');
    owner.send(JSON.stringify({ type: 'translation.start', version: 1, config: { backend: 'openai-realtime', sourceLanguage: 'en', targetLanguage: 'es' } }));
    const ready = await readyMessage;
    const audio = Buffer.alloc(9600).toString('base64');
    for (let index = 0; index < 6; index += 1) {
      owner.send(JSON.stringify({ type: 'translation.audio', version: 1, runId: ready.runId, audio }));
    }
    await until(owner, 'translation.caption');
    expect(delivered).toBe(5);
    expect(closed).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 1_050));
    const recoveredCaption = until(owner, 'translation.caption');
    owner.send(JSON.stringify({ type: 'translation.audio', version: 1, runId: ready.runId, audio }));
    await expect(recoveredCaption).resolves.toMatchObject({ translatedText: 'accepted 6' });
    expect(closed).toBe(0);

    const idle = untilPhase(owner, 'idle');
    owner.send(JSON.stringify({ type: 'translation.stop', version: 1, runId: ready.runId }));
    await idle;
    owner.close();
  });

  it('treats provider backpressure as a dropped chunk instead of a failed run', async () => {
    let attempts = 0;
    const adapter = {
      sampleRate: 24000,
      chunkDurationMs: 200,
      async connect(_config: unknown, emit: (event: object) => void) {
        return {
          sendAudio() {
            attempts += 1;
            if (attempts === 1) return false;
            emit({ type: 'translation', text: 'still listening', stability: 'streaming' });
            return true;
          },
          async finish() {},
          close() {},
        };
      },
    };
    const { url } = await serverFor(adapter);
    const owner = await connect(`${url}/translation-sync`);
    await authenticate(owner);
    const readyMessage = until(owner, 'translation.ready');
    owner.send(JSON.stringify({ type: 'translation.start', version: 1, config: { backend: 'openai-realtime', sourceLanguage: 'en', targetLanguage: 'es' } }));
    const ready = await readyMessage;
    const audio = Buffer.alloc(9600).toString('base64');
    owner.send(JSON.stringify({ type: 'translation.audio', version: 1, runId: ready.runId, audio }));
    const caption = until(owner, 'translation.caption');
    owner.send(JSON.stringify({ type: 'translation.audio', version: 1, runId: ready.runId, audio }));
    await expect(caption).resolves.toMatchObject({ translatedText: 'still listening' });
    expect(attempts).toBe(2);
    owner.close();
  });

  it('dispatches only explicit WebSocket paths', async () => {
    const { url } = await serverFor();
    await expect(connect(`${url}/not-a-service`)).rejects.toThrow('Unexpected server response: 404');
  });

  it('clears subscribers immediately when the producer disconnects', async () => {
    const { url } = await serverFor();
    const owner = await connect(`${url}/translation-sync`);
    await authenticate(owner);
    const readyMessage = until(owner, 'translation.ready');
    owner.send(JSON.stringify({ type: 'translation.start', version: 1, config: { backend: 'openai-realtime', sourceLanguage: 'en', targetLanguage: 'es' } }));
    const ready = await readyMessage;
    owner.send(JSON.stringify({ type: 'translation.audio', version: 1, runId: ready.runId, audio: Buffer.alloc(9600).toString('base64') }));
    await until(owner, 'translation.caption');

    const viewer = await connect(`${url}/translation-sync`);
    const cleared = until(viewer, 'translation.cleared');
    const failed = untilPhase(viewer, 'error');
    await authenticate(viewer, { role: 'viewer' });
    owner.close();
    await expect(failed).resolves.toMatchObject({ code: 'producer_disconnected' });
    await expect(cleared).resolves.toMatchObject({ reason: 'producer_disconnected' });

    const returning = await connect(`${url}/translation-sync`);
    const returningCapabilities = until(returning, 'translation.capabilities');
    const returningIdle = untilPhase(returning, 'idle');
    joinTranslation(returning);
    await returningCapabilities;
    await expect(returningIdle).resolves.toMatchObject({ phase: 'idle' });
    const restarted = until(returning, 'translation.ready');
    returning.send(JSON.stringify({ type: 'translation.start', version: 1, config: { backend: 'openai-realtime', sourceLanguage: 'en', targetLanguage: 'es' } }));
    await expect(restarted).resolves.toMatchObject({ sampleRate: 24000 });
    returning.close(); viewer.close();
  });

  it('reports a distinct finalization timeout and releases ownership for restart', async () => {
    let closes = 0;
    const adapter = {
      sampleRate: 24000,
      chunkDurationMs: 200,
      async connect() {
        return { sendAudio() {}, finish: () => new Promise(() => undefined), close() { closes += 1; } };
      },
    };
    const { url } = await serverFor(adapter, { finalizationTimeoutMs: 20 });
    const owner = await connect(`${url}/translation-sync`);
    await authenticate(owner);
    const readyMessage = until(owner, 'translation.ready');
    owner.send(JSON.stringify({ type: 'translation.start', version: 1, config: { backend: 'openai-realtime', sourceLanguage: 'en', targetLanguage: 'es' } }));
    const ready = await readyMessage;
    const failure = untilPhase(owner, 'error');
    const cleared = until(owner, 'translation.cleared');
    owner.send(JSON.stringify({ type: 'translation.stop', version: 1, runId: ready.runId }));
    await expect(failure).resolves.toMatchObject({ code: 'finalization_timeout' });
    await expect(cleared).resolves.toMatchObject({ reason: 'finalization_timeout' });
    expect(closes).toBe(1);
    const restarted = until(owner, 'translation.ready');
    owner.send(JSON.stringify({ type: 'translation.start', version: 1, config: { backend: 'openai-realtime', sourceLanguage: 'en', targetLanguage: 'es' } }));
    await expect(restarted).resolves.toMatchObject({ sampleRate: 24000 });
    owner.close();
  });

  it('cancels provider setup when Stop arrives before readiness', async () => {
    let aborted = false;
    const adapter = {
      sampleRate: 16000,
      chunkDurationMs: 100,
      connect(_config: unknown, _emit: unknown, signal: AbortSignal) {
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('cancelled'));
        }, { once: true }));
      },
    };
    const { url } = await serverFor(adapter);
    const owner = await connect(`${url}/translation-sync`);
    await authenticate(owner);
    const connecting = untilPhase(owner, 'connecting');
    owner.send(JSON.stringify({ type: 'translation.start', version: 1, config: { backend: 'openai-realtime', sourceLanguage: 'en', targetLanguage: 'es' } }));
    const connectingState = await connecting;
    const idle = untilPhase(owner, 'idle');
    const cleared = until(owner, 'translation.cleared');
    owner.send(JSON.stringify({ type: 'translation.stop', version: 1, runId: connectingState.runId }));
    await expect(idle).resolves.toMatchObject({ phase: 'idle' });
    await expect(cleared).resolves.toMatchObject({ reason: 'startup_cancelled' });
    expect(aborted).toBe(true);
    owner.close();
  });
});
