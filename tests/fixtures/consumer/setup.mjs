// Links this fixture to the engine checkout, the way `npm install file:../..` would,
// without running an install. The tests call this before using the fixture.
import { existsSync, lstatSync, mkdirSync, symlinkSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = dirname(fileURLToPath(import.meta.url));
const engine = resolve(fixture, '../../..');

export function linkFixture() {
  const modules = join(fixture, 'node_modules');
  const link = join(modules, 'ok-show');
  mkdirSync(modules, { recursive: true });
  if (!existsSync(link) && !isSymlink(link)) symlinkSync(relative(modules, engine), link, 'dir');
  return fixture;
}

function isSymlink(path) {
  try { return lstatSync(path).isSymbolicLink(); } catch { return false; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) linkFixture();
