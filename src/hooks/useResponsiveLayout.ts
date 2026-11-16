import { useEffect } from 'react';
import { useAppDispatch } from '../store/hooks';
import { setResponsiveState } from '../store/uiSlice';
import { store } from '../store/store';
import type { AspectRatio } from '../types/slide.types';

export function useResponsiveLayout() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const update = () => {
      const width = window.innerWidth;
      const isPortrait = window.matchMedia('(orientation: portrait)').matches;

      let newState: { isMobile: boolean; aspectRatio: AspectRatio; showDebugButton: boolean };
      if (width < 768) {
        newState = { isMobile: true, aspectRatio: '9:16', showDebugButton: false };
      } else if (width < 1024) {
        newState = { isMobile: false, aspectRatio: isPortrait ? '9:16' : '16:9', showDebugButton: true };
      } else {
        newState = { isMobile: false, aspectRatio: '16:9', showDebugButton: true };
      }

      const current = store.getState().ui;
      if (
        current.isMobile !== newState.isMobile ||
        current.aspectRatio !== newState.aspectRatio ||
        current.showDebugButton !== newState.showDebugButton
      ) {
        dispatch(setResponsiveState(newState));
      }
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [dispatch]);
}
