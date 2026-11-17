// @vitest-environment node
import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { controlLinks, findFreePort, parseCliArgs } from './cli.mjs';

describe('parseCliArgs', () => {
  it('defaults to help', () => {
    expect(parseCliArgs([])).toEqual({ command: 'help', options: {}, forwarded: [] });
    expect(parseCliArgs(['--help']).command).toBe('help');
    expect(parseCliArgs(['--version']).command).toBe('version');
  });

  it('reads project and server options', () => {
    expect(parseCliArgs(['dev', '--root', 'talk', '--config=custom.config.ts', '--port', '5300', '--host', '0.0.0.0', '--mode', 'staging']))
      .toEqual({ command: 'dev', options: { root: 'talk', config: 'custom.config.ts', port: 5300, host: '0.0.0.0', mode: 'staging' }, forwarded: [] });
    expect(parseCliArgs(['dev', '--host']).options.host).toBe(true);
    expect(parseCliArgs(['dev', '--host', '--port', '5300']).options).toEqual({ host: true, port: 5300 });
  });

  it('rejects bad input with a pointer to help', () => {
    expect(() => parseCliArgs(['serve'])).toThrow('Unknown command "serve"');
    expect(() => parseCliArgs(['dev', '--open'])).toThrow('Unknown option "--open" for dev');
    expect(() => parseCliArgs(['dev', '--https'])).toThrow('Unknown option "--https" for dev');
    expect(() => parseCliArgs(['dev', '--port', 'abc'])).toThrow('--port must be a port number');
    expect(() => parseCliArgs(['dev', '--port', '70000'])).toThrow('--port must be a port number');
    expect(() => parseCliArgs(['dev', '--root'])).toThrow('--root needs a value');
  });

  it('reads the init folder, deck, title, engine, and flags', () => {
    expect(parseCliArgs(['init', 'talk', '--deck', 'kickoff', '--title=Kick Off', '--engine', '^0.1.0', '--install', '--force'])).toEqual({
      command: 'init',
      options: { dir: 'talk', deck: 'kickoff', title: 'Kick Off', engine: '^0.1.0', install: true, force: true },
      forwarded: [],
    });
    expect(parseCliArgs(['init']).options).toEqual({});
    expect(() => parseCliArgs(['init', 'a', 'b'])).toThrow();
    expect(() => parseCliArgs(['dev', '--deck', 'x'])).toThrow('Unknown option "--deck" for dev');
    expect(() => parseCliArgs(['dev', '--force'])).toThrow('Unknown option "--force" for dev');
  });

  it('accepts only the options a command reads', () => {
    expect(() => parseCliArgs(['init', '--root', 'talk'])).toThrow('Unknown option "--root" for init');
    expect(() => parseCliArgs(['init', '--port', '5300'])).toThrow('Unknown option "--port" for init');
    expect(() => parseCliArgs(['build', '--host'])).toThrow('Unknown option "--host" for build');
    expect(() => parseCliArgs(['sync', '--port', '5300'])).toThrow('Unknown option "--port" for sync');
    expect(parseCliArgs(['build', '--mode', 'staging']).options).toEqual({ mode: 'staging' });
    expect(parseCliArgs(['preview', '--port', '4000']).options).toEqual({ port: 4000 });
  });

  it('forwards tool arguments while still reading the project root', () => {
    expect(parseCliArgs(['debug', 'goto', '3', '--json', '--root', 'talk'])).toEqual({
      command: 'debug', options: { root: 'talk' }, forwarded: ['goto', '3', '--json'],
    });
    expect(parseCliArgs(['audit', '--port', '1']).forwarded).toEqual(['--port', '1']);
  });
});

describe('controlLinks', () => {
  it('puts the session and token on deck and presenter links', () => {
    expect(controlLinks({ localUrl: 'http://localhost:5199/', networkUrls: ['http://10.0.0.2:5199/'], token: 'abc' })).toEqual({
      deck: 'http://localhost:5199/?session=default&token=abc',
      presenter: 'http://localhost:5199/notes?session=default&token=abc',
      remotePresenters: ['http://10.0.0.2:5199/notes?session=default&token=abc'],
    });
  });
});

describe('findFreePort', () => {
  it('skips a port that is taken', async () => {
    const start = await findFreePort(45_100, { host: '127.0.0.1' });
    const busy = createServer();
    await new Promise<void>((resolve) => busy.listen(start, '127.0.0.1', resolve));
    try {
      expect(await findFreePort(start, { host: '127.0.0.1' })).toBeGreaterThan(start);
    } finally {
      await new Promise((resolve) => busy.close(resolve));
    }
  });
});
