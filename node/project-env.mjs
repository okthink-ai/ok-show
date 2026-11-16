import { loadEnv } from 'vite';

export const TRANSLATION_ENV_KEYS = Object.freeze([
  'ELEVENLABS_API_KEY',
  'OPENAI_API_KEY',
  'OK_SHOW_TRANSLATION_PROVIDER',
  'ELEVENLABS_ENTERPRISE_API_KEY',
  'ELEVENLABS_TRANSLATION_VOICE_ID',
]);

/** Load only server-side translation configuration from the resolved project. */
export function applyProjectTranslationEnv({ root, mode = 'development', env = process.env, loader = loadEnv }) {
  const loaded = loader(mode, root, '');
  for (const key of TRANSLATION_ENV_KEYS) {
    // Exported shell variables always win over project files.
    if (env[key] === undefined && loaded[key] !== undefined) env[key] = loaded[key];
  }
  return Object.fromEntries(TRANSLATION_ENV_KEYS.map((key) => [key, env[key] || '']));
}
