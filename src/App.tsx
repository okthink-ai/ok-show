import { useCallback, useMemo, useRef } from 'react';
import SlideContainer from './components/SlideContainer';
import MobileFrame from './components/MobileFrame';
import Footer from './components/Footer';
import OutlineSidebar from './components/OutlineSidebar';
import PaletteSidebar from './components/PaletteSidebar';
import FaviconPanel from './components/FaviconPanel';
import PresentationSidebar from './components/PresentationSidebar';
import SlideInfoSidebar from './components/SlideInfoSidebar';
import AnnotationsSidebar from './components/AnnotationsSidebar';
import PracticeSidebar from './components/PracticeSidebar';
import type { PracticePosition } from './practice/slideCues';
import SpeakerNotesSidebar from './components/SpeakerNotesSidebar';
import type { SlideOrderRequest } from './components/SpeakerNotesSidebar';
import DeveloperToolsDrawer from './components/DeveloperToolsDrawer';
import type { DeveloperToolRegistry } from './components/DeveloperToolsDrawer';
import AnnotationBadge from './components/AnnotationBadge';
import StyleTweaksSidebar from './components/StyleTweaksSidebar';
import StyleTweakLayer from './components/StyleTweakLayer';
import LiveCaptionOverlay from './components/LiveCaptionOverlay';
import LiveTranslationPanel from './components/LiveTranslationPanel';
import { useStyleTweakPicker } from './hooks/useStyleTweakPicker';
import PendingAnnotationPopup from './components/PendingAnnotationPopup';
import { useKeyboardNavigation, toggleFullscreen } from './hooks/useKeyboardNavigation';
import { useInspectorMode } from './hooks/useInspectorMode';
import { useResponsiveLayout } from './hooks/useResponsiveLayout';
import { useFullscreenSync } from './hooks/useFullscreenSync';
import { useUrlSync } from './hooks/useUrlSync';
import { useAnnotationActions } from './hooks/useAnnotationActions';
import { useSlideRect } from './hooks/useSlideRect';
import { useAppDispatch, useAppSelector } from './store/hooks';
import type { SidebarType } from './store/uiSlice';
import { toggleDebugMode, openSidebar, toggleDeveloperTools, closeSidebar } from './store/uiSlice';
import { selectPresentation, goToSlide, nextSlide, previousSlide } from './store/presentationSlice';
import {
  generateId,
  removeAnnotation,
  addAnnotation,
  updateComment,
  updateRequestMetadata,
  setPendingDraft,
  updatePendingComment,
  updatePendingReplacementText,
  clearPending,
  clearAll,
  clearCopiedAnnotations,
  markAnnotationsCopied,
} from './store/annotationsSlice';
import { resolveSlideIndex } from './utils/resolveSlideIndex';
import { copyText } from './utils/copyText';
import { formatStyleTweaks, targetOf } from './utils/styleTweaks';
import {
  clearStyleTweaks,
  removeStyleTweak,
  resetSelectedTweak,
  selectTweakTarget,
  setStyleTweakMode,
  setTweakScope,
  setTweakValue,
} from './store/styleTweaksSlice';
import type { StyleTweak } from './types/styleTweak.types';
import { createAnnotationCaptureContext } from './utils/annotationContext';
import { commitAnnotation } from './store/annotationThunks';
import { presentations } from './project/presentations';
import type { PendingAnnotationDraft } from './types/annotation.types';
import { getPresenterViewUrl, getSyncSession, isPresentationSyncRequested, usePresentationSync } from './sync/usePresentationSync';
import { useLiveTranslation } from './hooks/useLiveTranslation';
// Global styles (design-system.css, animations.css) are imported in main.tsx
import './App.css';

function App() {
  const dispatch = useAppDispatch();
  const practicePosition = useRef<PracticePosition>({ scrollTop: 0, following: true });

  // --- Redux state ---
  const debugMode = useAppSelector(state => state.ui.debugMode);
  const isMobile = useAppSelector(state => state.ui.isMobile);
  const aspectRatio = useAppSelector(state => state.ui.aspectRatio);
  const showDebugButton = useAppSelector(state => state.ui.showDebugButton);
  const isFullscreen = useAppSelector(state => state.ui.isFullscreen);
  const activeSidebar = useAppSelector(state => state.ui.activeSidebar);
  const theme = useAppSelector(state => state.ui.theme);
  const currentPresentationId = useAppSelector(state => state.presentation.currentPresentationId);
  const currentSlide = useAppSelector(state => state.presentation.currentSlide);
  const allAnnotations = useAppSelector(state => state.annotations.annotations);
  const isMultiSelectMode = useAppSelector(state => state.annotations.isMultiSelectMode);
  const pendingDraft = useAppSelector(state => state.annotations.pendingDraft);
  const isStyleTweakMode = useAppSelector(state => state.styleTweaks.isActive);
  const allStyleTweaks = useAppSelector(state => state.styleTweaks.tweaks);
  const styleTweakSelection = useAppSelector(state => state.styleTweaks.selection);

  // --- Derived data ---
  const currentPresentation = presentations.find(p => p.id === currentPresentationId) ?? presentations[0] ?? null;
  const slides = useMemo(() => currentPresentation?.slides ?? [], [currentPresentation]);

  const currentAnnotations = useMemo(
    () => allAnnotations.filter(a => a.presentationId === currentPresentationId),
    [allAnnotations, currentPresentationId],
  );

  const handleCopyAll = useCallback(async (packet: string) => {
    const copied = await copyText(packet);
    if (copied) dispatch(markAnnotationsCopied({ annotations: currentAnnotations, copiedAt: Date.now() }));
    return copied;
  }, [currentAnnotations, dispatch]);

  const currentStyleTweaks = useMemo(
    () => allStyleTweaks.filter(tweak => tweak.presentationId === currentPresentationId),
    [allStyleTweaks, currentPresentationId],
  );

  const handleCopyStyleTweaks = useCallback(
    () => copyText(formatStyleTweaks(currentStyleTweaks, currentPresentationId)),
    [currentStyleTweaks, currentPresentationId],
  );

  useStyleTweakPicker({
    active: isStyleTweakMode,
    presentationId: currentPresentationId,
    slides,
    onPick: (target) => {
      dispatch(selectTweakTarget(target));
      dispatch(openSidebar('styleTweaks'));
    },
    onExit: () => dispatch(setStyleTweakMode(false)),
  });

  const toggleStyleTweakMode = () => {
    if (isStyleTweakMode) {
      dispatch(setStyleTweakMode(false));
      return;
    }
    dispatch(setStyleTweakMode(true));
    dispatch(openSidebar('styleTweaks'));
  };

  // Derive a safe slide index for this render without dispatching during render.
  // If currentSlide is out of bounds (e.g. switched from a larger deck), clamp it
  // inline. The selectPresentation reducer already resets currentSlide to 0, which
  // handles the common case; this covers any remaining edge cases harmlessly.
  const safeSlide = slides.length > 0 ? Math.min(currentSlide, slides.length - 1) : 0;

  // Stable callbacks: memoized panels only skip re-rendering when every prop
  // keeps its identity across unrelated updates such as typing a comment.
  const totalSlidesForNav = slides.length;
  const handleGoToSlide = useCallback(
    (index: number) => dispatch(goToSlide({ index, totalSlides: totalSlidesForNav })),
    [dispatch, totalSlidesForNav],
  );
  const handleResolveSlideIndex = useCallback(
    (slideId: string, capturedIndex: number) => resolveSlideIndex(slides, slideId, capturedIndex),
    [slides],
  );
  const handleCloseSidebar = useCallback(() => dispatch(closeSidebar()), [dispatch]);
  const handleRemoveAnnotation = useCallback((id: string) => dispatch(removeAnnotation(id)), [dispatch]);
  const handleUpdateAnnotationComment = useCallback(
    (id: string, comment: string) => dispatch(updateComment({ id, comment })),
    [dispatch],
  );
  const handleSetPendingDraft = useCallback((draft: PendingAnnotationDraft) => dispatch(setPendingDraft(draft)), [dispatch]);
  const handleUpdatePendingComment = useCallback((comment: string) => dispatch(updatePendingComment(comment)), [dispatch]);
  const handleUpdatePendingReplacementText = useCallback(
    (replacementText: string) => dispatch(updatePendingReplacementText(replacementText)),
    [dispatch],
  );
  const handleClearPendingDraft = useCallback(() => dispatch(clearPending()), [dispatch]);
  const handleSelectSection = useCallback((section: SidebarType) => dispatch(openSidebar(section)), [dispatch]);

  // --- Effect hooks ---
  useResponsiveLayout();
  useFullscreenSync();
  useUrlSync();

  // --- Derived helpers ---
  const totalSlides = slides.length;
  const syncEnabled = isPresentationSyncRequested();
  const presentationSync = usePresentationSync({
    dispatch,
    presentationId: currentPresentationId,
    slideIndex: safeSlide,
    totalSlides,
    theme,
    enabled: syncEnabled,
  });
  const liveTranslation = useLiveTranslation({ presentationId: currentPresentationId, enabled: syncEnabled });
  const translationPreferences = useAppSelector((state) => state.ui.translation);
  const syncSessionId = getSyncSession();
  const speakerNotesSync = usePresentationSync({
    dispatch,
    presentationId: currentPresentationId,
    slideIndex: safeSlide,
    totalSlides,
    theme,
    role: 'notes',
    enabled: activeSidebar === 'speakerNotes' && !isFullscreen,
    applyRemoteState: false,
  });

  const handleTextReplacement = useCallback((
    text: string,
    replacementText: string,
    context: { before: string; after: string; selector: string },
    clickPosition: { x: number; y: number },
  ) => {
    const slide = slides[safeSlide];
    if (!slide) return;
    const target = document.elementFromPoint(clickPosition.x, clickPosition.y);
    const slideElement = target?.closest('.slide--active') as HTMLElement | null;
    const rect = slideElement?.getBoundingClientRect();
    const detectedAspectRatio = slideElement?.classList.contains('slide--portrait') ? '9:16' : aspectRatio;
    dispatch(addAnnotation({
      id: generateId(),
      type: 'text',
      presentationId: currentPresentationId,
      slideId: slide.id,
      slideIndex: safeSlide,
      slideTemplate: slide.template || 'Unknown',
      slideTitle: slide.title || '',
      aspectRatio: detectedAspectRatio,
      comment: 'Replace this text with the edited wording.',
      normalizedPosition: rect
        ? {
            x: (clickPosition.x - rect.left) / rect.width,
            y: (clickPosition.y - rect.top) / rect.height,
          }
        : { x: 0.5, y: 0.5 },
      timestamp: Date.now(),
      capture: createAnnotationCaptureContext(),
      operation: 'replace-text',
      text,
      replacementText,
      surroundingContext: context,
      source: 'canvas',
    }));
  }, [aspectRatio, currentPresentationId, dispatch, safeSlide, slides]);

  // --- Annotation actions ---
  const {
    handleAnnotateElement,
    handleAnnotateText,
    handleAnnotateFromOutline,
    handleCommit,
    handleCommentCancel,
    handleToggleMultiSelect,
    lastPopupDismissRef,
  } = useAnnotationActions(slides, currentSlide, aspectRatio, currentPresentationId);

  const handleSpeakerNoteDeletion = useCallback((draft: PendingAnnotationDraft) => {
    dispatch(setPendingDraft(draft));
    dispatch(commitAnnotation('Delete this speaker-note bullet.'));
  }, [dispatch]);

  const handleCreateSlideOrderAnnotation = useCallback((request: SlideOrderRequest) => {
    const slide = slides[request.slideIndex];
    const anchorSlideIndex = slides.findIndex((candidate) => candidate.id === request.anchorSlideId);
    const anchorSlide = slides[anchorSlideIndex];
    if (!slide || !anchorSlide || slide.id === anchorSlide.id) return;

    for (const annotation of currentAnnotations) {
      if (annotation.type === 'slide-order' && annotation.slideId === slide.id) {
        dispatch(removeAnnotation(annotation.id));
      }
    }

    dispatch(addAnnotation({
      id: generateId(),
      type: 'slide-order',
      presentationId: currentPresentationId,
      slideId: slide.id,
      slideIndex: request.slideIndex,
      slideTemplate: slide.template ?? 'Slide',
      slideTitle: slide.title ?? `Slide ${request.slideIndex + 1}`,
      aspectRatio,
      comment: `Move “${slide.title ?? slide.id}” ${request.placement} “${anchorSlide.title ?? anchorSlide.id}”.`,
      operation: 'move',
      uiContext: 'Developer tools drawer → Slide previews',
      placement: request.placement,
      anchorSlideId: anchorSlide.id,
      anchorSlideTitle: anchorSlide.title ?? `Slide ${anchorSlideIndex + 1}`,
      anchorSlideIndex,
      normalizedPosition: { x: 0.5, y: 0.5 },
      timestamp: Date.now(),
      capture: createAnnotationCaptureContext(),
    }));
  }, [aspectRatio, currentAnnotations, currentPresentationId, dispatch, slides]);

  // --- Shared slide rect (one observer for all annotation badges) ---
  const slideRect = useSlideRect(slides[safeSlide]?.id ?? String(safeSlide));

  // --- Inspector + keyboard hooks ---
  useInspectorMode({
    currentSlide: safeSlide,
    totalSlides: slides.length,
    aspectRatio,
    slides,
    isMultiSelectMode,
    onAnnotate: handleAnnotateElement,
    onAnnotateText: handleAnnotateText,
    onTextReplacement: handleTextReplacement,
    onToggleMultiSelect: handleToggleMultiSelect,
    lastPopupDismissRef,
  });

  useKeyboardNavigation({
    onNext: () => dispatch(nextSlide(totalSlides)),
    onPrevious: () => dispatch(previousSlide()),
    onFullscreen: toggleFullscreen,
  });

  const developerToolRegistry = {
    speakerNotes: {
      id: 'speakerNotes',
      icon: 'speaker_notes',
      label: 'Speaker notes',
      badge: currentAnnotations.filter(
        (annotation) => annotation.type === 'speaker-note'
          || annotation.type === 'sparkle-prompt'
          || annotation.type === 'slide-order',
      ).length,
      content: (
        <SpeakerNotesSidebar
          presentationId={currentPresentationId}
          slides={slides}
          notes={speakerNotesSync.notes}
          sparklePrompts={speakerNotesSync.sparklePrompts}
          status={speakerNotesSync.status}
          error={speakerNotesSync.error}
          currentSlide={safeSlide}
          aspectRatio={aspectRatio}
          annotations={currentAnnotations}
          pendingDraft={pendingDraft}
          practicePosition={practicePosition}
          onSlideChange={handleGoToSlide}
          onSetPendingDraft={handleSetPendingDraft}
          onUpdatePendingComment={handleUpdatePendingComment}
          onUpdatePendingReplacementText={handleUpdatePendingReplacementText}
          onCommitPendingDraft={handleCommit}
          onCreateSpeakerNoteDeletion={handleSpeakerNoteDeletion}
          onCreateSlideOrderAnnotation={handleCreateSlideOrderAnnotation}
          onClearPendingDraft={handleClearPendingDraft}
          onUpdateComment={handleUpdateAnnotationComment}
          onRemoveAnnotation={handleRemoveAnnotation}
          onClose={handleCloseSidebar}
        />
      ),
    },
    liveTranslation: {
      id: 'liveTranslation',
      icon: 'translate',
      label: 'Live translation',
      content: <LiveTranslationPanel runtime={liveTranslation} />,
    },
    practice: {
      id: 'practice',
      icon: 'menu_book',
      label: 'Practice',
      content: <PracticeSidebar presentationId={currentPresentationId} slides={slides} currentSlide={safeSlide}
        position={practicePosition} onSlideChange={handleGoToSlide} />,
    },
    presentations: {
      id: 'presentations',
      icon: 'folder_open',
      label: 'Presentations',
      content: (
        <PresentationSidebar
          presentations={presentations}
          currentPresentationId={currentPresentationId}
          onPresentationSelect={(id) => { dispatch(selectPresentation(id)); dispatch(closeSidebar()); }}
        />
      ),
    },
    outline: {
      id: 'outline',
      icon: 'list',
      label: 'Outline',
      content: (
        <OutlineSidebar
          slides={slides}
          currentSlide={safeSlide}
          onSlideClick={handleGoToSlide}
          onClose={handleCloseSidebar}
          isMultiSelectMode={isMultiSelectMode}
          annotations={currentAnnotations}
          onAnnotateFromOutline={handleAnnotateFromOutline}
        />
      ),
    },
    palette: {
      id: 'palette',
      icon: 'palette',
      label: 'Palette',
      content: <PaletteSidebar onClose={handleCloseSidebar} />,
    },
    favicon: {
      id: 'favicon',
      icon: 'star',
      label: 'Favicon preview',
      content: <FaviconPanel onClose={handleCloseSidebar} />,
    },
    slideInfo: {
      id: 'slideInfo',
      icon: 'info',
      label: 'Slide info',
      content: (
        <SlideInfoSidebar
          slides={slides}
          currentSlide={safeSlide}
          aspectRatio={aspectRatio}
          onClose={handleCloseSidebar}
        />
      ),
    },
    annotations: {
      id: 'annotations',
      icon: 'edit_note',
      label: 'Annotations',
      badge: currentAnnotations.length,
      content: (
        <AnnotationsSidebar
          annotations={currentAnnotations}
          presentationId={currentPresentationId}
          totalSlides={slides.length}
          onRemove={handleRemoveAnnotation}
          onUpdateComment={handleUpdateAnnotationComment}
          onUpdateMetadata={(id, metadata) => dispatch(updateRequestMetadata({ id, metadata }))}
          onClearAll={() => dispatch(clearAll(currentPresentationId))}
          onCopyAll={handleCopyAll}
          onClearCopied={() => dispatch(clearCopiedAnnotations(currentPresentationId))}
          onClose={handleCloseSidebar}
          onNavigateToSlide={handleGoToSlide}
          resolveSlideIndex={handleResolveSlideIndex}
        />
      ),
    },
    styleTweaks: {
      id: 'styleTweaks',
      icon: 'tune',
      label: 'Style tweaks',
      badge: currentStyleTweaks.length,
      content: (
        <StyleTweaksSidebar
          presentationId={currentPresentationId}
          isActive={isStyleTweakMode}
          tweaks={currentStyleTweaks}
          selection={styleTweakSelection}
          currentSlide={safeSlide}
          onToggleActive={toggleStyleTweakMode}
          onSetValue={(property, value) => dispatch(setTweakValue({ property, value }))}
          onSetScope={(scope) => dispatch(setTweakScope(scope))}
          onResetSelection={() => dispatch(resetSelectedTweak())}
          onSelectTweak={(tweak: StyleTweak) => {
            const index = slides.findIndex((slide) => slide.id === tweak.slideId);
            dispatch(goToSlide({ index: index >= 0 ? index : tweak.slideIndex, totalSlides }));
            dispatch(selectTweakTarget(targetOf(tweak)));
          }}
          onRemoveTweak={(id) => dispatch(removeStyleTweak(id))}
          onCopyAll={handleCopyStyleTweaks}
          onClearAll={() => dispatch(clearStyleTweaks(currentPresentationId))}
        />
      ),
    },
  } satisfies DeveloperToolRegistry;

  // --- Render ---
  if (!currentPresentation) {
    return (
      <div className="app">
        <div className="app__content">
          <div className="app__main">
            <p>No presentations available.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app" data-app-surface="authoring">
      <div className={`app__content ${(debugMode || activeSidebar !== null) && !isMobile && !isFullscreen ? 'app__content--with-preview' : ''}`}>
        {!isFullscreen && activeSidebar && (
          <DeveloperToolsDrawer
            activeSection={activeSidebar}
            registry={developerToolRegistry}
            isMobile={isMobile}
            onSelectSection={handleSelectSection}
          />
        )}

        <StyleTweakLayer
          presentationId={currentPresentationId}
          tweaks={currentStyleTweaks}
          selection={styleTweakSelection}
          isActive={isStyleTweakMode}
        />

        <div className="app__main">
          <SlideContainer
            slides={slides}
            aspectRatio={aspectRatio}
            currentSlide={safeSlide}
            onSlideChange={handleGoToSlide}
            overlay={(
              <LiveCaptionOverlay
                caption={liveTranslation.caption}
                visible={translationPreferences.captionsVisible}
                fontSize={translationPreferences.captionFontSize}
              />
            )}
          />
        </div>

        {currentAnnotations
          .filter(a => a.slideId === slides[safeSlide]?.id && a.type !== 'speaker-note' && a.type !== 'slide-order')
          .slice(0, 10)
          .map((a, i) => (
            <AnnotationBadge
              key={a.id}
              number={i + 1}
              isText={a.type === 'text'}
              intent={a.intent}
              comment={a.comment}
              normalizedPosition={a.normalizedPosition}
              selector={a.type === 'element' ? a.selector : undefined}
              slideRect={slideRect}
              onBadgeClick={() => dispatch(openSidebar('annotations'))}
            />
          ))
        }

        {!isMobile && debugMode && !isFullscreen && (
          <div className="app__preview">
            <MobileFrame
              slides={slides}
              currentSlide={safeSlide}
              onSlideChange={handleGoToSlide}
            />
          </div>
        )}
      </div>

      {!isFullscreen && (
        <Footer
          currentSlide={safeSlide}
          totalSlides={slides.length}
          currentTemplate={slides[safeSlide]?.template}
          isMobile={isMobile}
          actions={{
            exportPresentationId: currentPresentationId,
            onToggleFullscreen: toggleFullscreen,
            isFullscreen,
            onToggleDebug: () => dispatch(toggleDebugMode()),
            debugMode,
            showDebugButton,
            onToggleDeveloperTools: () => dispatch(toggleDeveloperTools()),
            isDeveloperToolsOpen: activeSidebar !== null,
            onToggleStyleTweaks: toggleStyleTweakMode,
            isStyleTweakMode,
            styleTweakCount: currentStyleTweaks.length,
          }}
          annotationNav={currentAnnotations.length > 0 ? { annotations: currentAnnotations, onNavigateToSlide: (index) => dispatch(goToSlide({ index, totalSlides })) } : undefined}
          sync={{
            enabled: syncEnabled,
            status: presentationSync.status,
            sessionId: syncSessionId,
            error: presentationSync.error,
            // A session only exists once it is in the URL, so starting one is a
            // reload with ?session= attached rather than hidden in-memory state.
            onStartSession: () => {
              const params = new URLSearchParams(window.location.search);
              params.set('session', `live-${Math.random().toString(36).slice(2, 8)}`);
              window.location.search = params.toString();
            },
            onOpenPresenterView: () => window.open(getPresenterViewUrl(syncSessionId), '_blank'),
          }}
        />
      )}

      <PendingAnnotationPopup presentationId={currentPresentationId} onConfirm={handleCommit} onCancel={handleCommentCancel} />

    </div>
  );
}

export default App;
