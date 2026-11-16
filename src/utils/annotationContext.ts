import type { AnnotationCaptureContext } from '../types/annotation.types';

const DEVELOPER_PANEL_LABELS: Record<string, string> = {
  speakerNotes: 'Speaker notes',
  presentations: 'Presentations',
  outline: 'Outline',
  palette: 'Palette',
  favicon: 'Favicon preview',
  slideInfo: 'Slide info',
  annotations: 'Annotations',
};

/** Areas of the /notes presenter page, innermost first. */
const PRESENTER_AREAS: Array<[selector: string, label: string]> = [
  ['.speaker-notes__settings', 'Settings'],
  ['.speaker-notes__jump', 'Jump to slide'],
  ['.speaker-notes__bar', 'Toolbar'],
  ['.speaker-notes__notes', 'Notes'],
  ['.talk-practice', 'Practice'],
  ['.speaker-notes__left-column', 'Annotations'],
  ['.speaker-notes__footer', 'Navigation and timer'],
  ['.speaker-notes__right-column', 'Slide previews'],
];

/** Returns the app surface an annotation target belongs to, when it is not slide content. */
export function getAppUiContext(element: HTMLElement | null): string | undefined {
  if (!element) return undefined;

  const drawer = element.closest('.developer-tools-drawer');
  if (drawer) {
    const panel = drawer.querySelector<HTMLElement>('.developer-tools-drawer__panel');
    const section = panel?.dataset.activeSection;
    return section
      ? `Developer tools drawer → ${DEVELOPER_PANEL_LABELS[section] ?? section}`
      : 'Developer tools drawer → navigation rail';
  }

  if (element.closest('.footer')) return 'Presentation footer';

  // The presenter's slide previews are slide content; everything around them is the presenter UI.
  if (element.closest('.speaker-notes') && !element.closest('.slide')) {
    const area = PRESENTER_AREAS.find(([selector]) => element.closest(selector));
    return area ? `Presenter view → ${area[1]}` : 'Presenter view';
  }
  return undefined;
}

/**
 * Returns the index of the speaker note bullet an element sits in, read from
 * the `data-speaker-note-index` attribute the notes panel and the presenter
 * page put on each bullet.
 */
export function getSpeakerNoteIndex(element: HTMLElement | null): number | undefined {
  const bullet = element?.closest<HTMLElement>(
    '.speaker-notes-sidebar [data-speaker-note-index], .speaker-notes__notes [data-speaker-note-index]',
  );
  const value = bullet?.dataset.speakerNoteIndex;
  if (value === undefined || value.trim() === '') return undefined;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

function escapeCssIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

const STABLE_ROOTS = ['.slide--active', '.developer-tools-drawer', '.footer', '.speaker-notes'];

/** Builds a selector anchored to the nearest stable application surface. */
export function getStableElementSelector(element: HTMLElement): string {
  const root = element.closest<HTMLElement>(STABLE_ROOTS.join(', '));
  if (!root) return element.tagName.toLowerCase();

  const rootSelector = STABLE_ROOTS.find((selector) => root.matches(selector)) ?? '.footer';
  if (element === root) return rootSelector;

  const parts: string[] = [];
  let current: HTMLElement | null = element;
  while (current && current !== root) {
    let part = current.id
      ? `#${escapeCssIdentifier(current.id)}`
      : current.tagName.toLowerCase();
    if (!current.id) {
      const classes = Array.from(current.classList)
        .filter((className) => ![
          'slide--active',
          'slide-text-editor',
          'speaker-notes-sidebar__note--marked',
          'speaker-notes-sidebar__note-replacement',
        ].includes(className))
        .slice(0, 3);
      if (classes.length) {
        part += classes.map((className) => `.${escapeCssIdentifier(className)}`).join('');
      }
    }

    const parent: HTMLElement | null = current.parentElement;
    if (parent) {
      const currentTagName = current.tagName;
      const sameTagSiblings: Element[] = Array.from(parent.children).filter(
        sibling => sibling.tagName === currentTagName,
      );
      if (sameTagSiblings.length > 1) {
        part += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      }
    }
    parts.unshift(part);
    current = parent;
  }

  return `${rootSelector}${parts.length ? ` > ${parts.join(' > ')}` : ''}`;
}

function sanitizedRoute(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  params.delete('token');
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
}

/** Captures reproducibility metadata without persisting credentials from the URL. */
export function createAnnotationCaptureContext(): AnnotationCaptureContext {
  return {
    capturedAt: Date.now(),
    revision: import.meta.env.VITE_GIT_REVISION || 'unknown',
    route: sanitizedRoute(),
    viewport: {
      width: typeof window === 'undefined' ? 0 : window.innerWidth,
      height: typeof window === 'undefined' ? 0 : window.innerHeight,
    },
  };
}
