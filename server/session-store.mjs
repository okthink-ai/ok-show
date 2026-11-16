import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const EMPTY_SESSION_STATE = Object.freeze({
  presentationId: '',
  slideIndex: 0,
  totalSlides: 0,
  theme: 'midnight',
  revision: 0,
  updatedAt: 0,
});

async function loadSessions(path, isValidSessionId, isValidState) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([id, state]) => isValidSessionId(id) && isValidState(state)),
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn('[speaker-sync] could not load state:', error.message);
    return {};
  }
}

export async function persistSessions(path, sessions) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(Object.fromEntries(sessions), null, 2)}\n`);
  await rename(tempPath, path);
}

export function createSessionStore({
  stateFile,
  isValidSessionId,
  isValidState,
  normalizeState = (state) => state,
  isActive = () => false,
  sessionTtlMs,
  maxSessions,
  persist = persistSessions,
} = {}) {
  const sessions = new Map();
  let persistQueue = Promise.resolve();

  const ready = loadSessions(stateFile, isValidSessionId, isValidState).then((loaded) => {
    for (const [id, state] of Object.entries(loaded)) sessions.set(id, normalizeState(state));
  });
  const queuePersist = () => {
    persistQueue = persistQueue
      .then(() => persist(stateFile, sessions))
      .catch((error) => console.warn('[speaker-sync] could not persist state:', error.message));
  };
  const get = (sessionId) => sessions.get(sessionId) ?? EMPTY_SESSION_STATE;
  const removeExpired = (now = Date.now()) => {
    let changed = false;
    for (const [sessionId, state] of sessions) {
      if (!isActive(sessionId) && now - (state.updatedAt || 0) >= sessionTtlMs) {
        sessions.delete(sessionId);
        changed = true;
      }
    }
    if (changed) queuePersist();
    return changed;
  };
  const makeCapacity = () => {
    if (sessions.size < maxSessions) return true;
    const inactive = [...sessions]
      .filter(([sessionId]) => !isActive(sessionId))
      .sort(([, left], [, right]) => (left.updatedAt || 0) - (right.updatedAt || 0));
    if (!inactive.length) return false;
    sessions.delete(inactive[0][0]);
    queuePersist();
    return true;
  };
  const create = (sessionId, state, now = Date.now()) => {
    sessions.set(sessionId, normalizeState({ ...state, revision: 1, updatedAt: now }));
    queuePersist();
    return get(sessionId);
  };
  const touch = (sessionId, now = Date.now()) => {
    sessions.set(sessionId, { ...get(sessionId), updatedAt: now });
    queuePersist();
  };
  const applyNavigation = (sessionId, state, now = Date.now()) => {
    const current = get(sessionId);
    if (Number.isInteger(state.baseRevision) && state.baseRevision < current.revision) {
      return { accepted: false, state: current };
    }
    const next = normalizeState({
      presentationId: state.presentationId,
      slideIndex: state.slideIndex,
      totalSlides: state.totalSlides,
      theme: state.theme ?? current.theme,
      revision: current.revision + 1,
      updatedAt: now,
    });
    sessions.set(sessionId, next);
    queuePersist();
    return { accepted: true, state: next, previous: current };
  };
  const pruneCapacity = () => {
    let changed = false;
    while (sessions.size > maxSessions && makeCapacity()) changed = true;
    return changed;
  };

  return {
    ready,
    get,
    has: (sessionId) => sessions.has(sessionId),
    create,
    touch,
    applyNavigation,
    removeExpired,
    makeCapacity,
    pruneCapacity,
    size: () => sessions.size,
    entries: () => sessions.entries(),
    waitForPersistence: () => persistQueue,
  };
}
