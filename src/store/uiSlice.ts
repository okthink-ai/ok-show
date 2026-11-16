import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { AspectRatio } from '../types/slide.types';
import { isThemeId, type ThemeId } from '../themes';
import type { PresenterTimerState } from '../utils/presenterTimer';
import type { TranslationBackend, TranslationLanguage } from '../translation/protocol';

export const THEME_STORAGE_KEY = 'ok-show-theme';
export const PRESENTER_NEXT_KEY = 'speaker-notes-show-next';
export const PRESENTER_MODE_KEY = 'speaker-notes-reading-mode';
export const PRACTICE_TEXT_SIZE_KEY = 'speaker-notes-practice-text-size';
export const PRESENTER_TALK_MINUTES_KEY = 'speaker-notes-talk-minutes';
export const PRESENTER_PRESENTING_KEY = 'speaker-notes-presenting';
export const PRESENTER_TIMER_KEY = 'speaker-notes-timer';
export const NAV_HINT_SEEN_KEY = 'ok-show-nav-hint-seen';
export const TRANSLATION_PREFERENCES_KEY = 'ok-show-translation-preferences';

/** One reading size serves both the notes and the practice manuscript. */
export const READING_SIZE_MIN = 16;
export const READING_SIZE_MAX = 36;
export const READING_SIZE_STEP = 2;
const DEFAULT_READING_SIZE = 22;
export const TALK_MINUTES_MIN = 5;
export const TALK_MINUTES_MAX = 180;
const DEFAULT_TALK_MINUTES = 40;

interface TranslationPreferences {
  backend: TranslationBackend | '';
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  captionsVisible: boolean;
  captionFontSize: number;
}

const DEFAULT_TRANSLATION_PREFERENCES: TranslationPreferences = {
  backend: '',
  sourceLanguage: 'en',
  targetLanguage: 'es',
  captionsVisible: true,
  captionFontSize: 48,
};

function loadTranslationPreferences(): TranslationPreferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRANSLATION_PREFERENCES_KEY) ?? 'null') as Partial<TranslationPreferences> | null;
    const backend = ['', 'openai-realtime', 'elevenlabs-scribe', 'elevenlabs-realtime'].includes(parsed?.backend ?? '')
      ? parsed?.backend ?? '' : '';
    const sourceLanguage = parsed?.sourceLanguage === 'es' ? 'es' : 'en';
    const targetLanguage = parsed?.targetLanguage === sourceLanguage
      ? (sourceLanguage === 'en' ? 'es' : 'en') : parsed?.targetLanguage === 'en' ? 'en' : 'es';
    const captionFontSize = Number(parsed?.captionFontSize);
    return {
      backend,
      sourceLanguage,
      targetLanguage,
      captionsVisible: parsed?.captionsVisible !== false,
      captionFontSize: Number.isFinite(captionFontSize) ? Math.max(28, Math.min(72, captionFontSize)) : 48,
    };
  } catch { return DEFAULT_TRANSLATION_PREFERENCES; }
}

function loadPracticeTextSize(): number {
  try {
    const value = Number(localStorage.getItem(PRACTICE_TEXT_SIZE_KEY));
    return value >= READING_SIZE_MIN && value <= READING_SIZE_MAX ? value : DEFAULT_READING_SIZE;
  } catch { return DEFAULT_READING_SIZE; }
}

function loadTalkMinutes(): number {
  try {
    const value = Number(localStorage.getItem(PRESENTER_TALK_MINUTES_KEY));
    return Number.isInteger(value) && value >= TALK_MINUTES_MIN && value <= TALK_MINUTES_MAX ? value : DEFAULT_TALK_MINUTES;
  } catch { return DEFAULT_TALK_MINUTES; }
}

function loadPresenterPresenting(): boolean {
  try { return localStorage.getItem(PRESENTER_PRESENTING_KEY) === 'true'; } catch { return false; }
}

/** A reload in the middle of a talk keeps the clock, including a running one. */
function loadPresenterTimer(): PresenterTimerState {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRESENTER_TIMER_KEY) ?? 'null') as Partial<PresenterTimerState> | null;
    const elapsedMs = Number(parsed?.elapsedMs);
    const runningSince = parsed?.runningSince;
    return {
      elapsedMs: Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : 0,
      runningSince: typeof runningSince === 'number' && Number.isFinite(runningSince) ? runningSince : null,
    };
  } catch { return { runningSince: null, elapsedMs: 0 }; }
}

/** The phone tap-zone hint shows once per browser. */
function loadNavHintSeen(): boolean {
  try { return localStorage.getItem(NAV_HINT_SEEN_KEY) === 'true'; } catch { return false; }
}

function loadPresenterReadingMode(): 'notes' | 'practice' | 'annotations' {
  try {
    const mode = localStorage.getItem(PRESENTER_MODE_KEY);
    return mode === 'practice' || mode === 'annotations' ? mode : 'notes';
  } catch { return 'notes'; }
}

function loadPresenterShowNext(): boolean {
  try { return localStorage.getItem(PRESENTER_NEXT_KEY) !== 'false'; } catch { return true; }
}

export const SIDEBAR_STORAGE_KEY = 'ok-show-sidebar';
export const DRAWER_WIDTH_KEY = 'ok-show-developer-tools-width';
export const DRAWER_DEFAULT_WIDTH = 460;
export const DRAWER_MIN_WIDTH = 340;
export const DRAWER_MAX_WIDTH = 900;

export function clampDrawerWidth(width: number): number {
  const viewportMaximum = typeof window === 'undefined'
    ? DRAWER_MAX_WIDTH
    : Math.max(DRAWER_MIN_WIDTH, window.innerWidth * 0.75);
  return Math.round(Math.min(DRAWER_MAX_WIDTH, viewportMaximum, Math.max(DRAWER_MIN_WIDTH, width)));
}

function loadDrawerWidth(): number {
  try {
    const raw = localStorage.getItem(DRAWER_WIDTH_KEY);
    if (raw === null) return DRAWER_DEFAULT_WIDTH;
    const stored = Number(raw);
    return Number.isFinite(stored) ? clampDrawerWidth(stored) : DRAWER_DEFAULT_WIDTH;
  } catch {
    return DRAWER_DEFAULT_WIDTH;
  }
}

export const SIDEBAR_TYPES = [
  'speakerNotes',
  'liveTranslation',
  'practice',
  'presentations',
  'outline',
  'palette',
  'favicon',
  'slideInfo',
  'annotations',
  'styleTweaks',
] as const;

export type SidebarType = typeof SIDEBAR_TYPES[number];

function isSidebarType(value: unknown): value is SidebarType {
  return typeof value === 'string' && SIDEBAR_TYPES.some(sidebar => sidebar === value);
}

function loadTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : 'ember';
  } catch {
    return 'ember';
  }
}

function loadSidebarState(): { activeSidebar: SidebarType | null; lastSidebar: SidebarType } {
  try {
    const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { open?: unknown; lastSidebar?: unknown };
      const lastSidebar = isSidebarType(parsed.lastSidebar) ? parsed.lastSidebar : 'speakerNotes';
      return { activeSidebar: parsed.open === true ? lastSidebar : null, lastSidebar };
    }
  } catch { /* Storage is optional. */ }
  return { activeSidebar: null, lastSidebar: 'speakerNotes' };
}

interface UIState {
  presenterShowNext: boolean;
  presenterReadingMode: 'notes' | 'practice' | 'annotations';
  practiceTextSize: number;
  presenterTalkMinutes: number;
  presenterPresenting: boolean;
  presenterTimer: PresenterTimerState;
  debugMode: boolean;
  isMobile: boolean;
  aspectRatio: AspectRatio;
  showDebugButton: boolean;
  isFullscreen: boolean;
  activeSidebar: SidebarType | null;
  lastSidebar: SidebarType;
  drawerWidth: number;
  theme: ThemeId;
  navHintSeen: boolean;
  translation: TranslationPreferences;
}

const initialState: UIState = {
  presenterShowNext: loadPresenterShowNext(),
  presenterReadingMode: loadPresenterReadingMode(),
  practiceTextSize: loadPracticeTextSize(),
  presenterTalkMinutes: loadTalkMinutes(),
  presenterPresenting: loadPresenterPresenting(),
  presenterTimer: loadPresenterTimer(),
  debugMode: false,
  isMobile: false,
  aspectRatio: '16:9',
  showDebugButton: true,
  isFullscreen: false,
  ...loadSidebarState(),
  drawerWidth: loadDrawerWidth(),
  theme: loadTheme(),
  navHintSeen: loadNavHintSeen(),
  translation: loadTranslationPreferences(),
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setPracticeTextSize(state, action: PayloadAction<number>) {
      if (Number.isFinite(action.payload)) state.practiceTextSize = Math.max(READING_SIZE_MIN, Math.min(READING_SIZE_MAX, action.payload));
    },
    setPresenterTalkMinutes(state, action: PayloadAction<number>) {
      if (Number.isFinite(action.payload)) state.presenterTalkMinutes = Math.round(Math.max(TALK_MINUTES_MIN, Math.min(TALK_MINUTES_MAX, action.payload)));
    },
    setPresenterPresenting(state, action: PayloadAction<boolean>) {
      state.presenterPresenting = action.payload;
    },
    /** Payloads carry the time so the reducer stays pure. */
    startPresenterTimer(state, action: PayloadAction<number>) {
      if (state.presenterTimer.runningSince === null) state.presenterTimer.runningSince = action.payload;
    },
    /** Starts the clock on the first advance of a talk, and never restarts a paused one. */
    startPresenterTimerIfIdle(state, action: PayloadAction<number>) {
      if (state.presenterTimer.runningSince === null && state.presenterTimer.elapsedMs === 0) state.presenterTimer.runningSince = action.payload;
    },
    pausePresenterTimer(state, action: PayloadAction<number>) {
      const { runningSince, elapsedMs } = state.presenterTimer;
      if (runningSince === null) return;
      state.presenterTimer = { runningSince: null, elapsedMs: elapsedMs + Math.max(0, action.payload - runningSince) };
    },
    resetPresenterTimer(state) {
      state.presenterTimer = { runningSince: null, elapsedMs: 0 };
    },
    setPresenterReadingMode(state, action: PayloadAction<'notes' | 'practice' | 'annotations'>) {
      state.presenterReadingMode = action.payload;
    },
    setPresenterShowNext(state, action: PayloadAction<boolean>) {
      state.presenterShowNext = action.payload;
    },
    toggleDebugMode(state) {
      state.debugMode = !state.debugMode;
    },
    setDebugMode(state, action: PayloadAction<boolean>) {
      state.debugMode = action.payload;
    },
    setResponsiveState(state, action: PayloadAction<{ isMobile: boolean; aspectRatio: AspectRatio; showDebugButton: boolean }>) {
      state.isMobile = action.payload.isMobile;
      state.aspectRatio = action.payload.aspectRatio;
      state.showDebugButton = action.payload.showDebugButton;
    },
    setIsFullscreen(state, action: PayloadAction<boolean>) {
      state.isFullscreen = action.payload;
    },
    toggleSidebar(state, action: PayloadAction<SidebarType>) {
      if (state.activeSidebar === action.payload) {
        state.activeSidebar = null;
        return;
      }
      state.activeSidebar = action.payload;
      state.lastSidebar = action.payload;
    },
    openSidebar(state, action: PayloadAction<SidebarType>) {
      state.activeSidebar = action.payload;
      state.lastSidebar = action.payload;
    },
    toggleDeveloperTools(state) {
      state.activeSidebar = state.activeSidebar ? null : state.lastSidebar;
    },
    closeSidebar(state) {
      state.activeSidebar = null;
    },
    setDrawerWidth(state, action: PayloadAction<number>) {
      if (Number.isFinite(action.payload)) state.drawerWidth = clampDrawerWidth(action.payload);
    },
    setTheme(state, action: PayloadAction<ThemeId>) {
      state.theme = action.payload;
    },
    markNavHintSeen(state) {
      state.navHintSeen = true;
    },
    setTranslationBackend(state, action: PayloadAction<TranslationBackend | ''>) {
      state.translation.backend = action.payload;
    },
    setTranslationSourceLanguage(state, action: PayloadAction<TranslationLanguage>) {
      state.translation.sourceLanguage = action.payload;
      state.translation.targetLanguage = action.payload === 'en' ? 'es' : 'en';
    },
    setCaptionsVisible(state, action: PayloadAction<boolean>) {
      state.translation.captionsVisible = action.payload;
    },
    setCaptionFontSize(state, action: PayloadAction<number>) {
      if (Number.isFinite(action.payload)) state.translation.captionFontSize = Math.max(28, Math.min(72, action.payload));
    },
  },
});

export const { setPracticeTextSize, setPresenterTalkMinutes, setPresenterPresenting, startPresenterTimer, startPresenterTimerIfIdle, pausePresenterTimer, resetPresenterTimer, setPresenterReadingMode, setPresenterShowNext, toggleDebugMode, setDebugMode, setResponsiveState, setIsFullscreen, toggleSidebar, openSidebar, toggleDeveloperTools, closeSidebar, setDrawerWidth, setTheme, markNavHintSeen, setTranslationBackend, setTranslationSourceLanguage, setCaptionsVisible, setCaptionFontSize } = uiSlice.actions;
export default uiSlice.reducer;
