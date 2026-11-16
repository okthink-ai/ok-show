// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { manuscriptSentences } from './sentenceNavigation';

describe('manuscript sentence ranges', () => {
  it('keeps inline formatting, ignores slide cues, and treats code as one unit', () => {
    const content = document.createElement('div');
    content.innerHTML = '<p><button data-practice-cue="0">Slide 1</button></p><h2>Intro</h2><p>Hello <strong>everybody.</strong> Thank you\nfor coming!</p><pre>a.b();\nc.d();</pre>';
    expect(manuscriptSentences(content).map(range => range.toString())).toEqual([
      'Intro', 'Hello everybody.', 'Thank you\nfor coming!', 'a.b();\nc.d();',
    ]);
  });
  it('does not duplicate nested list items or lose source anchors', () => {
    const content = document.createElement('div');
    content.innerHTML = '<ul><li data-source-line="3">First.<ul><li data-source-line="4">Nested.</li></ul></li><li>Last.</li></ul>';
    const ranges = manuscriptSentences(content);
    expect(ranges.map(range => range.toString())).toEqual(['First.', 'Nested.', 'Last.']);
    expect(ranges[1].startContainer.parentElement?.dataset.sourceLine).toBe('4');
  });
});
