# {{title}}

Slides built with [ok-show](https://github.com/okthink-ai/ok-show).
The engine (app shell, presenter view, authoring tools, dev server) comes
from the `ok-show` package. This project holds what you edit.

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

## Live translated captions

Copy `.env.example` to `.env`, configure either `OPENAI_API_KEY` or
`ELEVENLABS_API_KEY`, and restart `npm run dev`. The **Live translation** tool
and `/notes` can then start English ↔ Spanish microphone captions. Configure
both providers only when you want an explicit choice; there is no automatic
fallback. ElevenLabs enterprise realtime additionally needs entitlement,
`ELEVENLABS_TRANSLATION_VOICE_ID`, and optionally its separate enterprise key.

Microphone access from another device needs HTTPS (localhost is the normal
development exception). On Tailscale, `npm run dev -- --https` obtains a
trusted MagicDNS certificate in git-ignored `.tmp/` storage and prints secure
phone links. Provider translation can be billable, including
audio output that ok-show discards. Once started, translation remains active
until Stop: transient congestion drops stale audio to stay current, and
temporary connection/provider failures reconnect automatically. Stop drains
final output and retains it for eight seconds; Clear removes it immediately.
Captions and audio are not persisted. This is a live authoring feature only:
`npm run build`, public hosting, and PDF export contain no translation controls
or credentials.

## Updating the engine

`ok-show` installs from GitHub, not the npm registry, so
`package.json` lists it as `github:okthink-ai/ok-show`, optionally
with `#<tag-or-branch>`. The repository is private: `npm install` needs git
access to it, the same access `git clone git@github.com:okthink-ai/ok-show.git`
needs.

To change versions, or to pick up new commits on a branch, install it again:

```bash
npm install github:okthink-ai/ok-show#<tag-or-branch>
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
| `ok-show.config.ts` | Page title, stylesheets, `head` tags, folders. |

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
`ok-show` package root, which loads every built-in stylesheet and
would compete with your copies.

The engine's README, in `node_modules/ok-show/README.md`, documents
every template's props, the brand tokens, annotations, and the debug CLI.
