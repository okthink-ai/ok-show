import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export function performanceOptions(flags) {
  const duration = Number(flags.duration ?? 3000);
  const cpu = Number(flags.cpu ?? 4);
  const slide = Number(flags.slide ?? 3);
  const scenario = flags.scenario ?? 'scroll';
  const match = /^(\d+)x(\d+)$/.exec(String(flags.viewport ?? '390x844'));
  if (!Number.isInteger(duration) || duration < 250 || duration > 30000) throw new Error('Use --duration <250..30000 milliseconds>');
  if (!Number.isFinite(cpu) || cpu < 1 || cpu > 20) throw new Error('Use --cpu <1..20 slowdown rate>');
  if (!Number.isInteger(slide) || slide < 1) throw new Error('Use --slide <positive slide number>');
  if (!['idle', 'scroll', 'navigate', 'open-practice'].includes(scenario)) throw new Error('Use --scenario <idle|scroll|navigate|open-practice>');
  if (!match || Number(match[1]) < 100 || Number(match[2]) < 100) throw new Error('Use --viewport <width>x<height>, at least 100x100');
  return { duration, cpu, slide, scenario, viewport: { width: Number(match[1]), height: Number(match[2]) }, mode: flags.mode ?? 'practice' };
}

export async function performanceCommand({ first, flags, ctx }) {
  if (!['start', 'stop', 'status'].includes(first)) throw new Error('Use perf <start|stop|status> [--notes]');
  const report = await ctx.withPage(Boolean(flags.notes), (page) => page.evaluate((action) => {
    const recorder = window.__OK_VIBE_DEBUG__?.performance;
    if (!recorder) throw new Error('Reload this tab to enable the performance recorder.');
    return recorder[action === 'status' ? 'report' : action]();
  }, first));
  ctx.output(report, flags);
}

/** Exercise a separate browser context and WebSocket session; never navigate the user's live deck. */
export async function presenterPerformanceCommand({ flags, ctx }) {
  const options = performanceOptions(flags);
  if (!['notes', 'practice'].includes(options.mode)) throw new Error('Use --mode <notes|practice>');
  if (options.scenario === 'scroll' && options.mode !== 'practice') throw new Error('Scrolling benchmark requires --mode practice');
  const report = await ctx.withPage(Boolean(flags.notes), async (source) => {
    const origin = new URL(source.url()).origin;
    const initial = await ctx.appState(source);
    if (options.slide > initial.slideCount) throw new Error(`Slide must be <= ${initial.slideCount}`);
    const context = await source.context().browser().newContext({ viewport: options.viewport });
    let client;
    try {
      const page = await context.newPage();
      let socketMessages = 0;
      let socketBytes = 0;
      let recording = false;
      page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
        if (recording) { socketMessages++; socketBytes += Buffer.byteLength(payload); }
      }));
      const url = new URL('/notes', origin);
      url.searchParams.set('session', `perf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      url.searchParams.set('presentation', initial.presentationId);
      url.searchParams.set('slide', String(options.slide));
      // The presenter view needs the control token; it is not in the page bundle.
      const token = ctx.controlToken?.();
      if (token) url.searchParams.set('token', token);
      client = await context.newCDPSession(page);
      await client.send('Emulation.setCPUThrottlingRate', { rate: options.cpu });
      await client.send('Performance.enable');
      await page.goto(url.href);
      await page.locator('.speaker-notes__status--connected').waitFor({ timeout: 15000 });
      const needsPractice = options.mode === 'practice' || options.scenario === 'open-practice';
      if (needsPractice && !(await page.getByRole('tab', { name: 'Practice', exact: true }).count())) {
        throw new Error(`Practice benchmarks need a manuscript.md in the ${initial.presentationId} deck folder; use --mode notes for decks without one.`);
      }
      if (options.mode === 'practice' && options.scenario !== 'open-practice') {
        await page.getByRole('tab', { name: 'Practice', exact: true }).click();
        const cue = page.locator(`[data-practice-cue="${options.slide - 1}"]`).first();
        if (await cue.count()) await cue.evaluate((element) => {
          const viewport = element.closest('.talk-practice__viewport');
          const rect = element.getBoundingClientRect();
          viewport.scrollTop += rect.top + rect.height / 2 - viewport.getBoundingClientRect().top - viewport.clientHeight / 2 + 12;
        });
      }
      await page.getByRole('button', { name: 'Start timer', exact: true }).click();
      await page.waitForTimeout(700);
      const before = await client.send('Performance.getMetrics');
      const startState = await ctx.appState(page);
      await page.evaluate(() => window.__OK_VIBE_DEBUG__.performance.start());
      recording = true;
      if (options.scenario === 'open-practice') await page.getByRole('tab', { name: 'Practice', exact: true }).click();
      const workload = await page.evaluate(async ({ duration, scenario }) => {
        const start = performance.now();
        const viewport = document.querySelector('.talk-practice__viewport');
        const initialScroll = viewport?.scrollTop ?? 0;
        let steps = 0;
        let lastAction = 0;
        await new Promise((resolve) => {
          const step = (now) => {
            const elapsed = now - start;
            if (elapsed >= duration) { resolve(); return; }
            if (scenario === 'scroll' && viewport) {
              // Time-based distance makes before/after runs traverse the same document.
              viewport.scrollTop = initialScroll + elapsed * .4;
              steps++;
            } else if (scenario === 'navigate' && elapsed - lastAction >= 300) {
              const forward = steps % 2 === 0;
              document.querySelector(`[aria-label="${forward ? 'Next' : 'Previous'} slide"]`)?.click();
              lastAction = elapsed;
              steps++;
            }
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
        return { steps, scrollDistance: viewport ? viewport.scrollTop - initialScroll : 0 };
      }, options);
      const result = await page.evaluate(() => window.__OK_VIBE_DEBUG__.performance.stop());
      recording = false;
      const after = await client.send('Performance.getMetrics');
      const browserMetrics = {};
      for (const name of ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount']) {
        const read = (metrics) => metrics.metrics.find((item) => item.name === name)?.value ?? 0;
        browserMetrics[name.endsWith('Duration') ? name + 'Ms' : name] = Math.round((read(after) - read(before)) * (name.endsWith('Duration') ? 100000 : 100)) / 100;
      }
      return { options, environment: { browser: await context.browser().version(), ...startState }, workload,
        ...result, browserMetrics, websocket: { receivedMessages: socketMessages, receivedBytes: socketBytes } };
    } finally {
      try { await client?.send('Emulation.setCPUThrottlingRate', { rate: 1 }); }
      finally { await context.close(); }
    }
  });
  if (typeof flags.out === 'string') {
    const path = ctx.resolve(flags.out);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(report, null, 2) + '\n');
  }
  ctx.output(report, flags);
}
