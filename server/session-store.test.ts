// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionStore } from './session-store.mjs';

const validState = (slideIndex = 0) => ({
  presentationId: 'demo',
  slideIndex,
  totalSlides: 3,
  theme: 'midnight',
});

function makeStore(overrides: Record<string, unknown> = {}) {
  return createSessionStore({
    stateFile: '/missing/session-store-test.json',
    isValidSessionId: () => true,
    isValidState: () => true,
    sessionTtlMs: 100,
    maxSessions: 2,
    persist: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });
}

describe('session store', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('evicts the least-recent inactive session without socket timing', async () => {
    const active = new Set(['active']);
    const store = makeStore({ isActive: (id: string) => active.has(id) });
    await store.ready;
    store.create('oldest', validState(), 10);
    store.create('active', validState(), 20);

    expect(store.makeCapacity()).toBe(true);
    expect(store.has('oldest')).toBe(false);
    expect(store.has('active')).toBe(true);
  });

  it('expires only inactive sessions using an explicit clock', async () => {
    const active = new Set(['connected']);
    const store = makeStore({ isActive: (id: string) => active.has(id) });
    await store.ready;
    store.create('stale', validState(), 10);
    store.create('connected', validState(), 10);

    expect(store.removeExpired(110)).toBe(true);
    expect(store.has('stale')).toBe(false);
    expect(store.has('connected')).toBe(true);
  });

  it('rejects stale revisions and increments accepted navigation', async () => {
    const store = makeStore();
    await store.ready;
    store.create('room', validState(), 10);

    expect(store.applyNavigation('room', { ...validState(1), baseRevision: 0 }, 20).accepted).toBe(false);
    const result = store.applyNavigation('room', { ...validState(2), baseRevision: 1 }, 30);
    expect(result.accepted).toBe(true);
    expect(store.get('room')).toMatchObject({ slideIndex: 2, revision: 2, updatedAt: 30 });
  });

  it('continues the persistence queue after a failed write', async () => {
    const persist = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValue(undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = makeStore({ persist });
    await store.ready;

    store.create('room', validState(), 10);
    await store.waitForPersistence();
    store.touch('room', 20);
    await store.waitForPersistence();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledOnce();
  });
});
