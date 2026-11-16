import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, FC, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { DRAWER_MAX_WIDTH, DRAWER_MIN_WIDTH, SIDEBAR_TYPES, clampDrawerWidth, setDrawerWidth } from '../store/uiSlice';
import type { SidebarType } from '../store/uiSlice';
import MaterialIcon from './MaterialIcon';
import './DeveloperToolsDrawer.css';

interface DeveloperToolsDrawerProps {
  activeSection: SidebarType;
  registry: DeveloperToolRegistry;
  isMobile: boolean;
  onSelectSection: (section: SidebarType) => void;
}

interface DeveloperToolPanel<Section extends SidebarType = SidebarType> {
  id: Section;
  icon: string;
  label: string;
  badge?: number;
  content: ReactNode;
}

export type DeveloperToolRegistry = {
  readonly [Section in SidebarType]: DeveloperToolPanel<Section>;
};

interface ResizeSession {
  handle: HTMLDivElement;
  pointerId: number;
  startX: number;
  startWidth: number;
}

const DeveloperToolsDrawer: FC<DeveloperToolsDrawerProps> = ({
  activeSection,
  registry,
  isMobile,
  onSelectSection,
}) => {
  const dispatch = useAppDispatch();
  const width = useAppSelector(state => state.ui.drawerWidth);
  const [resizeSession, setResizeSession] = useState<ResizeSession | null>(null);
  const widthRef = useRef(width);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const persistWidth = useCallback((nextWidth: number) => {
    const clamped = clampDrawerWidth(nextWidth);
    widthRef.current = clamped;
    dispatch(setDrawerWidth(clamped));
  }, [dispatch]);

  useEffect(() => {
    const reclampForViewport = () => {
      const clamped = clampDrawerWidth(widthRef.current);
      if (clamped === widthRef.current) return;
      widthRef.current = clamped;
      dispatch(setDrawerWidth(clamped));
    };

    window.addEventListener('resize', reclampForViewport);
    return () => window.removeEventListener('resize', reclampForViewport);
  }, [dispatch]);

  const stopResize = useCallback(() => {
    setResizeSession(null);
  }, []);

  useEffect(() => {
    if (!resizeSession) return;

    const move = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== resizeSession.pointerId) return;
      persistWidth(resizeSession.startWidth + event.clientX - resizeSession.startX);
    };
    const stopForPointer = (event: globalThis.PointerEvent) => {
      if (event.pointerId === resizeSession.pointerId) stopResize();
    };

    document.body.classList.add('is-resizing-developer-tools');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stopForPointer);
    window.addEventListener('pointercancel', stopForPointer);
    window.addEventListener('blur', stopResize);

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stopForPointer);
      window.removeEventListener('pointercancel', stopForPointer);
      window.removeEventListener('blur', stopResize);
      document.body.classList.remove('is-resizing-developer-tools');
      try {
        if (resizeSession.handle.hasPointerCapture?.(resizeSession.pointerId)) {
          resizeSession.handle.releasePointerCapture(resizeSession.pointerId);
        }
      } catch { /* Pointer capture may already have been released by the browser. */ }
    };
  }, [persistWidth, resizeSession, stopResize]);

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    if (isMobile) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch { /* Pointer capture is optional and may be rejected for an inactive pointer. */ }
    setResizeSession({
      handle: event.currentTarget,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: widthRef.current,
    });
  };

  const handleResizeKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    persistWidth(widthRef.current + (event.key === 'ArrowRight' ? 24 : -24));
  };

  return (
    <aside
      className={`developer-tools-drawer ${isMobile ? 'developer-tools-drawer--mobile' : ''}`}
      style={{ '--developer-tools-width': `${width}px` } as CSSProperties}
      aria-label="Developer tools"
    >
      <nav className="developer-tools-drawer__rail" aria-label="Developer tool sections">
        {SIDEBAR_TYPES.map((section) => {
          const panel = registry[section];
          const isActive = section === activeSection;
          return (
            <button
              key={panel.id}
              type="button"
              className={`developer-tools-drawer__section-button ${isActive ? 'developer-tools-drawer__section-button--active' : ''}`}
              onClick={() => onSelectSection(section)}
              aria-label={panel.label}
              aria-pressed={isActive}
              title={panel.label}
            >
              <MaterialIcon name={panel.icon} size="medium" />
              {panel.badge !== undefined && panel.badge > 0 && <span>{panel.badge}</span>}
            </button>
          );
        })}
      </nav>
      <div className="developer-tools-drawer__panel" data-active-section={activeSection}>
        {registry[activeSection].content}
      </div>
      {!isMobile && (
        <div
          className="developer-tools-drawer__resize-handle"
          role="separator"
          aria-label="Resize developer tools"
          aria-orientation="vertical"
          aria-valuemin={DRAWER_MIN_WIDTH}
          aria-valuemax={DRAWER_MAX_WIDTH}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={startResize}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
          onLostPointerCapture={stopResize}
          onKeyDown={handleResizeKey}
        />
      )}
    </aside>
  );
};

export default DeveloperToolsDrawer;
