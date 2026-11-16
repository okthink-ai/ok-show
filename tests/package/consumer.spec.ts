import { expect, test } from '@playwright/test';
import fixtureNotes from '../fixtures/consumer/decks/launch/notes.mjs';

// Runs against `ok-show dev --root tests/fixtures/consumer`: a project
// that installs the engine as a package and keeps its decks, templates, and
// public files in non-default folders named by ok-show.config.ts.

test('the CLI serves the project decks with the project title', async ({ page }) => {
  await page.goto('/?token=test-token');
  await expect(page).toHaveTitle('Fixture Talks');
  await expect(page.locator('.slide--active')).toContainText('Built on the package');
  const snapshot = await page.evaluate(() => window.__OK_SHOW_DEBUG__!.getSnapshot());
  expect(snapshot).toMatchObject({ presentationId: 'launch', slideCount: 3 });
  await expect(page.locator('meta[name="fixture-head"]')).toHaveAttribute('content', 'from-config');
  await expect(page.locator('meta[name="description"]')).toHaveCount(1);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'Fixture description');
});

test('project styles override the engine design tokens', async ({ page }) => {
  await page.goto('/?presentation=launch&slide=2&token=test-token');
  await expect(page.locator('.slide--active .quote-slide')).toBeVisible();
  const label = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim());
  expect(label).toBe('rgb(228, 87, 46)');
  await expect(page.locator('.slide--active .slide-header__label').first()).toHaveCSS('color', 'rgb(228, 87, 46)');
  // 0.3em of the 28px footer size: the project rule beats SlideHeader.css.
  await expect(page.locator('.slide--active .slide-header__label').first()).toHaveCSS('letter-spacing', '8.4px');
});

test('a project template renders with its own stylesheet and public asset', async ({ page }) => {
  await page.goto('/?presentation=launch&slide=2&token=test-token');
  const quote = page.locator('.slide--active .quote-slide');
  await expect(quote).toContainText('Decks live in our repo now.');
  await expect(quote).toHaveCSS('display', 'flex');
  const logo = quote.locator('.quote-slide__logo');
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  // Engine public files the project does not override still load.
  expect((await page.request.get('/favicon.svg')).ok()).toBe(true);
  expect((await page.request.get('/fixture-logo.svg')).ok()).toBe(true);
});

test('the inspector names project and engine stylesheets as the project sees them', async ({ page }) => {
  await page.goto('/?presentation=launch&slide=2&token=test-token');
  await expect(page.locator('.slide--active .quote-slide')).toBeVisible();
  const info = async (selector: string) => page.evaluate(async (target) => {
    const { getElementInfo } = await import('/src/utils/elementInfo.ts');
    const element = document.querySelector(`.slide--active ${target}`)!;
    const { componentName, cssFile } = getElementInfo(element as HTMLElement);
    return { componentName, cssFile };
  }, selector);
  expect(await info('.quote-slide__quote')).toEqual({ componentName: 'QuoteSlide', cssFile: 'templates/QuoteSlide.css' });
  await page.evaluate(() => window.__OK_SHOW_DEBUG__!.goToSlide(3));
  await expect(page.locator('.slide--active .bullet-slide')).toBeVisible();
  expect(await info('.bullet-slide li')).toEqual({
    componentName: 'BulletSlide',
    cssFile: 'node_modules/ok-show/src/components/slides/BulletSlide.css',
  });
});

test('speaker notes come from the project deck through the presenter remote', async ({ browser }) => {
  const presentation = await browser.newPage();
  const presenter = await browser.newPage();
  const session = 'consumer-notes';
  await presentation.goto(`/?presentation=launch&slide=1&session=${session}&token=test-token`);
  await expect(presentation.locator('.footer__sync')).toHaveClass(/--connected/);
  await presenter.goto(`/notes?session=${session}&token=test-token`);
  const bullets = presenter.getByRole('article', { name: 'Speaker notes' }).locator('li');
  for (const [number, id] of [[1, 'launch-title'], [2, 'launch-quote'], [3, 'launch-plan']] as const) {
    await presentation.evaluate((n) => window.__OK_SHOW_DEBUG__!.goToSlide(n), number);
    await expect(bullets).toHaveText(fixtureNotes[id]);
  }
  await presentation.close();
  await presenter.close();
});

test('the public bundle never contains the private notes', async ({ page }) => {
  await page.goto('/?token=test-token');
  const scripts = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => /\.(m?[jt]sx?)(\?|$)/.test(name) || name.includes('/@id/')));
  for (const url of scripts) {
    const body = await (await page.request.get(url)).text();
    expect(body, url).not.toContain('FIXTURE-PRIVATE-NOTE');
  }
});

test('Practice reads the project manuscript and packets point at project files', async ({ page }) => {
  await page.goto('/?presentation=launch&slide=1&token=test-token');
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  await page.getByRole('navigation', { name: 'Developer tool sections' }).getByRole('button', { name: 'Practice', exact: true }).click();
  const reader = page.getByRole('region', { name: 'Talk practice' });
  await expect(reader).toContainText('Fixture manuscript opening line.');
  await expect(reader).not.toContainText('Hidden from the reader.');
  await reader.locator('[data-practice-cue="1"]').first().click();
  await expect.poll(() => new URL(page.url()).searchParams.get('slide')).toBe('2');
  await expect(page.locator('.slide--active')).toContainText('Decks live in our repo now.');

  await page.getByRole('button', { name: 'Annotate passage', exact: true }).click();
  await page.getByPlaceholder('Describe the change…').fill('Name the customer.');
  await page.getByPlaceholder('Describe the change…').press('Enter');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy annotations (1)', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Copy to clipboard' }).click();
  const packet = await page.evaluate(() => navigator.clipboard.readText());
  expect(packet).toContain('Name the customer.');
  expect(packet).toContain('decks/launch/manuscript.md');
  expect(packet).toContain('decks/launch');
  expect(packet).not.toContain('src/data/presentations');
});
