import type { SlideData } from '../types/slide.types';

export function getVideoPreloadSources(slides: readonly SlideData[], currentSlide: number): string[] {
  const currentVideo = slides[currentSlide]?.preloadVideo;
  const upcomingVideo = slides.slice(currentSlide + 1).find((slide) => slide.preloadVideo)?.preloadVideo;
  return Array.from(new Set([currentVideo, upcomingVideo].filter((source): source is string => Boolean(source))));
}
