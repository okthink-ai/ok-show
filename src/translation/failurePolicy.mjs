export const TRANSLATION_FAILURE_DISPOSITIONS = Object.freeze({
  already_active: 'blocked',
  finalization_timeout: 'degraded',
  forbidden: 'blocked',
  invalid_api_key: 'blocked',
  invalid_audio: 'blocked',
  invalid_config: 'blocked',
  microphone_device: 'blocked',
  microphone_permission: 'blocked',
  not_configured: 'blocked',
  provider_access: 'blocked',
  quota_or_billing: 'blocked',
  producer_disconnected: 'retryable',
  provider_error: 'retryable',
  provider_timeout: 'retryable',
});

export function translationFailureDisposition(code) {
  return TRANSLATION_FAILURE_DISPOSITIONS[code] ?? 'retryable';
}
