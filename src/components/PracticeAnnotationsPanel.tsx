import { useAppDispatch, useAppSelector } from '../store/hooks';
import { clearAll, clearCopiedAnnotations, markAnnotationsCopied, removeAnnotation, updateComment, updateRequestMetadata } from '../store/annotationsSlice';
import { copyText } from '../utils/copyText';
import type { SlideData } from '../types/slide.types';
import AnnotationsSidebar from './AnnotationsSidebar';

/** The presenter route uses the same review UI as the main developer drawer. */
export default function PracticeAnnotationsPanel({ presentationId, slides, onClose, onSlideChange }: {
  presentationId: string;
  slides: SlideData[];
  onClose: () => void;
  onSlideChange?: (index: number) => void;
}) {
  const dispatch = useAppDispatch();
  const all = useAppSelector(state => state.annotations.annotations);
  const annotations = all.filter(item => item.presentationId === presentationId);
  return <AnnotationsSidebar annotations={annotations} presentationId={presentationId} totalSlides={slides.length}
    onRemove={id => dispatch(removeAnnotation(id))}
    onUpdateComment={(id, comment) => dispatch(updateComment({ id, comment }))}
    onUpdateMetadata={(id, metadata) => dispatch(updateRequestMetadata({ id, metadata }))}
    onClearAll={() => dispatch(clearAll(presentationId))}
    onClearCopied={() => dispatch(clearCopiedAnnotations(presentationId))}
    onCopyAll={async (packet) => {
      const copied = await copyText(packet);
      if (copied) dispatch(markAnnotationsCopied({ annotations, copiedAt: Date.now() }));
      return copied;
    }}
    onClose={onClose} onNavigateToSlide={onSlideChange}
    resolveSlideIndex={(id, fallback) => { const index = slides.findIndex(slide => slide.id === id); return index >= 0 ? index : fallback; }} />;
}
