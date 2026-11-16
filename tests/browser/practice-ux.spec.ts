import { expect, test } from '@playwright/test';

test('practice reading size survives reloads and preserves slide control', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/notes?session=practice-text-size&slide=7&token=test-token');
  await expect(page.locator('.speaker-notes__status')).toHaveAttribute('aria-label', 'connected');
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  const content = page.locator('.talk-practice__content');
  const before = parseFloat(await content.evaluate((element) => getComputedStyle(element).fontSize));
  await page.getByRole('button', { name: 'Increase reading size' }).click();
  await page.getByRole('button', { name: 'Increase reading size' }).click();
  await expect(content).toHaveCSS('font-size', `${before + 4}px`);
  await page.reload();
  await expect(content).toHaveCSS('font-size', `${before + 4}px`);
  await expect(page.locator('[data-practice-cue="6"][data-active="true"]')).toHaveCount(1);
});
