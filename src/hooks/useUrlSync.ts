import { useEffect } from 'react';
import { useAppSelector } from '../store/hooks';
import { buildPresentationUrl } from '../utils/presentationUrl';

interface UseUrlSyncOptions {
  includePresentation?: boolean;
}

export function useUrlSync({ includePresentation = true }: UseUrlSyncOptions = {}) {
  const currentSlide = useAppSelector(state => state.presentation.currentSlide);
  const currentPresentationId = useAppSelector(state => state.presentation.currentPresentationId);

  useEffect(() => {
    const newUrl = buildPresentationUrl({
      pathname: window.location.pathname,
      search: window.location.search,
      currentSlide,
      currentPresentationId,
      includePresentation,
    });
    window.history.replaceState({}, '', newUrl);
  }, [currentSlide, currentPresentationId, includePresentation]);
}
