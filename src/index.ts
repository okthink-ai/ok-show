/**
 * ok-show public API for projects that install the engine as a
 * package: slide types and the built-in templates. The app shell, tools, and
 * dev server come from the `ok-show` CLI, not from this module.
 *
 * Importing a template from here loads every built-in template's stylesheet.
 * A project that replaces a built-in template with its own copy (same class
 * names) should import the built-ins it keeps one by one instead:
 * `import BulletSlide from 'ok-show/slides/BulletSlide'`.
 */
export type {
  AspectRatio,
  ArtworkSide,
  BaseSlideProps,
  Presentation,
  PresentationMeta,
  SlideArtworkMetadata,
  SlideData,
  SlideOrientation,
  SlideQrCode,
  TextSafeSide,
} from './types/slide.types';
export type { SparklePromptInfo, SparklePromptMap } from './types/speakerNotes.types';

export { default as MaterialIcon } from './components/MaterialIcon';
export { default as VideoOverlay, PlayButton, useVideoOverlay } from './components/VideoOverlay';
export { default as BulletSlide } from './components/slides/BulletSlide';
export { default as FiguresSlide } from './components/slides/FiguresSlide';
export { default as FourImageSlide } from './components/slides/FourImageSlide';
export { default as FourPanelSlide } from './components/slides/FourPanelSlide';
export { default as SectionsSlide } from './components/slides/SectionsSlide';
export { default as SlideHeader } from './components/slides/SlideHeader';
export { default as StatementSlide } from './components/slides/StatementSlide';
export { default as TableOfContentsSlide } from './components/slides/TableOfContentsSlide';
export { default as TableSlide } from './components/slides/TableSlide';
export { default as TeamSlide } from './components/slides/TeamSlide';
export { default as TextWithMediaSlide } from './components/slides/TextWithMediaSlide';
export { default as ThreePanelSlide } from './components/slides/ThreePanelSlide';
export { default as TitleSlide } from './components/slides/TitleSlide';
export { default as VideoSlide } from './components/slides/VideoSlide';
