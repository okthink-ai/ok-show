// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { GITHUB_SPEC, defaultEngineSpec, planInit, rewriteImports, slugify, writeInit } from './init.mjs';
import { ENGINE_ROOT } from './project.mjs';

const DATE = new Date('2026-11-15T12:00:00Z');
const folders: string[] = [];

function tempProject(name = 'launch-talk') {
  const parent = mkdtempSync(join(tmpdir(), 'ovs-init-'));
  folders.push(parent);
  return join(parent, name);
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const plan = (options: Partial<Parameters<typeof planInit>[0]> = {}) =>
  planInit({ targetDir: tempProject(), engineSpec: 'file:../engine', date: DATE, ...options });

describe('planInit', () => {
  it('names the deck after the folder and writes the files an author edits', () => {
    const { deckId, title, files } = plan();
    expect(deckId).toBe('launch-talk');
    expect(title).toBe('Launch Talk');
    const deck = 'src/data/presentations/launch-talk';
    for (const file of [
      'package.json', '.gitignore', 'ok-vibe-slides.config.ts', 'tsconfig.json', 'README.md', 'AGENTS.md',
      'src/styles/brand.css', 'public/favicon.svg', 'src/data/presentations/index.ts',
      `${deck}/index.ts`, `${deck}/slides.tsx`, `${deck}/notes.mjs`, `${deck}/sparkle.mjs`, `${deck}/manuscript.md`,
    ]) {
      expect(files.has(file), file).toBe(true);
    }
    // Every built-in template, and SlideHeader, with its stylesheet.
    const builtIns = readdirSync(join(ENGINE_ROOT, 'src/components/slides')).filter((name) => /^[A-Z]\w*\.tsx$/.test(name));
    expect(builtIns).toContain('SlideHeader.tsx');
    for (const name of builtIns) expect(files.has(`src/components/slides/${name}`), name).toBe(true);
    expect(files.has('src/components/slides/TitleSlide.css')).toBe(true);
    // The starter docs name the deck and leave no placeholders.
    expect(files.get('README.md')).toMatch(/^# Launch Talk$/m);
    expect(files.get('README.md')).toContain(`${deck}/notes.mjs`);
    for (const doc of ['README.md', 'AGENTS.md']) expect(files.get(doc), doc).not.toContain('{{');
    // Nothing from the app shell, tools, or server is copied.
    expect([...files.keys()].some((file) => /^(server|node|debug-cli)\/|App\.tsx$/.test(file))).toBe(false);
  });

  it('takes the deck id and title from options', () => {
    const { deckId, title, files } = plan({ deckId: '2026-kickoff', title: 'Kickoff "26"' });
    expect(deckId).toBe('2026-kickoff');
    expect(title).toBe('Kickoff "26"');
    expect(files.get('src/data/presentations/index.ts')).toContain("import { deck2026Kickoff } from './2026-kickoff';");
    expect(files.get('src/data/presentations/2026-kickoff/index.ts')).toContain('title: "Kickoff \\"26\\""');
    expect(files.get('src/data/presentations/2026-kickoff/index.ts')).toContain('date: "November 2026"');
    expect(files.get('ok-vibe-slides.config.ts')).toContain('title: "Kickoff \\"26\\""');
    expect(files.get('src/data/presentations/2026-kickoff/manuscript.md')).toMatch(/^# Kickoff "26"$/m);
  });

  it('rejects deck ids that are not URL-safe', () => {
    expect(() => plan({ deckId: 'My Talk' })).toThrow('deck id "My Talk" must be lowercase');
    // A folder name that slugifies to nothing usable falls back to my-talk.
    expect(planInit({ targetDir: tempProject('!!!'), engineSpec: 'x', date: DATE }).deckId).toBe('my-talk');
  });

  it('only imports copied files or package exports', () => {
    const { files } = plan();
    const sources = [...files].filter(([file]) => file.endsWith('.tsx') || file.endsWith('.ts'));
    for (const [file, text] of sources) {
      for (const [, specifier] of text.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g)) {
        if (!specifier) continue;
        if (specifier.startsWith('.')) {
          const target = posix.normalize(posix.join(posix.dirname(file), specifier));
          const found = [target, `${target}.tsx`, `${target}.ts`, `${target}/index.ts`].some((path) => files.has(path));
          expect(found, `${file} imports ${specifier}`).toBe(true);
        } else {
          expect(specifier, file).toMatch(/^(ok-vibe-slides(\/(slides|components)\/[A-Z]\w*)?|ok-vibe-slides\/config|react(\/.*)?)$/);
        }
      }
    }
    // The starter deck uses the local template copies, never the package root's values.
    expect(files.get('src/data/presentations/launch-talk/slides.tsx')).toContain("from '../../../components/slides/TitleSlide'");
  });

  it('renames slide ids consistently across the deck, notes, Sparkle prompts, and manuscript', async () => {
    const project = plan();
    writeInit(project);
    const { files } = project;
    const deck = (name: string) => files.get(`src/data/presentations/launch-talk/${name}`)!;
    const load = async (name: string) => Object.keys((await import(
      pathToFileURL(join(project.root, 'src/data/presentations/launch-talk', name)).href
    )).default);
    const ids = [...deck('slides.tsx').matchAll(/\bid:\s*['"]([a-z0-9-]+)['"]/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(5);
    expect(ids.every((id) => id.startsWith('launch-talk-'))).toBe(true);
    for (const name of ['slides.tsx', 'notes.mjs', 'sparkle.mjs', 'manuscript.md']) {
      expect(deck(name), name).not.toMatch(/['"]demo-|slide:demo-/);
    }
    const noteKeys = await load('notes.mjs');
    const sparkleKeys = await load('sparkle.mjs');
    const cues = [...deck('manuscript.md').matchAll(/<!-- slide:([a-z0-9-]+) -->/g)].map((match) => match[1]);
    expect(noteKeys.length).toBeGreaterThan(0);
    expect(cues.length).toBeGreaterThan(0);
    for (const key of [...noteKeys, ...sparkleKeys, ...cues]) expect(ids).toContain(key);
  });

  it('merges into an existing package.json and .gitignore', () => {
    const root = tempProject();
    rmSync(root, { recursive: true, force: true });
    writeInit({ root, files: new Map([
      ['package.json', JSON.stringify({ name: 'mine', scripts: { dev: 'custom dev' }, dependencies: { react: '18.0.0' } })],
      ['.gitignore', 'node_modules/\ncoverage'],
    ]) } as ReturnType<typeof planInit>);
    const { files } = planInit({ targetDir: root, engineSpec: 'file:../engine', date: DATE });
    const pkg = JSON.parse(files.get('package.json')!);
    expect(pkg.name).toBe('mine');
    expect(pkg.scripts.dev).toBe('custom dev');
    expect(pkg.scripts.build).toBe('ok-vibe-slides build');
    expect(pkg.dependencies.react).toBe('18.0.0');
    expect(pkg.dependencies['ok-vibe-slides']).toBe('file:../engine');
    expect(pkg.devDependencies.typescript).toBeDefined();
    expect(files.get('.gitignore')).toBe('node_modules/\ncoverage\ndist\n.tmp\n.speaker-sync\n.env\n*.local\n');
  });

  it('writes a new package.json with the scripts and dependencies a project needs', () => {
    const pkg = JSON.parse(plan().files.get('package.json')!);
    expect(pkg).toMatchObject({ name: 'launch-talk', private: true, type: 'module' });
    expect(Object.keys(pkg.scripts)).toEqual(['dev', 'build', 'preview', 'type-check', 'audit', 'debug']);
    expect(Object.keys(pkg.dependencies)).toEqual(['ok-vibe-slides', 'react', 'react-dom']);
  });
});

describe('writeInit', () => {
  it('refuses to overwrite files unless forced', () => {
    const first = plan();
    writeInit(first);
    const slides = join(first.root, 'src/data/presentations/launch-talk/slides.tsx');
    writeFileSync(slides, '// mine');

    const again = planInit({ targetDir: first.root, engineSpec: 'file:../engine', date: DATE });
    expect(() => writeInit(again)).toThrow(/already exist[\s\S]*slides\.tsx[\s\S]*--force/);
    expect(readFileSync(slides, 'utf8')).toBe('// mine');

    const { overwritten } = writeInit(again, { force: true });
    expect(overwritten).toContain('src/data/presentations/launch-talk/slides.tsx');
    // package.json and .gitignore are merged, never reported as conflicts.
    expect(overwritten).not.toContain('package.json');
    expect(readFileSync(slides, 'utf8')).not.toBe('// mine');
  });

  it('writes every planned file', () => {
    const project = plan();
    expect(writeInit(project).overwritten).toEqual([]);
    for (const [file, text] of project.files) expect(readFileSync(join(project.root, file), 'utf8'), file).toBe(text);
  });
});

describe('rewriteImports', () => {
  const copies = new Map(['SlideHeader', 'TitleSlide'].map((name) => [`src/components/slides/${name}`, `src/components/slides/${name}`]));
  const rewrite = (source: string) => rewriteImports(source, {
    from: 'src/components/slides/TitleSlide.tsx',
    to: 'src/components/slides/TitleSlide.tsx',
    copies,
  });

  it('keeps copied files relative and points the rest at package exports', () => {
    expect(rewrite("import SlideHeader from './SlideHeader';")).toBe("import SlideHeader from './SlideHeader';");
    expect(rewrite("import './TitleSlide.css';")).toBe("import './TitleSlide.css';");
    expect(rewrite("import type { BaseSlideProps } from '../../types/slide.types';"))
      .toBe("import type { BaseSlideProps } from 'ok-vibe-slides';");
    expect(rewrite("import VideoOverlay from '../VideoOverlay';"))
      .toBe("import VideoOverlay from 'ok-vibe-slides/components/VideoOverlay';");
    expect(rewrite("import QuoteSlide from './QuoteSlide';")).toBe("import QuoteSlide from 'ok-vibe-slides/slides/QuoteSlide';");
  });

  it('refuses imports the package does not export', () => {
    expect(() => rewrite("import { store } from '../../store/store';"))
      .toThrow('src/components/slides/TitleSlide.tsx imports "../../store/store", which has no package export');
    expect(() => rewrite("import './QuoteSlide.css';")).toThrow('a stylesheet that is not copied');
  });
});

describe('helpers', () => {
  it('slugifies folder names', () => {
    expect(slugify('My Talk!')).toBe('my-talk');
    expect(slugify('  Café 2026 ')).toBe('cafe-2026');
  });

  it('names the repository package.json declares', () => {
    const { repository } = JSON.parse(readFileSync(join(ENGINE_ROOT, 'package.json'), 'utf8'));
    expect(repository.url).toBe(`git+https://github.com/${GITHUB_SPEC.slice('github:'.length)}.git`);
  });

  it('reuses the spec an installed engine came from, or else the GitHub repository', () => {
    const installer = tempProject('installer');
    const engine = join(installer, 'node_modules/ok-vibe-slides');
    mkdirSync(engine, { recursive: true });
    const install = (dependencies: Record<string, string>) =>
      writeFileSync(join(installer, 'package.json'), JSON.stringify({ dependencies }));

    install({ 'ok-vibe-slides': 'github:okthink-ai/ok-vibe-slides#v1.2.0' });
    expect(defaultEngineSpec('/anywhere/talk', engine)).toBe('github:okthink-ai/ok-vibe-slides#v1.2.0');
    // A path only makes sense from the installing project.
    install({ 'ok-vibe-slides': 'file:../ok-vibe-slides' });
    expect(defaultEngineSpec('/anywhere/talk', engine)).toBe(GITHUB_SPEC);
    rmSync(join(installer, 'package.json'));
    expect(defaultEngineSpec('/anywhere/talk', engine)).toBe(GITHUB_SPEC);
  });

  it('points a checkout at itself with a relative file: path', () => {
    expect(defaultEngineSpec(join(ENGINE_ROOT, '.tmp/talk'))).toBe('file:../..');
  });
});
