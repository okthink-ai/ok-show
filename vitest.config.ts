import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default defineConfig(async (env) => mergeConfig(
  await (typeof viteConfig === 'function' ? viteConfig(env) : viteConfig),
  {
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      exclude: ['tests/browser/**', 'tests/package/**/*.spec.ts', 'demo/**', 'node_modules/**', 'tests/fixtures/**/node_modules/**', '.tmp/**'],
    },
  },
));
