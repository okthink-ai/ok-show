import { afterEach, describe, expect, it } from 'vitest';
import type { StyleTweak, StyleValues } from '../types/styleTweak.types';
import {
  buildTweakCss,
  elementPath,
  formatStyleTweaks,
  hierarchy,
  isNeutral,
  lightness,
  neutralGray,
  roleSelector,
  textElementAt,
  toHex,
  withValue,
} from './styleTweaks';

const original: StyleValues = {
  fontFamily: 'Plus Jakarta Sans',
  fontSize: 48,
  fontWeight: 400,
  fontStyle: 'normal',
  lineHeight: 1.32,
  letterSpacing: 0,
  textTransform: 'none',
  color: '#141414',
};

function tweak(overrides: Partial<StyleTweak> = {}): StyleTweak {
  return {
    id: 't1',
    presentationId: 'demo',
    slideId: 'why-now',
    slideIndex: 2,
    slideTitle: 'Why now',
    slideTemplate: 'Frame',
    elementPath: 'div:nth-child(1) > p:nth-child(2)',
    roleSelector: '.feature-caption',
    hierarchy: ['feature-frame', 'p.feature-caption'],
    tag: 'p',
    className: 'feature-caption',
    text: 'Every slide is a component.',
    original,
    scope: 'element',
    values: { fontWeight: 600 },
    updatedAt: 1,
    ...overrides,
  };
}

afterEach(() => document.body.replaceChildren());

describe('colors', () => {
  it('normalizes computed colors to six-digit hex', () => {
    expect(toHex('rgb(20, 20, 20)')).toBe('#141414');
    expect(toHex('rgba(255, 0, 128, 0.5)')).toBe('#ff0080');
    expect(toHex('#abc')).toBe('#aabbcc');
    expect(toHex('transparent')).toBe('#000000');
  });

  it('maps the shade slider to neutral grays', () => {
    expect(neutralGray(0)).toBe('#000000');
    expect(neutralGray(50)).toBe('#808080');
    expect(lightness('#808080')).toBe(50);
    expect(isNeutral('#141414')).toBe(true);
    expect(isNeutral('#ff6b35')).toBe(false);
  });
});

describe('withValue', () => {
  it('drops a property that returns to its original value', () => {
    const changed = withValue(original, {}, 'fontWeight', 700);
    expect(changed).toEqual({ fontWeight: 700 });
    expect(withValue(original, changed, 'fontWeight', 400)).toEqual({});
  });
});

describe('buildTweakCss', () => {
  it('writes role tweaks before element tweaks so element tweaks win', () => {
    const css = buildTweakCss([
      tweak({ id: 'a', scope: 'element', values: { color: '#333333' } }),
      tweak({ id: 'b', scope: 'role', values: { fontFamily: 'Ovo', fontSize: 52 } }),
    ]);
    const [role, element] = css.split('\n');
    expect(role).toBe(".slide__content .feature-caption { font-family: Ovo !important; font-size: 52px !important; }");
    expect(element).toBe('.slide[data-slide-key="why-now"] > .slide__content > div:nth-child(1) > p:nth-child(2) { color: #333333 !important; }');
  });

  it('skips tweaks with no changes', () => {
    expect(buildTweakCss([tweak({ values: {} })])).toBe('');
  });
});

describe('formatStyleTweaks', () => {
  it('lists each change with its slide, template, and before and after values', () => {
    const text = formatStyleTweaks([
      tweak({ id: 'later', slideIndex: 5, values: { letterSpacing: 0.02 } }),
      tweak({ values: { fontFamily: 'Ovo', fontWeight: 600 } }),
      tweak({ id: 'other', presentationId: 'other-deck' }),
    ], 'demo');

    expect(text).toContain('Style tweaks for presentation "demo" (2).');
    expect(text).toContain('1. [Slide 3 / why-now / Frame — "Why now"]');
    expect(text).toContain('   Element: <p class="feature-caption"> "Every slide is a component."');
    expect(text).toContain('   Inside: feature-frame › p.feature-caption');
    expect(text).toContain('   Scope: this element only (its rule is ".feature-caption")');
    expect(text).toContain("   font-family: 'Plus Jakarta Sans' → Ovo");
    expect(text).toContain('   font-weight: 400 → 600');
    expect(text).toContain('2. [Slide 6 /');
    expect(text).toContain('   letter-spacing: 0em → 0.02em');
  });

  it('says so when the deck has no tweaks', () => {
    expect(formatStyleTweaks([], 'demo')).toBe('No style tweaks for presentation "demo".');
  });
});

describe('locating picked text', () => {
  function mount() {
    document.body.innerHTML = `
      <div class="slide__content">
        <section class="feature-frame">
          <dl class="feature-points">
            <div class="feature-point"><dt>Term</dt><dd>Body <strong>bold</strong></dd></div>
          </dl>
          <p class="feature-caption slide--x">Caption</p>
        </section>
      </div>`;
    return document.querySelector('.slide__content') as HTMLElement;
  }

  it('builds an nth-child path and a role selector', () => {
    const root = mount();
    const dt = root.querySelector('dt') as HTMLElement;
    const caption = root.querySelector('p') as HTMLElement;
    expect(elementPath(dt, root)).toBe('section:nth-child(1) > dl:nth-child(1) > div:nth-child(1) > dt:nth-child(1)');
    expect(root.querySelector(`:scope > ${elementPath(dt, root)}`)).toBe(dt);
    expect(roleSelector(dt, root)).toBe('.feature-point dt');
    expect(roleSelector(caption, root)).toBe('.feature-caption');
    expect(hierarchy(dt, root)).toEqual(['feature-frame', 'feature-points', 'feature-point', 'dt']);
  });

  it('picks the deepest element that holds its own text', () => {
    const root = mount();
    const strong = root.querySelector('strong') as HTMLElement;
    expect(textElementAt(strong, root)).toBe(strong);
    expect(textElementAt(root.querySelector('dl'), root)).toBeNull();
    expect(textElementAt(document.body, root)).toBeNull();
  });
});
