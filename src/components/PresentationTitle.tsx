import { useEffect } from 'react';
import { defaultPresentation, getPresentationById } from '../project/presentations';
import { useAppSelector } from '../store/hooks';

export default function PresentationTitle() {
  const presentationId = useAppSelector((state) => state.presentation.currentPresentationId);
  const title = (getPresentationById(presentationId) ?? defaultPresentation)?.title;

  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  return null;
}
