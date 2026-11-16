import { THEME_IDS } from '../src/themeRegistry.js';

export { THEME_IDS };

export function assertThemeId(theme) {
  if (!THEME_IDS.includes(theme)) {
    throw new Error(`Unknown theme: ${theme}`);
  }
  return theme;
}

export function themeUsage() {
  return `Usage: theme <${THEME_IDS.join('|')}>`;
}
