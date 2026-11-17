export type TranslationBackend = 'openai-realtime' | 'elevenlabs-scribe' | 'elevenlabs-realtime';
export type TranslationLanguage = 'en' | 'es';
export type TranslationPhase = 'idle' | 'connecting' | 'listening' | 'stopping' | 'error';
export type LiveTranslationPhase = 'off' | 'starting' | 'live' | 'recovering' | 'blocked' | 'stopping';
export type TranslationFailureDisposition = 'degraded' | 'retryable' | 'blocked';

export interface TranslationConfig {
  backend: TranslationBackend;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
}

export interface BackendCapability {
  configured: boolean;
  missing: string[];
  sampleRate: 16000 | 24000;
  chunkDurationMs: 100 | 200;
  supportsSourcePreview: boolean;
}

export interface TranslationCapabilities {
  version: 1;
  defaultBackend: TranslationBackend | '';
  backends: Record<TranslationBackend, BackendCapability>;
  languagePairs: Array<{ sourceLanguage: TranslationLanguage; targetLanguage: TranslationLanguage }>;
}

export interface CaptionSnapshot {
  type: 'translation.caption';
  version: 1;
  sessionId: string;
  presentationId: string;
  runId: string;
  sequence: number;
  sourceText?: string;
  translatedText: string;
  targetLanguage: TranslationLanguage;
  stability: 'streaming' | 'settled';
}

export type TranslationServerMessage =
  | ({ type: 'translation.capabilities' } & TranslationCapabilities)
  | { type: 'translation.status'; version: 1; sessionId: string; presentationId: string; phase: TranslationPhase; runId?: string; backend?: TranslationBackend; code?: string; message?: string; disposition?: TranslationFailureDisposition; producerClientId?: string; producerSurface?: 'deck' | 'presenter' }
  | { type: 'translation.ready'; version: 1; sessionId: string; presentationId: string; runId: string; sampleRate: 16000 | 24000; chunkDurationMs: 100 | 200 }
  | CaptionSnapshot
  | { type: 'translation.cleared'; version: 1; sessionId: string; presentationId: string; reason: string }
  | { type: 'translation.warning'; version: 1; sessionId: string; presentationId: string; runId: string; code: string; message: string }
  | { type: 'translation.health'; version: 1; sessionId: string; presentationId: string; runId: string; droppedAudioChunks: number }
  | { type: 'translation.error'; version: 1; code: string; message: string; disposition: TranslationFailureDisposition };

const backends: TranslationBackend[] = ['openai-realtime', 'elevenlabs-scribe', 'elevenlabs-realtime'];
const languages: TranslationLanguage[] = ['en', 'es'];
const phases: TranslationPhase[] = ['idle', 'connecting', 'listening', 'stopping', 'error'];
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const backend = (value: unknown): value is TranslationBackend => backends.includes(value as TranslationBackend);
const language = (value: unknown): value is TranslationLanguage => languages.includes(value as TranslationLanguage);

function capability(value: unknown): value is BackendCapability {
  if (!object(value) || typeof value.configured !== 'boolean' || !Array.isArray(value.missing)
    || !value.missing.every((item) => typeof item === 'string')) return false;
  return (value.sampleRate === 16000 || value.sampleRate === 24000)
    && (value.chunkDurationMs === 100 || value.chunkDurationMs === 200)
    && typeof value.supportsSourcePreview === 'boolean';
}

export function parseTranslationServerMessage(raw: string): TranslationServerMessage | null {
  let message: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!object(parsed)) return null;
    message = parsed;
  } catch { return null; }
  if (message.version !== 1 || typeof message.type !== 'string') return null;
  if (message.type === 'translation.capabilities') {
    if (!object(message.backends)) return null;
    const backendValues = message.backends;
    if (!backends.every((name) => capability(backendValues[name]))) return null;
    if (!(message.defaultBackend === '' || backend(message.defaultBackend)) || !Array.isArray(message.languagePairs)) return null;
    if (!message.languagePairs.every((pair) => object(pair) && language(pair.sourceLanguage) && language(pair.targetLanguage))) return null;
    return message as unknown as TranslationServerMessage;
  }
  if (message.type === 'translation.error') {
    return typeof message.code === 'string' && typeof message.message === 'string'
      && ['degraded', 'retryable', 'blocked'].includes(String(message.disposition)) ? message as unknown as TranslationServerMessage : null;
  }
  if (typeof message.sessionId !== 'string' || typeof message.presentationId !== 'string') return null;
  if (message.type === 'translation.status') {
    return phases.includes(message.phase as TranslationPhase) ? message as unknown as TranslationServerMessage : null;
  }
  if (message.type === 'translation.ready') {
    return typeof message.runId === 'string'
      && (message.sampleRate === 16000 || message.sampleRate === 24000)
      && (message.chunkDurationMs === 100 || message.chunkDurationMs === 200)
      ? message as unknown as TranslationServerMessage : null;
  }
  if (message.type === 'translation.caption') {
    return typeof message.runId === 'string' && Number.isInteger(message.sequence)
      && typeof message.translatedText === 'string' && language(message.targetLanguage)
      && (message.stability === 'streaming' || message.stability === 'settled')
      && (message.sourceText === undefined || typeof message.sourceText === 'string')
      ? message as unknown as TranslationServerMessage : null;
  }
  if (message.type === 'translation.cleared') return typeof message.reason === 'string' ? message as unknown as TranslationServerMessage : null;
  if (message.type === 'translation.warning') {
    return typeof message.runId === 'string' && typeof message.code === 'string' && typeof message.message === 'string'
      ? message as unknown as TranslationServerMessage : null;
  }
  if (message.type === 'translation.health') {
    return typeof message.runId === 'string' && typeof message.droppedAudioChunks === 'number'
      && Number.isInteger(message.droppedAudioChunks) && message.droppedAudioChunks >= 0
      ? message as unknown as TranslationServerMessage : null;
  }
  return null;
}
