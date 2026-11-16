/**
 * Style tweaks are local, live previews of type and color changes to slide text.
 * Like annotations they describe a requested source change; an agent applies the
 * copied summary to the deck's CSS.
 */

export type TextCase = 'none' | 'uppercase' | 'lowercase' | 'capitalize';

/** Rendered values at the fixed 1920x1080 (or 1080x1920) slide size. */
export interface StyleValues {
  /** The first family in the computed font-family list, unquoted. */
  fontFamily: string;
  /** Pixels. */
  fontSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  /** Unitless ratio of the font size. */
  lineHeight: number;
  /** Ems. */
  letterSpacing: number;
  textTransform: TextCase;
  /** #rrggbb. */
  color: string;
}

export type StyleProperty = keyof StyleValues;

/**
 * `element` previews the change on the clicked element only. `role` previews it on
 * every element matching `roleSelector` in the current deck, which is how most
 * type changes end up in the source.
 */
export type TweakScope = 'element' | 'role';

/** The text element a tweak belongs to. Everything here is serializable. */
export interface TweakTarget {
  presentationId: string;
  slideId: string;
  slideIndex: number;
  slideTitle: string;
  slideTemplate: string;
  /** Child-index path below `.slide__content`, used to find the element again. */
  elementPath: string;
  /** A class-based selector shared by the element's siblings in role, e.g. `.feature-point dt`. */
  roleSelector: string;
  /** Classed ancestors from the slide content down to the element. */
  hierarchy: string[];
  tag: string;
  className: string;
  text: string;
  /** Computed values before any tweak, read with the tweak layer disabled. */
  original: StyleValues;
}

export interface StyleTweak extends TweakTarget {
  id: string;
  scope: TweakScope;
  /** Only the properties that differ from `original`. */
  values: Partial<StyleValues>;
  updatedAt: number;
}

export interface TweakSelection {
  target: TweakTarget;
  scope: TweakScope;
}
