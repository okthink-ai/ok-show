import { defineConfig } from '@playwright/test';

const STATE = '/tmp/ok-show-playwright';
const ENGINE_PORT = Number(process.env.OK_SHOW_TEST_ENGINE_PORT || 5198);
const ENGINE_SYNC_PORT = Number(process.env.OK_SHOW_TEST_ENGINE_SYNC_PORT || 5201);
const CONSUMER_PORT = Number(process.env.OK_SHOW_TEST_CONSUMER_PORT || 5197);
const CONSUMER_SYNC_PORT = Number(process.env.OK_SHOW_TEST_CONSUMER_SYNC_PORT || 5202);

// Both servers start through the package CLI, the way a project runs it.
export default defineConfig({
  projects: [
    {
      name: 'engine',
      testDir: './tests/browser',
      use: {
        baseURL: `http://127.0.0.1:${ENGINE_PORT}`,
        permissions: ['microphone'],
        launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
      },
    },
    {
      name: 'consumer',
      testDir: './tests/package',
      testMatch: '*.spec.ts',
      use: {
        baseURL: `http://127.0.0.1:${CONSUMER_PORT}`,
        permissions: ['microphone'],
        launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
      },
    },
  ],
  webServer: [
    {
      command: `rm -f ${STATE}-state.json && OK_SHOW_TRANSLATION_TEST_MODE=true SYNC_CONTROL_TOKEN=test-token SYNC_PORT=${ENGINE_SYNC_PORT} SYNC_STATE_FILE=${STATE}-state.json node bin/ok-show.mjs dev --host 127.0.0.1 --port ${ENGINE_PORT}`,
      port: ENGINE_PORT,
      reuseExistingServer: false,
    },
    {
      command: `node tests/fixtures/consumer/setup.mjs && rm -f ${STATE}-consumer-state.json && OK_SHOW_TRANSLATION_TEST_MODE=true SYNC_CONTROL_TOKEN=test-token SYNC_PORT=${CONSUMER_SYNC_PORT} SYNC_STATE_FILE=${STATE}-consumer-state.json node bin/ok-show.mjs dev --root tests/fixtures/consumer --host 127.0.0.1 --port ${CONSUMER_PORT}`,
      port: CONSUMER_PORT,
      reuseExistingServer: false,
    },
  ],
});
