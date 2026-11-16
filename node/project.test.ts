// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULTS,
  ENGINE_ROOT,
  engineDirFor,
  findConfigFile,
  listManuscripts,
  listTemplateStylesheets,
  loadProject,
  projectRelative,
  resolveProject,
} from './project.mjs';

const temps: string[] = [];
function project(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'ok-vibe-slides-project-'));
  temps.push(root);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}
afterEach(() => { for (const root of temps.splice(0)) rmSync(root, { recursive: true, force: true }); });

const REGISTRY = { 'src/data/presentations/index.ts': 'export const presentations = [];' };

describe('resolveProject', () => {
  it('uses the default folders', () => {
    const root = project(REGISTRY);
    const resolved = resolveProject({}, { root });
    expect(resolved).toMatchObject({
      root,
      isEngine: false,
      presentationsDir: join(root, DEFAULTS.presentationsDir),
      presentationsEntry: join(root, 'src/data/presentations/index.ts'),
      templatesDir: join(root, DEFAULTS.templatesDir),
      publicDir: join(root, 'public'),
      outDir: join(root, 'dist'),
      title: undefined,
      vite: {},
      paths: { presentationsDir: 'src/data/presentations', templatesDir: 'src/components/slides' },
    });
  });

  it('resolves configured folders against the project root', () => {
    const root = project({ 'decks/index.tsx': '' });
    const resolved = resolveProject(
      { presentationsDir: 'decks', templatesDir: 'templates', publicDir: false, outDir: 'site', title: 'Talks', vite: { base: '/talks/' } },
      { root },
    );
    expect(resolved).toMatchObject({
      presentationsEntry: join(root, 'decks/index.tsx'),
      templatesDir: join(root, 'templates'),
      publicDir: false,
      outDir: join(root, 'site'),
      title: 'Talks',
      vite: { base: '/talks/' },
      paths: { presentationsDir: 'decks', templatesDir: 'templates' },
    });
  });

  it('resolves project stylesheets and head HTML', () => {
    const root = project({ ...REGISTRY, 'styles/brand.css': '' });
    const resolved = resolveProject({ styles: ['styles/brand.css'], head: '<meta name="x">' }, { root });
    expect(resolved.styles).toEqual([join(root, 'styles/brand.css')]);
    expect(resolved.head).toBe('<meta name="x">');
    expect(resolveProject({}, { root })).toMatchObject({ styles: [], head: '' });
    expect(() => resolveProject({ styles: ['styles/missing.css'] }, { root })).toThrow('stylesheet not found: styles/missing.css');
    expect(() => resolveProject({ styles: 'styles/brand.css' } as never, { root })).toThrow('"styles" must be a list');
    expect(() => resolveProject({ head: 1 } as never, { root })).toThrow('"head" must be an HTML string');
  });

  it('rejects unknown options and wrong types', () => {
    const root = project(REGISTRY);
    expect(() => resolveProject({ presentationDir: 'x' } as never, { root })).toThrow('unknown option "presentationDir"');
    expect(() => resolveProject({ title: '' }, { root })).toThrow('"title" must be a non-empty string');
    expect(() => resolveProject({ outDir: 3 } as never, { root })).toThrow('"outDir" must be a non-empty string');
    expect(() => resolveProject({ vite: [] } as never, { root })).toThrow('"vite" must be a Vite config object');
    expect(() => resolveProject([] as never, { root })).toThrow('must export an object');
  });

  it('explains how to add a deck registry when there is none', () => {
    const root = project();
    expect(() => resolveProject({ presentationsDir: 'decks' }, { root }))
      .toThrow('no deck registry in decks/. Create decks/index.ts exporting `presentations: Presentation[]`');
  });

  it('recognizes the engine repository as its own project', () => {
    const resolved = resolveProject({}, { root: ENGINE_ROOT });
    expect(resolved.isEngine).toBe(true);
    expect(resolved.paths.engineDir).toBe('');
  });
});

describe('engineDirFor', () => {
  it('names the installed package path when the engine is in node_modules', () => {
    const root = project(REGISTRY);
    mkdirSync(join(root, 'node_modules'));
    symlinkSync(ENGINE_ROOT, join(root, 'node_modules/ok-vibe-slides'), 'dir');
    expect(engineDirFor(root)).toBe('node_modules/ok-vibe-slides/');
  });

  it('falls back to the engine location when it is not installed', () => {
    const root = project(REGISTRY);
    const engine = project();
    expect(engineDirFor(root, engine)).toMatch(/\/$/);
    expect(engineDirFor(root, engine)).toContain(engine.split('/').pop());
  });
});

describe('project file helpers', () => {
  it('lists only PascalCase template stylesheets as project paths', () => {
    const root = project({
      'templates/QuoteSlide.css': '',
      'templates/EightPanelSlide.css': '',
      'templates/shared.css': '',
      'templates/QuoteSlide.tsx': '',
    });
    expect(listTemplateStylesheets(root, join(root, 'templates'))).toEqual({
      EightPanelSlide: 'templates/EightPanelSlide.css',
      QuoteSlide: 'templates/QuoteSlide.css',
    });
    expect(listTemplateStylesheets(root, join(root, 'missing'))).toEqual({});
  });

  it('lists deck manuscripts by folder name', () => {
    const root = project({ 'decks/b/manuscript.md': '', 'decks/a/manuscript.md': '', 'decks/c/slides.tsx': '' });
    expect(listManuscripts(join(root, 'decks'))).toEqual([
      { presentationId: 'a', file: join(root, 'decks/a/manuscript.md') },
      { presentationId: 'b', file: join(root, 'decks/b/manuscript.md') },
    ]);
    expect(listManuscripts(join(root, 'missing'))).toEqual([]);
  });

  it('keeps paths outside the project absolute', () => {
    expect(projectRelative('/work/talk', '/work/talk/decks/a')).toBe('decks/a');
    expect(projectRelative('/work/talk', '/work/engine')).toBe('/work/engine');
  });
});

describe('loadProject', () => {
  it('loads a TypeScript config file', async () => {
    const root = project({
      'ok-vibe-slides.config.ts': "const dir: string = 'decks';\nexport default { presentationsDir: dir, title: 'Typed' };\n",
      'decks/index.ts': '',
    });
    expect(findConfigFile(root)).toBe(join(root, 'ok-vibe-slides.config.ts'));
    const resolved = await loadProject({ root });
    expect(resolved).toMatchObject({ configFile: join(root, 'ok-vibe-slides.config.ts'), title: 'Typed', paths: { presentationsDir: 'decks' } });
  });

  it('works without a config file and reports a missing explicit one', async () => {
    const root = project(REGISTRY);
    expect((await loadProject({ root })).configFile).toBeNull();
    await expect(loadProject({ root, configFile: 'nope.config.ts' })).rejects.toThrow('config file not found');
  });
});
