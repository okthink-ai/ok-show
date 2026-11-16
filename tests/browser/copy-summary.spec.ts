import { expect, test } from '@playwright/test';

const base = {
  presentationId: 'demo',
  slideTemplate: 'Slide',
  aspectRatio: '16:9',
  normalizedPosition: { x: 0.5, y: 0.5 },
  timestamp: 1,
};

const seeded = [
  { ...base, id: 'a1', slideId: 'demo-title', slideIndex: 0, slideTitle: 'Title', comment: 'Shorten the title.', type: 'text', text: 'ok-vibe-slides', source: 'canvas', surroundingContext: { before: '', after: '' }, intent: 'fix' },
  { ...base, id: 'a2', slideId: 'demo-toc', slideIndex: 1, slideTitle: 'Contents', comment: 'Rename this entry.', type: 'text', text: 'Overview', source: 'outline', surroundingContext: { before: '', after: '' } },
  { ...base, id: 'a3', slideId: 'demo-title', slideIndex: 0, slideTitle: 'Title', comment: 'Put title later.', type: 'slide-order', placement: 'after', anchorSlideId: 'demo-toc', anchorSlideTitle: 'Contents', anchorSlideIndex: 1 },
];

test('Copy All asks for confirmation, previews the packet, copies it, and closes on Escape', async ({ page }) => {
  await page.addInitScript(annotations => {
    if (!localStorage.getItem('ok-vibe-slides-annotations')) {
      localStorage.setItem('ok-vibe-slides-annotations', JSON.stringify({ version: 4, annotations }));
    }
  }, seeded);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?presentation=demo&slide=1&session=copy-card&token=test-token');
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  await page.getByRole('navigation', { name: 'Developer tool sections' }).getByRole('button', { name: 'Annotations', exact: true }).click();

  const copyAll = page.getByRole('button', { name: 'Copy All (3)', exact: true });
  await copyAll.click();
  const dialog = page.getByRole('dialog', { name: 'Copy review packet' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await expect(dialog.getByTestId('copy-summary-total')).toHaveText('3');
  await expect(dialog.locator('[data-kind="slide-text"]')).toContainText('1');
  await expect(dialog.locator('[data-kind="outline-text"]')).toContainText('1');
  await expect(dialog.locator('[data-kind="slide-order"]')).toContainText('1');

  // Nothing is copied until the dialog confirms.
  await page.evaluate(() => navigator.clipboard.writeText('untouched'));
  await dialog.getByRole('button', { name: 'Show preview' }).click();
  await expect(dialog.getByLabel('Packet preview')).toContainText('# Annotation review');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('untouched');

  await dialog.getByRole('button', { name: 'Copy to clipboard' }).click();
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible();
  const packet = await page.evaluate(() => navigator.clipboard.readText());
  expect(packet).toContain('# Annotation review');
  expect(packet).toContain('Shorten the title.');
  expect(packet).toContain('Rename this entry.');
  expect(packet).toContain('`deck:slide-order`');
  expect(await dialog.getByLabel('Packet preview').textContent()).toBe(packet);

  // Existing post-copy behavior is unchanged.
  await expect(dialog).toHaveCount(0, { timeout: 4000 });
  await expect(copyAll).toBeFocused();
  await expect(page.getByRole('button', { name: 'Clear copied (3)', exact: true })).toBeEnabled();
});

test('Escape closes the Copy All dialog without copying and keeps focus inside while open', async ({ page }) => {
  await page.addInitScript(annotations => {
    if (!localStorage.getItem('ok-vibe-slides-annotations')) {
      localStorage.setItem('ok-vibe-slides-annotations', JSON.stringify({ version: 4, annotations }));
    }
  }, seeded);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?presentation=demo&slide=1&session=copy-card-escape&token=test-token');
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  await page.getByRole('navigation', { name: 'Developer tool sections' }).getByRole('button', { name: 'Annotations', exact: true }).click();
  await page.evaluate(() => navigator.clipboard.writeText('untouched'));

  await page.getByRole('button', { name: 'Copy All (3)', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Copy review packet' });
  await expect(dialog).toBeVisible();
  for (let press = 0; press < 8; press += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('untouched');
  await expect(page.getByRole('button', { name: 'Clear copied (0)', exact: true })).toBeDisabled();
});
