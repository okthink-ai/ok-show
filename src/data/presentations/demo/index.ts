import type { Presentation } from '../../../types/slide.types';
import { slides } from './slides';

export const demo: Presentation = {
  id: 'demo',
  title: 'ok-vibe-slides Demo',
  description: 'Showcases all available slide templates',
  date: 'May 2025',
  slides,
};
