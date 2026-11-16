import { describe, expect, it } from 'vitest';
import { presentations } from '../project/presentations';
import { getManuscript, hasManuscript } from './manuscriptRegistry';
import { manuscriptFile } from '../project/paths';
import { resolveSlideCue } from './slideCues';

describe('practice manuscripts', () => {
  it('finds a manuscript beside the demo deck and names its file for agents', () => {
    expect(hasManuscript('demo')).toBe(true);
    expect(hasManuscript('missing-deck')).toBe(false);
    expect(manuscriptFile('demo')).toBe('src/data/presentations/demo/manuscript.md');
  });

  it.each(presentations.filter((presentation) => hasManuscript(presentation.id)))('links every $id slide cue to a slide in its own deck', (presentation) => {
    const ids = presentation.slides.map((slide) => slide.id);
    const container = document.createElement('div');
    container.innerHTML = getManuscript(presentation.id)!.html;
    const links = Array.from(container.querySelectorAll('a[href*="slideId="]')).map((link) => link.getAttribute('href')!);
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      expect(resolveSlideCue(href, presentation.id, ids.length, ids), href).not.toBeNull();
    }
  });

  it('hides the agent context from the compiled manuscript', () => {
    expect(getManuscript('demo')!.html).not.toContain('Context for agents');
    expect(getManuscript('demo')!.source).toContain('Context for agents');
  });
});
