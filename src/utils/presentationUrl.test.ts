import { describe, expect, it } from 'vitest';
import { buildPresentationUrl } from './presentationUrl';

describe('presentation URL synchronization', () => {
  it('removes the redundant presentation ID from the public deck', () => {
    const url = buildPresentationUrl({
      pathname: '/',
      search: '?presentation=demo&campaign=launch',
      currentSlide: 2,
      currentPresentationId: 'demo',
      includePresentation: false,
    });
    const parsed = new URL(url, 'https://debug-cli.netlify.app');

    expect(parsed.searchParams.get('slide')).toBe('3');
    expect(parsed.searchParams.get('presentation')).toBeNull();
    expect(parsed.searchParams.get('campaign')).toBe('launch');
  });

  it('keeps presentation selection for local multi-deck authoring', () => {
    const url = buildPresentationUrl({
      pathname: '/',
      search: '',
      currentSlide: 0,
      currentPresentationId: 'demo',
      includePresentation: true,
    });
    const parsed = new URL(url, 'http://localhost:5199');

    expect(parsed.searchParams.get('slide')).toBe('1');
    expect(parsed.searchParams.get('presentation')).toBe('demo');
  });
});
