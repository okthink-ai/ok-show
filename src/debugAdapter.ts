import { performanceRecorder } from './debug/performance';
import type { Presentation } from './types/slide.types';
import type { AppDispatch, RootState } from './store/store';
import { goToSlide, selectPresentation } from './store/presentationSlice';
import { setDebugMode, setTheme } from './store/uiSlice';
import { isThemeId, type ThemeId } from './themes';

export interface DebugSlide {
  index: number;
  id: string;
  title: string;
  template: string;
}

export interface DebugSnapshot {
  presentationId: string | null;
  presentationTitle: string | null;
  currentSlide: number;
  slideCount: number;
  slideId: string | null;
  slideTitle: string | null;
  aspectRatio: RootState['ui']['aspectRatio'];
  theme: ThemeId;
  mobilePreview: boolean;
}

export interface DebugAdapter {
  performance: Pick<typeof performanceRecorder, 'start' | 'stop' | 'report'>;
  getSnapshot(): DebugSnapshot;
  getSlides(presentationId?: string): DebugSlide[];
  goToSlide(slideNumber: number, presentationId?: string): DebugSnapshot;
  setTheme(theme: string): DebugSnapshot;
  setMobilePreview(enabled: boolean): DebugSnapshot;
}

interface DebugStore {
  dispatch: AppDispatch;
  getState(): RootState;
}

function findPresentation(presentations: Presentation[], requestedId?: string) {
  if (!requestedId) return presentations[0];
  const presentation = presentations.find(({ id }) => id === requestedId);
  if (!presentation) throw new Error(`Unknown presentation: ${requestedId}`);
  return presentation;
}

export function createDebugAdapter(store: DebugStore, presentations: Presentation[]): DebugAdapter {
  const getSnapshot = (): DebugSnapshot => {
    const state = store.getState();
    const presentation = findPresentation(presentations, state.presentation.currentPresentationId);
    const slide = presentation?.slides[state.presentation.currentSlide];
    return {
      presentationId: presentation?.id ?? null,
      presentationTitle: presentation?.title ?? null,
      currentSlide: state.presentation.currentSlide + 1,
      slideCount: presentation?.slides.length ?? 0,
      slideId: slide?.id ?? null,
      slideTitle: slide?.title ?? null,
      aspectRatio: state.ui.aspectRatio,
      theme: state.ui.theme,
      mobilePreview: state.ui.debugMode,
    };
  };

  return {
    performance: performanceRecorder,
    getSnapshot,
    getSlides(requestedId) {
      const presentation = findPresentation(presentations, requestedId);
      return presentation?.slides.map((slide, index) => ({
        index: index + 1,
        id: slide.id,
        title: slide.title ?? '',
        template: slide.template ?? '',
      })) ?? [];
    },
    goToSlide(slideNumber, requestedId) {
      const presentation = findPresentation(presentations, requestedId);
      if (!presentation) throw new Error('Presentation not found');
      if (!Number.isInteger(slideNumber) || slideNumber < 1) {
        throw new Error('Slide number must be a positive integer');
      }
      if (store.getState().presentation.currentPresentationId !== presentation.id) {
        store.dispatch(selectPresentation(presentation.id));
      }
      store.dispatch(goToSlide({ index: slideNumber - 1, totalSlides: presentation.slides.length }));
      return getSnapshot();
    },
    setTheme(requestedTheme) {
      if (!isThemeId(requestedTheme)) throw new Error(`Unknown theme: ${requestedTheme}`);
      store.dispatch(setTheme(requestedTheme));
      return getSnapshot();
    },
    setMobilePreview(enabled) {
      store.dispatch(setDebugMode(enabled));
      return getSnapshot();
    },
  };
}
