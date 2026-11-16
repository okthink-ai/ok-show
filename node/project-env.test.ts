// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyProjectTranslationEnv } from './project-env.mjs';

describe('project translation env', () => {
  it('loads only allowlisted values from the consumer root and keeps shell overrides', () => {
    const env: Record<string, string | undefined> = {
      OPENAI_API_KEY: 'shell-key',
      TRANSLATION_PROVIDER: 'openai',
    };
    let request: unknown[] = [];
    const result = applyProjectTranslationEnv({
      root: '/consumer', mode: 'staging', env,
      loader: (...args: unknown[]) => {
        request = args;
        return {
          OPENAI_API_KEY: 'file-key',
          ELEVENLABS_API_KEY: 'eleven-file',
          TRANSLATION_PROVIDER: 'elevenlabs',
          UNRELATED_SECRET: 'never',
        };
      },
    });
    expect(request).toEqual(['staging', '/consumer', '']);
    expect(result.OPENAI_API_KEY).toBe('shell-key');
    expect(result.ELEVENLABS_API_KEY).toBe('eleven-file');
    expect(result.TRANSLATION_PROVIDER).toBe('openai');
    expect(env.UNRELATED_SECRET).toBeUndefined();
  });
});
