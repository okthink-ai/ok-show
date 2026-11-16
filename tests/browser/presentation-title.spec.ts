import { expect, test } from '@playwright/test';

for (const route of ['/', '/export', '/notes']) {
  test(`uses the requested presentation title on ${route}`, async ({ page }) => {
    await page.goto(`${route}?presentation=demo`);
    await expect(page).toHaveTitle('ok-vibe-slides Demo');
  });
}

test('uses the default presentation title for an unknown presentation', async ({ page }) => {
  await page.goto('/?presentation=unknown-deck&token=test-token');
  await expect(page).toHaveTitle('ok-vibe-slides Demo');
});
