import { BulletSlide, TitleSlide } from 'ok-show';
import type { SlideData } from 'ok-show';
import QuoteSlide from '../../templates/QuoteSlide';

export const slides: SlideData[] = [
  {
    id: 'launch-title',
    title: 'Launch',
    template: 'TitleSlide',
    content: <TitleSlide title="Fixture Launch" subtitle="Built on the package" brandName="Fixture Co" date="November 2026" />,
  },
  {
    id: 'launch-quote',
    title: 'Customer quote',
    template: 'QuoteSlide',
    content: <QuoteSlide quote="Decks live in our repo now." attribution="A happy customer" />,
  },
  {
    id: 'launch-plan',
    title: 'Plan',
    template: 'BulletSlide',
    content: (
      <BulletSlide
        label="Plan"
        title="Three steps"
        items={['Install the package', 'Write decks', 'Run ok-show dev']}
      />
    ),
  },
];
