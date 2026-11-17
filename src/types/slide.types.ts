import React from 'react';

export type ArtworkSide = 'left' | 'right' | 'center';
export type TextSafeSide = 'left' | 'right' | 'center' | 'none';

export interface SlideQrCode {
  src: string;
  url: string;
  alt: string;
  /** Caption under the code. Defaults to "Scan me". */
  label?: string;
}

export type SlideArtworkMetadata =
  | {
      mode: 'none';
    }
  | {
      /** Art-direction metadata for a generated background; it does not render the asset. */
      mode: 'background';
      background: 'white';
      focalSide: ArtworkSide;
      focalWidthPercent: number;
      textSafeSide: TextSafeSide;
      textSafeWidthPercent: number;
      styleName?: string;
      referenceImages?: string[];
      promptNotes?: string;
    };

export interface SlideData {
  id: string;
  title?: string;
  content: React.ReactNode;
  backgroundColor?: string;
  className?: string;
  template?: string; // e.g., "TitleSlide", "TableOfContentsSlide"
  /** Prompt/layout contract for optional generated background artwork. */
  artwork?: SlideArtworkMetadata;
  /** Optional QR rendered by the shared slide wrapper. Set false to suppress a deck default. */
  qrCode?: SlideQrCode | false;
  /** Video to warm before this slide becomes active. */
  preloadVideo?: string;
}

export type AspectRatio = '16:9' | '9:16';
export type SlideOrientation = 'landscape' | 'portrait';

export interface BaseSlideProps {
  orientation?: SlideOrientation;
}

export interface SlideContainerProps {
  slides: SlideData[];
  aspectRatio: AspectRatio;
  currentSlide: number;
  onSlideChange: (index: number) => void;
  /** Runtime chrome layered over the stage, outside authored slide content. */
  overlay?: React.ReactNode;
}

export interface SlideProps {
  slide: SlideData;
  aspectRatio: AspectRatio;
  isActive: boolean;
  slideNumber: number;
  totalSlides: number;
}

export interface PanelToggle {
  id: string;
  icon: string;
  label: string;
  isActive: boolean;
  onToggle?: () => void;
  badge?: number;
}

export interface FooterActions {
  /** Export: opens PDF export page in a new tab */
  exportPresentationId?: string;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  onToggleDebug?: () => void;
  debugMode?: boolean;
  showDebugButton?: boolean;
  onToggleDeveloperTools?: () => void;
  isDeveloperToolsOpen?: boolean;
  /** Style tweaks: picking mode that selects slide text for the slider panel */
  onToggleStyleTweaks?: () => void;
  isStyleTweakMode?: boolean;
  styleTweakCount?: number;
}

export interface FooterAnnotationNav {
  annotations: import('./annotation.types').Annotation[];
  onNavigateToSlide: (index: number) => void;
}

/** Live-session state shown in the footer connection indicator. */
export interface FooterSyncStatus {
  /** Whether this tab asked for a synchronized session at all. */
  enabled: boolean;
  /** Socket state reported by the presentation-role connection. */
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  /** Session the presenter view has to join to drive this deck. */
  sessionId: string;
  error?: string;
  /** Starts a session when one is not running yet. */
  onStartSession: () => void;
  /** Opens the presenter view for the running session. */
  onOpenPresenterView: () => void;
}

export interface FooterProps {
  currentSlide: number;
  totalSlides: number;
  currentTemplate?: string;
  /** Left-side panel toggle buttons, rendered in order */
  panels?: PanelToggle[];
  /** Right-side action buttons (fullscreen, export, debug) */
  actions?: FooterActions;
  /** Annotation dot navigation shown in the center */
  annotationNav?: FooterAnnotationNav;
  /** Live-session indicator; omitted when the shell has no sync at all */
  sync?: FooterSyncStatus;
  isMobile?: boolean;
}

export interface PresentationMeta {
  id: string;           // URL-safe identifier, e.g., "pitchdeck-nov-2025"
  title: string;        // Display name, e.g., "My Presentation"
  description?: string; // Optional description
  date?: string;        // Optional date, e.g., "November 2025"
  thumbnail?: string;   // Optional thumbnail image path
}

export interface Presentation extends PresentationMeta {
  slides: SlideData[];
}
