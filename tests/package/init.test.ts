// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const ENGINE = resolve(import.meta.dirname, '../..');
// Inside the engine, so react and the type packages resolve from its node_modules.
const PROJECT = join(ENGINE, '.tmp/init-package-test/kickoff-talk');
const OUT = join(PROJECT, 'dist');

// Run the way a shell would: without Vitest's NODE_ENV=test and VITE_* variables.
const shellEnv = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => !['NODE_ENV', 'TEST', 'VITEST', 'MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL'].includes(key) && !key.startsWith('VITEST_') && !key.startsWith('VITE_')));

function run(args: string[], cwd = ENGINE) {
  return execFileSync(process.execPath, args, { cwd, encoding: 'utf8', env: shellEnv, stdio: ['ignore', 'pipe', 'pipe'] });
}

describe('ok-vibe-slides init', () => {
  let output = '';

  beforeAll(() => {
    rmSync(join(PROJECT, '..'), { recursive: true, force: true });
    output = run(['bin/ok-vibe-slides.mjs', 'init', relative(ENGINE, PROJECT), '--title', 'Kickoff Talk']);
    // Stand in for `npm install`: link the package to this checkout.
    mkdirSync(join(PROJECT, 'node_modules'), { recursive: true });
    symlinkSync(relative(join(PROJECT, 'node_modules'), ENGINE), join(PROJECT, 'node_modules/ok-vibe-slides'), 'dir');
    run([join(ENGINE, 'bin/ok-vibe-slides.mjs'), 'build'], PROJECT);
  }, 120_000);

  it('prints what it made and what to run next', () => {
    expect(output).toContain('Created an ok-vibe-slides project in .tmp/init-package-test/kickoff-talk');
    expect(output).toContain('src/data/presentations/kickoff-talk/');
    expect(output).toMatch(/npm run dev/);
  });

  it('builds the starter deck from the local templates without the built-in copies', () => {
    const html = readFileSync(join(OUT, 'index.html'), 'utf8');
    expect(html).toContain('<title>Kickoff Talk</title>');
    const assets = readdirSync(join(OUT, 'assets'));
    const css = assets.filter((file) => file.endsWith('.css')).map((file) => readFileSync(join(OUT, 'assets', file), 'utf8')).join('\n');
    const js = assets.filter((file) => file.endsWith('.js')).map((file) => readFileSync(join(OUT, 'assets', file), 'utf8')).join('\n');
    expect(js).toContain('kickoff-talk-');
    // Each template stylesheet ships once: the project's copy replaces the built-in.
    expect(css.match(/\.three-panel-slide\{/g)).toHaveLength(1);
    // Speaker notes and the manuscript stay out of the public bundle.
    const notes = readFileSync(join(PROJECT, 'src/data/presentations/kickoff-talk/notes.mjs'), 'utf8');
    const firstNote = notes.match(/^\s+'([^']{30,})',$/m)?.[1];
    expect(firstNote).toBeDefined();
    expect(js).not.toContain(firstNote);
  });

  it('type-checks against the package types', () => {
    expect(() => run([join(ENGINE, 'node_modules/typescript/bin/tsc'), '-p', PROJECT])).not.toThrow();
  }, 60_000);

  // node/init.test.ts covers what a refusal keeps; this checks the CLI reports it and exits non-zero.
  it('exits with an error when run over its own files', () => {
    expect(() => run(['bin/ok-vibe-slides.mjs', 'init', relative(ENGINE, PROJECT)])).toThrow(/ok-vibe-slides: init: these files already exist/);
  });
});
