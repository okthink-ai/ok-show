interface PresentationUrlOptions {
  pathname: string;
  search: string;
  currentSlide: number;
  currentPresentationId: string;
  includePresentation: boolean;
}

export function buildPresentationUrl({
  pathname,
  search,
  currentSlide,
  currentPresentationId,
  includePresentation,
}: PresentationUrlOptions): string {
  const params = new URLSearchParams(search);
  params.set('slide', String(currentSlide + 1));
  if (includePresentation && currentPresentationId) {
    params.set('presentation', currentPresentationId);
  } else {
    params.delete('presentation');
  }
  return `${pathname}?${params.toString()}`;
}
