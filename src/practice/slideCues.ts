/** Resolve manuscript links locally; their hostname never changes the session. */
export function resolveSlideCue(href: string, presentationId: string, slideCount: number, slideIds: string[] = []): number | null {
  try {
    const url = new URL(href, 'https://presentation.local/');
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/') return null;
    if (url.searchParams.get('presentation') !== presentationId) return null;
    const slideId = url.searchParams.get('slideId');
    if (slideId) {
      const index = slideIds.indexOf(slideId);
      return index >= 0 ? index : null;
    }
    const number = url.searchParams.get('slide') ?? '';
    if (!/^[1-9]\d*$/.test(number)) return null;
    const index = Number(number) - 1;
    return Number.isSafeInteger(index) && index < slideCount ? index : null;
  } catch {
    return null;
  }
}

/** A small dead zone prevents a cue from flapping under a stationary finger. */
export function cueAtReadingLine(centers: number[], line: number, previous: number | null, tolerance = 6): number {
  let index = previous ?? -1;
  const threshold = previous === null ? 0 : tolerance;
  while (index + 1 < centers.length && line >= centers[index + 1] + threshold) index += 1;
  while (index >= 0 && line < centers[index] - threshold) index -= 1;
  return index;
}

export interface PracticePosition {
  scrollTop: number;
  following: boolean;
}

/** Turn stable manuscript cues into local links without changing the source. */
export function preparePracticeMarkdown(source: string, presentationId: string, slides: Array<{ id: string; title?: string }>): string {
  let fence = '';
  return source.split('\n').map((line) => {
    const delimiter = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (delimiter) {
      if (!fence) fence = delimiter;
      else if (delimiter[0] === fence[0] && delimiter.length >= fence.length) fence = '';
      return line;
    }
    if (fence) return line;
    const id = /^\s*<!--\s*slide:([a-zA-Z0-9_-]+)\s*-->\s*$/.exec(line)?.[1];
    if (!id) return line;
    const index = slides.findIndex((slide) => slide.id === id);
    const title = index >= 0 ? `Slide ${index + 1} — ${slides[index].title ?? id}` : `Slide — ${id}`;
    const label = title.replace(/([\\[\]])/g, '\\$1');
    const query = new URLSearchParams({ presentation: presentationId, slideId: id });
    return `[${label}](/?${query})`;
  }).join('\n');
}
