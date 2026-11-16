import { expect, test } from '@playwright/test';

test('either screen drives the session and the presenter view recovers after refresh', async ({ browser }) => {
  const presentation = await browser.newPage();
  const notes = await browser.newPage();
  await presentation.goto('/?presentation=demo&slide=1&session=browser-test&token=test-token');
  await notes.goto('/notes?session=browser-test&token=test-token');
  await expect.poll(() => presentation.evaluate(() => Boolean(window.__OK_VIBE_DEBUG__))).toBe(true);
  await expect(notes.getByTestId('speaker-notes-view')).toBeVisible();
  const currentProgress = notes.locator('.speaker-notes__progress span[data-current="true"]');
  const visitedProgress = notes.locator('.speaker-notes__progress span[data-visited="true"]');
  await expect(currentProgress).toHaveCount(1);
  await expect(visitedProgress).toHaveCount(1);

  // The presenter holds the control token, so advancing from the notes view has
  // to move the presentation screen too.
  await notes.getByRole('button', { name: 'Next slide' }).click();
  await expect(currentProgress).toHaveCount(1);
  await expect(visitedProgress).toHaveCount(2);
  await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('2');

  await presentation.keyboard.press('ArrowRight');
  await expect(visitedProgress).toHaveCount(3);

  await notes.reload();
  await expect(visitedProgress).toHaveCount(3);
  await presentation.keyboard.press('ArrowRight');
  await expect(visitedProgress).toHaveCount(4);
  const newlyOpenedNotes = await browser.newPage();
  await newlyOpenedNotes.goto('/notes?session=browser-test&token=test-token');
  await expect(newlyOpenedNotes.locator('.speaker-notes__progress span[data-visited="true"]')).toHaveCount(4);
});

test('the presentation footer reports whether a live session is running', async ({ page }) => {
  await page.goto('/?presentation=demo&slide=1&token=test-token');
  const indicator = page.locator('.footer__sync');
  await expect(indicator).toHaveClass(/footer__sync--off/);
  await expect(indicator).toContainText('Sync off');

  await page.goto('/?presentation=demo&slide=1&session=footer-indicator&token=test-token');
  await expect(indicator).toHaveClass(/footer__sync--connected/);
  await expect(indicator).toContainText('footer-indicator');
});

test('policy rejection is shown once instead of reconnecting forever', async ({ page }) => {
  await page.goto('/notes?session=rejected&token=wrong-token');
  const banner = page.getByRole('alert');
  await expect(banner).toContainText('Invalid control token');
  await expect(page.locator('.speaker-notes__status')).toHaveAttribute('aria-label', 'Invalid control token');
  await page.waitForTimeout(750);
  await expect(banner).toContainText('Invalid control token');
});

test('desktop presenter view keeps tall notes left and puts the next preview beside the current slide', async ({ browser }) => {
  const presentation = await browser.newPage({ viewport: { width: 1920, height: 878 } });
  const notes = await browser.newPage({ viewport: { width: 1920, height: 878 } });
  await presentation.goto('/?presentation=demo&slide=3&session=presenter-layout&token=test-token');
  await expect(presentation.locator('.footer__sync')).toHaveClass(/--connected/);
  await notes.goto('/notes?session=presenter-layout&token=test-token');
  await expect(notes.locator('.speaker-notes__progress span[data-current="true"]')).toHaveCount(1);

  const layout = await notes.evaluate(() => {
    const pane = document.querySelector<HTMLElement>('.speaker-notes__notes');
    const current = document.querySelector<HTMLElement>('.speaker-notes__current');
    const currentFrame = document.querySelector<HTMLElement>('.speaker-notes__preview-frame--current');
    const next = document.querySelector<HTMLElement>('.speaker-notes__next');
    const footer = document.querySelector<HTMLElement>('.speaker-notes__footer');
    const controls = document.querySelector<HTMLElement>('.speaker-notes__controls');
    const progress = document.querySelector<HTMLElement>('.speaker-notes__progress');
    const bar = document.querySelector<HTMLElement>('.speaker-notes__bar');
    const grid = document.querySelector<HTMLElement>('.speaker-notes__grid');
    if (!pane || !current || !currentFrame || !next || !footer || !controls || !progress || !bar || !grid) throw new Error('Expected presenter layout');
    const paneBounds = pane.getBoundingClientRect();
    const currentBounds = current.getBoundingClientRect();
    const currentFrameBounds = currentFrame.getBoundingClientRect();
    const nextBounds = next.getBoundingClientRect();
    const footerBounds = footer.getBoundingClientRect();
    const controlsBounds = controls.getBoundingClientRect();
    const progressBounds = progress.getBoundingClientRect();
    const barBounds = bar.getBoundingClientRect();
    const leftBounds = pane.parentElement?.getBoundingClientRect();
    const gridBounds = grid.getBoundingClientRect();
    return {
      documentFitsViewport: document.documentElement.scrollHeight <= window.innerHeight,
      controlsVisible: controlsBounds.bottom <= window.innerHeight,
      notesAllowScrolling: getComputedStyle(pane).overflowY === 'auto',
      notesLeftOfCurrent: paneBounds.right < currentBounds.left,
      notesFillLeftColumn: (pane.parentElement?.getBoundingClientRect().height ?? 0) / gridBounds.height > 0.95,
      footerBelowCurrent: footerBounds.top >= currentBounds.bottom,
      currentFrameFitsAboveFooter: currentFrameBounds.bottom <= footerBounds.top,
      progressLeftOfNext: progressBounds.right <= nextBounds.left,
      controlsInFooter: controlsBounds.top >= footerBounds.top && controlsBounds.bottom <= footerBounds.bottom,
      nextInFooter: nextBounds.top >= footerBounds.top && nextBounds.bottom <= footerBounds.bottom,
      barInLeftColumn: leftBounds ? barBounds.left >= leftBounds.left && barBounds.right <= leftBounds.right && barBounds.bottom <= paneBounds.top : false,
    };
  });

  expect(layout).toEqual({
    documentFitsViewport: true,
    controlsVisible: true,
    notesAllowScrolling: true,
    notesLeftOfCurrent: true,
    notesFillLeftColumn: true,
    footerBelowCurrent: true,
    currentFrameFitsAboveFooter: true,
    progressLeftOfNext: true,
    controlsInFooter: true,
    nextInFooter: true,
    barInLeftColumn: true,
  });

  await expect(notes.getByText('Presenter view')).toHaveCount(0);
  await expect(notes.locator('.speaker-notes__status').getByText('connected')).toHaveCount(0);
  await expect(notes.locator('.speaker-notes__current').getByText('Current slide')).toHaveCount(0);
  await expect(notes.locator('.sparkle-prompt-card')).toHaveCount(0);
  await expect(notes.locator('.speaker-notes__controls select')).toHaveCount(0);
  // One dot per slide, read from the deck itself so adding a slide is not a failure.
  const slideCount = await presentation.evaluate(() => window.__OK_VIBE_DEBUG__!.getSnapshot().slideCount);
  await expect(notes.locator('.speaker-notes__progress span')).toHaveCount(slideCount);
  await expect(notes.locator('.speaker-notes__progress span[data-visited="true"]')).toHaveCount(3);
  await expect(notes.locator('.speaker-notes__progress-count')).toHaveCount(0);
  await expect(notes.getByRole('progressbar', { name: 'Talk time used' })).toBeVisible();
  await expect(notes.locator('.speaker-notes__pace')).toContainText('40 min talk');
  await expect(notes.locator('.speaker-notes__header .speaker-notes__timer')).toHaveCount(0);
  await expect(notes.locator('.speaker-notes__footer-left .speaker-notes__timer')).toHaveCount(1);

  const timer = notes.getByTestId('presentation-timer');
  await expect(timer).toHaveText('00:00');
  await notes.getByRole('button', { name: 'Start timer' }).click();
  await expect(timer).not.toHaveText('00:00', { timeout: 2500 });
  await notes.getByRole('button', { name: 'Pause timer' }).click();
  const pausedTime = await timer.textContent();
  await notes.waitForTimeout(1100);
  await expect(timer).toHaveText(pausedTime ?? '');
  // A tap does not reset; holding does, and so does a deliberate key press.
  const reset = notes.getByRole('button', { name: 'Reset timer (hold)' });
  await reset.click();
  await expect(timer).toHaveText(pausedTime ?? '');
  await reset.hover();
  await notes.mouse.down();
  await notes.waitForTimeout(900);
  await notes.mouse.up();
  await expect(timer).toHaveText('00:00');
  await notes.getByRole('button', { name: 'Start timer' }).click();
  await expect(timer).not.toHaveText('00:00', { timeout: 2500 });
  await reset.press('Enter');
  await expect(timer).toHaveText('00:00');
  await expect(notes.getByRole('button', { name: 'Start timer' })).toBeVisible();
});

test('speaker-note review shows each slide\'s notes beside its Sparkle prompt record', async ({ page }) => {
  await page.goto('/?presentation=demo&slide=2&session=source-review&token=test-token');
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  const sidebar = page.getByRole('region', { name: 'Speaker notes review' });
  const agenda = sidebar.locator('[data-slide-id="demo-toc"]');
  await expect(agenda.locator('.sparkle-prompt-card')).toContainText('No image prompt has been authored for this slide.');
  await expect(agenda).toContainText('Templates first: every slide is a typed React component');
});

test('speaker-notes sidebar reviews, annotates, scroll-navigates, and joins Copy All', async ({ page }) => {
  await page.goto('/?presentation=demo&slide=1&session=sidebar-test&token=test-token');
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();

  const sidebar = page.getByRole('region', { name: 'Speaker notes review' });
  await expect(sidebar).toBeVisible();
  const sectionButtons = page.getByRole('navigation', { name: 'Developer tool sections' }).getByRole('button');
  await expect(sectionButtons.first()).toHaveAccessibleName('Speaker notes');
  await expect(sidebar.getByText('Welcome the audience and introduce ok-vibe-slides as a code-first presentation engine.')).toBeVisible();

  const drawer = page.getByRole('complementary', { name: 'Developer tools' });
  const resizeHandle = page.getByRole('separator', { name: 'Resize developer tools' });
  const initialWidth = await drawer.evaluate((element) => element.getBoundingClientRect().width);
  const handleBox = await resizeHandle.boundingBox();
  if (!handleBox) throw new Error('Expected developer-tools resize handle');
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 120, handleBox.y + 20);
  await page.mouse.up();
  await expect.poll(() => drawer.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(initialWidth + 80);

  const firstNote = sidebar.locator('.speaker-notes-sidebar__notes li').first().locator('p');
  await firstNote.evaluate((element) => {
    const text = element.firstChild;
    if (!text?.textContent) throw new Error('Expected speaker-note text node');
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await sidebar.getByPlaceholder('What should change?').fill('Lead with a shorter welcome.');
  await sidebar.getByRole('button', { name: 'Add annotation' }).click();
  await expect(sidebar.locator('textarea').first()).toHaveValue('Lead with a shorter welcome.');

  await firstNote.dblclick();
  const replacementEditor = sidebar.getByRole('textbox', { name: 'Edit speaker note 1 on slide 1' });
  await replacementEditor.fill('Greet the audience and introduce ok-vibe-slides as a code-first presentation engine.');
  await replacementEditor.press('Enter');
  await expect(firstNote).toHaveText('Greet the audience and introduce ok-vibe-slides as a code-first presentation engine.');

  const secondNote = sidebar.locator('.speaker-notes-sidebar__notes li').nth(1).locator('p');
  await secondNote.evaluate((element) => {
    const text = element.firstChild;
    if (!text) throw new Error('Expected speaker-note text node');
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 7);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await sidebar.getByPlaceholder('What should change?').fill('Make this preview more specific.');
  await sidebar.getByRole('button', { name: 'Add annotation' }).click();
  await expect(secondNote.locator('mark')).toHaveText('Preview');

  const sparkleCard = sidebar.locator('.speaker-notes-sidebar__slide').first().locator('.sparkle-prompt-card');
  await sparkleCard.locator('summary').click();
  const imagePrompt = sparkleCard.locator('.sparkle-prompt-card__field').nth(1).locator('p');
  await imagePrompt.evaluate((element) => {
    const text = element.firstChild;
    if (!text?.textContent) throw new Error('Expected Sparkle image-prompt text node');
    const selected = 'image prompt';
    const start = text.textContent.indexOf(selected);
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + selected.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await sparkleCard.getByPlaceholder('What should change?').fill('Author an image prompt for this slide.');
  await sparkleCard.getByRole('button', { name: 'Add annotation' }).click();
  await expect(imagePrompt.locator('mark')).toHaveText('image prompt');

  const list = sidebar.locator('.speaker-notes-sidebar__list');
  await list.dispatchEvent('wheel');
  await list.evaluate((element) => {
    const target = element.querySelector<HTMLElement>('[data-slide-index="2"]');
    target?.scrollIntoView({ block: 'start' });
    element.dispatchEvent(new Event('scroll'));
  });
  const followSlides = sidebar.getByRole('button', { name: 'Follow slides' });
  await expect(followSlides).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => new URL(page.url()).searchParams.get('slide')).toBe('3');

  const pausedScrollTop = await list.evaluate((element) => element.scrollTop);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => new URL(page.url()).searchParams.get('slide')).toBe('4');
  await expect.poll(() => list.evaluate(
    (element, prior) => Math.abs(element.scrollTop - prior),
    pausedScrollTop,
  )).toBeLessThan(2);
  await followSlides.click();
  await expect(followSlides).toHaveAttribute('aria-pressed', 'true');

  await sidebar.getByRole('button', { name: 'Close speaker notes' }).click();
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  await page.getByRole('button', { name: 'Annotations', exact: true }).click();
  await expect(page.getByText('Speaker note 1 · whole item')).toHaveCount(1);
  await expect(page.getByText('Speaker note 1 · selected text')).toBeVisible();
  await expect(page.getByText('Speaker note 2 · selected text')).toBeVisible();
  await expect(page.getByText('Sparkle · image prompt')).toBeVisible();
  await expect(page.getByText('Replace with “Greet the audience and introduce ok-vibe-slides as a code-first presentation engine.”')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as Window & { __copiedAnnotationText?: string }).__copiedAnnotationText = text;
        },
      },
    });
  });
  await page.getByRole('button', { name: 'Copy All (4)' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Copy to clipboard' }).click();
  const copied = await page.evaluate(
    () => (window as Window & { __copiedAnnotationText?: string }).__copiedAnnotationText ?? '',
  );
  expect(copied).toContain('# Annotation review — `demo`');
  expect(copied).toContain('## Work plan');
  expect(copied).toContain('notes.mjs["demo-title"][0]');
  expect(copied).toContain('Lead with a shorter welcome.');
  expect(copied).toContain('Make this preview more specific.');
  expect(copied).toContain('**Replace with:**');
  expect(copied).toContain('Greet the audience and introduce ok-vibe-slides as a code-first presentation engine.');
  expect(copied).toContain('sparkle.mjs["demo-title"].imagePrompt');
  expect(copied).toContain('Author an image prompt for this slide.');
});

test('speaker-notes sidebar is available as a mobile overlay', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?presentation=demo&slide=1&session=mobile-sidebar&token=test-token');
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  const overlay = page.locator('.developer-tools-drawer--mobile');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS('position', 'fixed');
});

test('slide preview review creates stable relative-order annotations', async ({ page }) => {
  await page.goto('/?presentation=demo&slide=1&session=slide-order-review&token=test-token');
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();

  const sidebar = page.getByRole('region', { name: 'Speaker notes review' });
  await sidebar.getByRole('tab', { name: 'Slides' }).click();
  await expect(sidebar.getByRole('heading', { name: 'Slide previews' })).toBeVisible();
  await expect(sidebar.locator('.slide-review-preview')).toHaveCount(13);

  const titleCard = sidebar.locator('[data-slide-id="demo-title"]');
  const tableOfContentsCard = sidebar.locator('[data-slide-id="demo-toc"]');
  const dragHandleBounds = await titleCard.locator('.speaker-notes-sidebar__drag-hint').boundingBox();
  const previewListBounds = await sidebar.locator('.speaker-notes-sidebar__list').boundingBox();
  expect(dragHandleBounds).not.toBeNull();
  expect(previewListBounds).not.toBeNull();
  await page.mouse.move(
    (dragHandleBounds?.x ?? 0) + (dragHandleBounds?.width ?? 0) / 2,
    (dragHandleBounds?.y ?? 0) + (dragHandleBounds?.height ?? 0) / 2,
  );
  await page.mouse.down();
  await expect(titleCard).toHaveClass(/speaker-notes-sidebar__slide--dragging/);
  for (let step = 0; step < 30; step += 1) {
    await page.mouse.move(
      (previewListBounds?.x ?? 0) + 40 + (step % 2),
      (previewListBounds?.y ?? 0) + (previewListBounds?.height ?? 1) - 20 + (step % 2),
      { steps: 2 },
    );
    if ((await tableOfContentsCard.getAttribute('class'))?.includes('speaker-notes-sidebar__slide--drop-after')) break;
  }
  await expect(tableOfContentsCard).toHaveClass(/speaker-notes-sidebar__slide--drop-after/);
  await page.mouse.up();
  await expect(sidebar.getByText('Move after Table of Contents')).toBeVisible();
  await expect(sidebar.locator('.speaker-notes-sidebar__slide').nth(0)).toHaveAttribute('data-slide-id', 'demo-toc');
  await expect(sidebar.locator('.speaker-notes-sidebar__slide').nth(1)).toHaveAttribute('data-slide-id', 'demo-title');

  await sidebar.getByRole('button', { name: 'Reorder slide 3: Bullet Slide' }).click();
  await sidebar.getByRole('combobox', { name: 'Position for Bullet Slide' }).selectOption('before');
  await sidebar.getByRole('combobox', { name: 'Anchor slide for Bullet Slide' }).selectOption('demo-toc');
  await sidebar.getByRole('button', { name: 'Add reorder annotation' }).click();
  await expect(sidebar.getByText('Move before Table of Contents')).toBeVisible();

  await sidebar.getByRole('button', { name: 'Close speaker notes' }).click();
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  await page.getByRole('button', { name: 'Annotations', exact: true }).click();
  await expect(page.getByText('Move Title Slide after Table of Contents')).toBeVisible();
  await expect(page.getByText('Move Bullet Slide before Table of Contents')).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as Window & { __copiedSlideOrderText?: string }).__copiedSlideOrderText = text;
        },
      },
    });
  });
  await page.getByRole('button', { name: 'Copy All (2)' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Copy to clipboard' }).click();
  const copied = await page.evaluate(
    () => (window as Window & { __copiedSlideOrderText?: string }).__copiedSlideOrderText ?? '',
  );
  expect(copied).toContain('`deck:slide-order`');
  expect(copied).toContain('`demo-title · after demo-toc`');
  expect(copied).toContain('`demo-bullet · before demo-toc`');
  expect(copied).toContain('simultaneous relative-order constraint');
});

test('whole-slide navigation updates the presenter preview and private notes together', async ({ browser }) => {
  const presentation = await browser.newPage();
  const notes = await browser.newPage();
  await presentation.goto('/?presentation=demo&slide=2&session=presenter-content&token=test-token');
  await notes.goto('/notes?session=presenter-content&token=test-token');
  const current = notes.locator('.speaker-notes__preview-frame--current');
  await expect(current.getByRole('heading', { name: 'Agenda' })).toBeVisible();
  await expect(notes.locator('.speaker-notes__notes')).toContainText('Frame the demo around templates');
  await notes.getByRole('button', { name: 'Next slide' }).click();
  await expect(current.getByRole('heading', { name: 'Key Capabilities' })).toBeVisible();
  await expect(notes.locator('.speaker-notes__notes')).toContainText('Call out dual aspect ratios');
  await expect.poll(() => new URL(presentation.url()).searchParams.get('slide')).toBe('3');
});

test('the presenter page has the Alt inspector and annotates its own interface', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/notes?session=presenter-inspector&token=test-token');
  const slideCount = page.locator('.speaker-notes__slide-count');
  await expect(slideCount).toBeVisible();
  const tooltip = page.locator('div', { hasText: /Click to copy$/ });

  // Hold Alt to inspect; Alt-click annotates (Alt+C switches it to copying debug info).
  await slideCount.hover();
  await page.keyboard.down('Alt');
  await page.mouse.move(0, 0);
  await slideCount.hover();
  await expect(tooltip).toBeVisible();
  await slideCount.click();
  const popup = page.locator('.comment-popup');
  await expect(popup).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Jump to slide' })).toBeHidden();
  await page.keyboard.up('Alt');
  await popup.locator('textarea').fill('Make the slide count larger.');
  await popup.locator('textarea').press('Enter');
  await expect(popup).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Annotations (1)' })).toBeVisible();

  // Inside a modal dialog the overlay and popup join the dialog's top layer.
  await page.getByRole('button', { name: 'Presenter settings' }).click();
  const settings = page.locator('dialog.speaker-notes__settings');
  const showNext = settings.getByText('Show next slide');
  await showNext.hover();
  await page.keyboard.down('Alt');
  await page.mouse.move(0, 0);
  await showNext.hover();
  await expect(settings.locator('div', { hasText: /Click to copy$/ })).toBeVisible();
  await showNext.click();
  await expect(settings.locator('.comment-popup')).toBeVisible();
  await page.keyboard.up('Alt');
  await settings.locator('.comment-popup textarea').fill('Explain what this hides.');
  await settings.locator('.comment-popup textarea').press('Enter');
  await expect(page.getByRole('tab', { name: 'Annotations (2)' })).toBeVisible();

  const stored = await page.evaluate(() => {
    const raw = Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? '').find((value) => value.includes('Explain what this hides.'));
    return raw ?? '';
  });
  expect(stored).toContain('Presenter view → Navigation and timer');
  expect(stored).toContain('Presenter view → Settings');
});
