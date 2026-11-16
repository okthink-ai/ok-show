import { defineConfig } from '@playwright/test';

const STATE = '/tmp/ok-show-demo-state.json';

// Records the feature tour in demo/ to docs/assets/ok-show-demo.mp4.
// The servers start through the package CLI, like playwright.config.ts.
export default defineConfig({
  testDir: './demo',
  outputDir: './test-results/demo-run',
  timeout: 90_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5198' },
  webServer: {
    command: `rm -f ${STATE} && SYNC_CONTROL_TOKEN=test-token SYNC_PORT=5201 SYNC_STATE_FILE=${STATE} node bin/ok-show.mjs dev --host 127.0.0.1 --port 5198`,
    port: 5198,
    reuseExistingServer: false,
  },
});
