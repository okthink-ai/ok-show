# ok-show Demo

## Context for agents

This is the practice manuscript for this deck. The presenter view's Practice tab renders everything outside this section. Each `<!-- slide:<id> -->` marker becomes a cue that moves the deck to that slide. Keep the markers in the same order as `slides.tsx`, and use stable slide IDs, not slide numbers.

## Opening

<!-- slide:demo-title -->

Welcome, everyone. This is ok-show, a presentation engine where every slide is a React component. You write the deck in code, review it in the browser, and present it from the same project.

<!-- slide:demo-toc -->

We will walk through five things: the slide templates, how content lays out, data visualization, media, and team profiles.

## Templates

<!-- slide:demo-bullet -->

Every deck renders in two aspect ratios, landscape for the stage and portrait for phones. You navigate with the keyboard or with swipes, leave annotations on any element, inspect layout with the Alt key, and export the whole deck to PDF.

<!-- slide:demo-statement -->

Here is the central idea. Presentations should be built with code, not dragged around in a GUI. When slides are typed components, they stay reusable and version controlled.

<!-- slide:demo-three-panel -->

Three foundations hold that up: a design system with consistent tokens, a library of slide templates, and a fast authoring loop.

<!-- slide:demo-four-panel -->

Navigation, annotations, the inspector, and export work together. You review a slide, leave a note, hand the note to an agent, and check the fix.

## Media and data

<!-- slide:demo-four-image -->

Image-heavy layouts use the same components, with alt text on every image.

<!-- slide:demo-text-media -->

Media is optional. When a slide has none, the text column takes the full width.

<!-- slide:demo-team -->

Team profiles carry their own metadata and orientation-specific portraits.

<!-- slide:demo-table -->

Tables can highlight a column, and they switch to a stacked treatment on portrait slides.

<!-- slide:demo-figures -->

A few numbers sum up the engine's breadth and its small footprint.

## Closing

<!-- slide:demo-sections -->

To find your way around the code: components hold the templates and chrome, hooks handle navigation and layout, the store holds state, and the design system holds the tokens.

<!-- slide:demo-video -->

And finally, video. In landscape, a video with a description gets a two-column layout. Thanks for watching.
