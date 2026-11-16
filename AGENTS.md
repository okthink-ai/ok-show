# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Commits

Always commit changes made to this repository before finishing the task. Include only the task's intended changes in the commit, and do not leave completed work unstaged or uncommitted.

## TypeScript Import Guidelines

### Always use proper type imports
```typescript
// Correct - Import types separately
import type { FC, ReactNode } from 'react';
import { useState, useEffect } from 'react';

// Avoid - Mixed imports can cause issues
import { FC, useState } from 'react';
```

### File extensions in imports
```typescript
// Correct - Use .ts/.tsx extensions for local files
import { SlideData } from './types/slide.types';
import SlideContainer from './components/SlideContainer';

// Avoid - Missing extensions
import { SlideData } from './types/slide.types.ts';
```

Inside `src/`, use relative imports. There is no `@/` path alias.

## Project Structure

```
src/
  main.tsx             - Route selection: public shell, authoring App, or /notes
  App.tsx              - Authoring shell and developer tools drawer panels
  PublicApp.tsx        - Public shell for production builds
  components/          - React components (chrome, drawer panels, presenter view, practice)
    slides/            - Individual slide type components (BulletSlide, TeamSlide, etc.)
  hooks/               - Custom React hooks
  practice/            - Manuscript registry, slide cues, sentence navigation
  store/               - RTK slices, thunks, typed hooks, persistence middleware
  sync/                - WebSocket protocol and usePresentationSync hook
  styles/              - CSS files and design system
  types/               - TypeScript type definitions
  data/
    presentations/     - Presentation registry
      index.ts         - Exports all presentations, getPresentationById helper
      demo/            - Built-in demo presentation
        index.ts       - Presentation metadata (id, title, description, date)
        slides.tsx     - Slide definitions for this presentation
        notes.mjs      - Private speaker notes, keyed by slide ID
        sparkle.mjs    - Sparkle style/image/motion prompts, keyed by slide ID
        manuscript.md  - Full talk for Practice mode, with slide cue markers
src/project/           - Reads the project's deck registry and review-packet paths from the virtual modules
src/index.ts           - Package entry: types, templates, and helpers decks import
src/client.d.ts        - Types for the virtual modules (`ok-vibe-slides/client`)
bin/ok-vibe-slides.mjs - The `ok-vibe-slides` CLI
node/
  cli.mjs              - CLI commands: init, dev, build, preview, sync, debug, audit, sparkle, info
  init.mjs             - `init`: copies the editable files into a new project
  init/                - Starter README.md, AGENTS.md, and brand.css that `init` fills in
  project.mjs          - Loads and validates ok-vibe-slides.config.*
  vite.ts              - Vite config and plugin: virtual modules, project head/styles/public files
server/
  sync-server.mjs      - WebSocket server: auth, notes delivery, session routing
  presentation-notes.mjs - Loads each deck's notes.mjs and sparkle.mjs
  session-store.mjs    - Session revision, persistence, expiry, and capacity
scripts/
  practice-markdown.ts - Vite plugin that compiles manuscript.md (`?practice`)
  sparkle-image.mjs    - Sparkle image/video asset CLI
debug-cli/             - Debug CLI commands, slide audits, performance recorder
tests/browser/         - Playwright specs for the engine repo
tests/package/         - Vitest and Playwright specs that run the engine as an installed package
tests/fixtures/consumer/ - A minimal consumer project used by tests/package
```

### State ownership

- Use `useAppSelector` and `useAppDispatch` from `src/store/hooks.ts` inside
  React. Do not import the store directly into components or utilities.
- Keep reducers pure and state serializable. Browser persistence belongs in the
  listener middleware in `src/store/store.ts`, not in reducers or event handlers.
- WebSocket connection state and received speaker notes are transient state in
  `usePresentationSync`; do not put sockets or notes in Redux.
- The developer tools are one resizable drawer with a left rail. Add or reorder
  sections through the panel registry in `App.tsx` and the `SidebarType`
  contract in `uiSlice.ts`; do not add a standalone sidebar.

## Using ok-vibe-slides as a Package

Decks no longer need a fork of this repository. A project installs
`ok-vibe-slides` and runs its CLI, the way an Astro site runs `astro dev`:

```bash
npx github:okthink-ai/ok-vibe-slides init my-talk --install
# or: npm install github:okthink-ai/ok-vibe-slides react react-dom
npx ok-vibe-slides dev     # authoring server with all developer tools
npx ok-vibe-slides build   # public site in dist/
```

- **`init`** (`node/init.mjs`) copies what an author edits into the project:
  the demo deck (slide IDs renamed to `<deck>-*` in slides, notes, Sparkle,
  and manuscript), every built-in template plus `SlideHeader`, a brand
  stylesheet, the favicon, config, tsconfig, and the starter README and
  AGENTS.md from `node/init/`. Copied files keep relative imports between
  copies; every other import is rewritten to a package export, and an import
  with no package export fails `init`. So when a template gains an import of
  a new engine module, export it from the package or `init` breaks
  (`node/init.test.ts` and `tests/package/init.test.ts` catch this).
- **Distribution:** the package is installed from GitHub
  (`github:okthink-ai/ok-vibe-slides#<ref>`), not the npm registry. A git
  install gets only the `files` in `package.json` and only `dependencies`,
  so anything the CLI or the app needs at runtime must be a dependency, not
  a devDependency. `init` writes the spec it was installed with into the new
  project (`defaultEngineSpec` in `node/init.mjs`), or `file:` from a checkout.

The engine stays the Vite root. The project supplies decks, templates,
public files, and styles, which the engine loads through virtual modules
(`virtual:ok-vibe-slides/presentations`, `/manuscripts`, `/project`,
`/styles`). This repository is itself a project: its scripts run the same CLI.

- **Layout:** by default the project keeps decks in `src/data/presentations/`
  (with an `index.ts` exporting `presentations`), project-local templates in
  `src/components/slides/`, and static files in `public/`. Engine public files
  the project does not override (favicon, placeholders) are still served.
- **Config:** optional `ok-vibe-slides.config.{ts,mts,js,mjs}` in the project root:
  ```typescript
  import { defineConfig } from 'ok-vibe-slides/config';

  export default defineConfig({
    presentationsDir: 'src/data/presentations', // deck registry folder
    templatesDir: 'src/components/slides',      // project templates (named in review packets)
    publicDir: 'public',                        // or false
    outDir: 'dist',
    title: 'My talks',                          // page <title>
    head: '<link rel="icon" href="/logo.png">', // appended to <head>
    styles: ['src/styles/brand.css'],           // loaded after the engine styles
    vite: { server: { allowedHosts: ['my-host'] } }, // merged over the engine's Vite config
  });
  ```
  A `head` that has its own `rel="icon"` link or `<meta name="description">`
  replaces the engine's tag of that kind. Unknown options are an error.
- **Brand tokens:** put them in a `styles` file with the selector
  `:root, :root[data-theme]` so they win over the built-in themes. The color,
  type, shape, and depth tokens in `src/styles/design-system.css` are the
  contract; templates must read colors from tokens (tints via `color-mix`),
  never hard-coded values, so a brand file restyles every template. See
  "Brand Styling" in the README.
- **Project templates:** a project template is `Name.tsx` plus `Name.css` in
  `templatesDir`, PascalCase, with a kebab-case root class and BEM parts.
  `SlideData.template` names it. A project template with a built-in's name
  replaces the built-in. The template must be the slide's `content` element
  (not wrapped), because the engine passes `orientation` to it. See "Your Own
  Templates" in the README.
- **Imports in decks and templates:**
  - `import type { Presentation, SlideData } from 'ok-vibe-slides'` for types and helpers;
  - `import TitleSlide from 'ok-vibe-slides/slides/TitleSlide'` for one template;
  - `import VideoOverlay from 'ok-vibe-slides/components/VideoOverlay'` for one component.

  Prefer the deep imports. The `ok-vibe-slides` entry pulls in every
  template's CSS.
- **Types:** the project's `tsconfig.json` needs
  `"types": ["ok-vibe-slides/client"]` in `compilerOptions`; `init` writes it.
- **Other commands:** `ok-vibe-slides debug …`, `audit`, `sparkle …`, `sync`,
  `preview`, `info` (prints the resolved config). Run `ok-vibe-slides help`.
- **Shared dependencies:** React, React DOM, Redux Toolkit, and React Redux are
  deduped, so a symlinked or `file:` install still uses one copy.
- **No private dependencies:** nothing from the private `@okthink-ai` scope,
  not even as an optional or dev dependency; `node/vite.test.ts` checks this.
  Inspection and annotation are the engine's own (`src/hooks/useInspector*.ts`).

## Multi-Presentation Architecture

The app supports multiple presentations. Each presentation lives in `src/data/presentations/{id}/`:

```typescript
// src/data/presentations/demo/index.ts
export const demo: Presentation = {
  id: 'demo',                          // URL-safe ID
  title: 'ok-vibe-slides Demo',
  description: 'Showcases all available slide templates',
  date: 'May 2025',
  slides,                               // Imported from ./slides.tsx
};
```

## Adding a New Presentation

1. Create `src/data/presentations/{new-deck-id}/` folder
2. Create `index.ts` with Presentation metadata:
   ```typescript
   import type { Presentation } from '../../../types/slide.types';
   import { slides } from './slides';

   export const myDeck: Presentation = {
     id: 'my-deck',
     title: 'My Presentation Title',
     description: 'Short description',
     date: 'May 2025',
     slides,
   };
   ```
3. Create `slides.tsx` with slide definitions using the available template components
4. Import and add the presentation to `src/data/presentations/index.ts`:
   ```typescript
   import { myDeck } from './my-deck';

   export const presentations: Presentation[] = [demo, myDeck];
   ```
5. Optional per-deck files, found by folder name (the folder name must equal the
   presentation `id`):
   - `notes.mjs` — `export default { [slideId]: string[] }`, the private spoken
     track. Loaded by the notes service; never import it into browser code, or
     the notes ship in the public bundle.
   - `sparkle.mjs` — `export default { [slideId]: { style, imagePrompt, motionPrompt } }`.
   - `manuscript.md` — the full talk. Each `<!-- slide:<slide-id> -->` marker
     becomes a Practice cue. A `## Context for agents` section is hidden from
     the reader. Keep markers in deck order and use slide IDs, not numbers.
   `server/speaker-notes.test.ts` fails on note or Sparkle keys that do not
   match a slide ID.

## Creating New Slide Templates

When adding a new slide template component to `src/components/slides/`:

1. Create `ComponentName.tsx` and `ComponentName.css` side by side
2. Define a props interface extending `BaseSlideProps`:
   ```typescript
   import type { FC } from 'react';
   import type { BaseSlideProps } from '../../types/slide.types';
   import SlideHeader from './SlideHeader';
   import './ComponentName.css';

   interface ComponentNameProps extends BaseSlideProps {
     label?: string;
     title: string;
     // ...additional props
   }
   ```
3. Use `SlideHeader` for consistent header rendering across orientations
4. Support both orientations via the `orientation` prop (defaults to `'landscape'`):
   ```typescript
   const ComponentName: FC<ComponentNameProps> = ({ orientation = 'landscape', title, label }) => {
     if (orientation === 'portrait') {
       return <div className="component-name component-name--portrait">...</div>;
     }
     return <div className="component-name">...</div>;
   };
   ```
5. Follow flexbox rules — `flex: 1`, `min-width: 0`, no padding in the component CSS (padding belongs only in `.slide--landscape` / `.slide--portrait`)
6. Register it in `src/utils/slideRegistry.ts` (built-in templates only) and
   run `npm run debug -- audit-slides` and `audit-slides --portrait`

## Development Server

- The dev server runs on port **5199**, or the next free port (see
  `node/vite.ts`; `--port` makes the port strict)
- `npm run dev` (`ok-vibe-slides dev`) starts the notes-sync service (internal port 5200), enables the
  debug adapter, and starts Vite. Vite proxies `/speaker-sync`, so only port
  5199 needs to be open.
- The control token is never put in the page bundle. `npm run dev` prints deck
  and presenter links with `?session=default&token=...`; sync and speaker notes
  need a tab opened from such a link (the token then lives in session storage).
  The token is also written to the git-ignored `.tmp/sync-control-token`, which
  the debug CLI reads when `SYNC_CONTROL_TOKEN` is unset.
- `npm run dev:vite` starts Vite alone; speaker notes show as disconnected and
  the debug CLI is unavailable.
- `npm run dev:sync` runs only the notes service and normally needs
  `SYNC_CONTROL_TOKEN`.
- Edits to a deck's `notes.mjs` or `sparkle.mjs` reload into the running
  service; no restart is needed.

## Testing Commands
```bash
npm run dev          # Start development server (Vite + notes service)
npm run build        # Build for production (public shell only)
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript type checking
npm test             # Vitest unit and component tests
npm run test:browser # Playwright: engine on ports 5198/5201, consumer package on 5197/5202
npm run slides:audit # Audit the live deck through the debug adapter
```

Run checks in proportion to the change. For application behavior, run
`npm test`, `npm run type-check`, and `npm run lint`. Add `npm run test:browser`
for navigation, themes, the developer drawer, sync, notes, or practice; add
`npm run build` for bundling or route changes. Changes under `bin/`, `node/`,
`src/index.ts`, or package `exports` also need the `tests/package` specs
(`npm test` and `npm run test:browser` both include them).

## Key Features
- Dual aspect ratio support (16:9 and 9:16)
- Keyboard navigation (arrows, F for fullscreen)
- Touch navigation on mobile
- Debug mode for mobile preview
- Responsive scaling with fixed dimensions
- URL parameter navigation for direct slide access
- Public/authoring split: production builds serve `PublicApp` (deck, navigation,
  fullscreen, export); authoring tools exist only in development
- Developer tools drawer: speaker notes, practice, presentations, outline,
  palette, favicon preview, slide info, annotations, and style tweaks
- Annotations on slide elements, slide text, outline text, speaker-note
  bullets, Sparkle prompt fields, manuscript passages, and slide order
- Style tweaks: click slide text, adjust type and color with sliders, copy the
  changes for an agent
- Presenter remote at `/notes`: current/next previews, notes, timer, swipe
- Practice mode: manuscript reader with slide cues and sentence shortcuts
- Optional per-slide QR code (`SlideData.qrCode`) and video preloading
  (`SlideData.preloadVideo`)
- Debug CLI (`npm run debug -- help`), including `perf` and `perf-presenter`

## URL Navigation

The slideshow supports URL parameters for deep linking:

- `?presentation=demo` - Load specific presentation by ID
- `?slide=5` - Jump to slide 5 (1-based indexing)
- `?presentation=demo&slide=3` - Both together

### Routes

- `/` - Main presentation view (default presentation)
- `/export` or `/#export` - PDF export view
- `/export?presentation=demo` - Export specific presentation
- `/notes?session=<id>` - Presenter view (development only). The presentation
  tab must use the same `?session=<id>`.

### Behavior

- URLs auto-update as you navigate slides
- Invalid slide numbers default to slide 1
- Presentation defaults to first in array if not specified

## Critical Slide Dimensions

**IMPORTANT**: All slides are rendered at fixed dimensions and then scaled to fit the viewport:
- Desktop slides: 1920x1080 pixels (16:9)
- Mobile slides: 1080x1920 pixels (9:16)

### Slide Architecture Rules

#### 1. Padding is ONLY in slide--landscape/portrait classes
```css
.slide--landscape {
  width: 1920px;
  height: 1080px;
  padding: 50px;  /* This is the ONLY place padding should be */
  background: var(--color-surface);
  border-radius: 40px;
  display: flex;
  box-sizing: border-box;
}
```

#### 2. Slide components must use flexbox properly
```css
.my-slide {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  /* NO padding, NO width/height, NO background */
}
```

#### 3. Typography Scale (defined in design-system.css)
```css
--slide-title-huge: 200px;      /* Main titles */
--slide-title-large: 120px;     /* Section headers */
--slide-title-medium: 80px;     /* Subsection headers */
--slide-title-small: 64px;      /* Small headers */
--slide-subtitle: 120px;        /* Subtitles */
--slide-body-large: 56px;       /* Main content */
--slide-body: 48px;             /* Regular content */
--slide-body-small: 40px;       /* Small body text */
--slide-caption: 36px;          /* Labels and captions */
--slide-footer: 28px;           /* Footer text */
--slide-tiny: 24px;             /* Very small text (page numbers) */
```

### Slide Component Best Practices

#### DO:
- Use CSS variables for all font sizes
- Use `flex: 1` and `min-width: 0` for proper expansion
- Structure slides with semantic regions (header, content, footer)
- Use flexbox for layout (display: flex, justify-content, align-items)
- Keep font weights varied (300 for light, 400 for regular, 600-700 for bold)

#### DON'T:
- Add padding to individual slide components
- Use fixed width/height in slide components
- Add background colors or border-radius to slide components
- Use pixel values for typography — always use CSS variables
- Override the slide--landscape padding
- Use width-based constraints like `max-width: 90%` — use flexbox instead
- Use margins for positioning — use flexbox properties instead
- **NEVER use `overflow: hidden`** — it's a band-aid, find the real flexbox fix

### Flexbox Layout Guidelines

**ALWAYS use flexbox for layout instead of width/margin positioning.**

#### Proper Flexbox Patterns:
```css
/* CORRECT - Use flexbox for positioning */
.slide-container {
  display: flex;
  flex-direction: column;
  justify-content: space-between; /* Push elements apart */
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.content-area {
  flex: 1; /* Grows to fill space */
  min-width: 0; /* Prevents overflow */
}

.footer-area {
  /* No flex - stays at natural size */
}
```

#### Avoid These Patterns:
```css
/* WRONG - Don't use width constraints */
.content {
  max-width: 90%;
  margin-bottom: 60px;
}

/* WRONG - Don't use fixed margins for positioning */
.description {
  margin-top: auto; /* Use justify-content instead */
}
```

#### Key Flexbox Properties for Slides:
- `justify-content: space-between` - Push elements to top/bottom
- `justify-content: center` - Center content vertically
- `align-items: flex-start` - Align to left/top
- `flex: 1` - Element grows to fill available space
- `min-width: 0` - Prevents flex items from overflowing
- `gap: 20px` - Consistent spacing between flex items

#### Fixing Overflow Issues:
When content overflows its container, **NEVER use `overflow: hidden`**. Instead:
1. Add `min-width: 0` and `min-height: 0` to flex items
2. Use `width: 0; height: 0; flex: 1` to force flex sizing
3. Check parent containers have proper flex constraints
4. Ensure all containers in the chain have `min-width: 0` and `min-height: 0`

**Common Pattern for Vertical Overflow:**
```css
/* When child elements (like images) are growing too tall */
.slide-component {
  display: flex;
  flex-direction: column;
  flex: 1;           /* Grow to fill space */
  min-height: 0;     /* CRITICAL: Allow shrinking below content size */
}

.content-container {
  flex: 1;
  min-height: 0;     /* Force flexbox sizing on children */
}

.child-element {
  flex: 1;
  min-height: 0;     /* This will now respect parent constraints */
}
```

**Example Fix (Team Slide):**
The team member portraits were overflowing because they had `flex: 1` but the parent containers didn't have `min-height: 0`. Adding `min-height: 0` to the parent flex containers fixed the overflow by forcing the children to respect height constraints.

### Common Slide Patterns

#### Title Slide Structure
- Title block: top-left aligned
- Open space: middle/right for breathing room
- Footer: split between left (label/date) and right (page number)

#### Table of Contents Structure
- Left side (40%): Header and description
- Right side (60%): List container with numbered items
- Page number: absolute bottom-right

#### Content Slide Structure
- Header: Label and title
- Body: Main content area
- Visual: Optional image/chart area

### Testing Checklist
- [ ] No padding in component CSS
- [ ] Using CSS variables for all font sizes
- [ ] Flexbox layout with proper flex: 1
- [ ] Content fits within slide boundaries
- [ ] Typography scale is consistent
- [ ] Page numbers positioned correctly

## Slide Analysis Workflow

**Use the debug CLI (`npm run debug -- <command>`), not Chrome DevTools MCP
or Puppeteer scripts.** Run `npm run debug -- help` for every command.

### Prerequisites
- Dev server running (`npm run dev`; the user usually manages this)
- Chrome with remote debugging: `npm run debug -- browser` starts one on port
  9222 with its own profile, or does nothing if one is already running
- No tab setup: when no deck tab is open, commands open one (or `/notes` with
  `--notes`) with the session token. A reused tab whose stored token is from
  an earlier `dev` run is reloaded with the current one.

### Workflow
1. **Go to the slide**: `npm run debug -- go 4` (add `--presentation <id>`).
   `state` shows the slide ID and template.
2. **Audit it**: `audit-slide 4` (add `--portrait`). Errors fail the command
   (missing slide, root scroll, hidden text in a box that hides overflow,
   text or media outside the slide); warnings (text within 12px of the edge,
   text under an ancestor that hides overflow) are listed and counted.
3. **Look at it**: `screenshot-slide 4 --out .tmp/before.png`, then Read the
   PNG. `screenshot-slides` captures the whole deck in both orientations into
   `.tmp/screenshots/`.
4. **Inspect elements**: `computed ".slide--active .bullet-slide__title"`
   prints box, scroll size, drawn-text box, scale, and computed styles
   (`--prop a,b` to choose styles, `--index n` for a later match).
   `rect <selector>` lists boxes of every match. `eval "<expression>"` runs
   anything else in the page. `logs --reload` captures console errors.
5. **Fix the component**: edit the slide component CSS following the flexbox
   rules above.
6. **Verify**: `reload`, re-run `audit-slide`/`audit-slides`, and take another
   screenshot.

### Common Issues
- **Root scroll / `layout.overflows: true` vertically** - add `min-height: 0` to flex containers
- **Overflow horizontally** - add `min-width: 0` to flex containers
- **Elements too large** - check that parent containers have `min-width/height: 0`

## Annotation Workflow for AI Agents

Users annotate in the developer tools drawer (or the `/notes` presenter) and
press **Copy All** to hand the agent a Markdown review packet. Annotations can
target slide elements, selected slide text, outline text, speaker-note bullets,
Sparkle prompt fields, manuscript passages, and slide order.

### Review Packet Format

The packet (built by `src/utils/annotationClipboard.ts`) starts with the deck
ID, the captured git revision, and the deck source root, followed by an agent
coordination section and a work plan. Annotations are grouped by source target;
each group lists its annotation IDs, slides, and primary source file, and each
item carries the operation (edit content, replace text, adjust layout, move,
insert slide, app behavior, question), the comment, and the exact source text.

- Treat stable slide IDs, annotation IDs, note indexes, prop paths, and Sparkle
  fields as authoritative. Slide numbers only describe capture-time order.
- Apply slide-order annotations as simultaneous relative-order constraints over
  slide IDs, not as sequential moves.
- Manuscript items point at `src/data/presentations/<id>/manuscript.md:<line>`;
  speaker-note items point at the deck's `notes.mjs`; Sparkle items point at
  `sparkle.mjs`.

**Style tweaks** use the same drawer: the user adjusts type and color on slide
text and copies a list of CSS changes for the agent to apply to the component
stylesheet.

### Agent Response Workflow

1. Read the review packet and follow its work plan order
2. Navigate to the relevant slide with the debug CLI (`npm run debug -- go N`, or find the slide ID with `slides`) and confirm the issue with `screenshot-slide`, `audit-slide`, or `computed`
3. Edit the source file the packet names; for layout items, match the selector to `src/components/slides/`
4. Apply targeted CSS or JSX fixes following the flexbox rules above
5. Verify with `audit-slide` and `screenshot-slide` (see Slide Analysis Workflow)
6. Report what was changed per annotation ID

### Tips
- Cross-reference selectors with the component's `.css` file — do not use `overflow: hidden` as a fix
- After the user has applied a packet, **Clear copied** removes only the annotations that were copied

## Critical CSS Rules - DO NOT BREAK THESE

### Slide Positioning and Transitions

**NEVER add `position: relative` to `.slide--landscape` or `.slide--portrait`!**

The slide transition system depends on slides being absolutely positioned:
```css
/* CORRECT - Slides MUST be position: absolute for stacking */
.slide {
  position: absolute;  /* This is CRITICAL */
  top: 0;
  left: 0;
  opacity: 0;
  transform: translateX(100%) scale(0.95);
}

/* CORRECT - Do NOT add position to these */
.slide--landscape {
  /* NO position property here! */
  width: 1920px;
  height: 1080px;
  /* ... other styles ... */
}

/* WRONG - This breaks everything */
.slide--landscape {
  position: relative;  /* NEVER DO THIS */
}
```

#### Why This Matters:
- With `position: absolute`, slides stack on top of each other in the same space
- With `position: relative`, slides stay in document flow and appear below each other
- This causes the next slide to appear cut off at the bottom instead of transitioning smoothly

### Slide Structure

The Slide component has this structure:
```html
<div class="slide slide--landscape">
  <div class="slide__content">
    <!-- Your slide component goes here -->
  </div>
  <span class="slide__page-number">1</span>
</div>
```

#### Important Rules:
1. **Page numbers are handled by Slide.tsx** — Never add page numbers in individual slide components
2. **The `slide__content` wrapper** — All slide components are wrapped in this div
3. **Individual slides should use `flex: 1`** — To properly fill the slide__content container

### Mobile Frame Styles

```css
/* CORRECT - Target only slide__content */
.mobile-frame .slide--portrait .slide__content {
  /* styles */
}

/* WRONG - Don't use > * selector */
.mobile-frame .slide--portrait > * {
  /* This incorrectly targets page numbers too */
}
```

## Inspector Mode

Hold **Alt** key to enter inspector mode, on the deck or the `/notes` presenter page:
- Hover over elements to see component info, dimensions, and flex properties
- Click to annotate (the default); **Alt+C** switches clicks to copying debug info
- Use the **Slide info** section of the developer tools drawer to view current slide props

On `/notes`, annotations carry a `Presenter view → <area>` UI context and route
to `src/components/SpeakerNotesView.tsx`; note bullets route to `notes.mjs` and
slide previews to the slide. The comment popup and overlay attach to an open
modal dialog (`src/utils/topLayerHost.ts`) so they stay visible above it.

The Slide info section shows:
- Current slide number, template, title, ID
- Aspect ratio and dimensions
- All component props passed to the slide
