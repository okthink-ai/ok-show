// Ambient types a project needs to type-check its decks against ok-show.
// Add `"types": ["ok-show/client"]` to the project's tsconfig, or
// reference it from a `.d.ts` file: /// <reference types="ok-show/client" />
/// <reference types="vite/client" />
// The virtual-module declarations are ambient; an import would turn them into module-scoped ones.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./virtual-modules.d.ts" />
