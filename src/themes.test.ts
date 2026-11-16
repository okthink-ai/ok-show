import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isThemeId, themes, THEME_IDS } from './themes';

describe('themes', () => {
  it('defines six complete, uniquely named themes', () => {
    expect(themes).toHaveLength(6);
    expect(new Set(themes.map((theme) => theme.id)).size).toBe(6);
    expect(themes.map((theme) => theme.id)).toEqual(THEME_IDS);
    expect(themes.every((theme) => theme.swatches.length === 3 && theme.fonts.includes(' + '))).toBe(true);
  });

  it('validates persisted theme identifiers', () => {
    expect(isThemeId('paper')).toBe(true);
    expect(isThemeId('unknown')).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it('defines an explicit CSS token selector for every registered theme', () => {
    const css = readFileSync(resolve('src/styles/design-system.css'), 'utf8');

    for (const theme of THEME_IDS) {
      expect(css).toContain(`:root[data-theme='${theme}']`);
    }
  });
});
