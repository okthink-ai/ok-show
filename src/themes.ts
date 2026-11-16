export { THEME_IDS } from './themeRegistry.js';
import { THEME_IDS, THEME_MANIFEST } from './themeRegistry.js';
import type { ThemeId } from './themeRegistry.js';
export type { ThemeId } from './themeRegistry.js';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  description: string;
  swatches: [string, string, string];
  fonts: string;
}

export const themes: ThemeDefinition[] = THEME_MANIFEST.map((theme) => ({
  ...theme,
  swatches: [...theme.swatches],
}));

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_IDS.includes(value as ThemeId);
}
