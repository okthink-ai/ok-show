import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test(`phone remote keeps previews, scrollable notes, and controls visible at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const presentation = await browser.newPage();
    const phone = await browser.newPage({ viewport, isMobile: true, hasTouch: true });
    const session = `phone-${viewport.width}`;
    try {
      await presentation.goto(`/?presentation=demo&slide=2&session=${session}&token=test-token`);
      await expect(presentation.locator('.footer__sync')).toHaveClass(/--connected/);
      await phone.goto(`/notes?session=${session}&token=test-token`);
      const current = phone.locator('.speaker-notes__current');
      const next = phone.locator('.speaker-notes__next');
      const notes = phone.getByRole('article', { name: 'Speaker notes' });
      await expect(current).toContainText('Agenda');
      await expect(notes).toContainText('Frame the demo around templates');
      await expect(next).toContainText('Key Capabilities');
      const slideCount = next.locator('.speaker-notes__slide-count');
      await expect(slideCount).toHaveText(/^2 out of \d+$/);
      await expect(phone.locator('.speaker-notes__preview-label, .speaker-notes__eyebrow')).toHaveCount(0);
      for (const region of [current, next, notes, phone.getByRole('navigation', { name: 'Slide navigation' })]) {
        const bounds = await region.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      }
      const layout = await phone.evaluate(() => {
        const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        const timer = rect('.speaker-notes__timer');
        const previous = rect('[aria-label="Previous slide"]');
        const next = rect('[aria-label="Next slide"]');
        const progress = document.querySelector<HTMLElement>('.speaker-notes__progress')!;
        const bar = progress.getBoundingClientRect();
        const footer = rect('.speaker-notes__footer-left');
        const currentPreview = rect('.speaker-notes__current .speaker-notes__preview-surface');
        const nextPreview = rect('.speaker-notes__next .speaker-notes__preview-surface');
        const count = rect('.speaker-notes__slide-count');
        return {
          progressFits: progress.scrollWidth <= progress.clientWidth,
          progressSpansRow: Math.abs(bar.width - footer.width) < 1,
          progressBelowControls: bar.top >= Math.max(timer.bottom, next.bottom),
          timerBesideButtons: timer.right <= previous.left && Math.abs(timer.y + timer.height / 2 - next.y - next.height / 2) < 1,
          generousTapTargets: previous.width >= 64 && next.width >= 96 && previous.height >= 64 && next.height >= 64,
          buttonsStayCompact: previous.width <= 64 && next.width <= 112,
          countAlignedWithCurrent: Math.abs(count.bottom - currentPreview.bottom) < 1 && Math.abs(count.right - nextPreview.right) < 1,
          nextIsLarger: next.width >= previous.width * 1.5,
          countBelowNext: count.top >= nextPreview.bottom && count.right <= nextPreview.right + 1,
          buttonsTogether: previous.right <= next.left && next.left - previous.right <= 8 && previous.y === next.y,
          currentLarger: currentPreview.width >= nextPreview.width * 1.9,
          previewsAreLandscape: Math.abs(currentPreview.height - currentPreview.width * 9 / 16) < 1
            && Math.abs(nextPreview.height - nextPreview.width * 9 / 16) < 1,
        };
      });
      expect(layout).toEqual({
        progressFits: true,
        progressSpansRow: true,
        progressBelowControls: true,
        timerBesideButtons: true,
        generousTapTargets: true,
        buttonsStayCompact: true,
        countAlignedWithCurrent: true,
        nextIsLarger: true,
        countBelowNext: true,
        buttonsTogether: true,
        currentLarger: true,
        previewsAreLandscape: true,
      });
      await notes.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      expect(await notes.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      const advance = phone.getByRole('button', { name: 'Next slide', exact: true });
      expect((await advance.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(advance).toHaveCSS('background-color', 'rgb(72, 144, 168)');
      await advance.click();
      await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('3');
      await expect(current).toContainText('Key Capabilities');
      await expect(slideCount).toHaveText(/^3 out of \d+$/);
      await expect(notes).toContainText('Call out dual aspect ratios');
      await expect.poll(() => notes.evaluate((element) => element.scrollTop)).toBe(0);
      await presentation.keyboard.press('ArrowLeft');
      await expect(current).toContainText('Agenda');
      await phone.reload();
      await expect(notes).toContainText('Frame the demo around templates');
      await phone.getByRole('button', { name: 'Previous slide', exact: true }).click();
      await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('1');
      await presentation.evaluate(() => window.__OK_VIBE_DEBUG__!.goToSlide(2));
      await expect(slideCount).toHaveText(/^2 out of \d+$/);
      await phone.getByRole('button', { name: 'Previous slide', exact: true }).click();
      await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('1');
      await expect(phone.getByRole('button', { name: 'Previous slide', exact: true })).toBeDisabled();
      const last = await presentation.evaluate(() => window.__OK_VIBE_DEBUG__!.getSnapshot().slideCount);
      await presentation.evaluate((index) => window.__OK_VIBE_DEBUG__!.goToSlide(index), last);
      await expect(next).toContainText('End of presentation');
      await expect(slideCount).toHaveText(`${last} out of ${last}`);
      await expect(advance).toBeDisabled();
    } finally {
      await phone.close();
      await presentation.close();
    }
  });
}

test('an unauthenticated remote cannot navigate a disconnected presentation', async ({ page }) => {
  await page.goto('/notes?session=phone-rejected&token=wrong-token');
  await expect(page.locator('.speaker-notes__status')).toHaveAttribute('aria-label', 'Invalid control token');
  await expect(page.getByRole('button', { name: 'Next slide', exact: true })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.speaker-notes__progress span').first()).toHaveAttribute('data-current', 'true');
  await expect(page.getByRole('alert')).toContainText('Invalid control token');
});
