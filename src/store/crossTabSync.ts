import type { Annotation } from '../types/annotation.types';
import { ANNOTATIONS_KEY } from './annotationsSlice';
import { decodeAnnotationsFromStorage, encodeAnnotationsForStorage } from './annotationCodec';

/**
 * Returns the annotation list another tab stored, or null when the event
 * should be ignored: another key, a removed key, malformed JSON, or a value
 * identical to the current list (which breaks any write-back loop).
 */
export function annotationsFromStorageEvent(
  event: Pick<StorageEvent, 'key' | 'newValue'>,
  current: Annotation[],
): Annotation[] | null {
  if (event.key !== ANNOTATIONS_KEY || event.newValue === null) return null;
  if (event.newValue === JSON.stringify(encodeAnnotationsForStorage(current))) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(event.newValue); } catch { return null; }
  const incoming = decodeAnnotationsFromStorage(parsed);
  if (JSON.stringify(incoming) === JSON.stringify(current)) return null;
  return incoming;
}
