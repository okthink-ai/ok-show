import { describe, expect, it } from 'vitest';
import { translationFailureDisposition } from './failurePolicy.mjs';

describe('translation failure policy', () => {
  it('separates blocked setup failures, degraded finalization, and retryable transport failures', () => {
    expect(translationFailureDisposition('invalid_api_key')).toBe('blocked');
    expect(translationFailureDisposition('quota_or_billing')).toBe('blocked');
    expect(translationFailureDisposition('finalization_timeout')).toBe('degraded');
    expect(translationFailureDisposition('provider_timeout')).toBe('retryable');
    expect(translationFailureDisposition('unknown_transport_failure')).toBe('retryable');
  });
});
