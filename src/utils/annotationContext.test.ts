import { afterEach, describe, expect, it } from 'vitest';
import { createAnnotationCaptureContext, getAppUiContext, getSpeakerNoteIndex, getStableElementSelector } from './annotationContext';

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
});

describe('annotation capture context', () => {
  it('builds a stable selector relative to the active slide', () => {
    document.body.innerHTML = `
      <section class="slide slide--active">
        <ul class="about-me__list">
          <li><strong>First</strong></li>
          <li><strong>Second</strong></li>
        </ul>
      </section>
    `;
    const target = document.querySelectorAll<HTMLElement>('strong')[1];
    expect(getStableElementSelector(target)).toBe(
      '.slide--active > ul.about-me__list > li:nth-of-type(2) > strong',
    );
  });

  it('keeps the full ancestor chain when an element has an id', () => {
    document.body.innerHTML = `
      <section class="slide slide--active">
        <div class="content"><p id="target-copy">Copy</p></div>
      </section>
    `;
    const target = document.querySelector<HTMLElement>('#target-copy');
    if (!target) throw new Error('Expected target element');
    expect(getStableElementSelector(target)).toBe(
      '.slide--active > div.content > #target-copy',
    );
  });

  it('captures reproducibility data without copying URL credentials', () => {
    window.history.replaceState(null, '', '/?presentation=demo&slide=2&token=secret#review');
    const capture = createAnnotationCaptureContext();

    expect(capture.route).toBe('/?presentation=demo&slide=2#review');
    expect(capture.route).not.toContain('secret');
    expect(capture.revision).toBeTruthy();
    expect(capture.viewport.width).toBeGreaterThan(0);
    expect(capture.capturedAt).toBeGreaterThan(0);
  });
});

describe('getSpeakerNoteIndex', () => {
  it('reads the index from the note bullet, even when it is the only bullet', () => {
    document.body.innerHTML = `
      <section class="speaker-notes-sidebar">
        <ul class="speaker-notes-sidebar__notes">
          <li data-speaker-note-index="0"><div><p id="lone">Only note</p></div></li>
        </ul>
      </section>
    `;
    const target = document.querySelector<HTMLElement>('#lone');
    expect(getSpeakerNoteIndex(target)).toBe(0);
  });

  it('returns the index of the bullet that contains the element', () => {
    document.body.innerHTML = `
      <section class="speaker-notes-sidebar">
        <ul>
          <li data-speaker-note-index="0"><p>First</p></li>
          <li data-speaker-note-index="1"><p id="second">Second</p></li>
        </ul>
      </section>
    `;
    expect(getSpeakerNoteIndex(document.querySelector<HTMLElement>('#second'))).toBe(1);
  });

  it('ignores elements outside the notes panel and malformed indexes', () => {
    document.body.innerHTML = `
      <section class="slide slide--active"><ul><li data-speaker-note-index="0"><p id="slide">Slide</p></li></ul></section>
      <section class="speaker-notes-sidebar">
        <p id="heading">Notes</p>
        <ul><li data-speaker-note-index="x"><p id="bad">Bad</p></li></ul>
      </section>
    `;
    expect(getSpeakerNoteIndex(document.querySelector<HTMLElement>('#slide'))).toBeUndefined();
    expect(getSpeakerNoteIndex(document.querySelector<HTMLElement>('#heading'))).toBeUndefined();
    expect(getSpeakerNoteIndex(document.querySelector<HTMLElement>('#bad'))).toBeUndefined();
    expect(getSpeakerNoteIndex(null)).toBeUndefined();
  });
});

describe('presenter page targets', () => {
  const presenter = `
    <main class="speaker-notes">
      <section class="speaker-notes__grid">
        <aside class="speaker-notes__left-column">
          <div class="speaker-notes__bar"><button id="settings">Settings</button></div>
          <article class="speaker-notes__notes"><ul>
            <li data-speaker-note-index="0">First</li>
            <li data-speaker-note-index="1" id="note">Second</li>
          </ul></article>
        </aside>
        <section class="speaker-notes__right-column">
          <div class="speaker-notes__preview-frame"><div class="slide slide--active"><h1 id="title">Intro</h1></div></div>
          <footer class="speaker-notes__footer"><button id="next">Next</button></footer>
        </section>
      </section>
      <dialog class="speaker-notes__jump"><button id="jump">1 Intro</button></dialog>
    </main>
  `;
  const byId = (id: string) => document.getElementById(id);

  it('names the presenter area an element sits in', () => {
    document.body.innerHTML = presenter;
    expect(getAppUiContext(byId('settings'))).toBe('Presenter view → Toolbar');
    expect(getAppUiContext(byId('note'))).toBe('Presenter view → Notes');
    expect(getAppUiContext(byId('next'))).toBe('Presenter view → Navigation and timer');
    expect(getAppUiContext(byId('jump'))).toBe('Presenter view → Jump to slide');
  });

  it('treats the slide preview as slide content', () => {
    document.body.innerHTML = presenter;
    expect(getAppUiContext(byId('title'))).toBeUndefined();
    expect(getStableElementSelector(byId('title')!)).toBe('.slide--active > #title');
  });

  it('anchors presenter selectors and reads presenter note indexes', () => {
    document.body.innerHTML = presenter;
    expect(getStableElementSelector(byId('next')!)).toBe(
      '.speaker-notes > section.speaker-notes__grid > section.speaker-notes__right-column > footer.speaker-notes__footer > #next',
    );
    expect(getSpeakerNoteIndex(byId('note'))).toBe(1);
  });
});
