import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, posix, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { DEFAULTS, ENGINE_ROOT, PACKAGE_NAME } from './project.mjs';

/**
 * `ok-show init` scaffolds a project that uses the engine as a
 * package. It copies the files an author edits while making a talk (the demo
 * deck, its speaker notes, Sparkle prompts and manuscript, the slide
 * templates, a brand stylesheet, the favicon) and leaves the app shell, tools,
 * and dev server in the installed package.
 */

const STARTER_DECK = 'src/data/presentations/demo';
const DECK_FILES = ['slides.tsx', 'notes.mjs', 'sparkle.mjs', 'manuscript.md'];
const STARTER_FILES = join(ENGINE_ROOT, 'node/init');
const STYLES_FILE = 'src/styles/brand.css';
const GITIGNORE = ['node_modules', 'dist', '.tmp', '.speaker-sync', '.env', '*.local'];
/** Files merged into, rather than refused, when they already exist. */
const MERGED = new Set(['package.json', '.gitignore']);
const DECK_ID = /^[a-z0-9][a-z0-9-]*$/;

const toPosix = (path) => path.split(sep).join('/');
const readEngine = (file) => readFileSync(join(ENGINE_ROOT, file), 'utf8');
const enginePackage = () => JSON.parse(readEngine('package.json'));

/** `My Talk!` → `my-talk`. */
export function slugify(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** `my-talk` → `My Talk`. */
function titleFromSlug(slug) {
  return slug.split('-').filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

/** `my-talk` → `myTalk`; `2026-talk` → `deck2026Talk`. */
function identifierFor(deckId) {
  const camel = deckId.replace(/-([a-z0-9])/g, (_match, character) => character.toUpperCase());
  return /^[a-z]/.test(camel) ? camel : `deck${camel[0].toUpperCase()}${camel.slice(1)}`;
}

/** The engine's GitHub repository (package.json `repository`), as an install spec. */
export const GITHUB_SPEC = 'github:okthink-ai/ok-show';

/**
 * The `ok-show` dependency the new project installs. An installed
 * engine (including an `npx github:…` run) reuses the spec it was installed
 * with, such as `github:okthink-ai/ok-show#v1.0.0`, or else the
 * package's GitHub repository. An engine checkout is linked with `file:`.
 */
export function defaultEngineSpec(targetDir, engineRoot = ENGINE_ROOT) {
  const realEngine = realpathSync(engineRoot);
  const segments = realEngine.split(sep);
  const modules = segments.lastIndexOf('node_modules');
  if (modules > 0) {
    const installer = join(segments.slice(0, modules).join(sep) || sep, 'package.json');
    let installedWith;
    try {
      const pkg = JSON.parse(readFileSync(installer, 'utf8'));
      installedWith = pkg.dependencies?.[PACKAGE_NAME] ?? pkg.devDependencies?.[PACKAGE_NAME];
    } catch {
      // No installing project: fall back to the repository.
    }
    // A path is relative to the installing project, so it can't be reused.
    if (installedWith && !/^(file:|link:|\.|\/|~)/.test(installedWith)) return installedWith;
    return GITHUB_SPEC;
  }
  return `file:${toPosix(relative(resolve(targetDir), realEngine))}`;
}

/**
 * Rewrites the relative imports of an engine file copied into the project.
 * Imports of other copied files stay relative (re-pointed at the copy);
 * everything else becomes a package import, so the copy keeps using the
 * engine as a library.
 */
export function rewriteImports(source, { from, to, copies }) {
  return source.replace(/(\bfrom\s+|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\2/g, (match, keyword, quote, specifier) => {
    const resolved = posix.normalize(posix.join(posix.dirname(from), specifier));
    // A stylesheet import travels with its copied component.
    const extension = resolved.endsWith('.css') ? '.css' : '';
    const target = resolved.slice(0, resolved.length - extension.length);
    let replacement;
    if (copies.has(target)) {
      replacement = posix.relative(posix.dirname(to), copies.get(target)) + extension;
      if (!replacement.startsWith('.')) replacement = `./${replacement}`;
    } else if (extension) {
      throw new Error(`init: ${from} imports "${specifier}", a stylesheet that is not copied`);
    } else if (target === 'src/types/slide.types' || target === 'src/types/speakerNotes.types') {
      replacement = PACKAGE_NAME;
    } else if (/^src\/components\/slides\/[A-Z]\w*$/.test(target)) {
      replacement = `${PACKAGE_NAME}/slides/${posix.basename(target)}`;
    } else if (/^src\/components\/[A-Z]\w*$/.test(target)) {
      replacement = `${PACKAGE_NAME}/components/${posix.basename(target)}`;
    } else {
      throw new Error(`init: ${from} imports "${specifier}", which has no package export`);
    }
    return `${keyword}${quote}${replacement}${quote}`;
  });
}

/** Renames the starter deck's `demo-*` slide IDs to `<deckId>-*` wherever they appear. */
function renameSlideIds(files, deckId) {
  if (deckId === 'demo') return files;
  const ids = [...files['slides.tsx'].matchAll(/\bid:\s*['"](demo-[a-z0-9-]+)['"]/g)].map((match) => match[1]);
  const pattern = new RegExp(`(?<![a-z0-9-])(${ids.join('|')})(?![a-z0-9-])`, 'g');
  return Object.fromEntries(Object.entries(files).map(([name, text]) => [
    name,
    ids.length ? text.replace(pattern, (id) => `${deckId}-${id.slice('demo-'.length)}`) : text,
  ]));
}

function packageJson({ name, engineSpec, existing }) {
  const engine = enginePackage();
  const scripts = {
    dev: 'ok-show dev',
    build: 'ok-show build',
    preview: 'ok-show preview',
    'type-check': 'tsc --noEmit',
    audit: 'ok-show audit',
    debug: 'ok-show debug',
  };
  const dependencies = {
    [PACKAGE_NAME]: engineSpec,
    react: engine.peerDependencies.react,
    'react-dom': engine.peerDependencies['react-dom'],
  };
  const devDependencies = {
    typescript: engine.devDependencies.typescript,
    '@types/react': engine.devDependencies['@types/react'],
    '@types/react-dom': engine.devDependencies['@types/react-dom'],
  };
  if (!existing) {
    return { name, private: true, version: '0.0.0', type: 'module', scripts, dependencies, devDependencies };
  }
  // Add what is missing and keep everything the project already declares.
  const declared = { ...existing.dependencies, ...existing.devDependencies };
  const missing = (entries) => Object.fromEntries(Object.entries(entries).filter(([key]) => !(key in declared)));
  return {
    ...existing,
    scripts: { ...scripts, ...existing.scripts },
    dependencies: { ...existing.dependencies, ...missing(dependencies) },
    devDependencies: { ...existing.devDependencies, ...missing(devDependencies) },
  };
}

function gitignore(existing) {
  if (existing === undefined) return `${GITIGNORE.join('\n')}\n`;
  const lines = new Set(existing.split(/\r?\n/).map((line) => line.trim()));
  const missing = GITIGNORE.filter((entry) => !lines.has(entry) && !lines.has(`${entry}/`));
  if (!missing.length) return existing;
  return `${existing}${existing.endsWith('\n') || existing === '' ? '' : '\n'}${missing.join('\n')}\n`;
}

const configFile = (title) => `import { defineConfig } from 'ok-show/config';

// Every option is optional. The commented values are the defaults.
export default defineConfig({
  title: ${JSON.stringify(title)},
  // Brand tokens and template overrides, loaded after the engine's styles.
  styles: [${JSON.stringify(STYLES_FILE)}],
  // presentationsDir: '${DEFAULTS.presentationsDir}', // deck folders and their index.ts registry
  // templatesDir: '${DEFAULTS.templatesDir}',     // your slide templates
  // publicDir: '${DEFAULTS.publicDir}',                         // images, video, favicon
  // outDir: '${DEFAULTS.outDir}',                              // ok-show build output
  // head: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
  // vite: {},                                     // merged over the engine's Vite config
});
`;

const TSCONFIG = `${JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    module: 'ESNext',
    moduleResolution: 'bundler',
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    moduleDetection: 'force',
    noEmit: true,
    jsx: 'react-jsx',
    strict: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    skipLibCheck: true,
    types: ['ok-show/client'],
  },
  include: ['src', 'ok-show.config.ts'],
}, null, 2)}\n`;

/**
 * Everything `init` writes, as project-relative paths and contents, without
 * touching the disk beyond reading the existing package.json and .gitignore.
 */
export function planInit({ targetDir, deckId, title, engineSpec, date = new Date() }) {
  const root = resolve(targetDir);
  const folderSlug = slugify(basename(root));
  const projectSlug = folderSlug || 'slides';
  const deck = deckId ?? (folderSlug || 'my-talk');
  if (!DECK_ID.test(deck)) throw new Error(`init: deck id "${deck}" must be lowercase letters, digits, and dashes`);
  const deckTitle = title ?? titleFromSlug(deck);
  const deckDir = `${DEFAULTS.presentationsDir}/${deck}`;

  // Every built-in template (and SlideHeader), keyed by engine path without extension.
  const templateNames = readdirSync(join(ENGINE_ROOT, DEFAULTS.templatesDir))
    .filter((name) => /^[A-Z]\w*\.tsx$/.test(name) && !name.includes('.test.'))
    .map((name) => name.slice(0, -'.tsx'.length))
    .sort();
  const copies = new Map();
  for (const name of templateNames) copies.set(`src/components/slides/${name}`, `${DEFAULTS.templatesDir}/${name}`);
  copies.set(`${STARTER_DECK}/slides`, `${deckDir}/slides`);

  const files = new Map();
  const readExisting = (file) => (existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : undefined);

  const existingPackage = readExisting('package.json');
  let parsedPackage;
  if (existingPackage !== undefined) {
    try {
      parsedPackage = JSON.parse(existingPackage);
    } catch (error) {
      throw new Error(`init: package.json is not valid JSON: ${error.message}`);
    }
  }
  files.set('package.json', `${JSON.stringify(packageJson({
    name: projectSlug,
    engineSpec: engineSpec ?? defaultEngineSpec(root),
    existing: parsedPackage,
  }), null, 2)}\n`);
  files.set('.gitignore', gitignore(readExisting('.gitignore')));
  files.set('ok-show.config.ts', configFile(deckTitle));
  files.set('tsconfig.json', TSCONFIG);
  for (const name of ['README.md', 'AGENTS.md']) {
    const text = readFileSync(join(STARTER_FILES, name), 'utf8');
    files.set(name, text.replaceAll('{{title}}', deckTitle).replaceAll('{{deckDir}}', deckDir));
  }
  files.set(STYLES_FILE, readFileSync(join(STARTER_FILES, 'brand.css'), 'utf8'));
  files.set('public/favicon.svg', readEngine('public/favicon.svg'));

  // Templates: the component with its imports re-pointed, and its stylesheet.
  for (const name of templateNames) {
    const from = `src/components/slides/${name}.tsx`;
    const to = `${DEFAULTS.templatesDir}/${name}.tsx`;
    files.set(to, rewriteImports(readEngine(from), { from, to, copies }));
    if (existsSync(join(ENGINE_ROOT, `src/components/slides/${name}.css`))) {
      files.set(`${DEFAULTS.templatesDir}/${name}.css`, readEngine(`src/components/slides/${name}.css`));
    }
  }

  // The starter deck: the engine's demo, under the new deck id.
  const deckFiles = renameSlideIds(
    Object.fromEntries(DECK_FILES.map((name) => [name, readEngine(`${STARTER_DECK}/${name}`)])),
    deck,
  );
  deckFiles['slides.tsx'] = rewriteImports(deckFiles['slides.tsx'], {
    from: `${STARTER_DECK}/slides.tsx`,
    to: `${deckDir}/slides.tsx`,
    copies,
  });
  deckFiles['manuscript.md'] = deckFiles['manuscript.md'].replace(/^# .*$/m, `# ${deckTitle}`);
  for (const [name, text] of Object.entries(deckFiles)) files.set(`${deckDir}/${name}`, text);

  const identifier = identifierFor(deck);
  const month = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  files.set(`${deckDir}/index.ts`, `import type { Presentation } from 'ok-show';
import { slides } from './slides';

export const ${identifier}: Presentation = {
  id: ${JSON.stringify(deck)},
  title: ${JSON.stringify(deckTitle)},
  description: 'Starter deck with every built-in template. Replace these slides with your own.',
  date: ${JSON.stringify(month)},
  slides,
};
`);
  files.set(`${DEFAULTS.presentationsDir}/index.ts`, `import type { Presentation } from 'ok-show';
import { ${identifier} } from './${deck}';

/** Every deck in this project, in the order the deck picker lists them. */
export const presentations: Presentation[] = [${identifier}];
`);

  return { root, deckId: deck, title: deckTitle, files };
}

/** Writes a plan. Refuses to overwrite existing files (other than merged ones) unless `force`. */
export function writeInit(plan, { force = false } = {}) {
  const conflicts = [...plan.files.keys()].filter((file) => !MERGED.has(file) && existsSync(join(plan.root, file)));
  if (conflicts.length && !force) {
    throw new Error(
      `init: these files already exist in ${plan.root}:\n${conflicts.map((file) => `  ${file}`).join('\n')}\n`
      + 'Run init in an empty folder, or pass --force to overwrite them.',
    );
  }
  for (const [file, contents] of plan.files) {
    const path = join(plan.root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  return { overwritten: conflicts };
}

function packageManager() {
  const agent = process.env.npm_config_user_agent ?? '';
  const name = agent.split('/')[0];
  return ['pnpm', 'yarn', 'bun'].includes(name) ? name : 'npm';
}

function install(root, manager) {
  return new Promise((resolveInstall) => {
    const child = spawn(manager, ['install'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', (error) => {
      console.error(error.message);
      resolveInstall(1);
    });
    child.once('exit', (code) => resolveInstall(code ?? 1));
  });
}

export const INIT_HELP = `ok-show init — create a project that uses ok-show as a package

Usage: ok-show init [dir] [options]

Copies the files you edit while making a talk into [dir] (default: the
current folder): a starter deck with speaker notes, Sparkle prompts and a
practice manuscript, every built-in slide template, a brand stylesheet, the
favicon, and a config. The app, presenter, tools, and dev server stay in the
installed package.

Options:
  --deck <id>      Deck id and folder name (default: the folder name)
  --title <text>   Deck and page title (default: from the deck id)
  --engine <spec>  ok-show dependency in package.json, such as
                   github:okthink-ai/ok-show#v1.0.0 (default: the spec
                   this copy was installed with, or a file: path to a checkout)
  --install        Run the package manager's install afterwards
  --force          Overwrite files that already exist
`;

/** Runs `ok-show init`. Resolves to an exit code. */
export async function init({ dir, deck, title, engine, install: runInstall = false, force = false } = {}) {
  const plan = planInit({ targetDir: dir ?? process.cwd(), deckId: deck, title, engineSpec: engine });
  const { overwritten } = writeInit(plan, { force });
  const where = relative(process.cwd(), plan.root) || '.';
  const manager = packageManager();

  console.log(`\n  Created an ok-show project in ${where}${overwritten.length ? ` (overwrote ${overwritten.length} files)` : ''}`);
  console.log(`  Your deck is in ${DEFAULTS.presentationsDir}/${plan.deckId}/ and the templates in ${DEFAULTS.templatesDir}/.`);
  console.log('  README.md describes every file.');

  if (runInstall) {
    console.log(`\n  Installing with ${manager}...\n`);
    const code = await install(plan.root, manager);
    if (code !== 0) return code;
  }
  console.log('\n  Next steps:');
  if (where !== '.') console.log(`    cd ${where.includes(' ') ? JSON.stringify(where) : where}`);
  if (!runInstall) console.log(`    ${manager} install`);
  console.log(`    ${manager} run dev\n`);
  return 0;
}
