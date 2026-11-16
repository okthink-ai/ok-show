// Modules the ok-show Vite plugin generates from the project's config (see node/vite.ts).

declare module 'virtual:ok-show/presentations' {
  /** The project's deck registry: `<presentationsDir>/index.ts`'s `presentations` export. */
  export const presentations: import('./types/slide.types').Presentation[];
}

declare module 'virtual:ok-show/manuscripts' {
  /** Compiled `<presentationsDir>/<id>/manuscript.md` files keyed by presentation ID. */
  export const manuscripts: Record<string, { html: string; source: string }>;
}

declare module 'virtual:ok-show/project' {
  /** Project-relative folder holding the deck folders. */
  export const presentationsDir: string;
  /** Project-relative path of the engine package, with a trailing slash; '' inside the engine repository. */
  export const engineDir: string;
  /** Project-local template stylesheets keyed by component name. */
  export const templateStylesheets: Record<string, string>;
}

declare module 'virtual:ok-show/styles' {
  // Side-effect imports of the project's `styles`; there are no exports.
}
