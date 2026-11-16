import type { SparklePromptMap } from '../types/speakerNotes.types';

export interface SyncState {
  presentationId: string;
  slideIndex: number;
  totalSlides: number;
  theme: string;
  revision: number;
  updatedAt: number;
}

export type SyncRole = 'presentation' | 'notes';

export type ServerSyncMessage = { type: 'state'; sessionId: string; state: SyncState }
  | {
      type: 'notes';
      sessionId: string;
      presentationId: string;
      revision: number;
      notes: Record<string, string[]>;
      sparkle: SparklePromptMap;
    };

export interface NotesRequestMessage {
  type: 'request-notes';
  presentationId: string;
  baseRevision: number;
}

function isNotes(value: unknown): value is Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(
    (notes) => Array.isArray(notes) && notes.every((note) => typeof note === 'string'),
  );
}

function isSparklePrompts(value: unknown): value is SparklePromptMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((prompt) => {
    if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) return false;
    const candidate = prompt as Partial<Record<'style' | 'imagePrompt' | 'motionPrompt', unknown>>;
    return typeof candidate.style === 'string'
      && typeof candidate.imagePrompt === 'string'
      && typeof candidate.motionPrompt === 'string';
  });
}

export function parseServerSyncMessage(value: string): ServerSyncMessage | null {
  try {
    const message = JSON.parse(value) as Partial<ServerSyncMessage>;
    if (message.type === 'notes' && typeof message.presentationId === 'string'
      && Number.isInteger(message.revision)
      && isNotes(message.notes)
      && isSparklePrompts(message.sparkle)) return message as ServerSyncMessage;
    const state = 'state' in message ? message.state : undefined;
    if (message.type !== 'state' || !state || typeof state.presentationId !== 'string' || typeof state.theme !== 'string') return null;
    if (![state.slideIndex, state.totalSlides, state.revision, state.updatedAt].every(Number.isInteger)) return null;
    return message as ServerSyncMessage;
  } catch {
    return null;
  }
}
