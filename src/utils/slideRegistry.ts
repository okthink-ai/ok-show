import { engineFile, projectPaths } from '../project/paths';

// Single source of truth for all slide component types.
// Add new entries here — getComponentName, componentFileMap, and the
// hierarchy regex are all derived from this array automatically.
export const SLIDE_TYPES = [
  { classFragment: 'bullet-slide',          componentName: 'BulletSlide' },
  { classFragment: 'figures-slide',         componentName: 'FiguresSlide' },
  { classFragment: 'four-panel-slide',      componentName: 'FourPanelSlide' },
  { classFragment: 'four-image-slide',      componentName: 'FourImageSlide' },
  { classFragment: 'sections-slide',        componentName: 'SectionsSlide' },
  { classFragment: 'statement-slide',       componentName: 'StatementSlide' },
  // Predates the naming convention; its root class is `toc-slide`.
  { classFragment: 'toc-slide',             componentName: 'TableOfContentsSlide' },
  { classFragment: 'table-slide',           componentName: 'TableSlide' },
  { classFragment: 'team-slide',            componentName: 'TeamSlide' },
  { classFragment: 'text-with-media-slide', componentName: 'TextWithMediaSlide' },
  { classFragment: 'three-panel-slide',     componentName: 'ThreePanelSlide' },
  { classFragment: 'title-slide',           componentName: 'TitleSlide' },
  { classFragment: 'video-slide',           componentName: 'VideoSlide' },
] as const;

/**
 * `EightPanelSlide` → `eight-panel-slide`. A template's root element carries
 * this class; its parts and variants use BEM names built on it
 * (`eight-panel-slide__panel`, `eight-panel-slide--portrait`).
 */
export const templateClassFragment = (componentName: string): string =>
  componentName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * Engine templates plus the project's own (`templatesDir/*.css`). Project
 * templates come first, longest class fragment first, so a project template
 * that shadows or extends an engine name wins.
 */
export const TEMPLATE_TYPES: ReadonlyArray<{ classFragment: string; componentName: string }> = [
  ...Object.keys(projectPaths.templateStylesheets)
    .map(componentName => ({ classFragment: templateClassFragment(componentName), componentName }))
    .sort((a, b) => b.classFragment.length - a.classFragment.length),
  ...SLIDE_TYPES,
];

// Component name to CSS file mapping, as paths in the project being edited.
export const componentFileMap: Record<string, string> = {
  ...Object.fromEntries(
    SLIDE_TYPES.map(({ componentName }) => [
      componentName,
      engineFile(`src/components/slides/${componentName}.css`),
    ])
  ),
  ...projectPaths.templateStylesheets,
  'Slide container': engineFile('src/components/Slide.css'),
  'slide__content wrapper': engineFile('src/components/Slide.css'),
};

/** True when a class is the template's root class or a BEM element or modifier of it. */
const belongsTo = (cls: string, classFragment: string): boolean =>
  cls === classFragment || cls.startsWith(`${classFragment}__`) || cls.startsWith(`${classFragment}--`);

export function getComponentName(className: string): string {
  // SVG elements expose className as an object, not a string.
  if (typeof className !== 'string') return 'Unknown';
  const classes = className.split(/\s+/).filter(Boolean);
  for (const { classFragment, componentName } of TEMPLATE_TYPES) {
    if (classes.some(cls => belongsTo(cls, classFragment))) return componentName;
  }
  if (className.includes('slide__content')) return 'slide__content wrapper';
  if (className.includes('slide--')) return 'Slide container';
  return 'Unknown';
}
