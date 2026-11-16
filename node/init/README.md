# {{title}}

Slides built with [ok-vibe-slides](https://github.com/okthink-ai/ok-vibe-slides).
The engine (app shell, presenter view, authoring tools, dev server) comes
from the `ok-vibe-slides` package. This project holds what you edit.

## Commands

```bash
npm install
npm run dev          # authoring server: deck, presenter (/notes), developer tools
npm run build        # public site in dist/ (no speaker notes, no authoring tools)
npm run preview      # serve dist/
npm run type-check   # check decks and templates
npm run audit        # audit every slide in the running deck
npm run debug -- help
```

`npm run dev` prints a deck link and a presenter link. Open them from the
terminal: each carries the control token that speaker notes and sync need.

## Updating the engine

`ok-vibe-slides` installs from GitHub, not the npm registry, so
`package.json` lists it as `github:okthink-ai/ok-vibe-slides`, optionally
with `#<tag-or-branch>`. The repository is private: `npm install` needs git
access to it, the same access `git clone git@github.com:okthink-ai/ok-vibe-slides.git`
needs.

To change versions, or to pick up new commits on a branch, install it again:

```bash
npm install github:okthink-ai/ok-vibe-slides#<tag-or-branch>
```

The templates and starter files in this project are copies. Updating the
engine doesn't change them, so your edits are safe.

## What lives where

| Path | What it is |
|------|------------|
| `{{deckDir}}/slides.tsx` | The slides. Each slide is a template element with a stable `id`. |
| `{{deckDir}}/notes.mjs` | Speaker notes, keyed by slide `id`. Private: never in the public build. |
| `{{deckDir}}/manuscript.md` | The full talk for Practice mode. `<!-- slide:<id> -->` markers cue slides. |
| `{{deckDir}}/sparkle.mjs` | Sparkle image and motion prompts, keyed by slide `id`. |
| `{{deckDir}}/index.ts` | Deck title, description, and date. |
| `src/data/presentations/index.ts` | The list of decks. |
| `src/components/slides/` | Slide templates (`Name.tsx` + `Name.css`). Copies of the built-ins: change them freely. |
| `src/styles/brand.css` | Brand tokens: colors, fonts, radii. |
| `public/` | Images, video, and the favicon, served at `/`. |
| `ok-vibe-slides.config.ts` | Page title, stylesheets, `head` tags, folders. |

## Adding a deck

1. Create `src/data/presentations/<deck-id>/` with `index.ts` and `slides.tsx`
   (copy `{{deckDir}}/` as a start). The folder name must equal the deck `id`.
2. Add it to `src/data/presentations/index.ts`.
3. Open it with `?presentation=<deck-id>`.

## Templates

The templates in `src/components/slides/` started as copies of the engine's
built-ins. Your copies are the ones the deck imports, so edit them directly,
or add new ones next to them: `QuoteSlide.tsx` plus `QuoteSlide.css` with the
root class `quote-slide`. Import templates from this folder, not from the
`ok-vibe-slides` package root, which loads every built-in stylesheet and
would compete with your copies.

The engine's README, in `node_modules/ok-vibe-slides/README.md`, documents
every template's props, the brand tokens, annotations, and the debug CLI.
