// Generic page commands: open, reload, eval, computed, rect, logs, targets, and
// browser. Each acts on the deck tab, or on the presenter tab with --notes.

export const PAGE_HELP = `Page commands (add --notes to act on the /notes tab):
  browser                           Start Chrome with remote debugging and its own profile, on the deck
  targets [--json]                  List Chrome tabs; marks the deck and presenter tabs
  open <path|url> [--notes]         Navigate the tab (\`/?presentation=demo\`); keeps its ?session=.
                                    In a synced tab the session's slide wins: use \`go\` to change slides
  reload [--ignore-cache] [--notes] Reload the tab and wait for the app
  eval <expression> [--notes]       Evaluate a JavaScript expression in the page and print the result
  computed <selector> [--prop a,b] [--index n] [--notes]
                                    Computed styles, box, scroll size, and drawn-text box of one element
  rect <selector> [--notes]         Boxes of every matching element (first 20)
  logs [--duration 3000] [--reload] [--notes]
                                    Capture console messages and page errors`;

const DEFAULT_PROPS = [
  'display', 'position', 'flex', 'flex-direction', 'justify-content', 'align-items', 'gap',
  'width', 'height', 'min-width', 'min-height', 'padding', 'margin', 'overflow-x', 'overflow-y',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'background-color',
];

function requireArg(value, usage) {
  if (typeof value !== 'string' || !value) throw new Error(`Usage: ${usage}`);
  return value;
}

// Sync is on only while the URL has ?session=, so a path opened without one
// keeps the session of the tab it replaces instead of leaving the presenter.
export function keepSession(target, currentUrl, appUrl) {
  const next = new URL(target, appUrl);
  let current;
  try { current = new URL(currentUrl); } catch { return next.href; }
  const session = current.searchParams.get('session');
  if (session && next.origin === current.origin && !next.searchParams.has('session')) next.searchParams.set('session', session);
  return next.href;
}

async function waitForApp(page) {
  await page.waitForFunction(() => Boolean(window.__OK_SHOW_DEBUG__), null, { timeout: 15000 });
}

async function browserCommand({ flags, ctx }) {
  ctx.output(await ctx.launchBrowser(), flags);
}

async function targetsCommand({ flags, ctx }) {
  ctx.output(await ctx.listTargets(), flags);
}

async function openCommand({ first, flags, ctx }) {
  const target = requireArg(first, 'open <path|url> [--notes]');
  const result = await ctx.withPage(Boolean(flags.notes), async (page) => {
    await page.goto(keepSession(target, page.url(), ctx.appUrl), { waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    return { ok: true, url: page.url() };
  });
  ctx.output(result, flags);
}

async function reloadCommand({ flags, ctx }) {
  const result = await ctx.withPage(Boolean(flags.notes), async (page) => {
    if (flags['ignore-cache']) {
      const client = await page.context().newCDPSession(page);
      try { await client.send('Page.reload', { ignoreCache: true }); }
      finally { await client.detach(); }
      await page.waitForLoadState('domcontentloaded');
    } else {
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
    await waitForApp(page);
    return { ok: true, url: page.url() };
  });
  ctx.output(result, flags);
}

async function evalCommand({ first, flags, ctx }) {
  const expression = requireArg(first, 'eval <expression> [--notes]');
  // A string is evaluated as an expression; a returned promise is awaited.
  const value = await ctx.withPage(Boolean(flags.notes), (page) => page.evaluate(expression));
  ctx.output(value === undefined ? null : value, { ...flags, json: true });
}

async function computedCommand({ first, flags, ctx }) {
  const selector = requireArg(first, 'computed <selector> [--prop a,b] [--index n] [--notes]');
  const props = typeof flags.prop === 'string' ? flags.prop.split(',').map((prop) => prop.trim()).filter(Boolean) : DEFAULT_PROPS;
  const index = flags.index === undefined ? 0 : Number(flags.index);
  if (!Number.isInteger(index) || index < 0) throw new Error('--index must be a whole number');
  const result = await ctx.withPage(Boolean(flags.notes), (page) => page.evaluate(({ selector: query, props: names, index: position }) => {
    const matches = document.querySelectorAll(query);
    const element = matches[position];
    if (!element) return { ok: false, selector: query, count: matches.length, error: 'No matching element' };
    const box = (rect) => ({ x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) });
    const rect = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const ink = range.getBoundingClientRect();
    const styles = getComputedStyle(element);
    return {
      ok: true,
      selector: query,
      count: matches.length,
      index: position,
      tag: element.tagName.toLowerCase(),
      className: typeof element.className === 'string' ? element.className : element.getAttribute('class'),
      text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      // Viewport pixels. Slides are scaled to fit, so these differ from CSS pixels by `scale`.
      rect: box(rect),
      textRect: ink.width || ink.height ? box(ink) : null,
      // CSS pixels, before the slide scale.
      layout: {
        offset: [element.offsetWidth, element.offsetHeight],
        client: [element.clientWidth, element.clientHeight],
        scroll: [element.scrollWidth, element.scrollHeight],
        overflows: element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight,
      },
      scale: element.offsetWidth ? Math.round((rect.width / element.offsetWidth) * 1000) / 1000 : null,
      styles: Object.fromEntries(names.map((name) => [name, styles.getPropertyValue(name)])),
    };
  }, { selector, props, index }));
  ctx.output(result, { ...flags, json: true });
  if (!result.ok) ctx.process.exitCode = 1;
}

async function rectCommand({ first, flags, ctx }) {
  const selector = requireArg(first, 'rect <selector> [--notes]');
  const result = await ctx.withPage(Boolean(flags.notes), (page) => page.evaluate((query) => {
    const matches = [...document.querySelectorAll(query)];
    return {
      selector: query,
      count: matches.length,
      elements: matches.slice(0, 20).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          className: typeof element.className === 'string' ? element.className : element.getAttribute('class'),
          x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height),
        };
      }),
    };
  }, selector));
  ctx.output(result, { ...flags, json: true });
}

async function logsCommand({ flags, ctx }) {
  const duration = flags.duration === undefined ? 3000 : Number(flags.duration);
  if (!Number.isFinite(duration) || duration < 0 || duration > 60000) throw new Error('--duration must be 0 to 60000 ms');
  const events = await ctx.withPage(Boolean(flags.notes), async (page) => {
    const captured = [];
    const onConsole = (message) => {
      const { url, lineNumber } = message.location();
      captured.push({ type: message.type(), text: message.text(), location: url ? `${url}:${lineNumber}` : undefined });
    };
    const onError = (error) => captured.push({ type: 'pageerror', text: error.message });
    page.on('console', onConsole);
    page.on('pageerror', onError);
    try {
      if (flags.reload) await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(duration);
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onError);
    }
    return captured;
  });
  ctx.output({ count: events.length, events }, { ...flags, json: true });
}

export const PAGE_COMMANDS = {
  browser: browserCommand,
  targets: targetsCommand,
  open: openCommand,
  reload: reloadCommand,
  eval: evalCommand,
  computed: computedCommand,
  rect: rectCommand,
  logs: logsCommand,
};
