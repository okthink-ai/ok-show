import type { ListenerMiddlewareInstance } from '@reduxjs/toolkit';

/**
 * One saved preference. `select` picks the persisted slice of state; the
 * listener runs only when that selection changes by reference. `serialize`
 * returns the string to store, or null to remove the key.
 */
export interface PersistedField<S, V> {
  key: string;
  select: (state: S) => V;
  serialize: (value: V) => string | null;
  /** Wait this long after the last change before writing. */
  debounceMs?: number;
}

/** Erases the value type so fields of different types fit in one table. */
export function persistedField<S, V>(field: PersistedField<S, V>): PersistedField<S, unknown> {
  return field as PersistedField<S, unknown>;
}

/**
 * Writes a string to storage, skipping the write when it is already stored.
 * The skip is what stops two tabs from echoing a value back and forth.
 */
export function writeStorage(key: string, value: string | null): void {
  try {
    if (localStorage.getItem(key) === value) return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage is optional or full */ }
}

/** Registers every field in the table on the middleware. */
export function registerPersistence<S>(
  middleware: ListenerMiddlewareInstance<unknown>,
  fields: ReadonlyArray<PersistedField<S, unknown>>,
): void {
  for (const field of fields) {
    middleware.startListening({
      predicate: (_action, current, previous) =>
        field.select(current as S) !== field.select(previous as S),
      effect: async (_action, api) => {
        if (field.debounceMs) {
          api.cancelActiveListeners();
          await api.delay(field.debounceMs);
        }
        writeStorage(field.key, field.serialize(field.select(api.getState() as S)));
      },
    });
  }
}
