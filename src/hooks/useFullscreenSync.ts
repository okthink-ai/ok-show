import { useEffect } from 'react';
import { useAppDispatch } from '../store/hooks';
import { setIsFullscreen } from '../store/uiSlice';

export function useFullscreenSync() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const handler = () => dispatch(setIsFullscreen(!!document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [dispatch]);
}
