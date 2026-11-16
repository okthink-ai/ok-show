export const TRANSLATION_ENV_KEYS: readonly string[];

export function applyProjectTranslationEnv(options: {
  root: string;
  mode?: string;
  env?: Record<string, string | undefined>;
  loader?: (mode: string, root: string, prefix: string) => Record<string, string>;
}): Record<string, string>;
