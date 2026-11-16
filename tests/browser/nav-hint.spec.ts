import { expect, test } from '@playwright/test';

const KEY = 'ok-vibe-slides-nav-hint-seen';
const MOBILE = { width: 390, height: 844 };

test('phone visitors see the tap-zone hint once, and it never blocks navigation', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/?presentation=demo&slide=1&session=nav-hint&token=test-token');
  const hint = page.getByTestId('nav-hint');
  await expect(hint).toBeVisible();
  await expect(hint.getByText('Tap to go back')).toBeVisible();
  await expect(hint.getByText('Tap to advance')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe('true');

  // A tap dismisses the hint without also turning the page.
  await hint.click({ position: { x: 300, y: 400 } });
  await expect(hint).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('slide')).toBe('1');

  // After dismissal the same tap navigates normally.
  await page.locator('.slide-container').click({ position: { x: 300, y: 400 } });
  await expect.poll(() => new URL(page.url()).searchParams.get('slide')).toBe('2');

  await page.goto('/?presentation=demo&slide=1&session=nav-hint&token=test-token');
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('nav-hint')).toHaveCount(0);
});

test('the hint leaves by itself after a few seconds', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/?presentation=demo&slide=1&session=nav-hint-auto&token=test-token');
  await expect(page.getByTestId('nav-hint')).toBeVisible();
  await expect(page.getByTestId('nav-hint')).toHaveCount(0, { timeout: 6000 });
});

test('the hint does not appear on desktop, off the first slide, or on the presenter route', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?presentation=demo&slide=1&session=nav-hint-desktop&token=test-token');
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('nav-hint')).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull();

  await page.setViewportSize(MOBILE);
  await page.goto('/?presentation=demo&slide=3&session=nav-hint-later&token=test-token');
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('nav-hint')).toHaveCount(0);

  await page.goto('/notes?session=nav-hint-notes&token=test-token');
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('nav-hint')).toHaveCount(0);

  await page.goto('/export?presentation=demo');
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('nav-hint')).toHaveCount(0);
});
