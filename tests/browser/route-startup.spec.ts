import { expect, test } from '@playwright/test';

for (const { route, module, selector } of [
  { route: '/notes?session=startup-check&slide=7&token=test-token', module: '**/src/components/SpeakerNotesView.tsx', selector: '.speaker-notes' },
  { route: '/?session=startup-check&slide=7&token=test-token', module: '**/src/App.tsx', selector: '.slide--active' },
]) {
  test(`opens ${route} directly without intermediate content`, async ({ page }) => {
    let releaseEntry!: () => void;
    let releaseSurface!: () => void;
    let surfaceRequested!: () => void;
    const entryGate = new Promise<void>((resolve) => { releaseEntry = resolve; });
    const surfaceGate = new Promise<void>((resolve) => { releaseSurface = resolve; });
    const requested = new Promise<void>((resolve) => { surfaceRequested = resolve; });
    await page.route('**/src/main.tsx', async (request) => { await entryGate; await request.continue(); });
    await page.route(module, async (request) => { surfaceRequested(); await surfaceGate; await request.continue(); });
    try {
      await page.goto(route, { waitUntil: 'commit' });
      await expect(page.locator('#root')).toBeEmpty();
      releaseEntry();
      await requested;
      await expect(page.locator('#root')).toBeEmpty();
      await expect(page.getByText(/Loading speaker notes|Loading presentation tools|What the presentation covers/)).toHaveCount(0);
      releaseSurface();
      await expect(page.locator(selector).first()).toBeVisible();
    } finally {
      releaseEntry();
      releaseSurface();
    }
  });
}
