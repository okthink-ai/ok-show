import { expect, test } from '@playwright/test';

// Shared annotation coverage lives in practice-drawer.spec.ts.
for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
  test(`presenter can hide the next preview and remember it at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`/notes?session=settings-${viewport.width}&token=test-token`);
    const surface = page.locator('.speaker-notes__current .speaker-notes__preview-surface');
    const before = await surface.boundingBox();
    await page.getByRole('button', { name: 'Presenter settings' }).click();
    await page.getByLabel('Show next slide').uncheck();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.locator('.speaker-notes__preview-frame')).toHaveCount(1);
    const after = await surface.boundingBox();
    if (viewport.height > 500) expect(after!.width).toBeGreaterThanOrEqual(before!.width);
    const controls = await page.locator('.speaker-notes__toolbar').boundingBox();
    expect(after!.y + after!.height).toBeLessThanOrEqual(controls!.y + 1);
    expect(after!.width / after!.height).toBeCloseTo(16 / 9, 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await expect(page.locator('.speaker-notes__preview-frame')).toHaveCount(1);
    await page.getByRole('button', { name: 'Presenter settings' }).click();
    await expect(page.getByLabel('Show next slide')).not.toBeChecked();
    await page.getByLabel('Show next slide').check();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.locator('.speaker-notes__preview-frame')).toHaveCount(2);
  });
}
