import { expect, test } from '@playwright/test';

test('captures through the translation service and shares captions with the presenter', async ({ page, context }) => {
  await page.goto('/?session=captions&translationCapture=fake&token=test-token');
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  await page.getByRole('button', { name: 'Live translation' }).click();
  const panel = page.getByRole('region', { name: 'Live translation' });
  await expect(panel.getByRole('button', { name: 'Start microphone' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Start microphone' }).click();
  await expect(panel.getByText('Live', { exact: true })).toBeVisible();
  await expect(panel.getByText(/This deck owns the microphone/)).toBeVisible();
  const audienceCaption = page.locator('.live-caption-overlay:not(.live-caption-overlay--preview)');
  await expect(audienceCaption).toContainText('Deterministic translated caption');
  await expect(audienceCaption.locator('br')).toHaveCount(1);
  const captionBox = await audienceCaption.locator('p').evaluate((element) => {
    const text = element.querySelector('.live-caption-overlay__text');
    if (!(text instanceof HTMLElement)) throw new Error('Caption text element is missing.');
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const lineHeight = Number.parseFloat(style.lineHeight);
    const chrome = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
      + Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
    const animatedWord = element.querySelector('.live-caption-overlay__word--new');
    return {
      height: box.height,
      twoLineHeight: lineHeight * 2 + chrome,
      fullyRendered: element.scrollHeight === element.clientHeight,
      overflow: style.overflow,
      fontSize: Number.parseFloat(style.fontSize),
      animationName: animatedWord ? getComputedStyle(animatedWord).animationName : '',
    };
  });
  expect(captionBox.height).toBeLessThanOrEqual(captionBox.twoLineHeight + 1);
  expect(captionBox.fullyRendered).toBe(true);
  expect(captionBox.overflow).toBe('visible');
  expect(captionBox.fontSize).toBeLessThan(48);
  expect(captionBox.animationName).toBe('live-caption-word-in');

  const presenter = await context.newPage();
  await presenter.goto('/notes?session=captions&token=test-token');
  const presenterDisclosure = presenter.locator('.live-translation-disclosure');
  await expect(presenterDisclosure).not.toHaveAttribute('open', '');
  await expect(presenterDisclosure.locator('summary')).toContainText('Live from Deck');
  await presenterDisclosure.locator('summary').click();
  const presenterPanel = presenter.getByRole('region', { name: 'Live translation' });
  await expect(presenterPanel.getByText('Live from Deck')).toBeVisible();
  await expect(presenterPanel.getByRole('button', { name: 'Running remotely' })).toBeDisabled();
  await expect(presenterPanel.locator('.live-caption-overlay')).toContainText('Deterministic translated caption');
  await presenterDisclosure.locator('summary').click();
  await expect(presenterDisclosure).not.toHaveAttribute('open', '');

  await page.keyboard.press('f');
  await expect(page.locator('.slide-container:fullscreen .live-caption-overlay')).toBeVisible();
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.slide--portrait')).toBeVisible();
  await expect(page.locator('.live-caption-overlay:not(.live-caption-overlay--preview)')).toBeVisible();

  await panel.getByRole('button', { name: 'Stop' }).click();
  await expect(panel.getByText('Off', { exact: true })).toBeVisible();
  await expect(presenterDisclosure.locator('summary')).toContainText('Not recording');
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
