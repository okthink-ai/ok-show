import { createElevenLabsRealtimeAdapter } from './elevenlabs-realtime.mjs';
import { createElevenLabsScribeAdapter } from './elevenlabs-scribe.mjs';
import { createOpenAIRealtimeAdapter } from './openai-realtime.mjs';

export function createTranslationAdapters(config) {
  const adapters = {};
  if (config.openaiApiKey) adapters['openai-realtime'] = createOpenAIRealtimeAdapter({ apiKey: config.openaiApiKey });
  if (config.elevenlabsApiKey) adapters['elevenlabs-scribe'] = createElevenLabsScribeAdapter({ apiKey: config.elevenlabsApiKey });
  const enterpriseKey = config.elevenlabsEnterpriseApiKey || config.elevenlabsApiKey;
  if (enterpriseKey && config.elevenlabsVoiceId) {
    adapters['elevenlabs-realtime'] = createElevenLabsRealtimeAdapter({ apiKey: enterpriseKey, voiceId: config.elevenlabsVoiceId });
  }
  return adapters;
}
