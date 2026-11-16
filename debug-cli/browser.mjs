import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { readDevServerFile, resolveControlToken } from '../server/control-token-file.mjs';
import { assertThemeId } from './themes.mjs';

export const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';

// A running `ok-vibe-slides dev` records the URL it serves in .tmp/dev-server.json.
export const APP_URL = process.env.APP_URL || readDevServerFile().appUrl || 'http://localhost:5199';

export const isAppTab = (url, notes) => url.startsWith(APP_URL) && (notes ? url.includes('/notes') : !url.includes('/notes'));

/**
 * `href` with a sync session and, when there is one, the control token. Other
 * parameters (slide, presentation) are kept. A tab keeps the token it was
 * opened with in session storage, so after `ok-vibe-slides dev` restarts with
 * a new token, an existing tab must be reloaded with this URL.
 */
export function withControlToken(href, token) {
  const url = new URL(href);
  if (!url.searchParams.has('session')) url.searchParams.set('session', 'default');
  if (token) url.searchParams.set('token', token);
  return url.href;
}

/** The deck or presenter URL, with the dev server's control token so sync and notes work. */
export function appTabUrl(notes = false, { appUrl = APP_URL, token = resolveControlToken() } = {}) {
  return withControlToken(new URL(notes ? '/notes' : '/', appUrl).href, token);
}

async function refreshControlToken(page, token = resolveControlToken()) {
  if (!token) return;
  const stored = await page.evaluate(() => {
    try { return sessionStorage.getItem('speaker-sync-token'); } catch { return null; }
  }).catch(() => token);
  if (stored !== token) await page.goto(withControlToken(page.url(), token), { waitUntil: 'domcontentloaded' });
}

const waitForDebugAdapter = (page, timeout) => page.waitForFunction(() => Boolean(window.__OK_VIBE_DEBUG__), null, { timeout });

/**
 * Attach to the deck (or `/notes`) tab in the debug Chrome. When there is no
 * such tab, open one, so a command never needs a hand-opened browser tab.
 */
export async function connectPage(notes = false) {
  let browser;
  try { browser = await chromium.connectOverCDP(CDP_URL); }
  catch { throw new Error(`Cannot connect to Chrome at ${CDP_URL}. Run \`ok-vibe-slides debug browser\` to start it.`); }
  const pages = browser.contexts().flatMap((context) => context.pages());
  let page = pages.find((candidate) => isAppTab(candidate.url(), notes));
  if (page) {
    await refreshControlToken(page);
  } else {
    const context = browser.contexts()[0] ?? await browser.newContext();
    page = await context.newPage();
    try { await page.goto(appTabUrl(notes), { waitUntil: 'domcontentloaded' }); }
    catch {
      await page.close().catch(() => {});
      await browser.close();
      throw new Error(`Cannot open ${APP_URL}. Is \`ok-vibe-slides dev\` running?`);
    }
  }
  try {
    await waitForDebugAdapter(page, 15000);
  } catch {
    await browser.close();
    throw new Error(`The app at ${APP_URL} does not expose the debug adapter. Restart it with VITE_ENABLE_DEBUG_CLI=true.`);
  }
  return { browser, page };
}

/** Page tabs in the debug Chrome, marking the deck and presenter tabs. */
export async function listTargets({ fetchImpl = fetch, cdpUrl = CDP_URL } = {}) {
  let response;
  try { response = await fetchImpl(`${cdpUrl}/json/list`); }
  catch { throw new Error(`Cannot connect to Chrome at ${cdpUrl}. Run \`ok-vibe-slides debug browser\` to start it.`); }
  const targets = await response.json();
  return targets.filter((target) => target.type === 'page').map(({ id, title, url }) => ({
    id,
    title,
    url,
    app: isAppTab(url, false) ? 'deck' : isAppTab(url, true) ? 'notes' : null,
  }));
}

const CHROME_PATHS = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
  win32: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
};

/**
 * Start Chrome with remote debugging and its own profile (Chrome refuses
 * remote debugging on the default profile), opened on the deck. Does nothing
 * when Chrome already answers on the debugging port.
 */
export async function launchBrowser({
  cdpUrl = CDP_URL,
  profile = process.env.CHROME_PROFILE || resolve('.tmp/chrome-profile'),
  chromePath = process.env.CHROME_PATH || (CHROME_PATHS[process.platform] ?? []).find((path) => existsSync(path)),
  url = appTabUrl(false),
  fetchImpl = fetch,
  spawnImpl = spawn,
  pollMs = 250,
  attempts = 40,
} = {}) {
  const answering = async () => {
    try { return (await fetchImpl(`${cdpUrl}/json/version`)).ok; }
    catch { return false; }
  };
  if (await answering()) return { ok: true, started: false, cdpUrl };
  if (!chromePath) throw new Error('Chrome not found. Set CHROME_PATH to the Chrome executable.');
  const port = new URL(cdpUrl).port || '9222';
  const child = spawnImpl(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    url,
  ], { detached: true, stdio: 'ignore' });
  child.unref?.();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await answering()) return { ok: true, started: true, cdpUrl, profile, url };
    await new Promise((done) => setTimeout(done, pollMs));
  }
  throw new Error(`Chrome started but ${cdpUrl} did not answer.`);
}

export async function appState(page) {
  return page.evaluate(() => {
    const debug = window.__OK_VIBE_DEBUG__;
    if (!debug) throw new Error('Missing __OK_VIBE_DEBUG__');
    const snapshot = debug.getSnapshot();
    return {
      route: window.location.pathname,
      session: new URLSearchParams(window.location.search).get('session') || 'default',
      ...snapshot,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

export async function setTheme(page, theme) {
  assertThemeId(theme);
  return page.evaluate((requested) => {
    const debug = window.__OK_VIBE_DEBUG__;
    if (!debug) throw new Error('Missing __OK_VIBE_DEBUG__');
    debug.setTheme(requested);
    return requested;
  }, theme);
}

export async function setMobilePreview(page, enabled) {
  return page.evaluate((requested) => {
    const debug = window.__OK_VIBE_DEBUG__;
    if (!debug) throw new Error('Missing __OK_VIBE_DEBUG__');
    if (typeof debug.setMobilePreview !== 'function') throw new Error('The app predates setMobilePreview. Restart the dev server.');
    return debug.setMobilePreview(requested).mobilePreview;
  }, enabled);
}

export async function setViewport(page, size) {
  if (size === 'reset') {
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.clearDeviceMetricsOverride');
    await client.detach();
    return 'reset';
  }
  await page.setViewportSize(size);
  return size;
}

export async function themeSnapshot(page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const state = window.__OK_VIBE_DEBUG__?.getSnapshot();
    return {
      theme: state?.theme ?? null,
      dataTheme: document.documentElement.dataset.theme ?? null,
      background: style.getPropertyValue('--color-background').trim(),
      surface: style.getPropertyValue('--color-surface').trim(),
      text: style.getPropertyValue('--color-text-primary').trim(),
      accent: style.getPropertyValue('--color-accent').trim(),
      bodyFont: style.getPropertyValue('--font-sans').trim(),
      displayFont: style.getPropertyValue('--font-ovo').trim(),
      slideRadius: style.getPropertyValue('--slide-radius-landscape').trim(),
    };
  });
}

export async function navigate(page, slideNumber, presentationId) {
  return page.evaluate(({ slideNumber: target, presentationId: requested }) => {
    const debug = window.__OK_VIBE_DEBUG__;
    if (!debug) throw new Error('Missing __OK_VIBE_DEBUG__');
    const snapshot = debug.goToSlide(target, requested);
    return { presentationId: snapshot.presentationId, slide: snapshot.currentSlide };
  }, { slideNumber, presentationId });
}

// Finding kinds. Errors fail the audit; warnings are reported but never fail it.
//   error:   missing-slide, root-scroll-overflow, overflow, out-of-bounds
//   warning: near-content-edge, hidden-clipping-risk
export async function auditActiveSlide(page) {
  return page.evaluate(() => {
    const TOLERANCE = 8;
    const EDGE_MARGIN = 12;
    const aspectRatio = window.__OK_VIBE_DEBUG__?.getSnapshot().aspectRatio;
    const orientation = aspectRatio === '9:16' ? 'portrait' : 'landscape';
    const slide = document.querySelector(`.slide--active.slide--${orientation}`);
    const content = slide?.querySelector('.slide__content');
    const templateRoot = content?.firstElementChild;
    if (!slide || !content) return { ok: false, errors: [{ kind: 'missing-slide' }], warnings: [] };

    const errors = [];
    const warnings = [];
    const slideRect = slide.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const describe = (element) => {
      const classes = [...element.classList].slice(0, 4).join('.');
      return element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
    };
    const textOf = (element) => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    const outside = (rect, bounds) => rect.left < bounds.left - TOLERANCE || rect.top < bounds.top - TOLERANCE
      || rect.right > bounds.right + TOLERANCE || rect.bottom > bounds.bottom + TOLERANCE;
    const scrollAxes = (element) => {
      const x = element.scrollWidth > element.clientWidth + TOLERANCE;
      const y = element.scrollHeight > element.clientHeight + TOLERANCE;
      return x || y ? (x && y ? 'both' : x ? 'x' : 'y') : null;
    };
    const finding = (kind, element, extra = {}) => ({ kind, selector: describe(element), text: textOf(element), ...extra });
    const scrollDetails = (element, axis) => ({
      axis, scroll: [element.scrollWidth, element.scrollHeight], client: [element.clientWidth, element.clientHeight],
    });

    for (const element of [slide, content, templateRoot]) {
      if (!element) continue;
      const axis = scrollAxes(element);
      if (axis) errors.push(finding('root-scroll-overflow', element, scrollDetails(element, axis)));
    }

    const visible = (element) => {
      const styles = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return styles.display !== 'none' && styles.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const textSelector = 'h1,h2,h3,h4,h5,h6,p,li,span,a,button,td,th,figcaption,label,[class*="title"],[class*="description"]';
    const textElements = [...content.querySelectorAll(textSelector)]
      .filter((element) => !element.classList.contains('material-icons') && textOf(element) && visible(element));
    const clips = (styles) => ['overflowX', 'overflowY'].some((key) => styles[key] !== 'visible');

    // Text drawn outside its box is only lost when the box hides it, so scroll
    // overflow on a text element is an error only when the element clips. The
    // bounds check measures the drawn text, so visible text that leaves the
    // slide still fails, while tall display glyphs in a tight line do not.
    const inkRect = (element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const ink = range.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      if (!ink.width || !ink.height) return box;
      return {
        left: Math.min(box.left, ink.left), top: Math.min(box.top, ink.top),
        right: Math.max(box.right, ink.right), bottom: Math.max(box.bottom, ink.bottom),
      };
    };
    for (const element of textElements) {
      const rect = inkRect(element);
      const axis = scrollAxes(element);
      if (axis && clips(getComputedStyle(element))) errors.push(finding('overflow', element, scrollDetails(element, axis)));
      if (outside(rect, contentRect) || outside(rect, slideRect)) errors.push(finding('out-of-bounds', element));
      if (rect.left < slideRect.left + EDGE_MARGIN || rect.top < slideRect.top + EDGE_MARGIN
        || rect.right > slideRect.right - EDGE_MARGIN || rect.bottom > slideRect.bottom - EDGE_MARGIN) {
        warnings.push(finding('near-content-edge', element));
      }
      for (let ancestor = element.parentElement; ancestor && ancestor !== content && ancestor !== slide; ancestor = ancestor.parentElement) {
        if (clips(getComputedStyle(ancestor)) && !/image|video|player|photo|marker|icon/.test(String(ancestor.className))) {
          warnings.push(finding('hidden-clipping-risk', element, { clippingAncestor: describe(ancestor) }));
          break;
        }
      }
    }

    for (const element of content.querySelectorAll('img,video')) {
      if (visible(element) && outside(element.getBoundingClientRect(), slideRect)) errors.push(finding('out-of-bounds', element));
    }

    return { ok: errors.length === 0, errors, warnings, box: { width: slideRect.width, height: slideRect.height } };
  });
}

export async function withPage(notes, action, connect = connectPage) {
  const { browser, page } = await connect(notes);
  try { return await action(page); }
  finally { await browser.close(); }
}
