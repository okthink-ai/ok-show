import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { presentations } from '../project/presentations';

function getInitialPresentationId(): string {
  if (presentations.length === 0) return '';
  const params = new URLSearchParams(window.location.search);
  const param = params.get('presentation');
  if (param && presentations.some(p => p.id === param)) return param;
  return presentations[0].id;
}

function getInitialSlide(): number {
  const params = new URLSearchParams(window.location.search);
  const param = params.get('slide');
  if (param) {
    const n = parseInt(param, 10);
    if (!isNaN(n) && n >= 1) return n - 1;
  }
  return 0;
}

interface PresentationState {
  currentPresentationId: string;
  currentSlide: number;
}

const initialState: PresentationState = {
  currentPresentationId: getInitialPresentationId(),
  currentSlide: getInitialSlide(),
};

const presentationSlice = createSlice({
  name: 'presentation',
  initialState,
  reducers: {
    selectPresentation(state, action: PayloadAction<string>) {
      state.currentPresentationId = action.payload;
      state.currentSlide = 0;
    },
    goToSlide(state, action: PayloadAction<{ index: number; totalSlides: number }>) {
      const { index, totalSlides } = action.payload;
      state.currentSlide = Math.max(0, Math.min(index, totalSlides - 1));
    },
    nextSlide(state, action: PayloadAction<number>) {
      state.currentSlide = Math.min(state.currentSlide + 1, Math.max(0, action.payload - 1));
    },
    previousSlide(state) {
      state.currentSlide = Math.max(state.currentSlide - 1, 0);
    },
  },
});

export const { selectPresentation, goToSlide, nextSlide, previousSlide } = presentationSlice.actions;
export default presentationSlice.reducer;
