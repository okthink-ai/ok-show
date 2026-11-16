import { expect, test } from '@playwright/test';

test('practice scrolling does not render React and the timer leaves the reader alone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/notes?session=performance-regression&slide=3&token=test-token');
  await expect(page.locator('.speaker-notes__status')).toHaveAttribute('aria-label', 'connected');
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Follow reading', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Follow reading', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__OK_SHOW_DEBUG__!.performance.start());
  await page.locator('.talk-practice__viewport').evaluate(async (element) => {
    for (let step = 0; step < 20; step++) {
      element.scrollTop += 20;
      await new Promise(requestAnimationFrame);
    }
  });
  const scrolling = await page.evaluate(() => window.__OK_SHOW_DEBUG__!.performance.stop());
  expect(scrolling.react.filter((entry) => ['PracticeReader', 'Manuscript', 'PracticeAnnotations'].includes(entry.id)).reduce((sum, entry) => sum + entry.renderedCommits, 0)).toBe(0);
  expect(scrolling.spans.find((entry) => entry.id === 'practice.measure')?.count).toBeGreaterThan(0);
  await expect(page.getByTestId('practice-reading-highlight')).toBeVisible();

  await page.getByRole('button', { name: 'Start timer', exact: true }).click();
  await page.evaluate(() => window.__OK_SHOW_DEBUG__!.performance.start());
  await expect(page.getByTestId('presentation-timer')).toHaveText('00:01');
  const timer = await page.evaluate(() => window.__OK_SHOW_DEBUG__!.performance.stop());
  expect(timer.react.some((entry) => entry.id === 'PresenterTimer' && entry.renderedCommits > 0)).toBe(true);
  expect(timer.react.some((entry) => ['PracticeReader', 'CurrentSlidePreview', 'NextSlidePreview'].includes(entry.id) && entry.renderedCommits > 0)).toBe(false);
});
