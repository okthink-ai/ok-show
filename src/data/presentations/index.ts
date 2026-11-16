import type { Presentation } from '../../types/slide.types';
import { demo } from './demo';

/** The engine repository's own decks. A project lists its decks the same way in `<presentationsDir>/index.ts`. */
export const presentations: Presentation[] = [demo];
