import type { StyleProperty, StyleTweak, StyleValues, TextCase, TweakScope, TweakTarget } from '../types/styleTweak.types';

/** The id of the <style> element that previews every tweak. */
export const TWEAK_LAYER_ID = 'style-tweaks-layer';
/** Attribute set on the element under the pointer while picking. */
export const TWEAK_HOVER_ATTR = 'data-style-tweak-hover';

/** Families index.html and index.css already load. */
export const FONT_CHOICES = [
  'Ovo',
  'Plus Jakarta Sans',
  'JetBrains Mono',
  'Manrope',
  'Spectral',
  'DM Sans',
  'IBM Plex Sans',
  'Space Grotesk',
  'Lora',
  'Cormorant Garamond',
] as const;

export const PROPERTY_LABELS: Record<StyleProperty, string> = {
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  fontStyle: 'font-style',
  lineHeight: 'line-height',
  letterSpacing: 'letter-spacing',
  textTransform: 'text-transform',
  color: 'color',
};

const PROPERTY_ORDER: StyleProperty[] = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'textTransform', 'color'];

// --- Color -------------------------------------------------------------------

const hex2 = (value: number) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0');

/** `rgb(…)`/`rgba(…)`/`#rgb`/`#rrggbb` to `#rrggbb`. Anything else becomes black. */
export function toHex(color: string): string {
  const value = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{3}$/.test(value)) return `#${[...value.slice(1)].map((c) => c + c).join('')}`;
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (!match) return '#000000';
  const [r, g, b] = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if ([r, g, b].some((channel) => !Number.isFinite(channel))) return '#000000';
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/** HSL lightness of a hex color, 0 to 100. */
export function lightness(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return Math.round(((Math.max(...channels) + Math.min(...channels)) / 2) * 100);
}

/** A neutral gray at the given lightness, 0 (black) to 100 (white). */
export function neutralGray(percent: number): string {
  const channel = hex2((Math.min(100, Math.max(0, percent)) / 100) * 255);
  return `#${channel}${channel}${channel}`;
}

export function isNeutral(hex: string): boolean {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(...channels) - Math.min(...channels) <= 3;
}

// --- Reading an element ------------------------------------------------------

const round = (value: number, places: number) => Number(value.toFixed(places));

function firstFamily(fontFamily: string): string {
  return (fontFamily.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '') || 'sans-serif';
}

function toTextCase(value: string): TextCase {
  return value === 'uppercase' || value === 'lowercase' || value === 'capitalize' ? value : 'none';
}

/** Computed values for an element. Pixel values ignore the slide's scale transform. */
export function readStyleValues(style: CSSStyleDeclaration): StyleValues {
  const fontSize = parseFloat(style.fontSize) || 16;
  const lineHeight = style.lineHeight === 'normal' ? 1.2 : parseFloat(style.lineHeight) / fontSize;
  const letterSpacing = style.letterSpacing === 'normal' ? 0 : parseFloat(style.letterSpacing) / fontSize;
  return {
    fontFamily: firstFamily(style.fontFamily),
    fontSize: round(fontSize, 1),
    fontWeight: Number(style.fontWeight) || 400,
    fontStyle: style.fontStyle === 'italic' || style.fontStyle.startsWith('oblique') ? 'italic' : 'normal',
    lineHeight: round(Number.isFinite(lineHeight) ? lineHeight : 1.2, 2),
    letterSpacing: round(Number.isFinite(letterSpacing) ? letterSpacing : 0, 3),
    textTransform: toTextCase(style.textTransform),
    color: toHex(style.color),
  };
}

const IGNORED_CLASS = /^(slide--|is-|has-|active$|css-)/;

function classesOf(element: Element): string[] {
  return [...element.classList].filter((name) => !IGNORED_CLASS.test(name));
}

/** `:nth-child` steps from `root` down to `element`, e.g. `section:nth-child(1) > p:nth-child(3)`. */
export function elementPath(element: Element, root: Element): string {
  const steps: string[] = [];
  let current: Element | null = element;
  while (current && current !== root) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;
    steps.unshift(`${current.tagName.toLowerCase()}:nth-child(${[...parent.children].indexOf(current) + 1})`);
    current = parent;
  }
  return steps.join(' > ');
}

/**
 * The selector the element's CSS most likely lives under: its own first class, or
 * its tag under the nearest classed ancestor (`.feature-point dt`).
 */
export function roleSelector(element: Element, root: Element): string {
  const own = classesOf(element)[0];
  if (own) return `.${own}`;
  const tag = element.tagName.toLowerCase();
  for (let ancestor = element.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
    const name = classesOf(ancestor)[0];
    if (name) return `.${name} ${tag}`;
  }
  return tag;
}

export function hierarchy(element: Element, root: Element): string[] {
  const names: string[] = [];
  for (let current: Element | null = element; current && current !== root; current = current.parentElement) {
    const name = classesOf(current)[0];
    if (current === element) names.unshift(name ? `${current.tagName.toLowerCase()}.${name}` : current.tagName.toLowerCase());
    else if (name) names.unshift(name);
  }
  return names;
}

/** The deepest element under the pointer that holds text of its own. */
export function textElementAt(target: EventTarget | null, root: Element): HTMLElement | null {
  if (!(target instanceof Element) || !root.contains(target)) return null;
  for (let current: Element | null = target; current && current !== root; current = current.parentElement) {
    if (!(current instanceof HTMLElement)) continue;
    const ownText = [...current.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    if (ownText) return current;
  }
  return null;
}

// --- Tweak values ------------------------------------------------------------

export function effectiveValues(original: StyleValues, values: Partial<StyleValues>): StyleValues {
  return { ...original, ...values };
}

/** Sets one property, dropping it when it is back to the original value. */
export function withValue<Key extends StyleProperty>(
  original: StyleValues,
  values: Partial<StyleValues>,
  property: Key,
  value: StyleValues[Key],
): Partial<StyleValues> {
  const next = { ...values };
  if (original[property] === value) delete next[property];
  else next[property] = value;
  return next;
}

export function formatValue<Key extends StyleProperty>(property: Key, value: StyleValues[Key]): string {
  switch (property) {
    case 'fontSize': return `${value}px`;
    case 'letterSpacing': return `${value}em`;
    case 'fontFamily': return /\s/.test(String(value)) ? `'${value}'` : String(value);
    default: return String(value);
  }
}

export function changedProperties(values: Partial<StyleValues>): StyleProperty[] {
  return PROPERTY_ORDER.filter((property) => values[property] !== undefined);
}

function declarations(values: Partial<StyleValues>, important: boolean): string {
  const suffix = important ? ' !important' : '';
  return changedProperties(values)
    .map((property) => `${PROPERTY_LABELS[property]}: ${formatValue(property, values[property] as never)}${suffix};`)
    .join(' ');
}

function quoteAttribute(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The selector a tweak previews under. Slide.tsx tags each slide with data-slide-key. */
export function tweakSelector(target: Pick<TweakTarget, 'slideId' | 'elementPath' | 'roleSelector'>, scope: TweakScope): string {
  if (scope === 'role') return `.slide__content ${target.roleSelector}`;
  const content = `.slide[data-slide-key=${quoteAttribute(target.slideId)}] > .slide__content`;
  return target.elementPath ? `${content} > ${target.elementPath}` : content;
}

/** Preview CSS for one deck. Element tweaks follow role tweaks so they win ties. */
export function buildTweakCss(tweaks: StyleTweak[]): string {
  const ordered = [...tweaks.filter((tweak) => tweak.scope === 'role'), ...tweaks.filter((tweak) => tweak.scope === 'element')];
  return ordered
    .filter((tweak) => changedProperties(tweak.values).length > 0)
    .map((tweak) => `${tweakSelector(tweak, tweak.scope)} { ${declarations(tweak.values, true)} }`)
    .join('\n');
}

/** The picked element a saved tweak describes, without its edit state. */
export function targetOf(tweak: StyleTweak): TweakTarget {
  return {
    presentationId: tweak.presentationId,
    slideId: tweak.slideId,
    slideIndex: tweak.slideIndex,
    slideTitle: tweak.slideTitle,
    slideTemplate: tweak.slideTemplate,
    elementPath: tweak.elementPath,
    roleSelector: tweak.roleSelector,
    hierarchy: tweak.hierarchy,
    tag: tweak.tag,
    className: tweak.className,
    text: tweak.text,
    original: tweak.original,
  };
}

export function sameTarget(a: Pick<TweakTarget, 'presentationId' | 'slideId' | 'elementPath'>, b: Pick<TweakTarget, 'presentationId' | 'slideId' | 'elementPath'>): boolean {
  return a.presentationId === b.presentationId && a.slideId === b.slideId && a.elementPath === b.elementPath;
}

// --- Clipboard ---------------------------------------------------------------

function truncate(text: string, length: number): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > length ? `${single.slice(0, length - 1)}…` : single;
}

/** The prompt an agent applies to the deck source. */
export function formatStyleTweaks(tweaks: StyleTweak[], presentationId: string): string {
  const owned = tweaks
    .filter((tweak) => tweak.presentationId === presentationId && changedProperties(tweak.values).length > 0)
    .sort((a, b) => a.slideIndex - b.slideIndex || a.updatedAt - b.updatedAt);
  if (owned.length === 0) return `No style tweaks for presentation "${presentationId}".`;

  const lines = [
    `Style tweaks for presentation "${presentationId}" (${owned.length}).`,
    'Values are rendered sizes at the fixed slide size. Apply each change to the deck\'s source CSS, not as inline styles. "Every match" means the change was previewed on every element matching that selector in the deck; "this element only" means just the one element.',
    '',
  ];
  owned.forEach((tweak, index) => {
    const className = tweak.className ? ` class="${tweak.className}"` : '';
    lines.push(`${index + 1}. [Slide ${tweak.slideIndex + 1} / ${tweak.slideId} / ${tweak.slideTemplate} — "${tweak.slideTitle}"]`);
    lines.push(`   Element: <${tweak.tag}${className}> "${truncate(tweak.text, 80)}"`);
    if (tweak.hierarchy.length > 0) lines.push(`   Inside: ${tweak.hierarchy.join(' › ')}`);
    lines.push(`   Scope: ${tweak.scope === 'role' ? `every match for "${tweak.roleSelector}"` : `this element only (its rule is "${tweak.roleSelector}")`}`);
    for (const property of changedProperties(tweak.values)) {
      const before = formatValue(property, tweak.original[property] as never);
      const after = formatValue(property, tweak.values[property] as never);
      lines.push(`   ${PROPERTY_LABELS[property]}: ${before} → ${after}`);
    }
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}
