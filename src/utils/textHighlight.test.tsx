import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getHighlightSegments,
  getSelectionOffsets,
  getSurroundingContext,
  getTextOffsets,
  renderHighlightedText,
} from './textHighlight';

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

describe('getHighlightSegments', () => {
  it('splits text at range boundaries and flags covered pieces', () => {
    expect(getHighlightSegments('Hello brave world', [{ start: 6, end: 11 }])).toEqual([
      { start: 0, end: 6, text: 'Hello ', marked: false },
      { start: 6, end: 11, text: 'brave', marked: true },
      { start: 11, end: 17, text: ' world', marked: false },
    ]);
  });

  it('never duplicates text where ranges overlap', () => {
    const segments = getHighlightSegments('abcdefgh', [{ start: 1, end: 5 }, { start: 3, end: 7 }]);
    expect(segments.map((segment) => segment.text).join('')).toBe('abcdefgh');
    expect(segments.filter((segment) => segment.marked).map((segment) => segment.text)).toEqual(['bc', 'de', 'fg']);
  });

  it('clamps ranges that run past either end of the text', () => {
    expect(getHighlightSegments('abc', [{ start: -4, end: 99 }])).toEqual([
      { start: 0, end: 3, text: 'abc', marked: true },
    ]);
  });
});

describe('renderHighlightedText', () => {
  it('returns the plain string when nothing is highlighted', () => {
    expect(renderHighlightedText('plain', [])).toBe('plain');
  });

  it('wraps highlighted ranges in mark elements', () => {
    const { container } = render(<p>{renderHighlightedText('Hello brave world', [{ start: 6, end: 11 }])}</p>);
    expect(container.textContent).toBe('Hello brave world');
    expect([...container.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['brave']);
  });
});

describe('getSurroundingContext', () => {
  it('returns up to the requested length on each side of the range', () => {
    expect(getSurroundingContext('0123456789', { start: 4, end: 6 }, 2)).toEqual({ before: '23', after: '67' });
    expect(getSurroundingContext('0123456789', { start: 1, end: 9 }, 5)).toEqual({ before: '0', after: '9' });
  });
});

describe('getTextOffsets', () => {
  function mount(html: string): HTMLElement {
    const element = document.createElement('p');
    element.innerHTML = html;
    document.body.append(element);
    return element;
  }

  it('measures offsets across nested nodes', () => {
    const element = mount('Hello <mark>brave</mark> world');
    const range = document.createRange();
    range.setStart(element.querySelector('mark')!.firstChild!, 2);
    range.setEnd(element.lastChild!, 3);
    expect(getTextOffsets(element, range)).toEqual({ start: 8, end: 14 });
  });

  it('returns null for a range that leaves the container', () => {
    const element = mount('Inside');
    const outside = mount('Outside');
    const range = document.createRange();
    range.setStart(element.firstChild!, 0);
    range.setEnd(outside.firstChild!, 3);
    expect(getTextOffsets(element, range)).toBeNull();
  });

  it('reads the current window selection and ignores a collapsed one', () => {
    const element = mount('Select some text');
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(element.firstChild!, 7);
    range.setEnd(element.firstChild!, 11);
    selection.removeAllRanges();
    selection.addRange(range);
    expect(getSelectionOffsets(element)).toEqual({ start: 7, end: 11 });

    selection.collapseToStart();
    expect(getSelectionOffsets(element)).toBeNull();
  });
});
