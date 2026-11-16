import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { persistedField, registerPersistence, writeStorage } from './persistence';

interface State { count: number; other: number }

function setup() {
  const middleware = createListenerMiddleware();
  registerPersistence<State>(middleware, [
    persistedField<State, number>({ key: 'test-count', select: s => s.count, serialize: String }),
    persistedField<State, number>({ key: 'test-removable', select: s => s.other, serialize: v => (v === 0 ? null : String(v)) }),
  ]);
  return configureStore({
    reducer: (state: State = { count: 0, other: 0 }, action: { type: string; field?: keyof State; value?: number }) =>
      action.type === 'set' ? { ...state, [action.field as string]: action.value } : state,
    middleware: (getDefault) => getDefault().prepend(middleware.middleware),
  });
}

let data: Map<string, string>;
let writes: number;
beforeEach(() => {
  data = new Map();
  writes = 0;
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { writes += 1; data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  });
});

describe('persistence table', () => {
  it('writes only the field that changed', () => {
    const store = setup();
    store.dispatch({ type: 'set', field: 'count', value: 3 });
    expect(localStorage.getItem('test-count')).toBe('3');
    expect(localStorage.getItem('test-removable')).toBeNull();
  });

  it('removes the key when the serializer returns null', () => {
    const store = setup();
    store.dispatch({ type: 'set', field: 'other', value: 2 });
    expect(localStorage.getItem('test-removable')).toBe('2');
    store.dispatch({ type: 'set', field: 'other', value: 0 });
    expect(localStorage.getItem('test-removable')).toBeNull();
  });

  it('skips a write when the value is already stored', () => {
    data.set('k', 'v');
    writeStorage('k', 'v');
    expect(writes).toBe(0);
    writeStorage('k', 'w');
    expect(writes).toBe(1);
  });
});
