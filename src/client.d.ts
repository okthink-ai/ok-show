// Ambient types a project needs to type-check its decks against ok-vibe-slides.
// Add `"types": ["ok-vibe-slides/client"]` to the project's tsconfig, or
// reference it from a `.d.ts` file: /// <reference types="ok-vibe-slides/client" />
/// <reference types="vite/client" />
// The virtual-module declarations are ambient; an import would turn them into module-scoped ones.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./virtual-modules.d.ts" />
