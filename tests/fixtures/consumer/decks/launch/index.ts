import type { Presentation } from 'ok-vibe-slides';
import { slides } from './slides';

export const launch: Presentation = {
  id: 'launch',
  title: 'Fixture Launch Talk',
  description: 'A consumer deck built on the ok-vibe-slides package',
  date: 'November 2026',
  slides,
};
