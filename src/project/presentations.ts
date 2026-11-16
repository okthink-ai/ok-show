import { presentations } from 'virtual:ok-vibe-slides/presentations';
import type { Presentation } from '../types/slide.types';

export { presentations };

export const getPresentationById = (id: string): Presentation | undefined => {
  return presentations.find(p => p.id === id);
};

export const defaultPresentation: Presentation | undefined = presentations[0];
