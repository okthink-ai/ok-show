import type { Presentation } from 'ok-show';
import { slides } from './slides';

export const launch: Presentation = {
  id: 'launch',
  title: 'Fixture Launch Talk',
  description: 'A consumer deck built on the ok-show package',
  date: 'November 2026',
  slides,
};
