import { expect, test } from '@playwright/test';
import demoNotes from '../../src/data/presentations/demo/notes.mjs';

test('every slide delivers its current speaker notes to the remote presenter', async ({ browser }) => {
  const presentation = await browser.newPage();
  const presenter = await browser.newPage();
  const session = 'demo-notes-coverage';
  await presentation.goto(`/?presentation=demo&slide=1&session=${session}&token=test-token`);
  await expect(presentation.locator('.footer__sync')).toHaveClass(/--connected/);
  await presenter.goto(`/notes?session=${session}&token=test-token`);
  const bullets = presenter.getByRole('article', { name: 'Speaker notes' }).locator('li');
  const slideCount = await presentation.evaluate(() => window.__OK_SHOW_DEBUG__!.getSnapshot().slideCount);
  const seen = [];
  for (let number = 1; number <= slideCount; number++) {
    const id = await presentation.evaluate((n) => window.__OK_SHOW_DEBUG__!.goToSlide(n).slideId!, number);
    seen.push(id);
    const expected = demoNotes[id as keyof typeof demoNotes];
    expect(expected?.length, `${id} must have speaker notes`).toBeGreaterThan(0);
    await expect(bullets, `${id} must receive the current bullets`).toHaveText(expected);
  }
  expect(seen.sort()).toEqual(Object.keys(demoNotes).sort());
  await presenter.reload();
  await expect(bullets).toHaveText(demoNotes['demo-video']);
  await presentation.close();
  await presenter.close();
});
