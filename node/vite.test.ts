// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ENGINE_ROOT, resolveProject } from './project.mjs';
import {
  createViteConfig,
  inheritedPublicFiles,
  manuscriptsModule,
  presentationsModule,
  projectHtml,
  projectModule,
  SHARED_DEPENDENCIES,
  stylesModule,
} from './vite';

const temps: string[] = [];
function consumer(files: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ok-show-vite-'));
  temps.push(root);
  for (const [path, body] of Object.entries({ 'decks/index.ts': '', ...files })) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return resolveProject({ presentationsDir: 'decks', templatesDir: 'templates', title: 'A & B' }, { root });
}
afterEach(() => { for (const root of temps.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('virtual modules', () => {
  it('re-exports the project deck registry', () => {
    const project = consumer();
    expect(presentationsModule(project)).toBe(`export { presentations } from ${JSON.stringify(join(project.root, 'decks/index.ts'))};\n`);
  });

  it('compiles each deck manuscript through the practice transform', () => {
    const project = consumer({ 'decks/launch/manuscript.md': '' });
    const source = manuscriptsModule(project);
    expect(source).toContain(`import * as manuscript0 from ${JSON.stringify(`${join(project.root, 'decks/launch/manuscript.md')}?practice`)};`);
    expect(source).toContain('"launch": { html: manuscript0.default, source: manuscript0.source },');
  });

  it('exposes project-relative paths for review packets', () => {
    const project = consumer({ 'templates/QuoteSlide.css': '' });
    const source = projectModule(project);
    expect(source).toContain('export const presentationsDir = "decks";');
    expect(source).toContain('export const templateStylesheets = {"QuoteSlide":"templates/QuoteSlide.css"};');
  });

  it('treats every template as an engine template inside the engine repository', () => {
    const engine = resolveProject({}, { root: ENGINE_ROOT });
    expect(projectModule(engine)).toContain('export const engineDir = "";');
    expect(projectModule(engine)).toContain('export const templateStylesheets = {};');
  });
});

describe('project styles and HTML', () => {
  it('imports project stylesheets in config order', () => {
    const project = { ...consumer(), styles: ['/p/styles/tokens.css', '/p/styles/brand.css'] };
    expect(stylesModule(project)).toBe('import "/p/styles/tokens.css";\nimport "/p/styles/brand.css";\n');
    expect(stylesModule({ ...project, styles: [] })).toBe('');
  });

  it('sets the escaped title and appends head HTML', () => {
    const html = '<html><head><title>ok-show</title></head><body></body></html>';
    expect(projectHtml(html, { title: 'A & <B>', head: '<meta name="x">' }))
      .toBe('<html><head><title>A &amp; &lt;B&gt;</title><meta name="x">\n  </head><body></body></html>');
    expect(projectHtml(html, { title: undefined, head: '' })).toBe(html);
  });

  it('drops the engine favicon and description only when the project head supplies its own', () => {
    const engine = [
      '<html><head>',
      '    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
      '    <meta name="description" content="engine" />',
      '  </head><body><meta name="description" content="body copy stays"></body></html>',
    ].join('\n');
    const withIcon = projectHtml(engine, { title: undefined, head: '<link rel="icon" href="/brand.png" />' });
    expect(withIcon).not.toContain('/favicon.svg');
    expect(withIcon).toContain('content="engine"');
    expect(withIcon).toContain('<link rel="icon" href="/brand.png" />');

    const withDescription = projectHtml(engine, { title: undefined, head: '<meta name="description" content="project" />' });
    expect(withDescription).toContain('/favicon.svg');
    expect(withDescription).not.toContain('content="engine"');
    expect(withDescription).toContain('content="project"');
    expect(withDescription).toContain('content="body copy stays"');

    expect(projectHtml(engine, { title: undefined, head: '<meta property="og:description" content="og" />' }))
      .toContain('content="engine"');
  });
});

describe('inheritedPublicFiles', () => {
  it('fills only the engine public files the project does not override', () => {
    const project = consumer({ 'public/favicon.svg': '<svg/>' });
    const inherited = inheritedPublicFiles(project);
    expect(inherited).toContain('placeholder-image.svg');
    expect(inherited).not.toContain('favicon.svg');
    expect(inheritedPublicFiles(resolveProject({}, { root: ENGINE_ROOT }))).toEqual([]);
  });
});

describe('createViteConfig', () => {
  it('serves the engine shell with the project as the source of decks and env', () => {
    const project = consumer();
    const config = createViteConfig(project, { command: 'serve', mode: 'development' }, { syncPort: 6000 });
    expect(config.root).toBe(ENGINE_ROOT);
    expect(config.envDir).toBe(project.root);
    expect(config.cacheDir).toBe(join(project.root, 'node_modules/.vite-ok-show'));
    expect(config.resolve?.dedupe).toEqual(SHARED_DEPENDENCIES);
    expect(config.server?.fs?.allow).toEqual(expect.arrayContaining([ENGINE_ROOT]));
    expect(config.server?.proxy?.['/speaker-sync']).toMatchObject({ target: 'ws://127.0.0.1:6000', ws: true });
    expect(config.server?.proxy?.['/translation-sync']).toMatchObject({ target: 'ws://127.0.0.1:6000', ws: true });
    expect(config.build?.outDir).toBe(project.outDir);
  });

  it('merges the project vite config over the engine config', () => {
    const project = { ...consumer(), vite: { base: '/talks/', server: { port: 6100 } } };
    const config = createViteConfig(project, { command: 'serve', mode: 'development' });
    expect(config.base).toBe('/talks/');
    expect(config.server?.port).toBe(6100);
    expect(config.server?.proxy).toHaveProperty('/speaker-sync');
    expect(config.server?.proxy).toHaveProperty('/translation-sync');
  });
});

describe('published dependencies', () => {
  it('depends on nothing from the private @okthink-ai scope', () => {
    const manifest = JSON.parse(readFileSync(join(ENGINE_ROOT, 'package.json'), 'utf8'));
    const names = ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']
      .flatMap((field) => Object.keys(manifest[field] ?? {}));
    expect(names.filter((name) => name.startsWith('@okthink-ai/'))).toEqual([]);
  });
});
