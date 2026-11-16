import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import uiReducer, {
  PRACTICE_TEXT_SIZE_KEY, PRESENTER_MODE_KEY, PRESENTER_NEXT_KEY, PRESENTER_PRESENTING_KEY,
  PRESENTER_TALK_MINUTES_KEY, NAV_HINT_SEEN_KEY, PRESENTER_TIMER_KEY, SIDEBAR_STORAGE_KEY, THEME_STORAGE_KEY, DRAWER_WIDTH_KEY,
} from './uiSlice';
import presentationReducer from './presentationSlice';
import annotationsReducer, { ANNOTATIONS_KEY, MODE_KEY, PENDING_ANNOTATION_KEY, replaceAnnotations } from './annotationsSlice';
import { encodeAnnotationsForStorage, encodePendingDraftForStorage } from './annotationCodec';
import styleTweaksReducer, { STYLE_TWEAKS_KEY } from './styleTweaksSlice';
import { persistedField, registerPersistence } from './persistence';
import { annotationsFromStorageEvent } from './crossTabSync';

// Storage key of the removed per-deck practice annotation session.
const STALE_PRACTICE_SESSION_KEY = 'ok-vibe-slides-practice-annotation-session';
try { localStorage.removeItem(STALE_PRACTICE_SESSION_KEY); } catch { /* storage unavailable */ }

const listenerMiddleware = createListenerMiddleware();

const str = (value: unknown) => String(value);
const json = (value: unknown) => JSON.stringify(value);

/** Every value saved to localStorage, in one place. */
registerPersistence<RootState>(listenerMiddleware, [
  persistedField<RootState, number>({ key: PRACTICE_TEXT_SIZE_KEY, select: s => s.ui.practiceTextSize, serialize: str }),
  persistedField<RootState, string>({ key: PRESENTER_MODE_KEY, select: s => s.ui.presenterReadingMode, serialize: str }),
  persistedField<RootState, boolean>({ key: PRESENTER_NEXT_KEY, select: s => s.ui.presenterShowNext, serialize: str }),
  persistedField<RootState, number>({ key: PRESENTER_TALK_MINUTES_KEY, select: s => s.ui.presenterTalkMinutes, serialize: str }),
  persistedField<RootState, boolean>({ key: PRESENTER_PRESENTING_KEY, select: s => s.ui.presenterPresenting, serialize: str }),
  persistedField<RootState, unknown>({ key: PRESENTER_TIMER_KEY, select: s => s.ui.presenterTimer, serialize: json }),
  persistedField<RootState, string>({ key: THEME_STORAGE_KEY, select: s => s.ui.theme, serialize: str }),
  persistedField<RootState, boolean>({ key: NAV_HINT_SEEN_KEY, select: s => s.ui.navHintSeen, serialize: str }),
  persistedField<RootState, number>({ key: DRAWER_WIDTH_KEY, select: s => s.ui.drawerWidth, serialize: str }),
  persistedField<RootState, string | null>({
    key: SIDEBAR_STORAGE_KEY,
    // Select a primitive pair so the listener fires only when one changes.
    select: s => `${s.ui.activeSidebar !== null}|${s.ui.lastSidebar}`,
    serialize: (value) => {
      const [open, lastSidebar] = String(value).split('|');
      return json({ open: open === 'true', lastSidebar });
    },
  }),
  persistedField<RootState, unknown>({
    key: ANNOTATIONS_KEY,
    select: s => s.annotations.annotations,
    serialize: (value) => json(encodeAnnotationsForStorage(value as RootState['annotations']['annotations'])),
  }),
  persistedField<RootState, RootState['annotations']['pendingDraft']>({
    key: PENDING_ANNOTATION_KEY,
    select: s => s.annotations.pendingDraft,
    serialize: draft => (draft ? json(encodePendingDraftForStorage(draft)) : null),
    debounceMs: 300,
  }),
  persistedField<RootState, boolean>({ key: MODE_KEY, select: s => s.annotations.isMultiSelectMode, serialize: str }),
  persistedField<RootState, unknown>({ key: STYLE_TWEAKS_KEY, select: s => s.styleTweaks.tweaks, serialize: json }),
]);

export const store = configureStore({
  reducer: {
    ui: uiReducer,
    presentation: presentationReducer,
    annotations: annotationsReducer,
    styleTweaks: styleTweaksReducer,
  },
  middleware: (getDefault) => getDefault().prepend(listenerMiddleware.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Another tab (deck or /notes) writes the shared annotation list. Adopt it so
// this tab's next save already contains that tab's changes. The event never
// fires in the writing tab, and an unchanged list is ignored, so tabs cannot
// echo a value back and forth.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    const incoming = annotationsFromStorageEvent(event, store.getState().annotations.annotations);
    if (incoming) store.dispatch(replaceAnnotations(incoming));
  });
}
