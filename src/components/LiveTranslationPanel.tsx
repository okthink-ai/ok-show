import type { FC } from 'react';
import type { LiveTranslationResult } from '../hooks/useLiveTranslation';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  setCaptionFontSize,
  setCaptionsVisible,
  setTranslationBackend,
  setTranslationSourceLanguage,
} from '../store/uiSlice';
import type { TranslationBackend, TranslationConfig, TranslationLanguage } from '../translation/protocol';
import LiveCaptionOverlay from './LiveCaptionOverlay';
import './LiveTranslationPanel.css';

const BACKENDS: Array<{ value: TranslationBackend; label: string }> = [
  { value: 'openai-realtime', label: 'OpenAI realtime' },
  { value: 'elevenlabs-scribe', label: 'ElevenLabs stable phrases' },
  { value: 'elevenlabs-realtime', label: 'ElevenLabs enterprise realtime' },
];

interface LiveTranslationPanelProps {
  runtime: LiveTranslationResult;
  compact?: boolean;
}

const LiveTranslationPanel: FC<LiveTranslationPanelProps> = ({ runtime, compact = false }) => {
  const dispatch = useAppDispatch();
  const preferences = useAppSelector((state) => state.ui.translation);
  const active = runtime.phase === 'connecting' || runtime.phase === 'listening' || runtime.phase === 'stopping';
  const capability = preferences.backend ? runtime.capabilities?.backends[preferences.backend] : undefined;
  const targetLanguage: TranslationLanguage = preferences.sourceLanguage === 'en' ? 'es' : 'en';
  const config: TranslationConfig | null = preferences.backend ? {
    backend: preferences.backend,
    sourceLanguage: preferences.sourceLanguage,
    targetLanguage,
  } : null;
  const setupMessage = !runtime.connected
    ? 'Open the tokenized deck or presenter link printed by ok-show dev.'
    : !preferences.backend
      ? 'Choose a configured provider.'
      : capability && !capability.configured
        ? `Set ${capability.missing.join(', ')} in the project .env and restart ok-show.` : '';

  return (
    <section className={`live-translation-panel${compact ? ' live-translation-panel--compact' : ''}`} aria-label="Live translation">
      <header>
        <div><h2>Live translation</h2><p data-phase={runtime.phase}>{runtime.phase}</p></div>
        <label className="live-translation-panel__visibility"><input type="checkbox" checked={preferences.captionsVisible} onChange={(event) => dispatch(setCaptionsVisible(event.target.checked))} /> Show</label>
      </header>
      <div className="live-translation-panel__fields">
        <label>
          <span>Provider</span>
          <select value={preferences.backend} disabled={active} onChange={(event) => dispatch(setTranslationBackend(event.target.value as TranslationBackend | ''))}>
            <option value="">Select…</option>
            {BACKENDS.map((item) => {
              const available = runtime.capabilities?.backends[item.value].configured;
              return <option key={item.value} value={item.value}>{item.label}{available === false ? ' — setup needed' : ''}</option>;
            })}
          </select>
        </label>
        <label>
          <span>From</span>
          <select value={preferences.sourceLanguage} disabled={active} onChange={(event) => dispatch(setTranslationSourceLanguage(event.target.value as TranslationLanguage))}>
            <option value="en">English → Spanish</option>
            <option value="es">Spanish → English</option>
          </select>
        </label>
      </div>
      <div className="live-translation-panel__controls">
        {!active
          ? <button type="button" disabled={!config || !capability?.configured || !runtime.connected} onClick={() => config && void runtime.start(config)}>Start microphone</button>
          : <button type="button" disabled={runtime.phase === 'stopping'} onClick={() => void runtime.stop()}>Stop</button>}
        <button type="button" disabled={!runtime.caption} onClick={runtime.clear}>Clear</button>
      </div>
      <label className="live-translation-panel__size">
        <span>Caption size</span>
        <input type="range" min="28" max="72" step="4" value={preferences.captionFontSize} onChange={(event) => dispatch(setCaptionFontSize(event.target.valueAsNumber))} />
      </label>
      {setupMessage && <p className="live-translation-panel__hint">{setupMessage}</p>}
      {runtime.error && <p className="live-translation-panel__error" role="alert">{runtime.error}</p>}
      {runtime.warning && <p className="live-translation-panel__warning" role="status">{runtime.warning}</p>}
      {runtime.caption ? (
        <div className="live-translation-panel__preview">
          {runtime.caption.sourceText && <p><strong>Source</strong> {runtime.caption.sourceText}</p>}
          <LiveCaptionOverlay caption={runtime.caption} visible fontSize={preferences.captionFontSize} preview />
        </div>
      ) : <p className="live-translation-panel__empty">Translated captions will preview here.</p>}
      <p className="live-translation-panel__disclosure">Audio is sent directly to the selected provider while listening. Native translation may generate billable audio output; ok-show discards it.</p>
    </section>
  );
};

export default LiveTranslationPanel;
