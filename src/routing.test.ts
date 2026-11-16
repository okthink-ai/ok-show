import { describe, expect, it } from 'vitest';
import { resolveAppRoute } from './routing';

describe('resolveAppRoute', () => {
  it('keeps the presentation on existing paths', () => expect(resolveAppRoute('/')).toBe('presentation'));
  it('routes the dedicated notes path', () => expect(resolveAppRoute('/notes')).toBe('notes'));
  it('preserves export routing', () => expect(resolveAppRoute('/export')).toBe('export'));
});
