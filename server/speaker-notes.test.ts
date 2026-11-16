// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { presentations } from '../src/data/presentations';
import { loadAllPresentationNotes } from './presentation-notes.mjs';

const { notesByPresentation, sparkleByPresentation } = await loadAllPresentationNotes({
  directory: fileURLToPath(new URL('../src/data/presentations/', import.meta.url)),
});

describe('speaker notes registry', () => {
  it('registers notes only under real presentation IDs', () => {
    const ids = presentations.map((presentation) => presentation.id);
    for (const presentationId of Object.keys(notesByPresentation)) {
      expect(ids, `notes folder without a presentation: ${presentationId}`).toContain(presentationId);
    }
  });

  it('loads the demo deck notes and Sparkle records', () => {
    expect(notesByPresentation.demo).toBeDefined();
    expect(sparkleByPresentation.demo).toBeDefined();
  });

  const decks = presentations.filter((presentation) => presentation.id in notesByPresentation);

  it.each(decks)('only contains keys for real $id slides', (presentation) => {
    const slideIds = new Set(presentation.slides.map((slide) => slide.id));
    for (const slideId of Object.keys(notesByPresentation[presentation.id])) {
      expect(slideIds, `orphaned ${presentation.id} speaker notes: ${slideId}`).toContain(slideId);
    }
  });

  it.each(decks.filter((presentation) => presentation.id in sparkleByPresentation))('has complete Sparkle prompt records for every $id slide', (presentation) => {
    const sparkle = sparkleByPresentation[presentation.id] as Record<string, Record<string, string>>;
    expect(Object.keys(sparkle).sort()).toEqual(presentation.slides.map((slide) => slide.id).sort());
    for (const slide of presentation.slides) {
      expect(sparkle[slide.id], `${slide.id} Sparkle prompt`).toMatchObject({
        style: expect.any(String),
        imagePrompt: expect.any(String),
        motionPrompt: expect.any(String),
      });
      expect(Object.values(sparkle[slide.id]).every((value) => value.trim().length > 0)).toBe(true);
    }
  });
});
