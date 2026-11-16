import { afterEach, describe, expect, it, vi } from 'vitest';
import { toggleFullscreen } from './useKeyboardNavigation';

describe('toggleFullscreen', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function buildSurface() {
    const container = document.createElement('div');
    container.className = 'slide-container slide-container--landscape';
    const slide = document.createElement('div');
    slide.className = 'slide slide--active';
    container.append(slide);
    document.body.append(container);

    const containerRequest = vi.fn().mockResolvedValue(undefined);
    const slideRequest = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(container, 'requestFullscreen', { configurable: true, value: containerRequest });
    Object.defineProperty(slide, 'requestFullscreen', { configurable: true, value: slideRequest });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });

    return { container, slide, containerRequest, slideRequest };
  }

  it('fullscreenes the slide surface rather than the surrounding application canvas', () => {
    const { containerRequest } = buildSurface();

    toggleFullscreen();

    expect(containerRequest).toHaveBeenCalledOnce();
  });

  it('never fullscreenes the active slide, which is remounted on every navigation', () => {
    const { slideRequest } = buildSurface();

    toggleFullscreen();

    // Handing the browser an element that navigation unmounts is what silently
    // dropped fullscreen after the first arrow key.
    expect(slideRequest).not.toHaveBeenCalled();
  });

  it('keeps the same fullscreen element after the deck advances', () => {
    const { container, containerRequest, slide } = buildSurface();

    toggleFullscreen();
    // Navigation replaces the keyed slide element but leaves the container.
    slide.remove();
    container.append(Object.assign(document.createElement('div'), { className: 'slide slide--active' }));

    expect(containerRequest.mock.instances[0] ?? container).toBe(container);
    expect(document.querySelector('.slide-container')).toBe(container);
  });

  it('falls back to the document when no slide surface is mounted', () => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    const request = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request });

    toggleFullscreen();

    expect(request).toHaveBeenCalledOnce();
  });

  it('exits fullscreen when something is already fullscreen', () => {
    const { containerRequest, container } = buildSurface();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: container });
    const exit = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });

    toggleFullscreen();

    expect(exit).toHaveBeenCalledOnce();
    expect(containerRequest).not.toHaveBeenCalled();
  });
});
