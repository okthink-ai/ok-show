import { expect, test } from '@playwright/test';

test('captures through the translation service and shares captions with the presenter', async ({ page, context }) => {
  await page.goto('/?session=captions&translationCapture=fake&token=test-token');
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  await page.getByRole('button', { name: 'Live translation' }).click();
  const panel = page.getByRole('region', { name: 'Live translation' });
  await expect(panel.getByRole('button', { name: 'Start microphone' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Start microphone' }).click();
  await expect(panel.getByText('listening', { exact: true })).toBeVisible();
  await expect(page.locator('.live-caption-overlay:not(.live-caption-overlay--preview)')).toContainText('Deterministic translated caption');

  const presenter = await context.newPage();
  await presenter.goto('/notes?session=captions&token=test-token');
  const presenterPanel = presenter.getByRole('region', { name: 'Live translation' });
  await expect(presenterPanel.locator('.live-caption-overlay')).toContainText('Deterministic translated caption');

  await page.keyboard.press('f');
  await expect(page.locator('.slide-container:fullscreen .live-caption-overlay')).toBeVisible();
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.slide--portrait')).toBeVisible();
  await expect(page.locator('.live-caption-overlay:not(.live-caption-overlay--preview)')).toBeVisible();

  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(panel.getByText('idle', { exact: true })).toBeVisible();
  await expect(page.locator('.live-caption-overlay:not(.live-caption-overlay--preview)')).toBeVisible();
  await panel.getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('.live-caption-overlay:not(.live-caption-overlay--preview)')).toHaveCount(0);
});

test('reports microphone permission denial and allows another attempt', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: () => Promise.reject(new DOMException('Denied by test', 'NotAllowedError')),
    });
  });
  await page.goto('/?session=permission&token=test-token');
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  await page.getByRole('button', { name: 'Live translation' }).click();
  const panel = page.getByRole('region', { name: 'Live translation' });
  await expect(panel.getByRole('button', { name: 'Start microphone' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Start microphone' }).click();
  await expect(panel.getByRole('alert')).toContainText('Microphone permission was denied');
  await expect(panel.getByRole('button', { name: 'Start microphone' })).toBeEnabled();
});
