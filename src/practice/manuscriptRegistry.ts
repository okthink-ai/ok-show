import { manuscripts } from 'virtual:ok-show/manuscripts';

export interface PracticeManuscript {
  /** Sanitized HTML compiled at build time by `scripts/practice-markdown.ts`. */
  html: string;
  /** The Markdown source, used to capture annotated passages by line. */
  source: string;
}

// Manuscripts only load in the authoring and presenter surfaces, which are excluded from the public bundle.
const registry = new Map<string, PracticeManuscript>(Object.entries(manuscripts));

export const getManuscript = (presentationId: string): PracticeManuscript | undefined => registry.get(presentationId);

export const hasManuscript = (presentationId: string): boolean => registry.has(presentationId);
