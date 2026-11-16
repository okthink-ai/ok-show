import { describe, expect, it } from 'vitest';
import { resolveAppSurface } from './appMode';

describe('application surface selection', () => {
  it('uses authoring tools and speaker notes only in development', () => {
    expect(resolveAppSurface('presentation', true)).toBe('authoring');
    expect(resolveAppSurface('notes', true)).toBe('notes');
  });

  it('uses the consumption shell and rejects speaker notes in production', () => {
    expect(resolveAppSurface('presentation', false)).toBe('presentation');
    expect(resolveAppSurface('notes', false)).toBe('not-found');
    expect(resolveAppSurface('export', false)).toBe('export');
  });
});
