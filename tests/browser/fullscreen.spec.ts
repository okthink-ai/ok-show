import { expect, test } from '@playwright/test';

// Regression: fullscreen used to target `.slide--active`. Only one slide is
// mounted at a time and it is keyed by slide ID, so navigating unmounted the
// very element the browser had been given and fullscreen silently ended.
test('fullscreen survives navigating forward and back', async ({ page }) => {
  await page.goto('/?presentation=demo&slide=2&token=test-token');
  await expect(page.locator('.slide--active')).toBeVisible();

  // A click would advance the deck, so rely on the keypress for user activation.
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);

  const target = await page.evaluate(() => document.fullscreenElement?.className ?? '');
  expect(target).toContain('slide-container');

  await page.keyboard.press('ArrowRight');
  await expect.poll(() => new URL(page.url()).searchParams.get('slide')).toBe('3');
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);

  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => new URL(page.url()).searchParams.get('slide')).toBe('2');
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);

  // The element handed to the browser is still the one that is fullscreen.
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === document.querySelector('.slide-container')))
    .toBe(true);
});

// Regression: the windowed 80px buffer was also applied in fullscreen, so the
// slide was scaled down and the black fullscreen backdrop showed as a margin.
test('fullscreen scales the slide up to fill its space on the constraining axis', async ({ page }) => {
  await page.goto('/?presentation=demo&slide=2&token=test-token');
  await expect(page.locator('.slide--active')).toBeVisible();
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);

  const measure = () => page.evaluate(() => {
    const outer = document.querySelector('.slide-container')!.getBoundingClientRect();
    const inner = document.querySelector('.slide--active')!.getBoundingClientRect();
    return {
      // The smaller gap is the axis the scale was fitted to; the larger one is
      // the letterbox that keeping 16:9 on a differently shaped screen requires.
      fittedGap: Math.round(Math.min(outer.width - inner.width, outer.height - inner.height)),
      ratio: inner.width / inner.height,
    };
  });

  await expect.poll(async () => (await measure()).fittedGap).toBeLessThanOrEqual(1);
  const fit = await measure();

  // One axis is filled exactly; the other keeps 16:9 by letterboxing.
  expect(fit.ratio).toBeCloseTo(16 / 9, 1);

  // Leaving fullscreen puts the slide back inside the windowed chrome buffer.
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect.poll(async () => (await measure()).fittedGap).toBeGreaterThanOrEqual(79);
});
