import { engineDir, presentationsDir, templateStylesheets } from 'virtual:ok-show/project';
import { MANUSCRIPT_FILENAME } from '../practice/manuscripts';

/**
 * Source paths as an agent working in the project sees them. Review packets
 * name these files, so they must be right for a project that installs the
 * engine as a package, not only for the engine repository.
 */
export const projectPaths = { presentationsDir, engineDir, templateStylesheets } as const;

/** A deck's folder, with a trailing slash. */
export const deckSourceRoot = (presentationId: string): string => `${presentationsDir}/${presentationId}/`;

/** A file inside a deck's folder. */
export const deckFile = (presentationId: string, file: string): string => `${deckSourceRoot(presentationId)}${file}`;

/** The project-relative path agents should edit for a deck's manuscript. */
export const manuscriptFile = (presentationId: string): string => deckFile(presentationId, MANUSCRIPT_FILENAME);

/** An engine source file (`src/components/Slide.css`) as seen from the project. */
export const engineFile = (path: string): string => `${engineDir}${path}`;
