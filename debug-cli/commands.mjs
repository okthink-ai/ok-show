import { performanceCommand, presenterPerformanceCommand } from './performance.mjs';
import { dirname, join } from 'node:path';
import { THEME_IDS, themeUsage } from './themes.mjs';
import { PAGE_COMMANDS, PAGE_HELP } from './page.mjs';

export const COMMAND_HELP = `App commands (need Chrome with remote debugging: run \`browser\` first;
the deck tab opens itself when none is open):
  perf <start|stop|status> [--notes] Record React commits, frame gaps, and long tasks
  perf-presenter [--scenario idle|scroll|navigate|open-practice] [--mode notes|practice]
    [--duration 3000] [--cpu 4] [--viewport 390x844] [--slide 3] [--out report.json]
                                    Benchmark an isolated presenter session
  doctor [--json]                   Check app, debug surface, and sync server
  state [--notes] [--json]          Current Redux/presentation state
  slides [--presentation demo]      List slide metadata
  go <n> [--notes] [--presentation demo] Navigate through the normal synchronized path
  mobile-preview <on|off> [--json]  Toggle the in-app mobile preview frame
  viewport <WxH|reset> [--notes]    Resize the tab, or clear the size override
  themes [--json]                   List available themes and active theme
  theme <id> [--json]               Apply a theme through Redux
  audit-themes [--slide 1]          Audit every slide in every theme (or one slide)
  practice [--notes] [--cue <n>|--top]   Open manuscript practice; scroll a slide cue past the guide
  notes [--json]                    Inspect the live speaker-notes view
  audit-slide <n> [--portrait]      Check one slide for overflow and clipping (errors fail; warnings do not)
  audit-slides [--portrait]         Check every slide
  screenshot-slide <n> [--portrait] [--out path]
                                    Capture the active slide
  screenshot-slides [--presentation demo] [--orientation landscape|portrait|both]
    [--out-dir .tmp/screenshots] [--json]
                                    Capture every slide as <id>-slide-<n>-<orientation>.png
  screenshot-notes [--out path] [--viewport 390x844]
                                    Capture the speaker-notes page

${PAGE_HELP}

Server commands (do not require Chrome):
  sync-health [--json]              Query /health
  sessions [--json]                 Query /diagnostics`;

async function restorePage(page, initial, ctx) {
  let firstError;
  const attempt = async (action) => {
    try { await action(); }
    catch (error) { firstError ??= error; }
  };
  await attempt(() => ctx.navigate(page, initial.currentSlide, initial.presentationId));
  await attempt(() => ctx.setTheme(page, initial.theme));
  await attempt(() => ctx.setMobilePreview(page, initial.mobilePreview));
  await attempt(() => page.setViewportSize(initial.viewport));
  if (firstError) throw firstError;
}

// Warnings never fail an audit, but they are totalled so they are visible at a glance.
function countWarnings(slides) {
  return slides.reduce((total, item) => total + (item.warnings?.length ?? 0), 0);
}

export async function auditThemesCommand({ flags, ctx }) {
  const result = await ctx.withPage(false, async (page) => {
    const initial = await ctx.appState(page);
    try {
      await ctx.setMobilePreview(page, false);
      await page.setViewportSize({ width: 1440, height: 900 });
      const requestedSlide = flags.slide ? Number(flags.slide) : null;
      if (requestedSlide !== null && (!Number.isInteger(requestedSlide) || requestedSlide < 1)) throw new Error('Expected --slide <positive number>');
      const targetSlides = requestedSlide ? [requestedSlide] : Array.from({ length: initial.slideCount }, (_, index) => index + 1);
      const audits = [];
      for (const theme of THEME_IDS) {
        await ctx.setTheme(page, theme);
        await page.waitForTimeout(100);
        const tokens = await ctx.themeSnapshot(page);
        const tokensPresent = Object.entries(tokens).filter(([key]) => !['theme', 'dataTheme'].includes(key)).every(([, value]) => Boolean(value));
        const slides = [];
        for (const slide of targetSlides) {
          await ctx.navigate(page, slide, flags.presentation);
          await page.waitForTimeout(60);
          slides.push({ slide, ...await ctx.auditActiveSlide(page) });
        }
        audits.push({ theme, ok: tokensPresent && tokens.dataTheme === theme && slides.every((slide) => slide.ok), tokens, slides });
      }
      return { ok: audits.every((audit) => audit.ok), warningCount: countWarnings(audits.flatMap((audit) => audit.slides)), themes: audits };
    } finally {
      await restorePage(page, initial, ctx);
    }
  });
  ctx.output(result, flags);
  if (!result.ok) ctx.process.exitCode = 1;
}

export async function auditSlidesCommand({ command, first, flags, ctx }) {
  const results = await ctx.withPage(false, async (page) => {
    const initial = await ctx.appState(page);
    try {
      await ctx.setMobilePreview(page, false);
      await page.setViewportSize(flags.portrait ? { width: 540, height: 960 } : { width: 1440, height: 900 });
      const targets = command === 'audit-slide' ? [Number(first)] : Array.from({ length: initial.slideCount }, (_, index) => index + 1);
      if (targets.some((value) => !Number.isInteger(value) || value < 1)) throw new Error('Usage: audit-slide <positive slide number>');
      const audits = [];
      for (const target of targets) {
        await ctx.navigate(page, target, flags.presentation);
        await page.waitForTimeout(100);
        audits.push({ slide: target, ...await ctx.auditActiveSlide(page) });
      }
      return audits;
    } finally {
      await restorePage(page, initial, ctx);
    }
  });
  const result = { ok: results.every((item) => item.ok), warningCount: countWarnings(results), slides: results };
  ctx.output(result, flags);
  if (!result.ok) ctx.process.exitCode = 1;
}

async function doctorCommand({ flags, ctx }) {
  const state = await ctx.withPage(false, ctx.appState);
  let sync;
  try { sync = await ctx.fetchJson('/health'); } catch (error) { sync = { ok: false, error: error.message }; }
  const result = { ok: state.slideCount > 0 && sync.ok, app: state, sync };
  ctx.output(result, flags);
  if (!result.ok) ctx.process.exitCode = 1;
}

// Capture the active slide in one orientation: switch the preview frame, navigate, and clip to the slide.
async function captureSlide(page, ctx, { number, portrait, presentation, path }) {
  await ctx.setMobilePreview(page, portrait);
  await page.setViewportSize({ width: 1440, height: 900 });
  await ctx.navigate(page, number, presentation);
  await page.waitForTimeout(150);
  await ctx.mkdir(dirname(path), { recursive: true });
  const { aspectRatio } = await ctx.appState(page);
  const orientation = portrait || aspectRatio === '9:16' ? 'portrait' : 'landscape';
  await page.locator(`.slide--active.slide--${orientation}`).first().screenshot({ path });
}

export function screenshotOrientations(value = 'both') {
  if (value === 'both') return ['landscape', 'portrait'];
  if (value === 'landscape' || value === 'portrait') return [value];
  throw new Error('Use --orientation landscape|portrait|both');
}

async function screenshotSlidesCommand({ flags, ctx }) {
  const orientations = screenshotOrientations(flags.orientation === true ? undefined : flags.orientation);
  if (flags['out-dir'] === true || flags.presentation === true) throw new Error('Expected a value for --out-dir / --presentation');
  const dir = ctx.resolve(typeof flags['out-dir'] === 'string' ? flags['out-dir'] : '.tmp/screenshots');
  const result = await ctx.withPage(false, async (page) => {
    const initial = await ctx.appState(page);
    const presentationId = flags.presentation ?? initial.presentationId;
    const slideCount = await page.evaluate((id) => window.__OK_VIBE_DEBUG__?.getSlides(id).length ?? 0, presentationId);
    if (!slideCount) throw new Error(`No slides found for presentation ${presentationId}`);
    const files = [];
    try {
      for (const orientation of orientations) {
        for (let number = 1; number <= slideCount; number += 1) {
          const path = join(dir, `${presentationId}-slide-${number}-${orientation}.png`);
          await captureSlide(page, ctx, { number, portrait: orientation === 'portrait', presentation: presentationId, path });
          files.push(path);
        }
      }
    } finally {
      await restorePage(page, initial, ctx);
    }
    return { ok: true, presentationId, orientations, dir, files };
  });
  ctx.output(result, flags);
}

async function screenshotCommand({ command, first, flags, ctx }) {
  const notes = command === 'screenshot-notes';
  const result = await ctx.withPage(notes, async (page) => {
    let restore = null;
    if (!notes) {
      const number = Number(first);
      if (!Number.isInteger(number) || number < 1) throw new Error('Usage: screenshot-slide <positive slide number>');
      const initial = await ctx.appState(page);
      restore = { mobilePreview: initial.mobilePreview, viewport: initial.viewport };
    }
    if (notes && flags.viewport) {
      const match = /^(\d+)x(\d+)$/.exec(String(flags.viewport));
      if (!match || Number(match[1]) < 1 || Number(match[2]) < 1) throw new Error('Use --viewport <positive width>x<positive height>');
      const initial = await ctx.appState(page);
      restore = { viewport: initial.viewport };
      await page.setViewportSize({ width: Number(match[1]), height: Number(match[2]) });
      await page.waitForTimeout(150);
    }
    const path = ctx.resolve(typeof flags.out === 'string' ? flags.out : `debug-cli/screenshots/${notes ? 'speaker-notes' : `slide-${first}`}.png`);
    try {
      if (notes) {
        await ctx.mkdir(dirname(path), { recursive: true });
        await page.screenshot({ path, fullPage: true });
      } else {
        await captureSlide(page, ctx, { number: Number(first), portrait: Boolean(flags.portrait), presentation: flags.presentation, path });
      }
    } finally {
      if (restore) {
        if (!notes) await ctx.setMobilePreview(page, restore.mobilePreview);
        await page.setViewportSize(restore.viewport);
      }
    }
    return { ok: true, path };
  });
  ctx.output(result, flags);
}

export const COMMANDS = {
  perf: performanceCommand,
  'perf-presenter': presenterPerformanceCommand,
  'sync-health': async ({ flags, ctx }) => ctx.output(await ctx.fetchJson('/health'), flags),
  sessions: async ({ flags, ctx }) => ctx.output(await ctx.fetchJson('/diagnostics'), flags),
  doctor: doctorCommand,
  state: async ({ flags, ctx }) => ctx.output(await ctx.withPage(Boolean(flags.notes), ctx.appState), flags),
  themes: async ({ flags, ctx }) => {
    const result = await ctx.withPage(false, async (page) => ({ active: (await ctx.appState(page)).theme, themes: THEME_IDS }));
    ctx.output(result, flags);
  },
  theme: async ({ first, flags, ctx }) => {
    if (!first) throw new Error(themeUsage());
    const result = await ctx.withPage(false, async (page) => {
      await ctx.setTheme(page, first);
      await page.waitForTimeout(100);
      return ctx.themeSnapshot(page);
    });
    ctx.output(result, flags);
  },
  'mobile-preview': async ({ first, flags, ctx }) => {
    if (first !== 'on' && first !== 'off') throw new Error('Usage: mobile-preview <on|off>');
    const result = await ctx.withPage(false, async (page) => {
      await ctx.setMobilePreview(page, first === 'on');
      await page.waitForTimeout(100);
      return ctx.appState(page);
    });
    ctx.output(result, flags);
  },
  viewport: async ({ first, flags, ctx }) => {
    if (!first) throw new Error('Usage: viewport <WxH|reset>');
    let size = 'reset';
    if (first !== 'reset') {
      const match = /^(\d+)x(\d+)$/.exec(first);
      if (!match) throw new Error('Usage: viewport <WxH|reset>');
      size = { width: Number(match[1]), height: Number(match[2]) };
    }
    const result = await ctx.withPage(Boolean(flags.notes), async (page) => {
      await ctx.setViewport(page, size);
      await page.waitForTimeout(100);
      return ctx.appState(page);
    });
    ctx.output(result, flags);
  },
  'audit-themes': auditThemesCommand,
  notes: async ({ flags, ctx }) => {
    const result = await ctx.withPage(true, async (page) => {
      const practice = await page.locator('.talk-practice').count() > 0;
      return { ...await ctx.appState(page), mode: practice ? 'practice' : 'notes',
        text: practice ? await page.locator('.talk-practice__viewport').getAttribute('data-reading-text') : await page.locator('.speaker-notes__notes').innerText(),
        status: await page.locator('.speaker-notes__status').getAttribute('aria-label') };
    });
    ctx.output(result, flags);
  },
  practice: async ({ flags, ctx }) => {
    const cueNumber = flags.cue === undefined ? null : Number(flags.cue);
    if (flags.top && cueNumber !== null) throw new Error('Use either --top or --cue, not both.');
    if (cueNumber !== null && (!Number.isInteger(cueNumber) || cueNumber < 1)) throw new Error('Use --cue <positive slide number>');
    const result = await ctx.withPage(Boolean(flags.notes), async (page) => {
      if (!flags.notes && !await page.getByRole('region', { name: 'Speaker notes review' }).isVisible()) {
        if (!await page.getByRole('complementary', { name: 'Developer tools' }).isVisible()) {
          await page.getByRole('button', { name: 'Toggle developer tools' }).click();
        }
        await page.getByRole('navigation', { name: 'Developer tool sections' }).getByRole('button', { name: 'Speaker notes', exact: true }).click();
      }
      await page.getByRole('tab', { name: 'Practice', exact: true }).click();
      await page.locator('.talk-practice__viewport').waitFor();
      if (flags.top) {
        await page.getByRole('button', { name: 'Scroll to top', exact: true }).click();
        await page.waitForTimeout(200);
      }
      if (cueNumber !== null) {
        if (!await page.locator(`[data-practice-cue="${cueNumber - 1}"]`).count()) throw new Error(`No manuscript cue for slide ${cueNumber}`);
        await page.locator(`[data-practice-cue="${cueNumber - 1}"]`).first().evaluate((cue) => {
          const reader = cue.closest('.talk-practice__viewport');
          const rect = cue.getBoundingClientRect();
          reader.scrollTop += rect.top + rect.height / 2 - reader.getBoundingClientRect().top - reader.clientHeight / 2 + 12;
        });
        await page.waitForTimeout(200);
      }
      return {
        ...await ctx.appState(page),
        practice: await page.locator('.talk-practice').evaluate((reader) => ({
          cueCount: reader.querySelectorAll('[data-practice-cue]').length,
          activeCue: reader.querySelector('[data-active="true"]')?.textContent ?? null,
          following: reader.querySelector('[aria-pressed]')?.getAttribute('aria-pressed') === 'true',
          scrollTop: reader.querySelector('.talk-practice__viewport')?.scrollTop,
          highlighted: Boolean(reader.querySelector('.talk-practice__highlight')),
          readingText: reader.querySelector('.talk-practice__viewport')?.getAttribute('data-reading-text'),
        })),
      };
    });
    ctx.output(result, flags);
  },
  slides: async ({ flags, ctx }) => {
    const result = await ctx.withPage(false, (page) => page.evaluate((requested) => window.__OK_VIBE_DEBUG__?.getSlides(requested) ?? [], flags.presentation));
    ctx.output(result, flags);
  },
  go: async ({ first, flags, ctx }) => {
    const number = Number(first);
    if (!Number.isInteger(number) || number < 1) throw new Error('Usage: go <positive slide number>');
    const result = await ctx.withPage(Boolean(flags.notes), async (page) => { await ctx.navigate(page, number, flags.presentation); await page.waitForTimeout(150); return ctx.appState(page); });
    ctx.output(result, flags);
  },
  'audit-slide': auditSlidesCommand,
  'audit-slides': auditSlidesCommand,
  'screenshot-slide': screenshotCommand,
  'screenshot-slides': screenshotSlidesCommand,
  'screenshot-notes': screenshotCommand,
  ...PAGE_COMMANDS,
};
