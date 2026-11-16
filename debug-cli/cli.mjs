#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  APP_URL,
  appState,
  auditActiveSlide,
  launchBrowser,
  listTargets,
  navigate,
  setMobilePreview,
  setTheme,
  setViewport,
  themeSnapshot,
  withPage,
} from './browser.mjs';
import { COMMAND_HELP, COMMANDS } from './commands.mjs';
import { CONTROL_TOKEN_FILE, readDevServerFile, resolveControlToken } from '../server/control-token-file.mjs';

const SYNC_URL = process.env.SYNC_HTTP_URL || readDevServerFile().syncUrl || 'http://127.0.0.1:5200';

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) { positional.push(value); continue; }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) flags[key] = true;
    else { flags[key] = next; index += 1; }
  }
  return { positional, flags };
}

function output(value, flags) {
  if (flags.json || typeof value !== 'string') console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

function help() {
  return `debug-cli for ok-vibe-slides

Usage: ok-vibe-slides debug <command> [options]

${COMMAND_HELP}

Environment:
  CDP_URL        default http://127.0.0.1:9222
  APP_URL        default: the running dev server's URL (.tmp/dev-server.json), else http://localhost:5199
  CHROME_PATH    Chrome binary for \`browser\` (default: the usual install location)
  CHROME_PROFILE profile folder for \`browser\` (default .tmp/chrome-profile)
  SYNC_HTTP_URL  default: the running notes service (.tmp/dev-server.json), else http://127.0.0.1:5200
  SYNC_CONTROL_TOKEN  bearer token for session diagnostics and presenter benchmarks;
                      when unset, read from ${CONTROL_TOKEN_FILE}
                      (written by ok-vibe-slides dev)
`;
}

export async function fetchJson(path, { fetchImpl = fetch, syncUrl = SYNC_URL, controlToken = resolveControlToken() } = {}) {
  const headers = path === '/diagnostics' && controlToken
    ? { Authorization: `Bearer ${controlToken}` }
    : undefined;
  const response = await fetchImpl(`${syncUrl}${path}`, { headers });
  if (response.status === 401) {
    throw new Error('Sync server returned HTTP 401. Set SYNC_CONTROL_TOKEN to the token the sync server was started with'
      + ` (npm run dev writes it to ${CONTROL_TOKEN_FILE}).`);
  }
  if (!response.ok) throw new Error(`Sync server returned HTTP ${response.status}`);
  return response.json();
}

export { auditActiveSlide, withPage } from './browser.mjs';

export async function runCommand(argv, {
  fetchJsonImpl = fetchJson,
  withPageImpl = withPage,
  outputImpl = output,
  mkdirImpl = mkdir,
  resolveImpl = resolve,
  processImpl = process,
  controlTokenImpl = resolveControlToken,
  launchBrowserImpl = launchBrowser,
  listTargetsImpl = listTargets,
  appUrl = APP_URL,
} = {}) {
  const { positional, flags } = parseArgs(argv);
  const [command, first] = positional;
  if (!command || command === 'help' || flags.help) { console.log(help()); return; }
  const handler = COMMANDS[command];
  if (!handler) throw new Error(`Unknown command: ${command}\n\n${help()}`);
  const ctx = {
    appState,
    appUrl,
    auditActiveSlide,
    controlToken: controlTokenImpl,
    fetchJson: fetchJsonImpl,
    launchBrowser: launchBrowserImpl,
    listTargets: listTargetsImpl,
    mkdir: mkdirImpl,
    navigate,
    output: outputImpl,
    process: processImpl,
    resolve: resolveImpl,
    setMobilePreview,
    setTheme,
    setViewport,
    themeSnapshot,
    withPage: withPageImpl,
  };
  return handler({ command, first, flags, ctx });
}

if (process.argv[1]?.endsWith('cli.mjs')) {
  runCommand(process.argv.slice(2)).catch((error) => {
    if (process.argv.includes('--json')) console.log(JSON.stringify({ error: { code: 'ERROR', message: error.message } }, null, 2));
    else console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}
