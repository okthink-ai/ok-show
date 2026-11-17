import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, watch } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import {
  controlTokenFile,
  devServerFile,
  removeControlTokenFile,
  removeDevServerFile,
  writeControlTokenFile,
  writeDevServerFile,
} from '../server/control-token-file.mjs';
import { NOTE_FILES, loadAllPresentationNotes, loadPresentationNotes } from '../server/presentation-notes.mjs';
import { createSyncServer } from '../server/sync-server.mjs';
import { INIT_HELP, init } from './init.mjs';
import { ENGINE_ROOT, loadProject } from './project.mjs';
import { applyProjectTranslationEnv } from './project-env.mjs';

const ENGINE_VITE_CONFIG = join(ENGINE_ROOT, 'vite.config.ts');
const DEFAULT_SYNC_PORT = 5200;
const LINK_SESSION = 'default';

export const HELP = `ok-show — presentation engine and authoring tools

Usage: ok-show <command> [options]

Commands:
  init [dir]         Create a project: a starter deck, speaker notes, templates,
                     and brand styles to edit (init --help)
  dev                Start the authoring server: deck, presenter (/notes),
                     speaker notes, practice, and the developer tools drawer
  build              Build the public site (deck, navigation, export) into outDir
  preview            Serve the built site
  sync               Run only the speaker-notes service
  debug <command>    Debug CLI against the running dev server (debug help)
  audit              Audit every slide in the running deck (debug audit-slides)
  sparkle <command>  Sparkle image and video asset CLI (sparkle help)
  info               Print the resolved project configuration
  help               Show this help

Options:
  --root <dir>       Project root (default: current directory)
  --config <file>    Config file (default: ok-show.config.{ts,mts,js,mjs})
  --mode <mode>      Vite mode
  --host [host]      dev/preview: listen on all addresses, or on <host>
  --port <port>      dev/preview: port, which must be free (default: 5199 or
                     the next free port for dev, 4173 for preview)

Environment:
  SYNC_PORT           Internal notes-service port (default: first free from 5200)
  SYNC_CONTROL_TOKEN  Control token (default: random per run)
  SYNC_STATE_FILE     Session state file (default: <root>/.speaker-sync/state.json)
`;

const PASSTHROUGH = new Set(['debug', 'audit', 'sparkle']);
const PROJECT_OPTIONS = ['--root', '--config', '--mode'];
const SERVER_OPTIONS = [...PROJECT_OPTIONS, '--host', '--port'];
const TOOL_OPTIONS = ['--root', '--config'];
/** The options each command reads. Passthrough commands forward everything else. */
const COMMAND_OPTIONS = {
  init: new Set(['--deck', '--title', '--engine', '--install', '--force']),
  dev: new Set(SERVER_OPTIONS),
  build: new Set(PROJECT_OPTIONS),
  preview: new Set(SERVER_OPTIONS),
  sync: new Set(PROJECT_OPTIONS),
  debug: new Set(TOOL_OPTIONS),
  audit: new Set(TOOL_OPTIONS),
  sparkle: new Set(TOOL_OPTIONS),
  info: new Set(PROJECT_OPTIONS),
  help: new Set(),
};
/** Options that take no value. `--host` takes an optional one. */
const FLAGS = new Set(['--install', '--force']);

/**
 * Split argv into a command, its own options, and (for passthrough commands)
 * the arguments forwarded to the wrapped tool.
 */
export function parseCliArgs(argv) {
  const [first, ...rest] = argv;
  const command = first === undefined || first === '--help' || first === '-h' ? 'help' : first;
  if (command === '--version' || command === '-v') return { command: 'version', options: {}, forwarded: [] };
  if (!Object.hasOwn(COMMAND_OPTIONS, command)) throw new Error(`Unknown command "${command}". Run ok-show help.`);
  const accepted = COMMAND_OPTIONS[command];
  const options = {};
  const forwarded = [];
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const [name, inline] = arg.startsWith('--') && arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    if (FLAGS.has(arg) && accepted.has(arg)) {
      options[arg.slice(2)] = true;
    } else if (name === '--host' && accepted.has(name)) {
      const next = rest[index + 1];
      if (inline !== undefined) options.host = inline;
      else if (next && !next.startsWith('-')) { options.host = next; index += 1; }
      else options.host = true;
    } else if (accepted.has(name) && !FLAGS.has(name)) {
      const value = inline ?? rest[index + 1];
      if (value === undefined || (inline === undefined && value.startsWith('--'))) throw new Error(`${name} needs a value`);
      if (inline === undefined) index += 1;
      options[name.slice(2)] = value;
    } else if (command === 'init' && !arg.startsWith('-') && options.dir === undefined) {
      options.dir = arg;
    } else if (PASSTHROUGH.has(command)) {
      forwarded.push(arg);
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown option "${arg}" for ${command}. Run ok-show help.`);
    }
  }
  if (options.port !== undefined) {
    const port = Number(options.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error(`--port must be a port number, got "${options.port}"`);
    options.port = port;
  }
  return { command, options, forwarded };
}

function isPortFree(port, host) {
  return new Promise((resolvePort) => {
    const probe = createNetServer();
    probe.once('error', () => resolvePort(false));
    probe.listen(port, host, () => probe.close(() => resolvePort(true)));
  });
}

/** The first free port at or after `start`. */
export async function findFreePort(start, { host = '0.0.0.0', attempts = 50 } = {}) {
  for (let port = start; port < start + attempts; port += 1) {
    if (await isPortFree(port, host)) return port;
  }
  throw new Error(`No free port in ${start}–${start + attempts - 1}`);
}

/** Deck and presenter links carrying this run's control token. */
export function controlLinks({ localUrl, networkUrls = [], token, session = LINK_SESSION }) {
  const query = new URLSearchParams({ session, token }).toString();
  const origin = (url) => url.replace(/\/+$/, '');
  return {
    deck: `${origin(localUrl)}/?${query}`,
    presenter: `${origin(localUrl)}/notes?${query}`,
    remotePresenters: networkUrls.map((url) => `${origin(url)}/notes?${query}`),
  };
}

function setViteEnvironment(project, extra = {}) {
  // vite.config.ts reads the project from here; see its header comment.
  process.env.OK_SHOW_ROOT = project.root;
  if (project.configFile) process.env.OK_SHOW_CONFIG = project.configFile;
  else delete process.env.OK_SHOW_CONFIG;
  Object.assign(process.env, extra);
}

async function startSyncServer(project, { port, log = console.log } = {}) {
  const syncPort = port ?? (process.env.SYNC_PORT ? Number(process.env.SYNC_PORT) : await findFreePort(DEFAULT_SYNC_PORT));
  const controlToken = process.env.SYNC_CONTROL_TOKEN || randomBytes(24).toString('hex');
  const { notesByPresentation, sparkleByPresentation, presentationIds } = await loadAllPresentationNotes({ directory: project.presentationsDir });
  const syncServer = createSyncServer({
    port: syncPort,
    controlToken,
    stateFile: process.env.SYNC_STATE_FILE || join(project.root, '.speaker-sync/state.json'),
    notesByPresentation,
    sparkleByPresentation,
    presentationIds,
  });
  await syncServer.listen();

  // The sync server imports notes once at startup; re-import on edit so an open
  // presenter view never reads notes older than the slides Vite is serving.
  const pendingReloads = new Map();
  const reloadNotes = async (presentationId) => {
    try {
      const { notes, sparkle } = await loadPresentationNotes(presentationId, { directory: project.presentationsDir, version: Date.now() });
      if (!notes) return;
      syncServer.reloadNotes(presentationId, notes, sparkle);
      log(`[ok-show] reloaded speaker notes for ${presentationId}`);
    } catch (error) {
      console.warn(`[ok-show] could not reload speaker notes for ${presentationId}: ${error.message}`);
    }
  };
  const watcher = watch(project.presentationsDir, { recursive: true }, (_event, file) => {
    if (!file || !NOTE_FILES.includes(basename(file))) return;
    const presentationId = dirname(file);
    if (presentationId === '.' || presentationId.includes('/') || presentationId.includes('\\')) return;
    // Editors write in bursts; reload once the file settles.
    clearTimeout(pendingReloads.get(presentationId));
    pendingReloads.set(presentationId, setTimeout(() => reloadNotes(presentationId), 100));
  });

  return {
    syncServer,
    syncPort,
    controlToken,
    close: async () => {
      watcher.close();
      for (const timer of pendingReloads.values()) clearTimeout(timer);
      await syncServer.close();
    },
  };
}

function onShutdown(close) {
  let closing = false;
  const handler = async (signal) => {
    if (closing) return;
    closing = true;
    try {
      await close();
    } finally {
      process.exit(signal === 'SIGINT' ? 130 : 143);
    }
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => handler(signal));
}

async function dev(project, options) {
  const sync = await startSyncServer(project);
  setViteEnvironment(project, { SYNC_PORT: String(sync.syncPort), VITE_ENABLE_DEBUG_CLI: 'true' });
  const tokenFile = controlTokenFile(project.root);
  const stateFile = devServerFile(project.root);

  const { createServer } = await import('vite');
  let server;
  try {
    server = await createServer({
      configFile: ENGINE_VITE_CONFIG,
      mode: options.mode,
      server: {
        ...(options.host !== undefined ? { host: options.host } : {}),
        ...(options.port !== undefined ? { port: options.port, strictPort: true } : {}),
      },
    });
    await server.listen();
  } catch (error) {
    await sync.close();
    throw error;
  }

  const cleanup = () => {
    removeControlTokenFile(sync.controlToken, tokenFile);
    removeDevServerFile(process.pid, stateFile);
  };
  process.once('exit', cleanup);
  onShutdown(async () => {
    await server.close();
    await sync.close();
    cleanup();
  });

  const { local = [], network = [] } = server.resolvedUrls ?? {};
  const localUrl = local[0] ?? `http://localhost:${server.config.server.port}/`;
  // The token never goes into the page bundle. Local tools such as the debug CLI
  // read it from this git-ignored file; browsers get it from the printed links.
  writeControlTokenFile(sync.controlToken, tokenFile);
  writeDevServerFile({ appUrl: localUrl.replace(/\/+$/, ''), syncUrl: `http://127.0.0.1:${sync.syncPort}`, pid: process.pid }, stateFile);

  const links = controlLinks({ localUrl, networkUrls: network, token: sync.controlToken });
  server.printUrls();
  console.log(`\n  Project   ${project.root}`);
  console.log(`  Decks     ${project.paths.presentationsDir}/`);
  console.log(`  Notes     speaker notes through /speaker-sync (internal port ${sync.syncPort})`);
  console.log('\n  Open these links; each carries this run\'s control token (also in');
  console.log(`  ${tokenFile}). Anyone with the token can drive the deck.`);
  console.log(`    Deck       ${links.deck}`);
  console.log(`    Presenter  ${links.presenter}`);
  for (const link of links.remotePresenters) console.log(`    Presenter  ${link}`);
  console.log('');
  server.bindCLIShortcuts({ print: false });
}

async function build(project, options) {
  setViteEnvironment(project);
  const { build: viteBuild } = await import('vite');
  await viteBuild({ configFile: ENGINE_VITE_CONFIG, mode: options.mode });
}

async function preview(project, options) {
  setViteEnvironment(project);
  const { preview: vitePreview } = await import('vite');
  const server = await vitePreview({
    configFile: ENGINE_VITE_CONFIG,
    mode: options.mode,
    preview: {
      ...(options.host !== undefined ? { host: options.host } : {}),
      ...(options.port !== undefined ? { port: options.port, strictPort: true } : {}),
    },
  });
  server.printUrls();
  server.bindCLIShortcuts({ print: true });
}

async function sync(project) {
  const service = await startSyncServer(project);
  const tokenFile = controlTokenFile(project.root);
  writeControlTokenFile(service.controlToken, tokenFile);
  process.once('exit', () => removeControlTokenFile(service.controlToken, tokenFile));
  onShutdown(service.close);
  console.log(`[ok-show] speaker notes service on ws://0.0.0.0:${service.syncPort}`);
  console.log(`[ok-show] control token in ${tokenFile}`);
}

function runTool(project, args, env = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, args, {
      cwd: project.root,
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    child.once('error', (error) => {
      console.error(error.message);
      resolveRun(1);
    });
    child.once('exit', (code, signal) => resolveRun(signal ? 1 : code ?? 1));
  });
}

export function info(project) {
  return {
    root: project.root,
    configFile: project.configFile,
    engineRoot: project.engineRoot,
    presentationsDir: project.paths.presentationsDir,
    presentationsEntry: project.presentationsEntry,
    templatesDir: project.paths.templatesDir,
    publicDir: project.publicDir,
    outDir: project.outDir,
    title: project.title ?? null,
    engineDir: project.paths.engineDir,
  };
}

export function version() {
  return JSON.parse(readFileSync(join(ENGINE_ROOT, 'package.json'), 'utf8')).version;
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options, forwarded } = parseCliArgs(argv);
  if (command === 'help' || options.help) {
    console.log(command === 'init' ? INIT_HELP : HELP);
    return 0;
  }
  if (command === 'version') {
    console.log(version());
    return 0;
  }
  if (command === 'init') {
    return init(options);
  }
  const root = resolve(options.root ?? process.cwd());
  const project = await loadProject({
    root,
    configFile: options.config,
    command: command === 'build' ? 'build' : 'serve',
    mode: options.mode ?? (command === 'build' || command === 'preview' ? 'production' : 'development'),
  });
  if (command === 'dev' || command === 'sync') {
    applyProjectTranslationEnv({ root: project.root, mode: options.mode ?? 'development' });
  }

  switch (command) {
    case 'dev': await dev(project, options); return undefined;
    case 'build': await build(project, options); return 0;
    case 'preview': await preview(project, options); return undefined;
    case 'sync': await sync(project); return undefined;
    case 'info': console.log(JSON.stringify(info(project), null, 2)); return 0;
    case 'debug': return runTool(project, [join(ENGINE_ROOT, 'debug-cli/cli.mjs'), ...forwarded]);
    case 'audit': return runTool(project, [join(ENGINE_ROOT, 'debug-cli/cli.mjs'), 'audit-slides', ...forwarded]);
    case 'sparkle':
      return runTool(
        project,
        [join(ENGINE_ROOT, 'scripts/with-env.mjs'), '--', process.execPath, join(ENGINE_ROOT, 'scripts/sparkle-image.mjs'), ...forwarded],
        { OK_SHOW_PRESENTATIONS_DIR: project.paths.presentationsDir },
      );
    default: throw new Error(`Unhandled command ${command}`);
  }
}
