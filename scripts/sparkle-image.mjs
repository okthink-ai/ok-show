import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_API_URL = 'https://us-central1-rm-image-maker.cloudfunctions.net/api';
/** Each deck keeps its own manifest beside the assets it describes. */
const DECK_MANIFEST_PATH = 'assets/generated/sparkle-manifest.json';
/** Set by the `ok-show sparkle` command from the project's config. */
const PRESENTATIONS_PATH = (process.env.OK_SHOW_PRESENTATIONS_DIR || 'src/data/presentations').replace(/\/+$/, '');
const PRESENTATION_OUTPUT_PATTERN = new RegExp(`^(${PRESENTATIONS_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^/]+)/`);
const MANIFEST_LOCK_PATH = '.tmp/sparkle-image-manifest.lock';
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 300;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
const COMMANDS = new Set([
  'affordability',
  'animate',
  'generate',
  'help',
  'models',
  'retry',
  'status',
  'styles',
  'validate',
  'video-models',
  'video-quote',
  'whoami',
]);
const VALUE_OPTIONS = new Set([
  '--accept-price',
  '--action',
  '--aspect-ratio',
  '--background',
  '--category',
  '--character-json',
  '--compression',
  '--count',
  '--cursor',
  '--duration',
  '--format',
  '--fps',
  '--idempotency-key',
  '--image-size',
  '--input-fidelity',
  '--job',
  '--limit',
  '--loop',
  '--manifest',
  '--model',
  '--moderation',
  '--output',
  '--prompt',
  '--prompt-file',
  '--quality',
  '--resolution',
  '--retries',
  '--seed',
  '--size',
  '--source-job',
  '--status',
  '--style',
  '--style-json',
  '--video-model',
]);
const LIST_OPTIONS = new Set(['--input-image-url']);
const FLAG_OPTIONS = new Set(['--camera-fixed', '--dry-run', '--force', '--help', '--json', '--sticker']);
const OPTION_ALIASES = new Map([
  ['-c', '--category'],
  ['-m', '--model'],
  ['-n', '--limit'],
]);

class SparkleApiError extends Error {
  constructor(code, message, status, details) {
    super(message);
    this.name = 'SparkleApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function usage() {
  return `Sparkle asset workflow

Usage:
  npm run sparkle -- generate "<prompt>" --output <image-path>
  npm run sparkle -- status [job-id]
  npm run sparkle -- retry <job-id> [--idempotency-key <key>]
  npm run sparkle -- styles [style-id]
  npm run sparkle -- models
  npm run sparkle -- affordability --model <id> [--count <n>]
  npm run sparkle -- video-models
  npm run sparkle -- video-quote --source-job <id> --video-model <id> --prompt "..."
  npm run sparkle -- animate --source-job <id> --video-model <id> --prompt "..." \\
    --accept-price <cents> --idempotency-key <key> --output <video-path>
  npm run sparkle -- whoami
  npm run sparkle -- validate [--manifest <path>]

Image generation:
  --prompt <text>              Prompt; may instead be the positional argument
  --prompt-file <path>         Read a UTF-8 prompt file
  --output <path>              Destination .png, .jpg/.jpeg, or .webp file
  --model <id>                 Default: gpt-image-2
  --style <id>                 Built-in Sparkle catalog style ID
  --style-json <json|@file>    Inline style object
  --character-json <json|@file> Inline character object
  --sticker                    Enable sticker mode
  --size <WxH>                 Default: 1536x864
  --quality <level>            Default: medium
  --background <mode>          auto, transparent, or opaque
  --compression <0-100>        JPEG/WebP output compression
  --moderation <mode>          auto or low
  --image-size <value>         fal.ai image-size setting
  --aspect-ratio <value>       fal.ai aspect-ratio setting
  --input-image-url <url>      Reference image URL; repeat for multiple inputs
  --input-fidelity <level>     high or low where supported
  --format <format>            png, jpeg, or webp; inferred from --output

Video generation:
  --source-job <id>            Owned completed Sparkle image job
  --video-model <id>           ID returned by video-models
  --action <action>            custom, walk, run, idle, jump, dance, wave, or attack
  --loop <mode>                one-shot or seamless
  --duration <seconds>         Model-supported integer duration
  --fps <fps>                  Export FPS for previews and GIF/WebP
  --aspect-ratio <ratio>       Model-supported video aspect ratio
  --resolution <value>         Model-supported resolution
  --camera-fixed               Seedance camera lock
  --seed <integer>             Seedance seed
  --accept-price <cents>       Exact quoted cents; required before animate spends
  --idempotency-key <key>      Stable 8-200 character key; required for animate/video retry

Shared:
  --manifest <path>            Asset provenance manifest (default: the output deck's
                               assets/generated/sparkle-manifest.json)
  --retries <count>            Transient request/download retries (default: 2)
  --force                      Replace an existing local asset and manifest entry
  --dry-run                    Print a request without API calls or file writes
  --json                       Accepted for compatibility; command output is already JSON
`;
}

function parseArgs(argv) {
  const args = [...argv];
  let command = 'generate';
  if (args[0] && !args[0].startsWith('-')) command = args.shift();
  if (!COMMANDS.has(command)) throw new Error(`Unknown command: ${command}`);

  const values = new Map();
  const lists = new Map();
  const flags = new Set();
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const rawArgument = args[index];
    const argument = OPTION_ALIASES.get(rawArgument) || rawArgument;
    if (FLAG_OPTIONS.has(argument)) {
      flags.add(argument);
      continue;
    }
    if (VALUE_OPTIONS.has(argument) || LIST_OPTIONS.has(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      if (LIST_OPTIONS.has(argument)) {
        lists.set(argument, [...(lists.get(argument) || []), value]);
      } else {
        values.set(argument, value);
      }
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) throw new Error(`Unknown option: ${rawArgument}`);
    positionals.push(argument);
  }

  return { command, flags, lists, positionals, values };
}

function repoPath(input, label) {
  const absolutePath = resolve(process.cwd(), input);
  const relativePath = relative(process.cwd(), absolutePath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`${label} must stay inside the repository: ${input}`);
  }
  return { absolutePath, relativePath: relativePath.split('\\').join('/') };
}

function readPrompt(parsed, { allowPositional = true } = {}) {
  const inlinePrompt = parsed.values.get('--prompt');
  const promptFile = parsed.values.get('--prompt-file');
  const positionalPrompt = allowPositional ? parsed.positionals[0] : undefined;
  const choices = [inlinePrompt, promptFile, positionalPrompt].filter(Boolean);
  if (choices.length > 1) {
    throw new Error('Use only one of a positional prompt, --prompt, or --prompt-file');
  }
  if (inlinePrompt?.trim()) return inlinePrompt.trim();
  if (positionalPrompt?.trim()) return positionalPrompt.trim();
  if (promptFile) {
    const file = repoPath(promptFile, '--prompt-file');
    const prompt = readFileSync(file.absolutePath, 'utf8').trim();
    if (prompt) return prompt;
  }
  throw new Error('A prompt is required');
}

function readJsonOption(value, label) {
  if (!value) return undefined;
  const source = value.startsWith('@')
    ? readFileSync(repoPath(value.slice(1), label).absolutePath, 'utf8')
    : value;
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`${label} must be valid JSON or @path-to-json`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must contain a JSON object`);
  }
  return parsed;
}

function integerOption(value, option, { fallback, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${option} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

function outputFormat(outputPath, explicitFormat) {
  const formats = new Map([
    ['.jpeg', 'jpeg'],
    ['.jpg', 'jpeg'],
    ['.png', 'png'],
    ['.webp', 'webp'],
  ]);
  const inferred = formats.get(extname(outputPath).toLowerCase());
  const format = explicitFormat?.toLowerCase() || inferred;
  if (!format || !new Set(['jpeg', 'png', 'webp']).has(format)) {
    throw new Error('--output must end in .png, .jpg/.jpeg, or .webp');
  }
  if (explicitFormat && inferred !== format) {
    throw new Error(`--format ${format} does not match the --output extension`);
  }
  return format;
}

function apiKey() {
  const key = process.env.SPARKLE_API_KEY;
  if (!key) {
    throw new Error(
      'Missing SPARKLE_API_KEY. Create a key in Sparkle Settings (https://sparkle.okthink.ai) and add it to .env',
    );
  }
  return key;
}

/** The public Sparkle API (https://sparkle.okthink.ai/docs/api-reference.html). */
function apiUrl() {
  return (process.env.SPARKLE_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
}

async function sparkle(endpoint, options = {}) {
  const response = await fetch(`${apiUrl()}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey(),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  const error = payload?.error || {};
  if (!response.ok || !payload?.ok || payload.data === undefined) {
    throw new SparkleApiError(
      error.code || `http_${response.status}`,
      error.message || 'Sparkle API request failed',
      error.status || response.status,
      error.details,
    );
  }
  return payload.data;
}

async function withRetries(label, retries, operation) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || (error instanceof SparkleApiError && error.status < 500)) break;
      const delayMs = Math.min(30_000, 2_000 * 2 ** attempt);
      console.warn(`${label}: ${error.message}; retrying in ${delayMs / 1_000}s`);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
    }
  }
  throw lastError;
}

async function waitForJob(jobId, label, retries) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const job = await withRetries(`${label} status`, retries, () =>
      sparkle(`/v1/images/jobs/${encodeURIComponent(jobId)}`),
    );
    console.log(`${label} ${jobId}: ${job.status}`);
    if (job.status === 'completed') return job;
    if (job.status === 'failed') {
      throw new Error(`${label} failed: ${job.error || job.errorCode || 'unknown error'}`);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, POLL_INTERVAL_MS));
  }
  throw new Error(`${label} timed out: ${jobId}`);
}

async function download(url, destination, retries) {
  const partialPath = `${destination}.partial-${process.pid}`;
  try {
    await withRetries('asset download', retries, async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(partialPath, bytes);
      renameSync(partialPath, destination);
      console.log(`saved ${relative(process.cwd(), destination)} (${bytes.length} bytes)`);
    });
  } finally {
    rmSync(partialPath, { force: true });
  }
}

function loadManifest(manifestPath) {
  if (!existsSync(manifestPath)) return { version: 1, assets: [] };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.assets)) throw new Error('Sparkle manifest must contain assets[]');
  return manifest;
}

function writeManifest(manifestPath, manifest) {
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 };

/** True when a process with this ID exists (EPERM means it exists but is not ours). */
function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readLock(lockPath) {
  try {
    const content = readFileSync(lockPath, 'utf8');
    const pid = Number.parseInt(content.split('\n')[0], 10);
    return { content, pid: Number.isSafeInteger(pid) && pid > 0 ? pid : null };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function acquireManifestLock(lockPath) {
  mkdirSync(dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      writeFileSync(lockPath, `${process.pid}\n${new Date().toISOString()}\n`, { flag: 'wx' });
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const owner = readLock(lockPath);
    if (!owner) continue; // Released between our attempt and the read.
    if (owner.pid && owner.pid !== process.pid && !processIsAlive(owner.pid)) {
      // Left behind by a run that was killed before it could clean up. Remove
      // it only if nobody replaced it in the meantime.
      if (readLock(lockPath)?.content === owner.content) rmSync(lockPath, { force: true });
      console.warn(`removed stale Sparkle manifest lock left by process ${owner.pid}`);
      continue;
    }
    const holder = owner.pid ? `process ${owner.pid} is still running` : 'its owner is unknown';
    throw new Error(
      `Sparkle manifest is locked by ${lockPath} (${holder}). Wait for that generation to finish; `
        + 'remove the file only if no Sparkle command is running.',
    );
  }
  throw new Error(`Could not acquire the Sparkle manifest lock ${lockPath}`);
}

/**
 * Hold the manifest lock for the whole operation. A `finally` block does not run
 * when the user presses Ctrl+C, so SIGINT/SIGTERM release the lock and exit, and
 * a later run treats a lock whose recorded process is gone as stale.
 */
async function withManifestLock(operation, { lockPath = MANIFEST_LOCK_PATH, processImpl = process } = {}) {
  acquireManifestLock(lockPath);
  const release = () => {
    if (readLock(lockPath)?.pid === process.pid) rmSync(lockPath, { force: true });
  };
  const signalHandlers = Object.entries(SIGNAL_EXIT_CODES).map(([signal, exitCode]) => [signal, () => {
    release();
    console.error(`\ninterrupted (${signal}); released the Sparkle manifest lock`);
    processImpl.exit(exitCode);
  }]);
  for (const [signal, handler] of signalHandlers) processImpl.once(signal, handler);
  processImpl.once('exit', release);
  try {
    return await operation();
  } finally {
    for (const [signal, handler] of signalHandlers) processImpl.removeListener(signal, handler);
    processImpl.removeListener('exit', release);
    release();
  }
}

function manifestFromArgs(parsed) {
  const explicit = parsed.values.get('--manifest');
  if (explicit) return repoPath(explicit, '--manifest');
  // Default to the manifest of the deck the asset is written into.
  const output = parsed.values.get('--output');
  const deck = output && PRESENTATION_OUTPUT_PATTERN.exec(repoPath(output, '--output').relativePath)?.[1];
  if (!deck) throw new Error(`Pass --manifest <path>, or write --output inside ${PRESENTATIONS_PATH}/<id>/`);
  return repoPath(`${deck}/${DECK_MANIFEST_PATH}`, '--manifest');
}

function assertOutputAvailable(output, manifest, force) {
  if (existsSync(output.absolutePath) && !force) {
    throw new Error(`${output.relativePath} already exists; pass --force to replace it`);
  }
  const currentManifest = loadManifest(manifest.absolutePath);
  const existingEntry = currentManifest.assets.find(
    (asset) => asset.outputPath === output.relativePath,
  );
  if (existingEntry && !force) {
    throw new Error(
      `${output.relativePath} already exists in ${manifest.relativePath}; pass --force to replace it`,
    );
  }
  return { currentManifest, existingEntry };
}

function recordAsset(manifest, currentManifest, existingEntry, entry) {
  const now = new Date().toISOString();
  const completedEntry = {
    ...entry,
    source: 'sparkle',
    createdAt: existingEntry?.createdAt || now,
    updatedAt: now,
  };
  currentManifest.version = 1;
  currentManifest.assets = [
    ...currentManifest.assets.filter((asset) => asset.outputPath !== entry.outputPath),
    completedEntry,
  ].sort((left, right) => left.outputPath.localeCompare(right.outputPath));
  writeManifest(manifest.absolutePath, currentManifest);
}

function buildGenerateRequest(parsed, prompt, format) {
  const model = parsed.values.get('--model') || 'gpt-image-2';
  const openAiModel = model.startsWith('gpt-image-');
  if (!openAiModel && format !== 'png') {
    throw new Error(`The deployed ${model} integration currently supports PNG output only`);
  }
  const styleId = parsed.values.get('--style');
  const style = readJsonOption(parsed.values.get('--style-json'), '--style-json');
  if (styleId && style) throw new Error('--style and --style-json are mutually exclusive');
  const character = readJsonOption(parsed.values.get('--character-json'), '--character-json');
  const settings = { output_format: format };
  if (openAiModel || parsed.values.has('--size')) {
    settings.size = parsed.values.get('--size') || '1536x864';
  }
  if (openAiModel || parsed.values.has('--quality')) {
    settings.quality_gpt = parsed.values.get('--quality') || 'medium';
  }
  const optionalSettings = [
    ['--background', 'background'],
    ['--moderation', 'moderation'],
    ['--image-size', 'image_size'],
    ['--aspect-ratio', 'aspect_ratio'],
    ['--input-fidelity', 'input_fidelity'],
  ];
  for (const [option, field] of optionalSettings) {
    if (parsed.values.has(option)) settings[field] = parsed.values.get(option);
  }
  if (parsed.values.has('--compression')) {
    settings.output_compression = integerOption(parsed.values.get('--compression'), '--compression', {
      min: 0,
      max: 100,
    });
  }
  const inputImages = parsed.lists.get('--input-image-url') || [];
  if (inputImages.length === 1) settings.input_image_url = inputImages[0];
  if (inputImages.length > 1) settings.input_image_urls = inputImages;

  return {
    prompt,
    model,
    mode: 'async',
    settings,
    ...(styleId ? { styleId } : {}),
    ...(style ? { style } : {}),
    ...(character ? { character } : {}),
    ...(parsed.flags.has('--sticker') ? { sticker_mode: true } : {}),
  };
}

async function generate(parsed) {
  const prompt = readPrompt(parsed);
  const outputValue = parsed.values.get('--output');
  if (!outputValue) throw new Error('generate requires --output');
  const output = repoPath(outputValue, '--output');
  const manifest = manifestFromArgs(parsed);
  const format = outputFormat(output.relativePath, parsed.values.get('--format'));
  const retries = integerOption(parsed.values.get('--retries'), '--retries', { fallback: 2 });
  const body = buildGenerateRequest(parsed, prompt, format);

  if (parsed.flags.has('--dry-run')) {
    console.log(
      JSON.stringify(
        {
          endpoint: '/v1/images/generate',
          outputPath: output.relativePath,
          manifestPath: manifest.relativePath,
          body,
        },
        null,
        2,
      ),
    );
    return;
  }

  await withManifestLock(async () => {
    const { currentManifest, existingEntry } = assertOutputAvailable(
      output,
      manifest,
      parsed.flags.has('--force'),
    );
    const created = await withRetries('image job creation', retries, () =>
      sparkle('/v1/images/generate', { method: 'POST', body: JSON.stringify(body) }),
    );
    const jobId = created?.job?.id;
    if (!jobId) throw new Error('Sparkle did not return an image job ID');
    console.log(`created image job ${jobId}`);
    const completed = await waitForJob(jobId, 'image', retries);
    if (!completed.imageUrl) throw new Error('Completed image job did not include imageUrl');
    await download(completed.imageUrl, output.absolutePath, retries);
    recordAsset(manifest, currentManifest, existingEntry, {
      type: 'image',
      outputPath: output.relativePath,
      imageJobId: jobId,
      model: body.model,
      prompt,
      settings: body.settings,
      ...(body.styleId ? { sparkleStyleId: body.styleId } : {}),
      ...(body.style ? { inlineStyle: body.style } : {}),
      ...(body.character ? { character: body.character } : {}),
      ...(body.sticker_mode ? { stickerMode: true } : {}),
      billing: completed.billing || null,
    });
    console.log(`recorded ${output.relativePath} in ${manifest.relativePath}`);
  });
}

function buildVideoRequest(parsed) {
  const sourceJobId = parsed.values.get('--source-job');
  const videoModelId = parsed.values.get('--video-model');
  if (!sourceJobId) throw new Error('Video commands require --source-job');
  if (!videoModelId) throw new Error('Video commands require --video-model');
  const prompt = readPrompt(parsed, { allowPositional: false });
  const body = { sourceJobId, videoModelId, prompt };
  const stringFields = [
    ['--action', 'action'],
    ['--loop', 'loopMode'],
    ['--aspect-ratio', 'aspectRatio'],
    ['--resolution', 'resolution'],
  ];
  for (const [option, field] of stringFields) {
    if (parsed.values.has(option)) body[field] = parsed.values.get(option);
  }
  if (parsed.values.has('--duration')) {
    body.durationSeconds = integerOption(parsed.values.get('--duration'), '--duration', { min: 1 });
  }
  if (parsed.values.has('--fps')) {
    body.exportFps = integerOption(parsed.values.get('--fps'), '--fps', { min: 1 });
  }
  if (parsed.values.has('--seed')) {
    body.seed = integerOption(parsed.values.get('--seed'), '--seed', {
      min: 0,
      max: 2_147_483_647,
    });
  }
  if (parsed.flags.has('--camera-fixed')) body.cameraFixed = true;
  return body;
}

async function quoteVideo(parsed) {
  const body = buildVideoRequest(parsed);
  if (parsed.flags.has('--dry-run')) {
    console.log(JSON.stringify({ endpoint: '/v1/video-models/quote', body }, null, 2));
    return null;
  }
  const quote = await sparkle('/v1/video-models/quote', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  console.log(JSON.stringify(quote, null, 2));
  return quote;
}

function acceptedQuote(quote, acceptedPrice) {
  const expected = integerOption(acceptedPrice, '--accept-price', { min: 0 });
  if (expected === undefined) {
    throw new Error(`animate requires --accept-price ${quote.customerPriceCents} after reviewing the quote`);
  }
  if (expected !== quote.customerPriceCents) {
    throw new Error(
      `Accepted price ${expected} cents does not match the current quote of ${quote.customerPriceCents} cents`,
    );
  }
  return {
    customerPriceCents: quote.customerPriceCents,
    priceVersion: quote.priceVersion,
    expiresAt: quote.expiresAt,
  };
}

function idempotencyKey(parsed) {
  const key = parsed.values.get('--idempotency-key');
  if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new Error('--idempotency-key must contain 8-200 URL-safe characters');
  }
  return key;
}

async function animate(parsed) {
  const request = buildVideoRequest(parsed);
  const outputValue = parsed.values.get('--output');
  if (!outputValue) throw new Error('animate requires --output');
  const output = repoPath(outputValue, '--output');
  if (extname(output.relativePath).toLowerCase() !== '.mp4') {
    throw new Error('animate --output must end in .mp4');
  }
  const manifest = manifestFromArgs(parsed);
  const retries = integerOption(parsed.values.get('--retries'), '--retries', { fallback: 2 });
  const key = idempotencyKey(parsed);

  if (parsed.flags.has('--dry-run')) {
    console.log(
      JSON.stringify(
        {
          quote: { endpoint: '/v1/video-models/quote', body: request },
          animate: {
            endpoint: '/v1/images/animate',
            idempotencyKey: key,
            acceptedPriceCents: parsed.values.get('--accept-price') || null,
            outputPath: output.relativePath,
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  await withManifestLock(async () => {
    const { currentManifest, existingEntry } = assertOutputAvailable(
      output,
      manifest,
      parsed.flags.has('--force'),
    );
    const quote = await sparkle('/v1/video-models/quote', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    console.log(
      `video quote: ${quote.customerPriceCents} cents ${quote.currency} (${quote.priceVersion})`,
    );
    const body = {
      ...quote.normalizedRequest,
      acceptedQuote: acceptedQuote(quote, parsed.values.get('--accept-price')),
      mode: 'async',
    };
    const created = await withRetries('video job creation', retries, () =>
      sparkle('/v1/images/animate', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify(body),
      }),
    );
    const jobId = created?.job?.id;
    if (!jobId) throw new Error('Sparkle did not return a video job ID');
    console.log(`created video job ${jobId}`);
    const completed = await waitForJob(jobId, 'video', retries);
    const videoUrl = completed.animation?.videoUrl;
    if (!videoUrl) throw new Error('Completed video job did not include animation.videoUrl');
    await download(videoUrl, output.absolutePath, retries);
    recordAsset(manifest, currentManifest, existingEntry, {
      type: 'animation',
      outputPath: output.relativePath,
      animationJobId: jobId,
      sourceJobId: body.sourceJobId,
      videoModelId: body.videoModelId,
      prompt: body.prompt,
      videoRequest: quote.normalizedRequest,
      acceptedQuote: body.acceptedQuote,
      idempotencyKey: key,
      billing: completed.billing || null,
    });
    console.log(`recorded ${output.relativePath} in ${manifest.relativePath}`);
  });
}

async function status(parsed) {
  const jobId = parsed.values.get('--job') || parsed.positionals[0];
  if (jobId) {
    console.log(
      JSON.stringify(await sparkle(`/v1/images/jobs/${encodeURIComponent(jobId)}`), null, 2),
    );
    return;
  }
  const query = new URLSearchParams();
  query.set(
    'limit',
    String(integerOption(parsed.values.get('--limit'), '--limit', { fallback: 20, min: 1, max: 100 })),
  );
  if (parsed.values.has('--status')) query.set('status', parsed.values.get('--status'));
  if (parsed.values.has('--cursor')) query.set('cursor', parsed.values.get('--cursor'));
  console.log(JSON.stringify(await sparkle(`/v1/images/jobs?${query}`), null, 2));
}

async function retryJob(parsed) {
  const jobId = parsed.values.get('--job') || parsed.positionals[0];
  if (!jobId) throw new Error('retry requires a job ID');
  const key = parsed.values.get('--idempotency-key');
  if (key && !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new Error('--idempotency-key must contain 8-200 URL-safe characters');
  }
  const request = (body) =>
    sparkle(`/v1/images/jobs/${encodeURIComponent(jobId)}/retry`, {
      method: 'POST',
      ...(key ? { headers: { 'Idempotency-Key': key } } : {}),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    console.log(JSON.stringify(await request(), null, 2));
  } catch (error) {
    const quote = error instanceof SparkleApiError ? error.details?.quote : null;
    if (error.code !== 'retry_quote_required' || !quote) throw error;
    const accepted = acceptedQuote(quote, parsed.values.get('--accept-price'));
    if (!key) throw new Error('Paid video retry requires --idempotency-key');
    console.log(JSON.stringify(await request({ acceptedQuote: accepted }), null, 2));
  }
}

function catalogStylePath(styleId) {
  return `/v1/styles/catalog/${encodeURIComponent(styleId)}`;
}

function selectCatalogStyles(catalog, { category, limit }) {
  if (!catalog || !Array.isArray(catalog.styles)) {
    throw new Error('Sparkle catalog response did not contain styles[]');
  }

  let available = [...catalog.styles].sort((left, right) => {
    const dateOrder = String(right?.createdAt || '').localeCompare(String(left?.createdAt || ''));
    return dateOrder || String(left?.id || '').localeCompare(String(right?.id || ''));
  });
  if (category) {
    const normalizedCategory = category.trim().toLowerCase();
    const groups = [...(catalog.categories || []), ...(catalog.sections || [])];
    const group = groups.find(
      (candidate) => String(candidate?.name || '').trim().toLowerCase() === normalizedCategory,
    );
    const groupStyleIds = group?.styleIds ? new Set(group.styleIds) : null;
    available = available.filter(
      (style) =>
        String(style?.category || '').trim().toLowerCase() === normalizedCategory ||
        groupStyleIds?.has(style?.id),
    );
  }

  return {
    styles: available.slice(0, limit),
    cursor: null,
    hasMore: available.length > limit,
  };
}

async function styles(parsed) {
  const styleId = parsed.positionals[0];
  if (styleId) {
    console.log(JSON.stringify(await sparkle(catalogStylePath(styleId)), null, 2));
    return;
  }
  if (parsed.values.has('--cursor')) {
    throw new Error('--cursor is not supported for the static built-in style catalog');
  }
  const limit = integerOption(parsed.values.get('--limit'), '--limit', {
    fallback: 50,
    min: 1,
    max: 200,
  });
  const catalog = await sparkle('/v1/styles/catalog');
  console.log(
    JSON.stringify(
      selectCatalogStyles(catalog, {
        category: parsed.values.get('--category'),
        limit,
      }),
      null,
      2,
    ),
  );
}

async function affordability(parsed) {
  const query = new URLSearchParams({
    model: parsed.values.get('--model') || 'gpt-image-2',
    n: String(
      integerOption(parsed.values.get('--count'), '--count', { fallback: 1, min: 1, max: 10 }),
    ),
  });
  console.log(JSON.stringify(await sparkle(`/v1/billing/affordability?${query}`), null, 2));
}

/** Every deck manifest that exists, for `validate` without `--manifest`. */
function deckManifests() {
  const root = repoPath(PRESENTATIONS_PATH, 'presentations');
  if (!existsSync(root.absolutePath)) return [];
  return readdirSync(root.absolutePath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => repoPath(`${PRESENTATIONS_PATH}/${entry.name}/${DECK_MANIFEST_PATH}`, '--manifest'))
    .filter((manifest) => existsSync(manifest.absolutePath));
}

function validate(parsed) {
  const explicit = parsed.values.has('--manifest') || parsed.values.has('--output');
  const manifests = explicit ? [manifestFromArgs(parsed)] : deckManifests();
  if (manifests.length === 0) {
    console.log('no Sparkle manifests found');
    return;
  }
  for (const manifest of manifests) validateManifest(manifest);
}

function validateManifest(manifest) {
  const currentManifest = loadManifest(manifest.absolutePath);
  const failures = [];
  for (const asset of currentManifest.assets) {
    if (!asset.outputPath) failures.push('manifest asset is missing outputPath');
    if (asset.type === 'animation' && !asset.animationJobId) {
      failures.push(`${asset.outputPath || 'unknown animation'} is missing animationJobId`);
    }
    if (asset.type !== 'animation' && !asset.imageJobId) {
      failures.push(`${asset.outputPath || 'unknown image'} is missing imageJobId`);
    }
    if (asset.outputPath) {
      try {
        const output = repoPath(asset.outputPath, 'manifest outputPath');
        if (!existsSync(output.absolutePath)) failures.push(`${asset.outputPath} does not exist`);
      } catch (error) {
        failures.push(error.message);
      }
    }
  }
  if (failures.length > 0) throw new Error(failures.join('\n'));
  console.log(`validated ${currentManifest.assets.length} Sparkle asset(s) in ${manifest.relativePath}`);
}

async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  if (parsed.flags.has('--help') || parsed.command === 'help') {
    console.log(usage());
    return;
  }
  if (parsed.command === 'generate') return generate(parsed);
  if (parsed.command === 'animate') return animate(parsed);
  if (parsed.command === 'video-quote') return quoteVideo(parsed);
  if (parsed.command === 'status') return status(parsed);
  if (parsed.command === 'retry') return retryJob(parsed);
  if (parsed.command === 'styles') return styles(parsed);
  if (parsed.command === 'affordability') return affordability(parsed);
  if (parsed.command === 'validate') return validate(parsed);

  const endpoints = {
    models: '/v1/models',
    'video-models': '/v1/video-models',
    whoami: '/v1/whoami',
  };
  console.log(JSON.stringify(await sparkle(endpoints[parsed.command]), null, 2));
}

function reportError(error) {
  const prefix = error instanceof SparkleApiError ? `${error.code}: ` : '';
  console.error(`${prefix}${error.message}`);
  if (error instanceof SparkleApiError && error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    reportError(error);
    process.exit(1);
  });
}

export {
  SparkleApiError,
  acceptedQuote,
  buildGenerateRequest,
  buildVideoRequest,
  catalogStylePath,
  main,
  parseArgs,
  processIsAlive,
  selectCatalogStyles,
  withManifestLock,
};
