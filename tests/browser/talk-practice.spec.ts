import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function scrollToCue(page: Page, number: number) {
  await page.locator(`[data-practice-cue="${number - 1}"]`).first().evaluate((cue) => {
    const viewport = cue.closest<HTMLElement>('.talk-practice__viewport')!;
    const rect = cue.getBoundingClientRect();
    viewport.scrollTop += rect.top + rect.height / 2 - viewport.getBoundingClientRect().top - viewport.clientHeight / 2 + 12;
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`practice follows reading in both directions and preserves position at ${viewport.width}px`, async ({ browser }) => {
    const presentation = await browser.newPage();
    const remote = await browser.newPage({ viewport });
    try {
      const session = `practice-${viewport.width}`;
      await presentation.goto(`/?session=${session}&slide=5&token=test-token`);
      await expect(presentation.locator('.footer__sync')).toHaveClass(/--connected/);
      await remote.goto(`/notes?session=${session}&token=test-token`);
      await expect(remote.locator('.speaker-notes__status')).toHaveAttribute('aria-label', 'connected');
      await remote.getByRole('tab', { name: 'Practice', exact: true }).click();
      const manuscript = remote.locator('.talk-practice__viewport');
      await expect(manuscript.getByRole('heading', { name: 'ok-vibe-slides Demo', exact: true })).toBeAttached();
      await expect(manuscript.getByRole('heading', { name: 'Closing', exact: true })).toBeAttached();
      expect(new URL(presentation.url()).searchParams.get('slide')).toBe('5');
      await expect(remote.locator('[data-practice-cue="4"]').first()).toHaveAttribute('data-active', 'true');
      await presentation.keyboard.press('ArrowRight');
      await expect(remote.locator('[data-practice-cue="5"]').first()).toHaveAttribute('data-active', 'true');
      await remote.getByRole('button', { name: 'Previous slide', exact: true }).click();
      await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('5');
      await expect(remote.locator('[data-practice-cue="4"]').first()).toHaveAttribute('data-active', 'true');
      await scrollToCue(remote, 2);
      await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('2');
      await scrollToCue(remote, 3);
      await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('3');
      await scrollToCue(remote, 2);
      await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('2');
      const guide = await remote.locator('.talk-practice__guide').boundingBox();
      const reader = await manuscript.boundingBox();
      expect(guide).not.toBeNull();
      expect(reader).not.toBeNull();
      expect(Math.abs(guide!.y - reader!.y - reader!.height / 2)).toBeLessThan(2);
      await expect(remote.getByTestId('practice-reading-highlight')).toBeVisible();
      const follow = remote.getByRole('button', { name: 'Follow reading', exact: true });
      await follow.click();
      await expect(follow).toHaveAttribute('aria-pressed', 'false');
      await scrollToCue(remote, 4);
      await expect(remote.locator('[data-practice-cue="3"]').first()).toHaveAttribute('data-active', 'true');
      expect(new URL(presentation.url()).searchParams.get('slide')).toBe('2');
      const position = await manuscript.evaluate((element) => element.scrollTop);
      await remote.getByRole('tab', { name: 'Notes', exact: true }).click();
      await remote.getByRole('tab', { name: 'Practice', exact: true }).click();
      await expect.poll(() => manuscript.evaluate((element) => element.scrollTop)).toBeCloseTo(position, 0);
      await expect(follow).toHaveAttribute('aria-pressed', 'false');
      await follow.click();
      await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('4');
      await follow.click();
      // Explicit cue selection still works with automatic following paused.
      await remote.locator('[data-practice-cue="1"]').first().click();
      await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('2');
      expect(new URL(remote.url()).pathname).toBe('/notes');
      expect(await remote.context().pages()).toHaveLength(1);
      await follow.click();
      await remote.setViewportSize({ width: 1280, height: 850 });
      await scrollToCue(remote, 3);
      await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('3');
    } finally {
      await presentation.close();
      await remote.close();
    }
  });
}

test('the in-app sidebar offers practice and returns to working per-slide notes', async ({ page }) => {
  await page.goto('/?slide=5&token=test-token');
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  const sidebar = page.getByRole('region', { name: 'Speaker notes review' });
  await sidebar.getByRole('tab', { name: 'Practice', exact: true }).click();
  await expect(page.locator('[data-practice-cue="4"]').first()).toHaveAttribute('data-active', 'true');
  await scrollToCue(page, 2);
  await expect.poll(() => new URL(page.url()).searchParams.get('slide')).toBe('2');
  await sidebar.getByRole('tab', { name: 'Notes', exact: true }).click();
  await expect(sidebar.locator('.speaker-notes-sidebar__list')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => new URL(page.url()).searchParams.get('slide')).toBe('3');
  await sidebar.getByRole('tab', { name: 'Practice', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('slide')).toBe('3');
  await expect(page.locator('[data-practice-cue="2"]').first()).toHaveAttribute('data-active', 'true');
  await scrollToCue(page, 4);
  await expect.poll(() => new URL(page.url()).searchParams.get('slide')).toBe('4');
});

test('practice keeps reading available while disconnected without changing slides', async ({ page }) => {
  await page.goto('/notes?session=practice-rejected&token=wrong-token');
  await expect(page.locator('.speaker-notes__status')).toHaveAttribute('aria-label', 'Invalid control token');
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  await scrollToCue(page, 2);
  await expect(page.locator('[data-practice-cue="1"]').first()).toHaveAttribute('data-active', 'true');
  await expect(page.locator('[data-practice-cue="1"]').first()).toHaveAttribute('aria-disabled', 'true');
  await page.locator('[data-practice-cue="1"]').first().evaluate((button: HTMLButtonElement) => button.click());
  expect(await page.evaluate(() => window.__OK_VIBE_DEBUG__!.getSnapshot().currentSlide)).toBe(1);
  await expect(page.getByText('Slide control is disconnected')).toBeVisible();
});


test('returning to Practice aligns to a changed slide and Top respects paused following', async ({ browser }) => {
  const presentation = await browser.newPage();
  const remote = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await presentation.goto('/?session=practice-entry-top&slide=7&token=test-token');
    await expect(presentation.locator('.footer__sync')).toHaveClass(/--connected/);
    await remote.goto('/notes?session=practice-entry-top&token=test-token');
    await expect(remote.locator('.speaker-notes__status')).toHaveAttribute('aria-label', 'connected');
    const reader = remote.locator('.talk-practice__viewport');
    await remote.getByRole('tab', { name: 'Practice', exact: true }).click();
    await expect(remote.locator('[data-practice-cue="6"]').first()).toHaveAttribute('data-active', 'true');
    await remote.getByRole('tab', { name: 'Notes', exact: true }).click();
    await remote.getByRole('button', { name: 'Next slide', exact: true }).click();
    await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('8');
    await remote.getByRole('tab', { name: 'Practice', exact: true }).click();
    await expect(remote.locator('[data-practice-cue="7"]').first()).toHaveAttribute('data-active', 'true');
    const cue = await remote.locator('[data-practice-cue="7"]').first().boundingBox();
    const bounds = await reader.boundingBox();
    expect(Math.abs(cue!.y + cue!.height / 2 - bounds!.y - bounds!.height / 2)).toBeLessThan(16);
    await remote.getByRole('button', { name: 'Scroll to top', exact: true }).click();
    await expect.poll(() => reader.evaluate((element) => element.scrollTop)).toBe(0);
    await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('1');
    await expect(reader).toHaveAttribute('data-reading-text', 'ok-vibe-slides Demo');
    // The navigation echo must not scroll from the document top to the slide-1 cue.
    await remote.getByRole('tab', { name: 'Notes', exact: true }).click();
    await remote.getByRole('tab', { name: 'Practice', exact: true }).click();
    await expect.poll(() => reader.evaluate((element) => element.scrollTop)).toBe(0);
    await remote.getByRole('button', { name: 'Next slide', exact: true }).click();
    await expect(remote.locator('[data-practice-cue="1"]').first()).toHaveAttribute('data-active', 'true');
    await remote.getByRole('button', { name: 'Follow reading', exact: true }).click();
    await remote.getByRole('button', { name: 'Scroll to top', exact: true }).click();
    await expect.poll(() => reader.evaluate((element) => element.scrollTop)).toBe(0);
    expect(new URL(presentation.url()).searchParams.get('slide')).toBe('2');
    await remote.getByRole('button', { name: 'Follow reading', exact: true }).click();
    await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('1');
    expect(await reader.evaluate((element) => element.scrollTop)).toBe(0);
    expect(await remote.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await presentation.close();
    await remote.close();
  }
});

test('presenter remembers Practice and Notes across reloads and omits agent context', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/notes?session=remember-reading-mode&token=test-token');
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  await expect(page.locator('.talk-practice__content')).not.toContainText('Context for agents');
  await expect(page.locator('.talk-practice__content')).not.toContainText('This is the demo deck\'s practice manuscript');
  await expect(page.locator('.talk-practice__cue').first()).toBeAttached();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Practice', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.talk-practice')).toBeVisible();
  await page.getByRole('tab', { name: 'Notes', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Notes', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.talk-practice')).toHaveCount(0);
});
