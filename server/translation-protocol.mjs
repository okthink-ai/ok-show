export const TRANSLATION_BACKENDS = Object.freeze([
  'openai-realtime',
  'elevenlabs-scribe',
  'elevenlabs-realtime',
]);
export const TRANSLATION_LANGUAGES = Object.freeze(['en', 'es']);
export const TRANSLATION_WINDOW_CHARACTERS = 280;
export const TRANSLATION_HISTORY_LIMIT = 40;

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validTranslationId(value, maximum = 128) {
  return typeof value === 'string' && value.length <= maximum && ID_PATTERN.test(value);
}

export function validTranslationConfig(value) {
  return isPlainObject(value)
    && TRANSLATION_BACKENDS.includes(value.backend)
    && TRANSLATION_LANGUAGES.includes(value.sourceLanguage)
    && TRANSLATION_LANGUAGES.includes(value.targetLanguage)
    && value.sourceLanguage !== value.targetLanguage;
}

export function decodeAudio(value, maximumBytes) {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(maximumBytes / 3) * 4 + 4) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  const decoded = Buffer.from(value, 'base64');
  if (!decoded.length || decoded.length > maximumBytes || decoded.length % 2 !== 0) return null;
  return decoded.toString('base64') === value ? decoded : null;
}

/** Keep a display-sized tail without splitting a grapheme when Intl supports it. */
export function keepRecentText(value, maximum = TRANSLATION_WINDOW_CHARACTERS) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maximum) return text;
  let tail;
  if (typeof Intl.Segmenter === 'function') {
    const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((segment) => segment.segment);
    const recent = [];
    let length = 0;
    for (let index = graphemes.length - 1; index >= 0; index -= 1) {
      if (length + graphemes[index].length > maximum) break;
      recent.unshift(graphemes[index]);
      length += graphemes[index].length;
    }
    tail = recent.join('');
  } else {
    tail = text.slice(-maximum);
  }
  const wordBoundary = tail.search(/\s/u);
  return wordBoundary >= 0 && wordBoundary < Math.floor(maximum / 3)
    ? tail.slice(wordBoundary + 1)
    : tail;
}

export function sanitizedProviderError(error, fallback = 'provider_error') {
  const status = Number(error?.statusCode ?? error?.status ?? error?.code);
  if (status === 401) return { code: 'invalid_api_key', message: 'The provider rejected its API key. Check the project .env and restart ok-show.' };
  if (status === 402 || status === 429) return { code: 'quota_or_billing', message: 'The provider rejected the request because of quota, billing, or rate limits.' };
  if (status === 403) return { code: 'provider_access', message: 'This account does not have access to the selected provider feature, model, or required terms.' };
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const lower = raw.toLowerCase();
  if (lower.includes('timed out') || lower.includes('timeout')) return { code: 'provider_timeout', message: 'The translation provider timed out.' };
  if (lower.includes('quota') || lower.includes('billing') || lower.includes('rate limit')) return { code: 'quota_or_billing', message: 'The provider rejected the request because of quota, billing, or rate limits.' };
  if (lower.includes('permission') || lower.includes('enterprise') || lower.includes('terms') || lower.includes('access')) return { code: 'provider_access', message: 'This account does not have access to the selected provider feature, model, or required terms.' };
  return { code: fallback, message: 'The translation provider could not complete the request. Check server logs for the sanitized error code.' };
}

export function translationCapabilities({
  openaiApiKey = '',
  elevenlabsApiKey = '',
  elevenlabsEnterpriseApiKey = '',
  elevenlabsVoiceId = '',
  defaultProvider = '',
} = {}) {
  const openai = Boolean(openaiApiKey);
  const scribe = Boolean(elevenlabsApiKey);
  const enterpriseKey = Boolean(elevenlabsEnterpriseApiKey || elevenlabsApiKey);
  const enterprise = enterpriseKey && Boolean(elevenlabsVoiceId);
  const configuredProviders = [openai && 'openai', (scribe || enterpriseKey) && 'elevenlabs'].filter(Boolean);
  const requestedDefault = defaultProvider === 'openai' ? 'openai-realtime'
    : defaultProvider === 'elevenlabs' ? 'elevenlabs-scribe' : '';
  const soleDefault = configuredProviders.length === 1
    ? (configuredProviders[0] === 'openai' ? 'openai-realtime' : 'elevenlabs-scribe') : '';
  return {
    version: 1,
    defaultBackend: requestedDefault || soleDefault,
    backends: {
      'openai-realtime': {
        configured: openai,
        missing: openai ? [] : ['OPENAI_API_KEY'],
        sampleRate: 24000,
        chunkDurationMs: 200,
        supportsSourcePreview: false,
      },
      'elevenlabs-scribe': {
        configured: scribe,
        missing: scribe ? [] : ['ELEVENLABS_API_KEY'],
        sampleRate: 16000,
        chunkDurationMs: 100,
        supportsSourcePreview: true,
      },
      'elevenlabs-realtime': {
        configured: enterprise,
        missing: [
          ...(!enterpriseKey ? ['ELEVENLABS_ENTERPRISE_API_KEY or ELEVENLABS_API_KEY'] : []),
          ...(!elevenlabsVoiceId ? ['ELEVENLABS_TRANSLATION_VOICE_ID'] : []),
        ],
        sampleRate: 16000,
        chunkDurationMs: 100,
        supportsSourcePreview: true,
      },
    },
    languagePairs: [
      { sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceLanguage: 'es', targetLanguage: 'en' },
    ],
  };
}
