import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SlideData } from '../types/slide.types';
import { getVideoPreloadSources } from '../utils/videoPreload';
import Slide from './Slide';

afterEach(cleanup);

const qrCode = {
  src: '/connect.svg',
  url: 'https://example.com/event/',
  alt: 'QR code for the event page',
};

function renderSlide(slide: SlideData) {
  return render(<Slide slide={slide} aspectRatio="16:9" isActive slideNumber={1} totalSlides={1} />);
}

describe('Slide QR code', () => {
  it('renders an optional QR code from the shared slide contract', () => {
    renderSlide({ id: 'with-qr', content: <p>Content</p>, qrCode });

    expect(screen.getByRole('img', { name: qrCode.alt })).toHaveAttribute('src', qrCode.src);
    expect(document.querySelector('.slide__qr-code')).toHaveAttribute('data-qr-url', qrCode.url);
  });

  it('leaves the QR code out when the slide opts out', () => {
    renderSlide({ id: 'without-qr', content: <p>Content</p>, qrCode: false });

    expect(document.querySelector('.slide__qr-code')).toBeNull();
  });
});

describe('slide video preloading', () => {
  it('warms only the current and next upcoming animation', () => {
    const slides: SlideData[] = [
      { id: 'one', content: <p>One</p> },
      { id: 'two', content: <p>Two</p>, preloadVideo: '/two.mp4' },
      { id: 'three', content: <p>Three</p> },
      { id: 'four', content: <p>Four</p>, preloadVideo: '/four.mp4' },
    ];

    expect(getVideoPreloadSources(slides, 0)).toEqual(['/two.mp4']);
    expect(getVideoPreloadSources(slides, 1)).toEqual(['/two.mp4', '/four.mp4']);
    expect(getVideoPreloadSources(slides, 2)).toEqual(['/four.mp4']);
  });
});
