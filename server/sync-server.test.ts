// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createSyncServer } from './sync-server.mjs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { request } from 'node:http';

const servers: Array<ReturnType<typeof createSyncServer>> = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => server.close())); });

function nextMessage(socket: WebSocket) {
  return new Promise<Record<string, unknown>>((resolve) => socket.once('message', (data) => resolve(JSON.parse(String(data)))));
}

function get(port: number, path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end();
  });
}

function connect(url: string, options?: WebSocket.ClientOptions) {
  const socket = new WebSocket(url, options);
  return new Promise<WebSocket>((resolve, reject) => {
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function closeSocket(socket: WebSocket) {
  return new Promise<void>((resolve) => {
    socket.once('close', () => resolve());
    socket.close();
  });
}

describe('speaker synchronization server', () => {
  it('shares navigation and gives refreshed/new clients the latest state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'speaker-sync-'));
    const stateFile = join(directory, 'state.json');
    const server = createSyncServer({ port: 0, host: '127.0.0.1', stateFile });
    servers.push(server);
    const address = await server.listen() as { port: number };
    const first = new WebSocket(`ws://127.0.0.1:${address.port}`);
    await new Promise((resolve) => first.once('open', resolve));
    first.send(JSON.stringify({ type: 'join', state: { presentationId: 'demo', slideIndex: 0, totalSlides: 13 } }));
    await nextMessage(first);
    first.send(JSON.stringify({ type: 'navigate', presentationId: 'demo', slideIndex: 4, totalSlides: 13 }));
    await nextMessage(first);

    const refreshed = new WebSocket(`ws://127.0.0.1:${address.port}`);
    await new Promise((resolve) => refreshed.once('open', resolve));
    refreshed.send(JSON.stringify({ type: 'join', state: { presentationId: 'demo', slideIndex: 0, totalSlides: 13 } }));
    const message = await nextMessage(refreshed) as { state: { slideIndex: number } };
    expect(message.state.slideIndex).toBe(4);
    await expect.poll(async () => JSON.parse(await readFile(stateFile, 'utf8')).default.slideIndex).toBe(4);
    first.close();
    refreshed.close();
  });

  it('isolates sessions and rejects stale navigation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'speaker-sync-'));
    const server = createSyncServer({ port: 0, host: '127.0.0.1', stateFile: join(directory, 'state.json'), controlToken: 'test-token' });
    servers.push(server);
    const address = await server.listen() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}`);
    await new Promise((resolve) => socket.once('open', resolve));
    socket.send(JSON.stringify({ type: 'join', sessionId: 'room-a', role: 'presentation', token: 'test-token', state: { presentationId: 'demo', slideIndex: 1, totalSlides: 13 } }));
    const joined = await nextMessage(socket) as { state: { revision: number } };
    socket.send(JSON.stringify({ type: 'navigate', presentationId: 'demo', slideIndex: 5, totalSlides: 13, baseRevision: joined.state.revision }));
    await nextMessage(socket);
    socket.send(JSON.stringify({ type: 'navigate', presentationId: 'demo', slideIndex: 2, totalSlides: 13, baseRevision: 0 }));
    const stale = await nextMessage(socket) as { state: { slideIndex: number } };
    expect(stale.state.slideIndex).toBe(5);
    expect(server.getState('default').totalSlides).toBe(0);
    socket.close();
  });

  it('serves presentation-keyed notes and lets a notes client drive the session', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'speaker-sync-'));
    const server = createSyncServer({
      port: 0,
      host: '127.0.0.1',
      stateFile: join(directory, 'state.json'),
      controlToken: 'test-token',
      notesByPresentation: {
        demo: { title: ['Demo notes'] },
        keynote: { title: ['Keynote notes'] },
      },
      sparkleByPresentation: {
        keynote: { title: { style: 'Ink', imagePrompt: 'Draw it.', motionPrompt: 'Move it.' } },
      },
    });
    servers.push(server);
    const address = await server.listen() as { port: number };
    const controller = await connect(`ws://127.0.0.1:${address.port}`);
    controller.send(JSON.stringify({
      type: 'join', sessionId: 'deck-switch', role: 'presentation', token: 'test-token',
      state: { presentationId: 'demo', slideIndex: 0, totalSlides: 13 },
    }));
    const initial = await nextMessage(controller) as { state: { revision: number } };
    controller.send(JSON.stringify({
      type: 'navigate', presentationId: 'demo', slideIndex: 5, totalSlides: 13,
      baseRevision: initial.state.revision,
    }));
    const advanced = await nextMessage(controller) as { state: { revision: number } };

    const socket = await connect(`ws://127.0.0.1:${address.port}`);
    socket.send(JSON.stringify({
      type: 'join', sessionId: 'deck-switch', role: 'notes', token: 'test-token',
      state: { presentationId: 'keynote', slideIndex: 0, totalSlides: 4 },
    }));
    const joined = await nextMessage(socket) as { state: { revision: number } };
    expect(joined.state.revision).toBe(advanced.state.revision);
    // The presenter view holds the control token, so it is allowed to advance the
    // deck on the presentation screen.
    const controllerFollows = nextMessage(controller) as Promise<{ state: { presentationId: string; slideIndex: number } }>;
    const presenterEcho = nextMessage(socket) as Promise<{ state: { presentationId: string; slideIndex: number; revision: number } }>;
    socket.send(JSON.stringify({
      type: 'navigate', presentationId: 'keynote', slideIndex: 2, totalSlides: 4,
      baseRevision: joined.state.revision,
    }));
    const driven = await presenterEcho;
    const followed = await controllerFollows;
    expect(driven.state).toMatchObject({ presentationId: 'keynote', slideIndex: 2 });
    expect(followed.state).toMatchObject({ presentationId: 'keynote', slideIndex: 2 });

    socket.send(JSON.stringify({
      type: 'request-notes', presentationId: 'keynote', baseRevision: driven.state.revision,
    }));
    const requestedNotes = await nextMessage(socket) as {
      presentationId: string;
      revision: number;
      notes: Record<string, string[]>;
      sparkle: Record<string, { style: string; imagePrompt: string; motionPrompt: string }>;
    };
    expect(requestedNotes).toMatchObject({
      presentationId: 'keynote',
      revision: driven.state.revision,
      notes: { title: ['Keynote notes'] },
      sparkle: { title: { style: 'Ink', imagePrompt: 'Draw it.', motionPrompt: 'Move it.' } },
    });
    expect(server.getState('deck-switch')).toMatchObject({
      presentationId: 'keynote', slideIndex: 2, revision: driven.state.revision,
    });
    controller.close();
    socket.close();
  });

  it('pushes reloaded notes to presenters reading that deck', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'speaker-sync-'));
    const server = createSyncServer({
      port: 0,
      host: '127.0.0.1',
      stateFile: join(directory, 'state.json'),
      controlToken: 'test-token',
      notesByPresentation: { keynote: { title: ['Old notes'] } },
      sparkleByPresentation: {},
    });
    servers.push(server);
    const address = await server.listen() as { port: number };
    const socket = await connect(`ws://127.0.0.1:${address.port}`);
    socket.send(JSON.stringify({
      type: 'join', sessionId: 'reload', role: 'notes', token: 'test-token',
      state: { presentationId: 'keynote', slideIndex: 0, totalSlides: 2 },
    }));
    await nextMessage(socket);
    socket.send(JSON.stringify({ type: 'request-notes', presentationId: 'keynote', baseRevision: 0 }));
    expect(await nextMessage(socket)).toMatchObject({ notes: { title: ['Old notes'] } });

    const pushed = nextMessage(socket);
    server.reloadNotes('keynote', { title: ['New notes'], closing: ['Thanks'] });
    expect(await pushed).toMatchObject({ type: 'notes', presentationId: 'keynote', notes: { title: ['New notes'], closing: ['Thanks'] } });
    socket.close();
  });

  it('restores the latest session state after a server restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'speaker-sync-'));
    const stateFile = join(directory, 'state.json');
    const firstServer = createSyncServer({ port: 0, host: '127.0.0.1', stateFile });
    const address = await firstServer.listen() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}`);
    await new Promise((resolve) => socket.once('open', resolve));
    socket.send(JSON.stringify({ type: 'join', sessionId: 'rehearsal', state: { presentationId: 'demo', slideIndex: 7, totalSlides: 13 } }));
    await nextMessage(socket);
    socket.close();
    await new Promise((resolve) => socket.once('close', resolve));
    await firstServer.close();

    const restarted = createSyncServer({ port: 0, host: '127.0.0.1', stateFile });
    servers.push(restarted);
    await restarted.listen();
    expect(restarted.getState('rehearsal').slideIndex).toBe(7);
  });

  it('protects session diagnostics while leaving aggregate health available', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'speaker-sync-'));
    const server = createSyncServer({
      port: 0,
      host: '127.0.0.1',
      stateFile: join(directory, 'state.json'),
      controlToken: 'secret',
    });
    servers.push(server);
    const address = await server.listen() as { port: number };

    expect((await get(address.port, '/health')).status).toBe(200);
    expect((await get(address.port, '/diagnostics')).status).toBe(401);
    expect((await get(address.port, '/diagnostics', { authorization: 'Bearer wrong' })).status).toBe(401);
    const diagnostics = await get(address.port, '/diagnostics', { authorization: 'Bearer secret' });
    expect(diagnostics.status).toBe(200);
    expect(diagnostics.body).toHaveProperty('sessions');
  });

  it('requires a present, exact-match Origin when an allowlist is configured', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'speaker-sync-'));
    const server = createSyncServer({
      port: 0,
      host: '127.0.0.1',
      stateFile: join(directory, 'state.json'),
      allowedOrigins: ['https://slides.example.com'],
    });
    servers.push(server);
    const address = await server.listen() as { port: number };
    const url = `ws://127.0.0.1:${address.port}`;

    await expect(connect(url)).rejects.toThrow('Unexpected server response: 403');
    await expect(connect(url, { origin: 'https://attacker.example.com' })).rejects.toThrow('Unexpected server response: 403');
    const allowed = await connect(url, { origin: 'https://slides.example.com' });
    allowed.close();
  });

  it('ignores frames that are valid JSON but not plain objects', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'speaker-sync-'));
    const server = createSyncServer({ port: 0, host: '127.0.0.1', stateFile: join(directory, 'state.json') });
    servers.push(server);
    const address = await server.listen() as { port: number };
    const socket = await connect(`ws://127.0.0.1:${address.port}`);
    const junk = ['null', '42', '[]', '[{"type":"join"}]', '"join"', 'true'];

    // Before joining: none of these may crash the process or join the socket.
    for (const frame of junk) socket.send(frame);
    socket.send(JSON.stringify({ type: 'join', state: { presentationId: 'demo', slideIndex: 0, totalSlides: 13 } }));
    const joined = await nextMessage(socket) as { state: { revision: number } };

    // After joining: the same frames are ignored and the session keeps working.
    for (const frame of junk) socket.send(frame);
    socket.send(JSON.stringify({
      type: 'navigate', presentationId: 'demo', slideIndex: 3, totalSlides: 13, baseRevision: joined.state.revision,
    }));
    const navigated = await nextMessage(socket) as { state: { slideIndex: number } };
    expect(navigated.state.slideIndex).toBe(3);
    expect(server.getState().slideIndex).toBe(3);
    await closeSocket(socket);
  });

  it('closes clients that do not join before the deadline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'speaker-sync-'));
    const server = createSyncServer({
      port: 0,
      host: '127.0.0.1',
      stateFile: join(directory, 'state.json'),
      joinTimeoutMs: 20,
    });
    servers.push(server);
    const address = await server.listen() as { port: number };
    const socket = await connect(`ws://127.0.0.1:${address.port}`);

    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      socket.once('close', (code, reason) => resolve({ code, reason: String(reason) }));
    });
    await expect(closed).resolves.toEqual({ code: 1008, reason: 'Join timeout' });
  });

  it('keeps a timely joined client and rejects connections beyond the ceiling', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'speaker-sync-'));
    const server = createSyncServer({
      port: 0,
      host: '127.0.0.1',
      stateFile: join(directory, 'state.json'),
      joinTimeoutMs: 20,
      maxConnections: 1,
    });
    servers.push(server);
    const address = await server.listen() as { port: number };
    const url = `ws://127.0.0.1:${address.port}`;
    const joined = await connect(url);
    joined.send(JSON.stringify({ type: 'join', state: { presentationId: 'demo', slideIndex: 0, totalSlides: 13 } }));
    await nextMessage(joined);

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(joined.readyState).toBe(WebSocket.OPEN);
    await expect(connect(url)).rejects.toThrow('Unexpected server response: 503');
    await closeSocket(joined);
  });

  it('expires disconnected sessions and persists their deletion', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'speaker-sync-'));
    const stateFile = join(directory, 'state.json');
    const server = createSyncServer({
      port: 0,
      host: '127.0.0.1',
      stateFile,
      sessionTtlMs: 30,
    });
    servers.push(server);
    const address = await server.listen() as { port: number };
    const socket = await connect(`ws://127.0.0.1:${address.port}`);
    socket.send(JSON.stringify({
      type: 'join', sessionId: 'temporary',
      state: { presentationId: 'demo', slideIndex: 0, totalSlides: 13 },
    }));
    await nextMessage(socket);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(server.getState('temporary').totalSlides).toBe(13);
    await closeSocket(socket);
    await expect.poll(() => server.getState('temporary').totalSlides).toBe(0);
    await expect.poll(async () => JSON.parse(await readFile(stateFile, 'utf8')).temporary).toBeUndefined();
  });

  it('evicts the least-recent inactive session when capacity is reached', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'speaker-sync-'));
    const stateFile = join(directory, 'state.json');
    const server = createSyncServer({
      port: 0,
      host: '127.0.0.1',
      stateFile,
      maxSessions: 2,
    });
    servers.push(server);
    const address = await server.listen() as { port: number };
    const url = `ws://127.0.0.1:${address.port}`;

    for (const sessionId of ['oldest', 'newer']) {
      const socket = await connect(url);
      socket.send(JSON.stringify({
        type: 'join', sessionId,
        state: { presentationId: 'demo', slideIndex: 0, totalSlides: 13 },
      }));
      await nextMessage(socket);
      await closeSocket(socket);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const newest = await connect(url);
    newest.send(JSON.stringify({
      type: 'join', sessionId: 'newest',
      state: { presentationId: 'demo', slideIndex: 0, totalSlides: 13 },
    }));
    await nextMessage(newest);

    expect(server.getState('oldest').totalSlides).toBe(0);
    expect(server.getState('newer').totalSlides).toBe(13);
    expect(server.getState('newest').totalSlides).toBe(13);
    await expect.poll(async () => Object.keys(JSON.parse(await readFile(stateFile, 'utf8'))).sort())
      .toEqual(['newer', 'newest']);
    await closeSocket(newest);
  });

  it('rejects a new session when every capacity slot is active', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'speaker-sync-'));
    const server = createSyncServer({
      port: 0,
      host: '127.0.0.1',
      stateFile: join(directory, 'state.json'),
      maxSessions: 1,
    });
    servers.push(server);
    const address = await server.listen() as { port: number };
    const url = `ws://127.0.0.1:${address.port}`;
    const active = await connect(url);
    active.send(JSON.stringify({
      type: 'join', sessionId: 'active',
      state: { presentationId: 'demo', slideIndex: 0, totalSlides: 13 },
    }));
    await nextMessage(active);

    const rejected = await connect(url);
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      rejected.once('close', (code, reason) => resolve({ code, reason: String(reason) }));
    });
    rejected.send(JSON.stringify({
      type: 'join', sessionId: 'overflow',
      state: { presentationId: 'demo', slideIndex: 0, totalSlides: 13 },
    }));
    await expect(closed).resolves.toEqual({ code: 1013, reason: 'Session limit reached' });
    expect(server.getState('active').totalSlides).toBe(13);
    expect(server.getState('overflow').totalSlides).toBe(0);
    await closeSocket(active);
  });

  it('retries later persistence after a transient write failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'speaker-sync-'));
    const stateFile = join(directory, 'state.json');
    let attempts = 0;
    const persist = async (path: string, sessions: Map<string, unknown>) => {
      attempts += 1;
      if (attempts === 1) throw new Error('disk temporarily unavailable');
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(Object.fromEntries(sessions)));
    };
    const server = createSyncServer({ port: 0, host: '127.0.0.1', stateFile, persist });
    servers.push(server);
    const address = await server.listen() as { port: number };
    const socket = await connect(`ws://127.0.0.1:${address.port}`);
    socket.send(JSON.stringify({ type: 'join', state: { presentationId: 'demo', slideIndex: 0, totalSlides: 13 } }));
    await nextMessage(socket);
    await expect.poll(() => attempts).toBe(1);
    socket.send(JSON.stringify({ type: 'navigate', presentationId: 'demo', slideIndex: 6, totalSlides: 13 }));
    await nextMessage(socket);

    await expect.poll(async () => JSON.parse(await readFile(stateFile, 'utf8')).default.slideIndex).toBe(6);
    expect(attempts).toBe(2);
    socket.close();
  });
});
