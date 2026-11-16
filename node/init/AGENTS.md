# AGENTS.md

This project is a set of slide decks rendered by the `ok-vibe-slides`
package. The package supplies the app shell, presenter view, authoring tools,
and dev server; this project supplies decks, templates, styles, and public
files. Do not edit `node_modules/ok-vibe-slides`. Its `README.md` and
`AGENTS.md` are the reference for template props, brand tokens, review
packets, and the debug CLI.

## Layout

- `src/data/presentations/<deck-id>/`: one folder per deck. The folder name equals
  the deck `id`.
  - `slides.tsx`: `SlideData[]`. Every slide has a stable `id`, a `template`
    name, and a template element as `content` (not wrapped, or it won't get
    `orientation`).
  - `notes.mjs`: `export default { [slideId]: string[] }`. Private speaker
    notes, loaded by the notes service. Never import it into browser code.
  - `sparkle.mjs`: `export default { [slideId]: { style, imagePrompt, motionPrompt } }`.
  - `manuscript.md`: the talk for Practice mode. Each `<!-- slide:<id> -->`
    marker cues a slide; keep markers in deck order and use slide IDs.
- `src/data/presentations/index.ts`: exports `presentations: Presentation[]`.
- `src/components/slides/`: templates, `Name.tsx` plus `Name.css`, PascalCase,
  with a kebab-case root class and BEM parts (`quote-slide__quote`,
  `quote-slide--portrait`). The deck imports these copies.
- `src/styles/brand.css`: brand tokens under `:root, :root[data-theme]`.

## Imports

- Types: `import type { SlideData, BaseSlideProps } from 'ok-vibe-slides'`.
- Templates: from `src/components/slides/` with relative imports. If you need an
  engine template you have not copied, import it one by one:
  `ok-vibe-slides/slides/<Name>`. Never import values from the
  `ok-vibe-slides` root; it loads every built-in stylesheet, which competes
  with the copies here.
- Components: `ok-vibe-slides/components/<Name>` (for example `VideoOverlay`).

## Slide rules

Slides render at 1920x1080 (landscape) and 1080x1920 (portrait), then scale.
Every template must handle both `orientation` values.

- The engine pads the slide; templates add no padding, width, height,
  background, or border radius on their root.
- The root fills the slide: `display: flex; flex: 1; min-width: 0; min-height: 0`.
- Lay out with flexbox (`gap`, `justify-content`, `flex: 1`), not margins or
  percentage widths.
- Size text with the `--slide-*` variables (`--slide-title-large`,
  `--slide-body`, `--slide-caption`, ...), never pixel font sizes.
- Read colors only from tokens (`var(--color-accent)`, tints with
  `color-mix`), so the brand stylesheet and themes restyle every slide.
- Never fix overflow with `overflow: hidden`. Add `min-width: 0` /
  `min-height: 0` along the flex chain instead.
- Slide numbers come from the engine; don't add them in templates.

## Checking your work

The dev server (`npm run dev`) must be running for the debug CLI.

```bash
npm run debug -- go 4                      # go to slide 4 (state shows its id)
npm run debug -- audit-slide 4             # errors fail; add --portrait
npm run audit                              # every slide
npm run debug -- screenshot-slide 4 --out .tmp/slide-4.png
npm run debug -- computed ".slide--active .slide-header__title"
npm run type-check
npm run build
```

Use the debug CLI rather than browser automation scripts.

## Review packets

The user annotates slides in the developer tools drawer and pastes a review
packet. Slide IDs, annotation IDs, note indexes, and prop paths in it are
authoritative; slide numbers only describe the order when it was captured.
Edit the file each item names, verify with `audit-slide` and
`screenshot-slide`, and report what changed for each annotation ID.
