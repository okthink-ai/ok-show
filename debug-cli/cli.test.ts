// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchJson, parseArgs, runCommand, withPage } from './cli.mjs';
import {
  readControlTokenFile,
  removeControlTokenFile,
  resolveControlToken,
  writeControlTokenFile,
} from '../server/control-token-file.mjs';
import { renderThemeRegistryTypes } from './generate-theme-types.mjs';
import { THEME_IDS, assertThemeId, themeUsage } from './themes.mjs';
import { auditSlidesCommand, auditThemesCommand, screenshotOrientations } from './commands.mjs';
import { COMMANDS } from './commands.mjs';
import { appTabUrl, isAppTab, launchBrowser, listTargets, withControlToken } from './browser.mjs';
import { keepSession } from './page.mjs';

describe('debug CLI arguments', () => {
  it('separates positional arguments and flags', () => {
    expect(parseArgs(['audit-slide', '3', '--portrait', '--presentation', 'demo', '--json'])).toEqual({
      positional: ['audit-slide', '3'],
      flags: { portrait: true, presentation: 'demo', json: true },
    });
  });
});

describe('debug CLI sync requests', () => {
  it('sends the control token only to session diagnostics', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    await fetchJson('/diagnostics', { fetchImpl, syncUrl: 'http://sync.test', controlToken: 'secret' });
    await fetchJson('/health', { fetchImpl, syncUrl: 'http://sync.test', controlToken: 'secret' });

    expect(requests[0].init.headers).toEqual({ Authorization: 'Bearer secret' });
    expect(requests[1].init.headers).toBeUndefined();
  });

  it('explains how to authenticate when diagnostics are rejected', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    await expect(fetchJson('/diagnostics', { fetchImpl, syncUrl: 'http://sync.test', controlToken: '' }))
      .rejects.toThrow(/HTTP 401\. Set SYNC_CONTROL_TOKEN.*sync-control-token/);
  });

  it('uses the environment token first and falls back to the dev server token file', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'sync-token-')), '.tmp', 'sync-control-token');
    expect(resolveControlToken({ env: {}, path })).toBe('');

    writeControlTokenFile('from-dev-server', path);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(resolveControlToken({ env: {}, path })).toBe('from-dev-server');
    expect(resolveControlToken({ env: { SYNC_CONTROL_TOKEN: 'from-env' }, path })).toBe('from-env');

    // Another run's token is left alone; this run's token is removed.
    removeControlTokenFile('someone-else', path);
    expect(readControlTokenFile(path)).toBe('from-dev-server');
    removeControlTokenFile('from-dev-server', path);
    expect(readControlTokenFile(path)).toBe('');
  });
});

describe('debug CLI command runner', () => {
  it('routes state commands through the injected browser adapter', async () => {
    const calls: unknown[] = [];
    const snapshot = { slideCount: 3, currentSlide: 2 };

    await runCommand(['state', '--notes', '--json'], {
      withPageImpl: async (notes: boolean, action: (page: object) => Promise<unknown>) => {
        calls.push({ notes });
        return action({ evaluate: async () => snapshot });
      },
      outputImpl: (value: unknown, flags: object) => calls.push({ value, flags }),
    });

    expect(calls).toEqual([
      { notes: true },
      { value: snapshot, flags: { notes: true, json: true } },
    ]);
  });

  it('sets a failing doctor exit status without terminating the test process', async () => {
    const processImpl = { exitCode: 0 };
    const outputs: unknown[] = [];

    await runCommand(['doctor'], {
      withPageImpl: async () => ({ slideCount: 0 }),
      fetchJsonImpl: async () => ({ ok: true }),
      outputImpl: (value: unknown) => outputs.push(value),
      processImpl,
    });

    expect(processImpl.exitCode).toBe(1);
    expect(outputs).toEqual([{ ok: false, app: { slideCount: 0 }, sync: { ok: true } }]);
  });

  it('closes the browser when a page action fails', async () => {
    let closed = false;

    await expect(withPage(false, async () => {
      throw new Error('action failed');
    }, async () => ({
      browser: { close: async () => { closed = true; } },
      page: {},
    }))).rejects.toThrow('action failed');

    expect(closed).toBe(true);
  });

  it('restores the presenter viewport when a phone screenshot fails', async () => {
    const viewports: unknown[] = [];
    const original = { width: 1440, height: 900 };
    await expect(runCommand(['screenshot-notes', '--viewport', '390x844'], {
      withPageImpl: async (notes: boolean, action: (page: object) => Promise<unknown>) => {
        expect(notes).toBe(true);
        return action({
          evaluate: async () => ({ viewport: original }),
          setViewportSize: async (size: unknown) => { viewports.push(size); },
          waitForTimeout: async () => {},
          screenshot: async () => { throw new Error('Capture failed'); },
        });
      },
      mkdirImpl: async () => {},
    })).rejects.toThrow('Capture failed');
    expect(viewports).toEqual([{ width: 390, height: 844 }, original]);
  });

  it('routes remote navigation to the notes tab', async () => {
    const requests: unknown[] = [];
    await runCommand(['go', '2', '--notes'], {
      withPageImpl: async (notes: boolean, action: (page: object) => Promise<unknown>) => {
        expect(notes).toBe(true);
        return action({
          evaluate: async (_action: unknown, args: unknown) => { requests.push(args); return {}; },
          waitForTimeout: async () => {},
        });
      },
      outputImpl: () => {},
    });
    expect(requests[0]).toEqual({ slideNumber: 2, presentationId: undefined });
  });
});

describe('debug CLI themes', () => {
  it('keeps TypeScript theme IDs generated from the runtime manifest', async () => {
    const declaration = await readFile(new URL('../src/themeRegistry.d.ts', import.meta.url), 'utf8');
    expect(declaration).toBe(renderThemeRegistryTypes());
  });

  it('reads the runtime registry used by the application', async () => {
    const runtimeRegistry = await import('../src/themeRegistry.js');
    expect(THEME_IDS).toBe(runtimeRegistry.THEME_IDS);
    expect(THEME_IDS).toEqual(['midnight', 'ocean', 'paper', 'ember', 'forest', 'mono']);
  });

  it('validates theme arguments from the shared registry', () => {
    expect(assertThemeId('paper')).toBe('paper');
    expect(() => assertThemeId('unknown')).toThrow('Unknown theme: unknown');
    expect(themeUsage()).toContain(THEME_IDS.join('|'));
  });
});

describe('debug CLI audits', () => {
  const initial = {
    currentSlide: 3,
    presentationId: 'demo',
    slideCount: 4,
    theme: 'midnight',
    mobilePreview: true,
    viewport: { width: 1024, height: 768 },
  };

  function auditContext(overrides: Record<string, unknown> = {}) {
    const calls: unknown[] = [];
    const page = {
      setViewportSize: async (viewport: unknown) => { calls.push({ viewport }); },
      waitForTimeout: async () => {},
    };
    return {
      calls,
      page,
      ctx: {
        appState: async () => initial,
        auditActiveSlide: async () => ({ ok: true, errors: [] }),
        navigate: async (_page: unknown, slide: number, presentationId: string) => { calls.push({ slide, presentationId }); },
        output: (value: unknown) => { calls.push({ output: value }); },
        process: { exitCode: 0 },
        setMobilePreview: async (_page: unknown, mobilePreview: boolean) => { calls.push({ mobilePreview }); },
        setTheme: async (_page: unknown, theme: string) => { calls.push({ theme }); },
        themeSnapshot: async () => ({ theme: 'midnight', dataTheme: 'midnight', background: '#000' }),
        withPage: async (_notes: boolean, action: (target: typeof page) => Promise<unknown>) => action(page),
        ...overrides,
      },
    };
  }

  it('restores theme, navigation, and viewport after a theme audit', async () => {
    const { calls, ctx } = auditContext();

    await auditThemesCommand({ flags: { slide: '1' }, ctx });

    expect(calls[0]).toEqual({ mobilePreview: false });
    expect(calls.slice(-5, -1)).toEqual([
      { slide: 3, presentationId: 'demo' },
      { theme: 'midnight' },
      { mobilePreview: true },
      { viewport: { width: 1024, height: 768 } },
    ]);
  });

  it('restores browser state when a theme audit fails', async () => {
    const { calls, ctx } = auditContext({ auditActiveSlide: async () => { throw new Error('audit failed'); } });

    await expect(auditThemesCommand({ flags: { slide: '1' }, ctx })).rejects.toThrow('audit failed');

    expect(calls.slice(-4)).toEqual([
      { slide: 3, presentationId: 'demo' },
      { theme: 'midnight' },
      { mobilePreview: true },
      { viewport: { width: 1024, height: 768 } },
    ]);
  });

  it('restores browser state after a slide audit', async () => {
    const { calls, ctx } = auditContext();

    await auditSlidesCommand({ command: 'audit-slide', first: '2', flags: {}, ctx });

    expect(calls[0]).toEqual({ mobilePreview: false });
    expect(calls.slice(-5, -1)).toEqual([
      { slide: 3, presentationId: 'demo' },
      { theme: 'midnight' },
      { mobilePreview: true },
      { viewport: { width: 1024, height: 768 } },
    ]);
  });
});

describe('debug CLI audit results', () => {
  function run(audit: (slide: number) => unknown) {
    const outputs: Array<Record<string, unknown>> = [];
    const ctx = {
      appState: async () => ({ currentSlide: 1, presentationId: 'demo', slideCount: 2, theme: 'midnight', mobilePreview: false, viewport: { width: 1, height: 1 } }),
      auditActiveSlide: async () => audit(0),
      navigate: async () => ({}),
      output: (value: Record<string, unknown>) => { outputs.push(value); },
      process: { exitCode: 0 },
      setMobilePreview: async () => {},
      setTheme: async () => {},
      withPage: async (_n: boolean, action: (page: object) => Promise<unknown>) => action({ setViewportSize: async () => {}, waitForTimeout: async () => {} }),
    };
    return { outputs, ctx };
  }

  it('counts warnings without failing the audit', async () => {
    const warning = { kind: 'near-content-edge', selector: 'p', text: 'hi' };
    const { outputs, ctx } = run(() => ({ ok: true, errors: [], warnings: [warning] }));
    await auditSlidesCommand({ command: 'audit-slides', first: undefined, flags: {}, ctx });
    expect(outputs[0]).toMatchObject({ ok: true, warningCount: 2 });
    expect(ctx.process.exitCode).toBe(0);
  });

  it('fails with exit code 1 when any slide has an error', async () => {
    const { outputs, ctx } = run(() => ({ ok: false, errors: [{ kind: 'overflow' }], warnings: [] }));
    await auditSlidesCommand({ command: 'audit-slides', first: undefined, flags: {}, ctx });
    expect(outputs[0]).toMatchObject({ ok: false, warningCount: 0 });
    expect(ctx.process.exitCode).toBe(1);
  });
});

describe('screenshot-slides', () => {
  it('parses --orientation', () => {
    expect(screenshotOrientations()).toEqual(['landscape', 'portrait']);
    expect(screenshotOrientations('both')).toEqual(['landscape', 'portrait']);
    expect(screenshotOrientations('portrait')).toEqual(['portrait']);
    expect(() => screenshotOrientations('square')).toThrow(/--orientation/);
  });

  function setup(failAt?: number) {
    const calls: unknown[] = [];
    const shots: string[] = [];
    let state = 'landscape';
    const page = {
      evaluate: async () => 2,
      setViewportSize: async (viewport: unknown) => { calls.push({ viewport }); },
      waitForTimeout: async () => {},
      locator: (selector: string) => ({
        first: () => ({
          screenshot: async ({ path }: { path: string }) => {
            if (failAt !== undefined && shots.length === failAt) throw new Error('Capture failed');
            shots.push(`${path}|${selector}`);
          },
        }),
      }),
    };
    const outputs: Array<Record<string, unknown>> = [];
    const ctx = {
      appState: async () => ({ currentSlide: 2, presentationId: 'demo', theme: 'midnight', mobilePreview: false, aspectRatio: state, viewport: { width: 1024, height: 768 } }),
      mkdir: async () => {},
      navigate: async (_p: unknown, slide: number, presentation: string) => { calls.push({ slide, presentation }); },
      output: (value: Record<string, unknown>) => { outputs.push(value); },
      resolve: (path: string) => `/proj/${path}`,
      setMobilePreview: async (_p: unknown, on: boolean) => { state = on ? '9:16' : '16:9'; calls.push({ mobilePreview: on }); },
      setTheme: async (_p: unknown, theme: string) => { calls.push({ theme }); },
      withPage: async (_n: boolean, action: (target: typeof page) => Promise<unknown>) => action(page),
    };
    return { calls, shots, outputs, ctx };
  }

  it('captures every slide in both orientations and restores the tab', async () => {
    const { calls, shots, outputs, ctx } = setup();
    await COMMANDS['screenshot-slides']({ command: 'screenshot-slides', first: undefined, flags: {}, ctx });
    expect(outputs[0].files).toEqual([
      '/proj/.tmp/screenshots/demo-slide-1-landscape.png',
      '/proj/.tmp/screenshots/demo-slide-2-landscape.png',
      '/proj/.tmp/screenshots/demo-slide-1-portrait.png',
      '/proj/.tmp/screenshots/demo-slide-2-portrait.png',
    ]);
    expect(shots).toHaveLength(4);
    expect(shots[2]).toContain('.slide--portrait');
    expect(calls.slice(-4)).toEqual([
      { slide: 2, presentation: 'demo' },
      { theme: 'midnight' },
      { mobilePreview: false },
      { viewport: { width: 1024, height: 768 } },
    ]);
  });

  it('honours --orientation, --out-dir, and --presentation', async () => {
    const { outputs, ctx } = setup();
    await COMMANDS['screenshot-slides']({ command: 'screenshot-slides', first: undefined, flags: { orientation: 'portrait', 'out-dir': 'shots', presentation: 'other' }, ctx });
    expect(outputs[0].files).toEqual(['/proj/shots/other-slide-1-portrait.png', '/proj/shots/other-slide-2-portrait.png']);
  });

  it('restores the tab when a capture fails', async () => {
    const { calls, ctx } = setup(1);
    await expect(COMMANDS['screenshot-slides']({ command: 'screenshot-slides', first: undefined, flags: {}, ctx })).rejects.toThrow('Capture failed');
    expect(calls.slice(-3)).toEqual([{ theme: 'midnight' }, { mobilePreview: false }, { viewport: { width: 1024, height: 768 } }]);
  });
});

describe('performance commands', () => {
  it('validates benchmark limits before creating a browser session', async () => {
    const { performanceOptions } = await import('./performance.mjs');
    expect(performanceOptions({})).toMatchObject({ duration: 3000, cpu: 4, viewport: { width: 390, height: 844 } });
    for (const flags of [{ duration: 0 }, { duration: 30001 }, { cpu: 0 }, { viewport: '0x844' }, { scenario: 'invalid' }, { slide: -1 }]) {
      expect(() => performanceOptions(flags)).toThrow();
    }
  });
  it('routes performance recording to the requested surface', async () => {
    const calls: unknown[] = [];
    await runCommand(['perf', 'stop', '--notes'], {
      withPageImpl: async (notes: boolean, action: (page: object) => Promise<unknown>) => {
        calls.push(notes);
        return action({ evaluate: async (_fn: unknown, arg: unknown) => { calls.push(arg); return { commits: 7 }; } });
      },
      outputImpl: (value: unknown) => calls.push(value),
    });
    expect(calls).toEqual([true, 'stop', { commits: 7 }]);
  });
});

describe('page commands', () => {
  const run = async (argv: string[], page: Record<string, unknown>) => {
    const calls: Array<{ notes: boolean; value: unknown }> = [];
    const processImpl = { exitCode: 0 };
    await runCommand(argv, {
      withPageImpl: async (notes: boolean, action: (page: unknown) => unknown) => {
        const value = await action(page);
        calls.push({ notes, value });
        return value;
      },
      outputImpl: (value: unknown) => calls.push({ notes: false, value }),
      processImpl,
      appUrl: 'http://app.test',
    } as never);
    return { calls, processImpl };
  };

  it('registers the generic page commands', () => {
    for (const name of ['browser', 'targets', 'open', 'reload', 'eval', 'computed', 'rect', 'logs']) {
      expect(COMMANDS).toHaveProperty(name);
    }
  });

  it('evaluates an expression on the presenter tab with --notes', async () => {
    const seen: unknown[] = [];
    const { calls } = await run(['eval', 'document.title', '--notes'], { evaluate: async (expression: unknown) => { seen.push(expression); return 'Deck'; } });
    expect(seen).toEqual(['document.title']);
    expect(calls[0]).toEqual({ notes: true, value: 'Deck' });
    expect(calls[1].value).toBe('Deck');
  });

  it('prints null for an undefined result', async () => {
    const { calls } = await run(['eval', 'void 0'], { evaluate: async () => undefined });
    expect(calls.at(-1)?.value).toBeNull();
  });

  it('opens a path against the app URL and keeps the tab session', async () => {
    const visited: string[] = [];
    const page = {
      url: () => 'http://app.test/?presentation=demo&session=talk',
      goto: async (url: string) => { visited.push(url); },
      waitForFunction: async () => undefined,
    };
    await run(['open', '/?presentation=demo&slide=3'], page);
    expect(visited).toEqual(['http://app.test/?presentation=demo&slide=3&session=talk']);
  });

  it('keeps a session only for same-origin targets without one', () => {
    const current = 'http://app.test/?session=talk';
    expect(keepSession('/notes', current, 'http://app.test')).toBe('http://app.test/notes?session=talk');
    expect(keepSession('/?session=other', current, 'http://app.test')).toBe('http://app.test/?session=other');
    expect(keepSession('http://elsewhere.test/', current, 'http://app.test')).toBe('http://elsewhere.test/');
    expect(keepSession('/', 'about:blank', 'http://app.test')).toBe('http://app.test/');
  });

  it('sets a failing exit code when computed finds no element', async () => {
    const { calls, processImpl } = await run(['computed', '.missing'], { evaluate: async () => ({ ok: false, count: 0 }) });
    expect(calls.at(-1)?.value).toEqual({ ok: false, count: 0 });
    expect(processImpl.exitCode).toBe(1);
  });

  it('validates arguments before touching the browser', async () => {
    await expect(run(['open'], {})).rejects.toThrow('Usage: open');
    await expect(run(['computed', '.x', '--index', '-1'], {})).rejects.toThrow('--index');
    await expect(run(['logs', '--duration', 'soon'], {})).rejects.toThrow('--duration');
  });
});

describe('debug browser and tabs', () => {
  it('builds tokenized deck and presenter URLs', () => {
    expect(appTabUrl(false, { appUrl: 'http://app.test', token: 't' })).toBe('http://app.test/?session=default&token=t');
    expect(appTabUrl(true, { appUrl: 'http://app.test', token: '' })).toBe('http://app.test/notes?session=default');
    // An open tab keeps its slide and session and takes the dev server's new token.
    expect(withControlToken('http://app.test/?session=talk&slide=4&token=old', 'new')).toBe('http://app.test/?session=talk&slide=4&token=new');
    expect(withControlToken('http://app.test/notes', 'new')).toBe('http://app.test/notes?session=default&token=new');
  });

  it('marks the deck and presenter tabs in the target list', async () => {
    const fetchImpl = async () => new Response(JSON.stringify([
      { id: '1', type: 'page', title: 'Deck', url: `${appTabUrl(false, { token: '' })}` },
      { id: '2', type: 'page', title: 'Notes', url: `${appTabUrl(true, { token: '' })}` },
      { id: '3', type: 'page', title: 'Other', url: 'https://example.test/' },
      { id: '4', type: 'service_worker', title: 'SW', url: 'https://example.test/sw.js' },
    ]));
    const targets = await listTargets({ fetchImpl, cdpUrl: 'http://cdp.test' } as never);
    expect(targets.map((target: { id: string; app: string | null }) => [target.id, target.app])).toEqual([['1', 'deck'], ['2', 'notes'], ['3', null]]);
    expect(isAppTab(targets[2].url, false)).toBe(false);
  });

  it('reuses a Chrome that already answers', async () => {
    let spawned = false;
    const result = await launchBrowser({
      cdpUrl: 'http://cdp.test',
      fetchImpl: async () => new Response('{}'),
      spawnImpl: () => { spawned = true; },
    } as never);
    expect(result).toEqual({ ok: true, started: false, cdpUrl: 'http://cdp.test' });
    expect(spawned).toBe(false);
  });

  it('starts Chrome with its own profile and waits for the debugging port', async () => {
    let attempts = 0;
    const launches: Array<{ command: string; args: string[] }> = [];
    const result = await launchBrowser({
      cdpUrl: 'http://127.0.0.1:9333',
      chromePath: '/bin/chrome',
      profile: '/tmp/profile',
      url: 'http://app.test/',
      pollMs: 1,
      fetchImpl: async () => { attempts += 1; if (attempts < 3) throw new Error('refused'); return new Response('{}'); },
      spawnImpl: (command: string, args: string[]) => { launches.push({ command, args }); return { unref() {} }; },
    } as never);
    expect(result).toMatchObject({ ok: true, started: true });
    expect(launches[0].command).toBe('/bin/chrome');
    expect(launches[0].args).toEqual(expect.arrayContaining(['--remote-debugging-port=9333', '--user-data-dir=/tmp/profile', 'http://app.test/']));
  });
});
