// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { linkFixture } from '../fixtures/consumer/setup.mjs';

const ENGINE = resolve(import.meta.dirname, '../..');
const FIXTURE = linkFixture();
const OUT = join(FIXTURE, 'build');

// Run the way a shell would: without Vitest's NODE_ENV=test and VITE_* variables.
const shellEnv = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => !['NODE_ENV', 'TEST', 'VITEST', 'MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL'].includes(key) && !key.startsWith('VITEST_') && !key.startsWith('VITE_')));

function run(command: string, args: string[]) {
  return execFileSync(command, args, { cwd: ENGINE, encoding: 'utf8', env: shellEnv, stdio: ['ignore', 'pipe', 'pipe'] });
}

describe('a project that installs ok-vibe-slides', () => {
  beforeAll(() => {
    rmSync(OUT, { recursive: true, force: true });
    run(process.execPath, ['bin/ok-vibe-slides.mjs', 'build', '--root', FIXTURE]);
  }, 120_000);

  it('builds the public site into the configured outDir', () => {
    const html = readFileSync(join(OUT, 'index.html'), 'utf8');
    expect(html).toContain('<title>Fixture Talks</title>');
    expect(html).toContain('<meta name="fixture-head" content="from-config">');
    // The project's description replaces the engine's; the engine favicon stays.
    expect(html).toContain('<meta name="description" content="Fixture description">');
    expect(html).not.toContain('A presentation engine built with React and TypeScript');
    expect(html).toContain('href="/favicon.svg"');
    const bundle = readdirSync(join(OUT, 'assets'))
      .filter((file) => file.endsWith('.js') || file.endsWith('.css'))
      .map((file) => readFileSync(join(OUT, 'assets', file), 'utf8'))
      .join('\n');
    expect(bundle).toContain('Decks live in our repo now.');
    expect(bundle).toContain('.quote-slide__quote');
    expect(bundle).toMatch(/--color-accent:\s*(rgb\(228,\s*87,\s*46\)|#e4572e)/);
    expect(bundle).toContain('Install the package');
  });

  it('keeps private speaker notes and authoring tools out of the bundle', () => {
    const bundle = readdirSync(join(OUT, 'assets')).map((file) => readFileSync(join(OUT, 'assets', file), 'utf8')).join('\n');
    expect(bundle).not.toContain('FIXTURE-PRIVATE-NOTE');
    expect(bundle).not.toContain('Fixture manuscript opening line.');
    expect(bundle).not.toContain('__OK_VIBE_DEBUG__');
  });

  it('ships the project public files and fills the gaps from the engine', () => {
    expect(readFileSync(join(OUT, 'fixture-logo.svg'), 'utf8')).toContain('#e4572e');
    expect(existsSync(join(OUT, 'favicon.svg'))).toBe(true);
    expect(existsSync(join(OUT, 'placeholder-image.svg'))).toBe(true);
  });

  it('type-checks decks and templates against the package types', () => {
    expect(() => run(process.execPath, [join(ENGINE, 'node_modules/typescript/bin/tsc'), '-p', FIXTURE])).not.toThrow();
  }, 60_000);
});
