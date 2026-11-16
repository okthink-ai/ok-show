import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Where `ok-vibe-slides dev` records the control token it generated in a
 * project, so local tools (the debug CLI) can authenticate without the token
 * ever reaching the browser bundle. Projects should git-ignore `.tmp/`.
 */
export const controlTokenFile = (root = process.cwd()) => join(resolve(root), '.tmp/sync-control-token');

/** The token file for the project in the current directory, where the debug CLI runs. */
export const CONTROL_TOKEN_FILE = controlTokenFile();

/** Where `ok-vibe-slides dev` records the app and notes-service URLs it is serving. */
export const devServerFile = (root = process.cwd()) => join(resolve(root), '.tmp/dev-server.json');

export function writeDevServerFile(state, path = devServerFile()) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

/** `{ appUrl, syncUrl, pid }` from a running dev server, or `{}`. */
export function readDevServerFile(path = devServerFile()) {
  try {
    const state = JSON.parse(readFileSync(path, 'utf8'));
    return state && typeof state === 'object' ? state : {};
  } catch {
    return {};
  }
}

/** Remove the file only if this process wrote it. */
export function removeDevServerFile(pid = process.pid, path = devServerFile()) {
  if (readDevServerFile(path).pid === pid) rmSync(path, { force: true });
}

export function writeControlTokenFile(token, path = CONTROL_TOKEN_FILE) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${token}\n`, { mode: 0o600 });
  // `mode` only applies when the file is created; tighten an existing file too.
  chmodSync(path, 0o600);
}

export function readControlTokenFile(path = CONTROL_TOKEN_FILE) {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return '';
  }
}

/** Remove the file only if it still holds this process's token. */
export function removeControlTokenFile(token, path = CONTROL_TOKEN_FILE) {
  if (token && readControlTokenFile(path) === token) rmSync(path, { force: true });
}

/** The token a local tool should send: the environment wins, then the dev server's file. */
export function resolveControlToken({ env = process.env, path = CONTROL_TOKEN_FILE } = {}) {
  return env.SYNC_CONTROL_TOKEN || readControlTokenFile(path);
}
