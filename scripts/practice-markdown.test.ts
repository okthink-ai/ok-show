// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compilePracticeMarkdown } from './practice-markdown';
import { presentationIdFromManuscriptPath } from '../src/practice/manuscripts';

describe('compiled practice manuscript', () => {
  it('keeps source lines, stable cues, GFM tables, code, and relative links', () => {
    const html = compilePracticeMarkdown('# Talk\n\n<!-- slide:opening-title -->\n\nA **bold** passage.\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n[Brief](docs/talk-brief.md)\n\n```text\n<!-- slide:not-a-cue -->\n```', 'demo');
    expect(html).toContain('data-source-line="5"');
    expect(html).toContain('slideId=opening-title');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('class="talk-practice__table"');
    expect(html).toContain('href="/docs/talk-brief.md"');
    expect(html).not.toContain('slideId=not-a-cue');
    expect(html).toContain('&#x3C;!-- slide:not-a-cue -->');
  });
  it('strips HTML and unsafe URLs before exposing HTML to the reader', () => {
    const html = compilePracticeMarkdown('<script>alert(1)</script>\n\n[unsafe](javascript:alert%281%29)\n\n<img src=x onerror=alert(1)>\n\n[safe](https://example.com)', 'demo');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noreferrer"');
  });
});

it('omits agent context including subsections while preserving source line anchors', () => {
  const source = '# Talk\n\n## Context for agents\n\nPrivate instructions.\n\n### Sources for agents\n\nDo not read this.\n\n## Intro\n\n<!-- slide:opening-title -->\n\nSpoken opening.';
  const html = compilePracticeMarkdown(source, 'demo');
  expect(html).not.toContain('Context for agents');
  expect(html).not.toContain('Private instructions');
  expect(html).not.toContain('Sources for agents');
  expect(html).not.toContain('Do not read this');
  expect(html).toContain('slideId=opening-title');
  expect(html).toContain('<p data-source-line="15" data-source-end-line="15">Spoken opening.</p>');
});

it('compiles only manuscripts that sit in a presentation folder', () => {
  const decks = '/repo/src/data/presentations';
  expect(presentationIdFromManuscriptPath('/repo/src/data/presentations/demo/manuscript.md', decks)).toBe('demo');
  expect(presentationIdFromManuscriptPath('C:\\repo\\decks\\demo\\manuscript.md', 'C:\\repo\\decks\\')).toBe('demo');
  expect(presentationIdFromManuscriptPath('/repo/README.md', decks)).toBeNull();
  expect(presentationIdFromManuscriptPath('/repo/src/data/presentations/demo/notes/manuscript.md', decks)).toBeNull();
  expect(presentationIdFromManuscriptPath('/repo/src/data/presentations/manuscript.md', decks)).toBeNull();
  // Another project's decks folder with the same layout is not this project's.
  expect(presentationIdFromManuscriptPath('/other/src/data/presentations/demo/manuscript.md', decks)).toBeNull();
});
