import { describe, expect, it } from 'vitest';
import type { StyleValues, TweakTarget } from '../types/styleTweak.types';
import reducer, {
  clearStyleTweaks,
  resetSelectedTweak,
  selectTweakTarget,
  setTweakScope,
  setTweakValue,
} from './styleTweaksSlice';

const original: StyleValues = {
  fontFamily: 'Ovo',
  fontSize: 48,
  fontWeight: 400,
  fontStyle: 'normal',
  lineHeight: 1.25,
  letterSpacing: 0,
  textTransform: 'none',
  color: '#141414',
};

function target(overrides: Partial<TweakTarget> = {}): TweakTarget {
  return {
    presentationId: 'demo',
    slideId: 'why-now',
    slideIndex: 2,
    slideTitle: 'Why now',
    slideTemplate: 'Frame',
    elementPath: 'p:nth-child(2)',
    roleSelector: '.feature-caption',
    hierarchy: [],
    tag: 'p',
    className: 'feature-caption',
    text: 'Caption',
    original,
    ...overrides,
  };
}

const empty = () => reducer({ isActive: false, tweaks: [], selection: null }, { type: 'init' });

describe('styleTweaksSlice', () => {
  it('creates a tweak for the selection and removes it when every value is back to the original', () => {
    let state = reducer(empty(), selectTweakTarget(target()));
    state = reducer(state, setTweakValue({ property: 'fontWeight', value: 600 }));
    expect(state.tweaks).toHaveLength(1);
    expect(state.tweaks[0]).toMatchObject({ scope: 'element', values: { fontWeight: 600 } });

    state = reducer(state, setTweakValue({ property: 'fontWeight', value: 400 }));
    expect(state.tweaks).toEqual([]);
  });

  it('keeps the first-read original and scope when an element is picked again', () => {
    let state = reducer(empty(), selectTweakTarget(target()));
    state = reducer(state, setTweakScope('role'));
    state = reducer(state, setTweakValue({ property: 'color', value: '#333333' }));
    state = reducer(state, selectTweakTarget(target({ original: { ...original, color: '#333333' } })));

    expect(state.selection?.scope).toBe('role');
    expect(state.selection?.target.original.color).toBe('#141414');
    expect(state.tweaks[0].scope).toBe('role');
  });

  it('resets the selected element and clears only the requested deck', () => {
    let state = reducer(empty(), selectTweakTarget(target({ presentationId: 'other-deck' })));
    state = reducer(state, setTweakValue({ property: 'fontSize', value: 52 }));
    state = reducer(state, selectTweakTarget(target()));
    state = reducer(state, setTweakValue({ property: 'fontSize', value: 56 }));
    expect(state.tweaks).toHaveLength(2);

    state = reducer(state, clearStyleTweaks('other-deck'));
    expect(state.tweaks.map((tweak) => tweak.presentationId)).toEqual(['demo']);
    expect(state.selection).not.toBeNull();

    state = reducer(state, resetSelectedTweak());
    expect(state.tweaks).toEqual([]);
  });
});
