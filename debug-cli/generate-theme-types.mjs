#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { THEME_MANIFEST } from '../src/themeRegistry.js';

const quote = (value) => JSON.stringify(value);

export function renderThemeRegistryTypes(manifest = THEME_MANIFEST) {
  const entries = manifest.map((theme) => `  {
    readonly id: ${quote(theme.id)};
    readonly name: ${quote(theme.name)};
    readonly description: ${quote(theme.description)};
    readonly swatches: readonly [${theme.swatches.map(quote).join(', ')}];
    readonly fonts: ${quote(theme.fonts)};
  },`).join('\n');

  return `// Generated from themeRegistry.js by debug-cli/generate-theme-types.mjs. Do not edit.
export const THEME_MANIFEST: readonly [
${entries}
];

export type ThemeManifestEntry = (typeof THEME_MANIFEST)[number];
export type ThemeId = ThemeManifestEntry['id'];
export const THEME_IDS: readonly ThemeId[];
`;
}

if (process.argv[1]?.endsWith('generate-theme-types.mjs')) {
  await writeFile(new URL('../src/themeRegistry.d.ts', import.meta.url), renderThemeRegistryTypes());
}
