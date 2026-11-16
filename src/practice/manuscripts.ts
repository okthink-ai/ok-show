/**
 * A deck's practice manuscript lives beside its slides:
 * `<presentationsDir>/<presentation-id>/manuscript.md`.
 * This module is shared by the browser and the Vite plugin, so it stays free of bundler APIs.
 */
export const MANUSCRIPT_FILENAME = 'manuscript.md';

const normalize = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/, '');

/**
 * The presentation a manuscript file belongs to, or null when the file is not
 * `<presentationsDir>/<id>/manuscript.md`.
 */
export function presentationIdFromManuscriptPath(file: string, presentationsDir: string): string | null {
  const prefix = `${normalize(presentationsDir)}/`;
  const path = normalize(file);
  if (!path.startsWith(prefix)) return null;
  const [presentationId, filename, ...rest] = path.slice(prefix.length).split('/');
  return presentationId && filename === MANUSCRIPT_FILENAME && rest.length === 0 ? presentationId : null;
}
