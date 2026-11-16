import { expect, test } from '@playwright/test';

test('Practice in the main drawer navigates slides and preserves paused reading', async ({ page }) => {
  await page.goto('/?presentation=demo&slide=2&token=test-token');
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  const rail = page.getByRole('navigation', { name: 'Developer tool sections' });
  await rail.getByRole('button', { name: 'Practice', exact: true }).click();
  const reader = page.getByRole('region', { name: 'Talk practice' });
  await expect(reader).toBeVisible();
  await expect(reader.locator('[data-practice-cue="1"]').first()).toHaveAttribute('data-active', 'true');
  const follow = reader.getByRole('button', { name: 'Follow reading', exact: true });
  await follow.click();
  await reader.locator('[data-practice-cue="2"]').first().click();
  await expect.poll(() => new URL(page.url()).searchParams.get('slide')).toBe('3');
  await expect(page.locator('.slide--active')).toContainText('Key Capabilities');
  const viewport = reader.locator('.talk-practice__viewport');
  const position = await viewport.evaluate(el => el.scrollTop);
  await rail.getByRole('button', { name: 'Outline', exact: true }).click();
  await rail.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => viewport.evaluate(el => el.scrollTop)).toBeCloseTo(position, 0);
  const manuscript = reader.locator('.talk-practice__content');
  const size = await manuscript.evaluate(el => getComputedStyle(el).fontSize);
  await page.getByRole('button', { name: 'Increase practice text size' }).click();
  await expect.poll(() => manuscript.evaluate(el => getComputedStyle(el).fontSize)).not.toBe(size);
});

for (const surface of ['drawer', 'presenter'] as const) {
  test(`Practice uses the shared annotation popup and review list in ${surface}`, async ({ page }) => {
    await page.goto(surface === 'drawer'
      ? '/?presentation=demo&slide=2&token=test-token'
      : '/notes?session=shared-practice-annotations&slide=2&token=test-token');
    if (surface === 'drawer') {
      await page.getByRole('button', { name: 'Toggle developer tools' }).click();
      await page.getByRole('navigation', { name: 'Developer tool sections' }).getByRole('button', { name: 'Practice', exact: true }).click();
    } else {
      await page.getByRole('tab', { name: 'Practice', exact: true }).click();
    }
    await expect(page.getByRole('button', { name: 'Annotate slide', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Copy annotations (0)', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Annotate passage', exact: true }).click();
    await expect(page.locator('.comment-popup')).toHaveCount(1);
    await expect(page.locator('dialog.practice-annotations')).toHaveCount(0);
    await page.getByPlaceholder('Describe the change…').fill('Explain this with one concrete example.');
    await page.getByPlaceholder('Describe the change…').press('Enter');
    await expect(page.locator('.comment-popup')).toHaveCount(0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ok-show-annotations') ?? '[]'));
    expect(saved.annotations).toEqual(expect.arrayContaining([expect.objectContaining({
      source: 'practice', comment: 'Explain this with one concrete example.', practice: expect.objectContaining({ target: 'talk' }),
    })]));
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy annotations (1)', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Copy to clipboard' }).click();
    await expect(page.getByRole('status')).toHaveText('Copied');
    const practicePacket = await page.evaluate(() => navigator.clipboard.readText());
    expect(practicePacket).toContain('Explain this with one concrete example.');
    expect(practicePacket).toContain('src/data/presentations/demo/manuscript.md');
    if (surface === 'drawer') {
      await page.getByRole('navigation', { name: 'Developer tool sections' }).getByRole('button', { name: 'Annotations', exact: true }).click();
    } else {
      await page.getByRole('tab', { name: /^Annotations/ }).click();
    }
    const review = page.locator('.annotations-sidebar');
    await expect(review).toBeVisible();
    await expect(review.getByRole('button', { name: 'Clear copied (1)', exact: true })).toBeEnabled();
    await expect(review.locator('.annotations-sidebar__comment')).toHaveValue('Explain this with one concrete example.');
    await review.locator('.annotations-sidebar__comment').fill('Use a shorter example.');
    await review.locator('.annotations-sidebar__comment').press('Tab');
    await page.reload();
    await expect(page.locator('.annotations-sidebar__comment')).toHaveValue('Use a shorter example.');
    await expect(page.getByRole('button', { name: 'Clear copied (0)', exact: true })).toBeDisabled();
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy All (1)', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Copy to clipboard' }).click();
    const packet = await page.evaluate(() => navigator.clipboard.readText());
    expect(packet).toContain('Use a shorter example.');
    expect(packet).toContain('src/data/presentations/demo/manuscript.md');
    await expect(page.getByRole('button', { name: 'Clear copied (1)', exact: true })).toBeEnabled();
    if (surface === 'drawer') {
      await page.getByRole('navigation', { name: 'Developer tool sections' }).getByRole('button', { name: 'Practice', exact: true }).click();
    } else await page.getByRole('tab', { name: 'Practice', exact: true }).click();
    await page.getByRole('button', { name: 'Annotate passage', exact: true }).click();
    await page.getByPlaceholder('Describe the change…').fill('New feedback after copying.');
    await page.getByPlaceholder('Describe the change…').press('Enter');
    if (surface === 'drawer') {
      await page.getByRole('navigation', { name: 'Developer tool sections' }).getByRole('button', { name: 'Annotations', exact: true }).click();
    } else await page.getByRole('tab', { name: /^Annotations/ }).click();
    await page.reload();
    await expect(page.locator('.annotations-sidebar__card')).toHaveCount(2);
    await page.getByRole('button', { name: 'Clear copied (1)', exact: true }).click();
    await expect(page.locator('.annotations-sidebar__card')).toHaveCount(1);
    await expect(page.locator('.annotations-sidebar__comment')).toHaveValue('New feedback after copying.');
  });
}

for (const surface of ['drawer', 'presenter'] as const) {
  test(`Sentence shortcuts follow the reading line and annotate through the shared editor in ${surface}`, async ({ page }) => {
    await page.goto(surface === 'drawer' ? '/?presentation=demo&slide=1&token=test-token' : '/notes?session=sentence-shortcuts&slide=1&token=test-token');
    if (surface === 'drawer') {
      await page.getByRole('button', { name: 'Toggle developer tools' }).click();
      await page.getByRole('navigation', { name: 'Developer tool sections' }).getByRole('button', { name: 'Practice', exact: true }).click();
    } else await page.getByRole('tab', { name: 'Practice', exact: true }).click();
    const viewport = page.getByLabel('Talk manuscript', { exact: true });
    // Start at a known sentence on the focus line, just as manual scrolling would.
    await viewport.evaluate(el => {
      const p = Array.from(el.querySelectorAll('p')).find(p => p.textContent?.startsWith('Welcome, everyone.'))!;
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      const node = walker.nextNode()!;
      const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 1);
      const rect = range.getBoundingClientRect();
      el.scrollTop += rect.top + rect.height / 2 - el.getBoundingClientRect().top - el.clientHeight / 2;
    });
    await page.waitForTimeout(100);
    await viewport.focus();
    await viewport.press('j');
    const selected = () => page.evaluate(() => window.getSelection()?.toString());
    await expect.poll(selected).toBe('This is ok-show, a presentation engine where every slide is a React component.');
    await viewport.press('k');
    await expect.poll(selected).toBe('Welcome, everyone.');
    await viewport.press('Shift+J');
    await expect.poll(selected).toBe('Welcome, everyone. This is ok-show, a presentation engine where every slide is a React component.');
    await viewport.press('Shift+K');
    await expect.poll(selected).toBe('Welcome, everyone.');
    await viewport.press('Shift+J');
    await expect.poll(() => viewport.evaluate(el => {
      const rect = window.getSelection()!.getRangeAt(0).getClientRects()[0];
      const guide = el.getBoundingClientRect().top + el.clientHeight / 2;
      return Math.abs(rect.top + rect.height / 2 - guide);
    })).toBeLessThan(3);
    await viewport.press('x');
    await expect(page.locator('.comment-popup')).toHaveCount(1);
    await expect(page.locator('.comment-popup__selection')).toContainText('Welcome, everyone. This is ok-show, a presentation engine where every slide is a React component.');
    const input = page.getByPlaceholder('Describe the change…');
    await input.fill('j k x stay text here');
    await input.press('Enter');
    await expect(page.locator('.comment-popup')).toHaveCount(0);
    await expect(viewport).toBeFocused();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ok-show-annotations') ?? '{}').annotations);
    expect(saved).toEqual(expect.arrayContaining([expect.objectContaining({source: 'practice', text: 'Welcome, everyone. This is ok-show, a presentation engine where every slide is a React component.', comment: 'j k x stay text here'})]));
    await viewport.press('j');
    await expect.poll(selected).not.toContain('Welcome, everyone.');
    await viewport.press('Escape');
    await expect.poll(selected).toBe('');
    await viewport.press('x');
    await expect(page.locator('.comment-popup')).toHaveCount(1);
    await input.press('Escape');
    await expect(viewport).toBeFocused();
    // Extend backwards across a heading/paragraph boundary and keep both source lines.
    for (let i = 0; i < 8; i++) await viewport.press('Shift+K');
    await viewport.press('x');
    await input.fill('A selection across blocks');
    await input.press('Enter');
    const across = await page.evaluate(() => JSON.parse(localStorage.getItem('ok-show-annotations') ?? '{}').annotations.find((a: {comment: string}) => a.comment === 'A selection across blocks'));
    expect(across.practice.sourceEndLine).toBeGreaterThan(across.practice.sourceLine);
  });
}
