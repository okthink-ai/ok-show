import { expect, test } from '@playwright/test';
import { THEME_IDS } from '../../src/themeRegistry.js';

test('users can select and persist all presentation themes', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/?session=theme-test&token=test-token');
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  await page.getByRole('button', { name: 'Palette' }).click();

  const tokenSignatures = new Set<string>();
  for (const theme of THEME_IDS) {
    await page.getByTestId(`theme-option-${theme}`).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return { background: style.getPropertyValue('--color-background').trim(), accent: style.getPropertyValue('--color-accent').trim(), bodyFont: style.getPropertyValue('--font-sans').trim(), displayFont: style.getPropertyValue('--font-ovo').trim() };
    });
    expect(tokens.background).not.toBe('');
    expect(tokens.accent).not.toBe('');
    expect(tokens.bodyFont).not.toBe('');
    expect(tokens.displayFont).not.toBe('');
    tokenSignatures.add(JSON.stringify(tokens));
  }
  expect(tokenSignatures.size).toBe(THEME_IDS.length);

  const finalTheme = THEME_IDS.at(-1) ?? 'forest';
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', finalTheme);
  const notesContext = await browser.newContext();
  const notes = await notesContext.newPage();
  await notes.goto('/notes?session=theme-test&token=test-token');
  await expect(notes.locator('html')).toHaveAttribute('data-theme', finalTheme);
  await notesContext.close();
  await context.close();
});

test('mobile users can open the theme picker', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/?session=mobile-theme-test&token=test-token');
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  await page.getByRole('button', { name: 'Palette' }).click();
  await expect(page.getByTestId('theme-option-paper')).toBeVisible();
  await page.getByTestId('theme-option-paper').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await context.close();
});

test('presenter previews fit their frames while its application shell stays dark', async ({ page }) => {
  // A synced tab adopts its session's theme on connect, so set the theme
  // through the session (the deck's palette), not through localStorage.
  await page.goto('/?session=notes-layout-test&token=test-token');
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  await page.getByRole('button', { name: 'Palette' }).click();
  await page.getByTestId('theme-option-paper').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await page.goto('/notes?session=notes-layout-test&token=test-token');
  await expect(page.locator('.speaker-notes__status')).toHaveAttribute('aria-label', 'connected');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');

  const previews = page.locator('.speaker-notes__preview-frame');
  await expect(previews.first()).toBeVisible();
  // Exercise width-limited and height-limited desktop layouts, including resize.
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1920, height: 1280 },
    { width: 1280, height: 850 },
    { width: 1920, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    for (let index = 0; index < await previews.count(); index += 1) {
      await expect.poll(() => previews.nth(index).evaluate((frame) => {
        const surface = frame.querySelector<HTMLElement>('.speaker-notes__preview-surface')!;
        const canvas = surface.querySelector<HTMLElement>('.speaker-notes__preview-canvas')!;
        const bounds = surface.getBoundingClientRect();
        const canvasBounds = canvas.getBoundingClientRect();
        const frameBounds = frame.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0
          && Math.abs(bounds.height - bounds.width * 9 / 16) < 1
          && Math.abs(bounds.width - canvasBounds.width) < 1
          && Math.abs(bounds.height - canvasBounds.height) < 1
          && bounds.left >= frameBounds.left - 1
          && bounds.right <= frameBounds.right + 1
          && bounds.top >= frameBounds.top - 1
          && bounds.bottom <= frameBounds.bottom + 1;
      }), { message: `Preview ${index + 1} must fit at 16:9 in ${viewport.width}x${viewport.height}` }).toBe(true);
    }
  }

  const colors = await page.locator('.speaker-notes').evaluate((element) => {
    const shell = getComputedStyle(element);
    const sample = document.createElement('div');
    sample.style.background = 'var(--color-background)';
    document.body.append(sample);
    const expected = getComputedStyle(sample).backgroundColor;
    sample.remove();
    return { actual: shell.backgroundColor, expected };
  });
  expect(colors.actual).toBe('rgb(11, 15, 20)');
  expect(colors.actual).not.toBe(colors.expected);
});
