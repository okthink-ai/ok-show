import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { StyleProperty, StyleTweak, StyleValues, TweakScope, TweakSelection, TweakTarget } from '../types/styleTweak.types';
import { changedProperties, sameTarget, withValue } from '../utils/styleTweaks';
import { generateId } from './annotationsSlice';

export const STYLE_TWEAKS_KEY = 'ok-show-style-tweaks';

interface StyleTweaksState {
  /** Picking mode: clicks on slide text select it instead of advancing. */
  isActive: boolean;
  tweaks: StyleTweak[];
  selection: TweakSelection | null;
}

function isTweak(value: unknown): value is StyleTweak {
  if (!value || typeof value !== 'object') return false;
  const tweak = value as Partial<StyleTweak>;
  return typeof tweak.id === 'string'
    && typeof tweak.presentationId === 'string'
    && typeof tweak.slideId === 'string'
    && typeof tweak.elementPath === 'string'
    && typeof tweak.roleSelector === 'string'
    && (tweak.scope === 'element' || tweak.scope === 'role')
    && Boolean(tweak.original && typeof tweak.original === 'object')
    && Boolean(tweak.values && typeof tweak.values === 'object');
}

function loadTweaks(): StyleTweak[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STYLE_TWEAKS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isTweak).map((tweak) => ({ ...tweak, hierarchy: tweak.hierarchy ?? [] })) : [];
  } catch {
    return [];
  }
}

const initialState: StyleTweaksState = {
  isActive: false,
  tweaks: loadTweaks(),
  selection: null,
};

function findIndex(state: StyleTweaksState, target: TweakTarget): number {
  return state.tweaks.findIndex((tweak) => sameTarget(tweak, target));
}

const styleTweaksSlice = createSlice({
  name: 'styleTweaks',
  initialState,
  reducers: {
    setStyleTweakMode(state, action: PayloadAction<boolean>) {
      state.isActive = action.payload;
    },
    /** Select a picked element. An existing tweak keeps its first-read original and scope. */
    selectTweakTarget(state, action: PayloadAction<TweakTarget | null>) {
      const target = action.payload;
      if (!target) { state.selection = null; return; }
      const existing = state.tweaks[findIndex(state, target)];
      state.selection = existing
        ? { target: { ...target, original: existing.original }, scope: existing.scope }
        : { target, scope: 'element' };
    },
    setTweakValue(state, action: PayloadAction<{ property: StyleProperty; value: StyleValues[StyleProperty] }>) {
      const selection = state.selection;
      if (!selection) return;
      const { property, value } = action.payload;
      const index = findIndex(state, selection.target);
      const current = index >= 0 ? state.tweaks[index].values : {};
      const values = withValue(selection.target.original, current, property, value as never);
      if (changedProperties(values).length === 0) {
        if (index >= 0) state.tweaks.splice(index, 1);
        return;
      }
      if (index >= 0) {
        state.tweaks[index] = { ...state.tweaks[index], ...selection.target, values, updatedAt: Date.now() };
      } else {
        state.tweaks.push({ ...selection.target, id: generateId(), scope: selection.scope, values, updatedAt: Date.now() });
      }
    },
    setTweakScope(state, action: PayloadAction<TweakScope>) {
      if (!state.selection) return;
      state.selection.scope = action.payload;
      const index = findIndex(state, state.selection.target);
      if (index >= 0) state.tweaks[index].scope = action.payload;
    },
    resetSelectedTweak(state) {
      if (!state.selection) return;
      const index = findIndex(state, state.selection.target);
      if (index >= 0) state.tweaks.splice(index, 1);
    },
    removeStyleTweak(state, action: PayloadAction<string>) {
      state.tweaks = state.tweaks.filter((tweak) => tweak.id !== action.payload);
    },
    clearStyleTweaks(state, action: PayloadAction<string>) {
      state.tweaks = state.tweaks.filter((tweak) => tweak.presentationId !== action.payload);
      if (state.selection?.target.presentationId === action.payload) state.selection = null;
    },
  },
});

export const {
  setStyleTweakMode,
  selectTweakTarget,
  setTweakValue,
  setTweakScope,
  resetSelectedTweak,
  removeStyleTweak,
  clearStyleTweaks,
} = styleTweaksSlice.actions;

export default styleTweaksSlice.reducer;
