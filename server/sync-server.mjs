import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { THEME_IDS } from '../src/themeRegistry.js';
import { createSessionStore, persistSessions } from './session-store.mjs';

const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_MESSAGES_PER_SECOND = 30;
const HEARTBEAT_MS = 15_000;
const DEFAULT_JOIN_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_CONNECTIONS = 100;
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_SESSIONS = 1_000;
const DEFAULT_SESSION = 'default';
const SESSION_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validNavigation(value) {
  return value && typeof value.presentationId === 'string' && value.presentationId.length > 0
    && value.presentationId.length <= 128 && Number.isInteger(value.slideIndex)
    && Number.isInteger(value.totalSlides) && value.totalSlides > 0
    && value.totalSlides <= 10_000 && value.slideIndex >= 0 && value.slideIndex < value.totalSlides
    && (value.theme === undefined || THEME_IDS.includes(value.theme));
}

function validNotesRequest(value) {
  return value && typeof value.presentationId === 'string' && value.presentationId.length > 0
    && value.presentationId.length <= 128 && Number.isInteger(value.baseRevision)
    && value.baseRevision >= 0;
}

function validSessionId(value) {
  return typeof value === 'string' && SESSION_PATTERN.test(value);
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createSyncServer({
  port = 5200,
  host = '0.0.0.0',
  stateFile = process.env.SYNC_STATE_FILE || resolve('.speaker-sync/state.json'),
  controlToken = process.env.SYNC_CONTROL_TOKEN || '',
  allowedOrigins = process.env.SYNC_ALLOWED_ORIGINS?.split(',').map((value) => value.trim()).filter(Boolean) ?? [],
  joinTimeoutMs = positiveInteger(process.env.SYNC_JOIN_TIMEOUT_MS, DEFAULT_JOIN_TIMEOUT_MS),
  maxConnections = positiveInteger(process.env.SYNC_MAX_CONNECTIONS, DEFAULT_MAX_CONNECTIONS),
  sessionTtlMs = positiveInteger(process.env.SYNC_SESSION_TTL_MS, DEFAULT_SESSION_TTL_MS),
  maxSessions = positiveInteger(process.env.SYNC_MAX_SESSIONS, DEFAULT_MAX_SESSIONS),
  persist = persistSessions,
  notesByPresentation = {},
  sparkleByPresentation = {},
} = {}) {
  notesByPresentation = { ...notesByPresentation };
  sparkleByPresentation = { ...sparkleByPresentation };
  joinTimeoutMs = positiveInteger(joinTimeoutMs, DEFAULT_JOIN_TIMEOUT_MS);
  maxConnections = positiveInteger(maxConnections, DEFAULT_MAX_CONNECTIONS);
  sessionTtlMs = positiveInteger(sessionTtlMs, DEFAULT_SESSION_TTL_MS);
  maxSessions = positiveInteger(maxSessions, DEFAULT_MAX_SESSIONS);
  const clientMeta = new WeakMap();
  let heartbeat;
  let sessionCleanup;
  const hasActiveClient = (sessionId) => {
    for (const client of wss.clients) {
      if (clientMeta.get(client)?.sessionId === sessionId) return true;
    }
    return false;
  };
  const normalizeState = (state) => ({
    ...state,
    theme: THEME_IDS.includes(state.theme) ? state.theme : 'midnight',
  });
  const store = createSessionStore({
    stateFile,
    isValidSessionId: validSessionId,
    isValidState: validNavigation,
    normalizeState,
    isActive: hasActiveClient,
    sessionTtlMs,
    maxSessions,
    persist,
  });
  const getState = (sessionId) => store.get(sessionId);

  const httpServer = createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, sessions: store.size(), clients: wss.clients.size }));
      return;
    }
    if (request.url === '/diagnostics') {
      if (controlToken && request.headers.authorization !== `Bearer ${controlToken}`) {
        response.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Bearer' });
        response.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ sessions: Object.fromEntries(store.entries()), clients: wss.clients.size }));
      return;
    }
    response.writeHead(404).end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  httpServer.on('upgrade', (request, socket, head) => {
    const origin = request.headers.origin;
    if (allowedOrigins.length && (!origin || !allowedOrigins.includes(origin))) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    if (wss.clients.size >= maxConnections) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });

  const sendState = (socket, sessionId) => socket.send(JSON.stringify({ type: 'state', sessionId, state: getState(sessionId) }));
  const sendNotes = (socket, sessionId, presentationId) => {
    const revision = getState(sessionId).revision;
    socket.send(JSON.stringify({
      type: 'notes',
      sessionId,
      presentationId,
      revision,
      notes: notesByPresentation[presentationId] ?? {},
      sparkle: sparkleByPresentation[presentationId] ?? {},
    }));
  };
  const broadcast = (sessionId) => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN && clientMeta.get(client)?.sessionId === sessionId) sendState(client, sessionId);
    }
  };

  wss.on('connection', (socket) => {
    let alive = true;
    let rateWindow = Date.now();
    let messages = 0;
    let forcedTermination;
    const joinDeadline = setTimeout(() => {
      if (!clientMeta.has(socket)) {
        socket.close(1008, 'Join timeout');
        forcedTermination = setTimeout(() => socket.terminate(), 1_000);
        forcedTermination.unref();
      }
    }, joinTimeoutMs);
    joinDeadline.unref();
    socket.on('pong', () => { alive = true; });
    socket.on('message', (raw) => {
      const now = Date.now();
      if (now - rateWindow >= 1000) { rateWindow = now; messages = 0; }
      if (++messages > MAX_MESSAGES_PER_SECOND) return socket.close(1008, 'Rate limit exceeded');
      let message;
      try { message = JSON.parse(String(raw)); } catch { return; }
      // JSON.parse accepts null, numbers, strings, and arrays. Only a plain
      // object can be a protocol message; anything else is ignored.
      if (!isPlainObject(message)) return;

      if (message.type === 'join') {
        const sessionId = validSessionId(message.sessionId) ? message.sessionId : DEFAULT_SESSION;
        const role = message.role === 'notes' ? 'notes' : 'presentation';
        if (role === 'notes' && !controlToken) return socket.close(1008, 'Speaker notes require a control token');
        if (controlToken && message.token !== controlToken) return socket.close(1008, 'Invalid control token');
        clearTimeout(joinDeadline);
        store.removeExpired(now);
        if (!store.has(sessionId) && validNavigation(message.state) && !store.makeCapacity()) {
          return socket.close(1013, 'Session limit reached');
        }
        clientMeta.set(socket, { sessionId, role, clientId: String(message.clientId || '') });
        if (!store.has(sessionId) && validNavigation(message.state)) {
          store.create(sessionId, message.state, now);
        } else if (store.has(sessionId)) {
          store.touch(sessionId, now);
        }
        sendState(socket, sessionId);
        return;
      }

      const meta = clientMeta.get(socket);
      if (!meta) return;
      if (meta.role === 'notes' && message.type === 'request-notes') {
        if (!validNotesRequest(message)) return;
        meta.notesPresentationId = message.presentationId;
        sendNotes(socket, meta.sessionId, message.presentationId);
        return;
      }
      // A notes client authenticated with the control token, so it is allowed to
      // drive the session. That is the point of the presenter view.
      if (message.type !== 'navigate' || !validNavigation(message)) return;
      const result = store.applyNavigation(meta.sessionId, message, now);
      if (!result.accepted) {
        sendState(socket, meta.sessionId);
        return;
      }
      broadcast(meta.sessionId);
    });
    socket.on('close', () => {
      clearTimeout(joinDeadline);
      clearTimeout(forcedTermination);
      clientMeta.delete(socket);
    });
    socket.isAlive = () => alive;
    socket.markDead = () => { alive = false; };
  });

  return {
    listen: async () => {
      await store.ready;
      const address = await new Promise((resolveAddress) => httpServer.listen(port, host, () => resolveAddress(httpServer.address())));
      heartbeat = setInterval(() => {
        for (const socket of wss.clients) {
          if (!socket.isAlive()) socket.terminate();
          else { socket.markDead(); socket.ping(); }
        }
      }, HEARTBEAT_MS);
      sessionCleanup = setInterval(store.removeExpired, Math.min(HEARTBEAT_MS, sessionTtlMs));
      sessionCleanup.unref();
      store.removeExpired();
      store.pruneCapacity();
      return address;
    },
    close: async () => {
      clearInterval(heartbeat);
      clearInterval(sessionCleanup);
      for (const socket of wss.clients) socket.terminate();
      await store.waitForPersistence();
      await new Promise((resolveClose) => wss.close(() => httpServer.close(resolveClose)));
    },
    getState: (sessionId = DEFAULT_SESSION) => ({ ...getState(sessionId) }),
    /** Swap in edited notes and push them to every presenter reading that deck. */
    reloadNotes: (presentationId, notes, sparkle) => {
      notesByPresentation[presentationId] = notes;
      if (sparkle) sparkleByPresentation[presentationId] = sparkle;
      for (const client of wss.clients) {
        const meta = clientMeta.get(client);
        if (client.readyState === WebSocket.OPEN && meta?.role === 'notes' && meta.notesPresentationId === presentationId) {
          sendNotes(client, meta.sessionId, presentationId);
        }
      }
    },
  };
}
