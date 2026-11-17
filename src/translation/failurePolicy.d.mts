export type TranslationFailureDisposition = 'degraded' | 'retryable' | 'blocked';
export const TRANSLATION_FAILURE_DISPOSITIONS: Readonly<Record<string, TranslationFailureDisposition>>;
export function translationFailureDisposition(code: string): TranslationFailureDisposition;
