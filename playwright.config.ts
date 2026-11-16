import { defineConfig } from '@playwright/test';

const STATE = '/tmp/ok-show-playwright';

// Both servers start through the package CLI, the way a project runs it.
export default defineConfig({
  projects: [
    {
      name: 'engine',
      testDir: './tests/browser',
      use: { baseURL: 'http://127.0.0.1:5198' },
    },
    {
      name: 'consumer',
      testDir: './tests/package',
      testMatch: '*.spec.ts',
      use: { baseURL: 'http://127.0.0.1:5197' },
    },
  ],
  webServer: [
    {
      command: `rm -f ${STATE}-state.json && SYNC_CONTROL_TOKEN=test-token SYNC_PORT=5201 SYNC_STATE_FILE=${STATE}-state.json node bin/ok-show.mjs dev --host 127.0.0.1 --port 5198`,
      port: 5198,
      reuseExistingServer: false,
    },
    {
      command: `node tests/fixtures/consumer/setup.mjs && rm -f ${STATE}-consumer-state.json && SYNC_CONTROL_TOKEN=test-token SYNC_PORT=5202 SYNC_STATE_FILE=${STATE}-consumer-state.json node bin/ok-show.mjs dev --root tests/fixtures/consumer --host 127.0.0.1 --port 5197`,
      port: 5197,
      reuseExistingServer: false,
    },
  ],
});
