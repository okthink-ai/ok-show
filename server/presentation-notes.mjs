import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Speaker notes and Sparkle prompt records live beside each deck:
 * `<presentationsDir>/<presentation-id>/notes.mjs` and `sparkle.mjs`.
 * The folder name is the presentation ID the sync server keys them by.
 */

export const NOTE_FILES = ['notes.mjs', 'sparkle.mjs'];

async function importDefault(file, version) {
  if (!existsSync(file)) return undefined;
  const href = pathToFileURL(file).href;
  const module = await import(version === undefined ? href : `${href}?v=${version}`);
  return module.default;
}

/** Load one deck's notes and Sparkle records. Pass a version to bypass the module cache after an edit. */
export async function loadPresentationNotes(presentationId, { directory, version }) {
  const deck = join(directory, presentationId);
  const [notes, sparkle] = await Promise.all(NOTE_FILES.map((file) => importDefault(join(deck, file), version)));
  return { notes, sparkle };
}

/** Load every deck that has a `notes.mjs`. */
export async function loadAllPresentationNotes({ directory }) {
  const entries = await readdir(directory, { withFileTypes: true });
  const presentationIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const notesByPresentation = {};
  const sparkleByPresentation = {};
  await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async ({ name }) => {
    const { notes, sparkle } = await loadPresentationNotes(name, { directory });
    if (!notes) return;
    notesByPresentation[name] = notes;
    if (sparkle) sparkleByPresentation[name] = sparkle;
  }));
  return { notesByPresentation, sparkleByPresentation, presentationIds };
}
