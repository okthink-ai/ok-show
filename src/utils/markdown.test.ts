import { describe, expect, it } from 'vitest';
import { blockquote, fencedText, humanList, inlineCode } from './markdown';

describe('inlineCode', () => {
  it('wraps plain text in single backticks', () => {
    expect(inlineCode('slide:about-me')).toBe('`slide:about-me`');
  });

  it('uses a fence longer than any backtick run inside the value', () => {
    expect(inlineCode('a ``b`` c')).toBe('```a ``b`` c```');
  });

  it('pads values that start or end with a backtick', () => {
    expect(inlineCode('`tick')).toBe('`` `tick ``');
    expect(inlineCode('tick`')).toBe('`` tick` ``');
  });
});

describe('fencedText', () => {
  it('uses a three-backtick fence with a language by default', () => {
    expect(fencedText('one\ntwo')).toBe('```text\none\ntwo\n```');
    expect(fencedText('.a > .b', 'css')).toBe('```css\n.a > .b\n```');
  });

  it('outgrows a fence inside the value so the block cannot close early', () => {
    expect(fencedText('before\n```\ninside\n```')).toBe('````text\nbefore\n```\ninside\n```\n````');
    expect(fencedText('`````')).toBe('``````text\n`````\n``````');
  });
});

describe('blockquote', () => {
  it('quotes every line, including empty ones', () => {
    expect(blockquote('first\n\nthird')).toBe('> first\n>\n> third');
  });

  it('keeps heading markers and fences inside the quote', () => {
    const quoted = blockquote('# Heading\n```\ncode');
    expect(quoted).toBe('> # Heading\n> ```\n> code');
    expect(quoted.split('\n').every(line => line.startsWith('>'))).toBe(true);
  });

  it('treats Windows line endings as line breaks', () => {
    expect(blockquote('one\r\ntwo')).toBe('> one\n> two');
  });
});

describe('humanList', () => {
  it.each([
    [[], ''],
    [['A1'], 'A1'],
    [['A1', 'A2'], 'A1 and A2'],
    [['A1', 'A2', 'A3'], 'A1, A2, and A3'],
  ])('joins %j as %j', (values, expected) => {
    expect(humanList(values)).toBe(expected);
  });
});
