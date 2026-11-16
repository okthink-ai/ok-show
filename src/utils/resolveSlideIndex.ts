/**
 * Resolve an annotation's current slide position from its stable slide ID.
 * Falls back to the index captured at annotation time when the slide no
 * longer exists (same rule the annotations sidebar applies).
 */
export function resolveSlideIndex(
  slides: ReadonlyArray<{ id: string }>,
  slideId: string,
  capturedIndex: number,
): number {
  const index = slides.findIndex((slide) => slide.id === slideId);
  return index >= 0 ? index : capturedIndex;
}
