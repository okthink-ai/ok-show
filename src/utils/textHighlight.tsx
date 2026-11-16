import { Fragment } from 'react';
import type { ReactNode } from 'react';

/** A half-open character range, `[start, end)`, within a string. */
export interface TextRange {
  start: number;
  end: number;
}

export interface HighlightSegment extends TextRange {
  text: string;
  marked: boolean;
}

/**
 * Converts a DOM range into character offsets within `container`'s text.
 * Returns null when the range starts or ends outside the container.
 */
export function getTextOffsets(container: HTMLElement, range: Range): TextRange | null {
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(container);
  before.setEnd(range.startContainer, range.startOffset);
  const through = document.createRange();
  through.selectNodeContents(container);
  through.setEnd(range.endContainer, range.endOffset);
  const start = before.toString().length;
  const end = through.toString().length;
  return start < end ? { start, end } : { start: end, end: start };
}

/** Character offsets of the current, non-empty window selection inside `container`. */
export function getSelectionOffsets(container: HTMLElement): TextRange | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  return getTextOffsets(container, selection.getRangeAt(0));
}

/** Up to `length` characters on each side of `[start, end)`. */
export function getSurroundingContext(
  text: string,
  { start, end }: TextRange,
  length: number,
): { before: string; after: string } {
  return {
    before: text.slice(Math.max(0, start - length), start),
    after: text.slice(end, end + length),
  };
}

/**
 * Splits `text` at every range boundary (clamped to the text) and flags each
 * piece covered by at least one range. Overlapping ranges therefore never
 * produce nested or duplicated segments.
 */
export function getHighlightSegments(text: string, ranges: TextRange[]): HighlightSegment[] {
  const boundaries = new Set([0, text.length]);
  for (const range of ranges) {
    boundaries.add(Math.max(0, Math.min(text.length, range.start)));
    boundaries.add(Math.max(0, Math.min(text.length, range.end)));
  }
  const points = [...boundaries].sort((a, b) => a - b);
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1] ?? start;
    return {
      start,
      end,
      text: text.slice(start, end),
      marked: ranges.some((range) => range.start < end && range.end > start),
    };
  });
}

/** Renders `text` with every range wrapped in `<mark>`. */
export function renderHighlightedText(text: string, ranges: TextRange[]): ReactNode {
  if (!ranges.length) return text;
  return getHighlightSegments(text, ranges).map(({ start, end, text: segment, marked }) => (
    marked
      ? <mark key={`${start}-${end}`}>{segment}</mark>
      : <Fragment key={`${start}-${end}`}>{segment}</Fragment>
  ));
}
