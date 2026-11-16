import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The installed ok-show package: its app shell, templates, server, and tools. */
export const ENGINE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PACKAGE_NAME = 'ok-show';

export const CONFIG_FILES = [
  'ok-show.config.ts',
  'ok-show.config.mts',
  'ok-show.config.js',
  'ok-show.config.mjs',
];

export const DEFAULTS = Object.freeze({
  presentationsDir: 'src/data/presentations',
  templatesDir: 'src/components/slides',
  publicDir: 'public',
  outDir: 'dist',
});

const ENTRY_FILES = ['index.ts', 'index.tsx', 'index.js', 'index.mjs', 'index.jsx'];
const KNOWN_KEYS = new Set(['presentationsDir', 'templatesDir', 'publicDir', 'outDir', 'title', 'head', 'styles', 'vite']);

/** Identity helper so a project's config file gets editor completion. */
export function defineConfig(config) {
  return config;
}

const toPosix = (path) => path.split(sep).join('/');

/** A project-relative POSIX path for review packets, or the absolute path when it lies outside. */
export function projectRelative(root, path) {
  const rel = toPosix(relative(root, path));
  return rel.startsWith('../') || isAbsolute(rel) ? toPosix(path) : rel;
}

export function findConfigFile(root) {
  for (const name of CONFIG_FILES) {
    const file = join(root, name);
    if (existsSync(file)) return file;
  }
  return null;
}

/** The deck registry module: `<presentationsDir>/index.{ts,tsx,js,mjs,jsx}`. */
export function findPresentationsEntry(presentationsDir) {
  for (const name of ENTRY_FILES) {
    const file = join(presentationsDir, name);
    if (existsSync(file)) return file;
  }
  return null;
}

/**
 * How review packets should name engine files from the project's point of
 * view: '' when the project is the engine itself, otherwise the installed
 * package path (`node_modules/ok-show/`).
 */
export function engineDirFor(root, engineRoot = ENGINE_ROOT) {
  const realRoot = realpathSync(root);
  const realEngine = realpathSync(engineRoot);
  if (realRoot === realEngine) return '';
  const installed = join(root, 'node_modules', PACKAGE_NAME);
  if (existsSync(installed)) return `node_modules/${PACKAGE_NAME}/`;
  return `${projectRelative(realRoot, realEngine)}/`;
}

function stringOption(config, key, fallback) {
  const value = config[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`ok-show config: "${key}" must be a non-empty string`);
  }
  return value;
}

/**
 * Template stylesheets the inspector and review packets attribute to a
 * project-local template, keyed by component name (`EightPanelSlide.css` →
 * `EightPanelSlide`).
 */
export function listTemplateStylesheets(root, templatesDir) {
  if (!existsSync(templatesDir) || !statSync(templatesDir).isDirectory()) return {};
  return Object.fromEntries(readdirSync(templatesDir)
    .filter((name) => /^[A-Z][A-Za-z0-9]*\.css$/.test(name))
    .sort()
    .map((name) => [name.slice(0, -'.css'.length), projectRelative(root, join(templatesDir, name))]));
}

/** Folders in the presentations directory that hold a `manuscript.md`. */
export function listManuscripts(presentationsDir) {
  if (!existsSync(presentationsDir)) return [];
  return readdirSync(presentationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(presentationsDir, entry.name, 'manuscript.md')))
    .map((entry) => ({ presentationId: entry.name, file: join(presentationsDir, entry.name, 'manuscript.md') }))
    .sort((a, b) => a.presentationId.localeCompare(b.presentationId));
}

/**
 * Turn a raw config object into absolute paths. Kept separate from file
 * loading so it can be tested without a bundler.
 */
export function resolveProject(rawConfig = {}, { root = process.cwd(), configFile = null, engineRoot = ENGINE_ROOT } = {}) {
  if (rawConfig === null || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    throw new Error('ok-show config must export an object');
  }
  const unknown = Object.keys(rawConfig).filter((key) => !KNOWN_KEYS.has(key));
  if (unknown.length) {
    throw new Error(`ok-show config: unknown option${unknown.length === 1 ? '' : 's'} ${unknown.map((key) => `"${key}"`).join(', ')}`);
  }
  root = resolve(root);
  const presentationsDir = resolve(root, stringOption(rawConfig, 'presentationsDir', DEFAULTS.presentationsDir));
  const templatesDir = resolve(root, stringOption(rawConfig, 'templatesDir', DEFAULTS.templatesDir));
  const outDir = resolve(root, stringOption(rawConfig, 'outDir', DEFAULTS.outDir));
  const publicDir = rawConfig.publicDir === false
    ? false
    : resolve(root, stringOption(rawConfig, 'publicDir', DEFAULTS.publicDir));
  const title = rawConfig.title === undefined ? undefined : stringOption(rawConfig, 'title');
  const head = rawConfig.head ?? '';
  if (typeof head !== 'string') throw new Error('ok-show config: "head" must be an HTML string');
  const styleEntries = rawConfig.styles ?? [];
  if (!Array.isArray(styleEntries) || styleEntries.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw new Error('ok-show config: "styles" must be a list of stylesheet paths');
  }
  const styles = styleEntries.map((entry) => resolve(root, entry));
  const missingStyle = styles.find((file) => !existsSync(file));
  if (missingStyle) throw new Error(`ok-show config: stylesheet not found: ${projectRelative(root, missingStyle)}`);
  const vite = rawConfig.vite ?? {};
  if (vite === null || typeof vite !== 'object' || Array.isArray(vite)) {
    throw new Error('ok-show config: "vite" must be a Vite config object');
  }

  const presentationsEntry = findPresentationsEntry(presentationsDir);
  if (!presentationsEntry) {
    throw new Error(
      `ok-show: no deck registry in ${projectRelative(root, presentationsDir)}/. `
      + `Create ${projectRelative(root, join(presentationsDir, 'index.ts'))} exporting \`presentations: Presentation[]\`, `
      + 'or set "presentationsDir" in ok-show.config.',
    );
  }

  return {
    root,
    configFile,
    engineRoot,
    isEngine: realpathSync(root) === realpathSync(engineRoot),
    presentationsDir,
    presentationsEntry,
    templatesDir,
    publicDir,
    outDir,
    title,
    head,
    styles,
    vite,
    /** Paths as an agent working in the project should see them. */
    paths: {
      presentationsDir: projectRelative(root, presentationsDir),
      templatesDir: projectRelative(root, templatesDir),
      engineDir: engineDirFor(root, engineRoot),
    },
  };
}

/** Load `ok-show.config.*` from the project root (TypeScript is supported) and resolve it. */
export async function loadProject({ root = process.cwd(), configFile, command = 'serve', mode = 'development', engineRoot = ENGINE_ROOT } = {}) {
  root = resolve(root);
  const file = configFile ? resolve(root, configFile) : findConfigFile(root);
  let rawConfig = {};
  if (file) {
    if (!existsSync(file)) throw new Error(`ok-show: config file not found: ${file}`);
    const { loadConfigFromFile } = await import('vite');
    const loaded = await loadConfigFromFile({ command, mode, isSsrBuild: false, isPreview: false }, file, root, 'silent');
    rawConfig = loaded?.config ?? {};
  }
  return resolveProject(rawConfig, { root, configFile: file, engineRoot });
}
