export interface OverflowInfo {
  isOverflowingX: boolean;
  isOverflowingY: boolean;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
}

export interface ParentInfo {
  tagName: string;
  className: string;
  display: string;
  flexDirection: string;
  justifyContent: string;
  alignItems: string;
  gap: string;
  width: string;
  height: string;
}

export interface ChildrenInfo {
  count: number;
  tags: string[];
  hasMore: boolean;
}

export interface ImageInfo {
  naturalWidth: number;
  naturalHeight: number;
  aspectRatio: string;
  objectFit: string;
  objectPosition: string;
  src: string;
}

export interface CanvasPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export interface ElementInfo {
  componentName: string;
  tagName: string;
  id: string;
  className: string;
  styles: CSSStyleDeclaration | null;
  element: HTMLElement | null;
  cssFile: string | null;
  hierarchy: string[];
  overflow: OverflowInfo;
  parent: ParentInfo | null;
  children: ChildrenInfo;
  imageInfo: ImageInfo | null;
  canvasPosition: CanvasPosition | null;
  diagnostics: string[];
  serializedStyles: Record<string, string>;
}
