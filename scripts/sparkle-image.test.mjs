// @vitest-environment node
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  acceptedQuote,
  buildGenerateRequest,
  buildVideoRequest,
  catalogStylePath,
  parseArgs,
  processIsAlive,
  selectCatalogStyles,
  withManifestLock,
} from './sparkle-image.mjs';

function lockPathInTempDir() {
  return join(mkdtempSync(join(tmpdir(), 'sparkle-lock-')), '.tmp', 'sparkle-image-manifest.lock');
}

function deadPid() {
  const { pid } = spawnSync(process.execPath, ['-e', '']);
  expect(processIsAlive(pid)).toBe(false);
  return pid;
}

describe('Sparkle CLI argument mapping', () => {
  it('maps the deployed image generation options', () => {
    const parsed = parseArgs([
      'generate',
      'A source-grounded illustration',
      '--model',
      'gpt-image-2',
      '--style-json',
      '{"prompt":"editorial ink"}',
      '--character-json',
      '{"name":"Caretaker","details":{"role":"engineer"}}',
      '--sticker',
      '--background',
      'transparent',
      '--compression',
      '80',
      '--input-image-url',
      'https://example.com/first.png',
      '--input-image-url',
      'https://example.com/second.png',
    ]);

    expect(buildGenerateRequest(parsed, parsed.positionals[0], 'webp')).toEqual({
      prompt: 'A source-grounded illustration',
      model: 'gpt-image-2',
      mode: 'async',
      settings: {
        size: '1536x864',
        quality_gpt: 'medium',
        output_format: 'webp',
        background: 'transparent',
        output_compression: 80,
        input_image_urls: [
          'https://example.com/first.png',
          'https://example.com/second.png',
        ],
      },
      style: { prompt: 'editorial ink' },
      character: { name: 'Caretaker', details: { role: 'engineer' } },
      sticker_mode: true,
    });
  });

  it('maps the deployed quoted video request fields', () => {
    const parsed = parseArgs([
      'video-quote',
      '--source-job',
      'image-job-1',
      '--video-model',
      'seedance-1.5-pro',
      '--prompt',
      'Slow ambient motion',
      '--action',
      'idle',
      '--loop',
      'seamless',
      '--duration',
      '8',
      '--fps',
      '12',
      '--aspect-ratio',
      '1:1',
      '--resolution',
      '1080p',
      '--camera-fixed',
      '--seed',
      '42',
    ]);

    expect(buildVideoRequest(parsed)).toEqual({
      sourceJobId: 'image-job-1',
      videoModelId: 'seedance-1.5-pro',
      prompt: 'Slow ambient motion',
      action: 'idle',
      loopMode: 'seamless',
      durationSeconds: 8,
      exportFps: 12,
      aspectRatio: '1:1',
      resolution: '1080p',
      cameraFixed: true,
      seed: 42,
    });
  });

  it('requires explicit acceptance of the current video price', () => {
    const quote = {
      customerPriceCents: 75,
      priceVersion: 'video-2026-08-01',
      expiresAt: '9999-12-31T23:59:59.999Z',
    };

    expect(acceptedQuote(quote, '75')).toEqual(quote);
    expect(() => acceptedQuote(quote, '74')).toThrow('does not match');
    expect(() => acceptedQuote(quote)).toThrow('--accept-price 75');
  });

  it('rejects a saved style combined with an inline style', () => {
    const parsed = parseArgs([
      'generate',
      'Prompt',
      '--style',
      'editorial',
      '--style-json',
      '{"prompt":"inline"}',
    ]);

    expect(() => buildGenerateRequest(parsed, 'Prompt', 'png')).toThrow('mutually exclusive');
  });

  it('does not send OpenAI defaults to other deployed providers', () => {
    const parsed = parseArgs(['generate', 'Prompt', '--model', 'nano-banana-2']);

    expect(buildGenerateRequest(parsed, 'Prompt', 'png').settings).toEqual({
      output_format: 'png',
    });
    expect(() => buildGenerateRequest(parsed, 'Prompt', 'webp')).toThrow('PNG output only');
  });

  it('discovers styles from the built-in catalog namespace used by generation', () => {
    expect(catalogStylePath('paperwhite one-bit')).toBe(
      '/v1/styles/catalog/paperwhite%20one-bit',
    );
  });

  it('limits and filters the built-in catalog without querying saved styles', () => {
    const catalog = {
      styles: [
        { id: 'ink', category: 'drawing', createdAt: '2026-01-01' },
        { id: 'paperwhite-one-bit', category: 'new-styles', createdAt: '2026-08-17' },
        { id: 'other-pixel', category: 'pixel', createdAt: '2026-07-01' },
      ],
      categories: [{ name: 'Pixel Art', styleIds: ['paperwhite-one-bit', 'other-pixel'] }],
      sections: [],
    };

    expect(selectCatalogStyles(catalog, { category: 'Pixel Art', limit: 1 })).toEqual({
      styles: [
        { id: 'paperwhite-one-bit', category: 'new-styles', createdAt: '2026-08-17' },
      ],
      cursor: null,
      hasMore: true,
    });
    expect(selectCatalogStyles(catalog, { category: 'new-styles', limit: 100 })).toEqual({
      styles: [
        { id: 'paperwhite-one-bit', category: 'new-styles', createdAt: '2026-08-17' },
      ],
      cursor: null,
      hasMore: false,
    });
  });
});

describe('Sparkle manifest lock', () => {
  it('releases the lock after the operation, even when it fails', async () => {
    const lockPath = lockPathInTempDir();
    await expect(withManifestLock(async () => {
      expect(readFileSync(lockPath, 'utf8').split('\n')[0]).toBe(String(process.pid));
      return 'done';
    }, { lockPath })).resolves.toBe('done');
    expect(existsSync(lockPath)).toBe(false);

    await expect(withManifestLock(async () => { throw new Error('boom'); }, { lockPath })).rejects.toThrow('boom');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('replaces a lock whose recorded process has exited', async () => {
    const lockPath = lockPathInTempDir();
    await withManifestLock(async () => {}, { lockPath }); // creates the directory
    writeFileSync(lockPath, `${deadPid()}\n2026-01-01T00:00:00.000Z\n`);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(withManifestLock(async () => 'ran', { lockPath })).resolves.toBe('ran');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('removed stale Sparkle manifest lock'));
    expect(existsSync(lockPath)).toBe(false);
    warn.mockRestore();
  });

  it('refuses a lock held by a running process', async () => {
    const lockPath = lockPathInTempDir();
    await withManifestLock(async () => {}, { lockPath });
    writeFileSync(lockPath, `${process.ppid}\n2026-01-01T00:00:00.000Z\n`);
    const operation = vi.fn();

    await expect(withManifestLock(operation, { lockPath })).rejects.toThrow(`process ${process.ppid} is still running`);
    expect(operation).not.toHaveBeenCalled();
    expect(readFileSync(lockPath, 'utf8')).toContain(String(process.ppid));
  });

  it('releases the lock and exits on SIGINT or SIGTERM', async () => {
    for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]]) {
      const lockPath = lockPathInTempDir();
      const fakeProcess = Object.assign(new EventEmitter(), { exit: vi.fn() });
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      let started;
      const running = new Promise((resolve) => { started = resolve; });
      void withManifestLock(() => { started(); return new Promise(() => {}); }, { lockPath, processImpl: fakeProcess });
      await running;
      expect(existsSync(lockPath)).toBe(true);

      fakeProcess.emit(signal);
      expect(existsSync(lockPath)).toBe(false);
      expect(fakeProcess.exit).toHaveBeenCalledWith(exitCode);
      error.mockRestore();
    }
  });

  it('leaves no lock behind when a real run is interrupted with Ctrl+C', async () => {
    const lockPath = lockPathInTempDir();
    const script = join(mkdtempSync(join(tmpdir(), 'sparkle-lock-script-')), 'hold-lock.mjs');
    const modulePath = fileURLToPath(new URL('./sparkle-image.mjs', import.meta.url));
    writeFileSync(script, `
      import { withManifestLock } from ${JSON.stringify(modulePath)};
      // Stand-in for job polling: keeps the process busy until it is interrupted.
      await withManifestLock(() => { console.log('locked'); return new Promise(() => setInterval(() => {}, 1000)); }, { lockPath: ${JSON.stringify(lockPath)} });
    `);
    const child = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      child.stdout.on('data', (chunk) => { if (String(chunk).includes('locked')) resolve(); });
      child.once('exit', (code) => reject(new Error(`child exited early with ${code}`)));
    });
    expect(existsSync(lockPath)).toBe(true);

    const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
    child.kill('SIGINT');
    await expect(exited).resolves.toBe(130);
    expect(existsSync(lockPath)).toBe(false);
  });
});
