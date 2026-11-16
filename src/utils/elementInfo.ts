import { TEMPLATE_TYPES, componentFileMap, getComponentName } from './slideRegistry';
import type {
  OverflowInfo,
  ParentInfo,
  ChildrenInfo,
  ImageInfo,
  CanvasPosition,
  ElementInfo,
} from '../types/elementInfo.types';

export type { OverflowInfo, ParentInfo, ChildrenInfo, ImageInfo, CanvasPosition, ElementInfo };
export { componentFileMap, getComponentName };

// Regex derived from TEMPLATE_TYPES — matches exact root class names like "team-slide".
const SLIDE_ROOT_CLASS_RE = new RegExp(
  `^(${TEMPLATE_TYPES.map(t => t.classFragment).join('|')})$`
);

export function getComponentHierarchy(element: HTMLElement): string[] {
  const hierarchy: string[] = [];
  let current: HTMLElement | null = element;
  let foundMainComponent = false;

  while (current && hierarchy.length < 15) {
    const className = current.className || '';
    const componentName = getComponentName(className);

    if (componentName !== 'Unknown' && !foundMainComponent) {
      const isMainContainer =
        className.split(' ').some(cls => SLIDE_ROOT_CLASS_RE.test(cls)) ||
        className.includes('slide__content') ||
        /slide--(landscape|portrait)/.test(className);

      if (isMainContainer) {
        hierarchy.unshift(componentName);
        foundMainComponent = true;
      } else if (className) {
        const firstClass = className.split(' ')[0];
        if (firstClass && !firstClass.startsWith('css-')) {
          hierarchy.unshift(firstClass);
        }
      }
    } else if (className) {
      const firstClass = className.split(' ')[0];
      if (firstClass && !firstClass.startsWith('css-')) {
        hierarchy.unshift(firstClass);
      }
    } else {
      hierarchy.unshift(current.tagName.toLowerCase());
    }

    current = current.parentElement;
  }

  // Trim hierarchy to start from slide-related elements
  const slideStartIndex = hierarchy.findIndex(item =>
    item === 'Slide container' ||
    item === 'slide__content wrapper' ||
    item === 'slide' ||
    item.includes('-slide')
  );

  if (slideStartIndex > 0) {
    return hierarchy.slice(slideStartIndex);
  }

  return hierarchy;
}

export function getOverflowInfo(element: HTMLElement): OverflowInfo {
  const isOverflowingX = element.scrollWidth > element.clientWidth;
  const isOverflowingY = element.scrollHeight > element.clientHeight;

  return {
    isOverflowingX,
    isOverflowingY,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
  };
}

export function getParentInfo(element: HTMLElement): ParentInfo | null {
  const parent = element.parentElement;
  if (!parent) return null;

  const styles = window.getComputedStyle(parent);
  const className = parent.className || '(no class)';

  return {
    tagName: parent.tagName.toLowerCase(),
    className: className.split(' ')[0] || className,
    display: styles.display,
    flexDirection: styles.flexDirection,
    justifyContent: styles.justifyContent,
    alignItems: styles.alignItems,
    gap: styles.gap,
    width: styles.width,
    height: styles.height,
  };
}

export function getDiagnostics(
  element: HTMLElement,
  parentInfo: ParentInfo | null,
  overflowInfo: OverflowInfo
): string[] {
  const issues: string[] = [];
  const styles = window.getComputedStyle(element);

  const isFlexItem = parentInfo && (parentInfo.display === 'flex' || parentInfo.display === 'inline-flex');

  if (isFlexItem) {
    const isColumnFlex = parentInfo.flexDirection === 'column' || parentInfo.flexDirection === 'column-reverse';
    const isRowFlex = parentInfo.flexDirection === 'row' || parentInfo.flexDirection === 'row-reverse';

    if (isColumnFlex && styles.minHeight === 'auto' && overflowInfo.isOverflowingY) {
      issues.push('min-height: auto on flex item in column container - add min-height: 0 to allow shrinking');
    }
    if (isRowFlex && styles.minWidth === 'auto' && overflowInfo.isOverflowingX) {
      issues.push('min-width: auto on flex item in row container - add min-width: 0 to allow shrinking');
    }

    if (styles.flexShrink === '0' && (overflowInfo.isOverflowingX || overflowInfo.isOverflowingY)) {
      issues.push('flex-shrink: 0 prevents this element from shrinking');
    }
  }

  // Check ancestors for overflow: hidden (only if this element has overflow)
  if (overflowInfo.isOverflowingX || overflowInfo.isOverflowingY) {
    let ancestor = element.parentElement;
    let depth = 0;
    while (ancestor && depth < 5) {
      const ancestorStyles = window.getComputedStyle(ancestor);
      const ancestorClass = ancestor.className?.split(' ')[0] || ancestor.tagName.toLowerCase();

      const isSlideContainer = ancestor.className?.includes('slide--landscape') ||
                               ancestor.className?.includes('slide--portrait') ||
                               ancestor.className?.includes('slide__content');

      if (!isSlideContainer && (ancestorStyles.overflow === 'hidden' || ancestorStyles.overflowX === 'hidden' || ancestorStyles.overflowY === 'hidden')) {
        issues.push(`Ancestor "${ancestorClass}" has overflow: hidden - clipping this element's overflow`);
        break;
      }
      ancestor = ancestor.parentElement;
      depth++;
    }
  }

  if (element.tagName.toLowerCase() === 'img') {
    const objectFit = styles.objectFit;
    if (objectFit === 'fill' || objectFit === 'none') {
      if (isFlexItem) {
        issues.push(`Image has object-fit: ${objectFit} - consider using "cover" or "contain" for better scaling`);
      }
    }
  }

  return issues;
}

export function getChildrenInfo(element: HTMLElement): ChildrenInfo {
  const children = Array.from(element.children);
  const childTags = children.slice(0, 5).map(child => child.tagName.toLowerCase());

  return {
    count: children.length,
    tags: childTags,
    hasMore: children.length > 5,
  };
}

export function getImageInfo(element: HTMLElement): ImageInfo | null {
  if (element.tagName.toLowerCase() !== 'img') return null;

  const img = element as HTMLImageElement;
  const styles = window.getComputedStyle(element);

  return {
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    aspectRatio: img.naturalWidth && img.naturalHeight
      ? (img.naturalWidth / img.naturalHeight).toFixed(2)
      : 'unknown',
    objectFit: styles.objectFit,
    objectPosition: styles.objectPosition,
    src: img.src.length > 60 ? '...' + img.src.slice(-57) : img.src,
  };
}

export function getSlideCanvasPosition(element: HTMLElement): CanvasPosition | null {
  const slideContainer = element.closest('.slide--landscape, .slide--portrait') as HTMLElement;
  if (!slideContainer) return null;

  const slideRect = slideContainer.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const isLandscape = slideContainer.classList.contains('slide--landscape');
  const slideWidth = isLandscape ? 1920 : 1080;
  const slideHeight = isLandscape ? 1080 : 1920;

  const scaleX = slideWidth / slideRect.width;
  const scaleY = slideHeight / slideRect.height;

  const x = Math.round((elementRect.left - slideRect.left) * scaleX);
  const y = Math.round((elementRect.top - slideRect.top) * scaleY);
  const width = Math.round(elementRect.width * scaleX);
  const height = Math.round(elementRect.height * scaleY);

  return {
    x,
    y,
    width,
    height,
    scale: Math.round((1 / scaleX) * 100) / 100,
  };
}

const SERIALIZED_STYLE_PROPS = [
  'display',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'flexDirection',
  'justifyContent',
  'alignItems',
  'gap',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'padding',
  'margin',
  'overflow',
  'position',
  'fontSize',
  'lineHeight',
  'fontWeight',
] as const;

export function getElementInfo(element: HTMLElement): ElementInfo {
  const className = element.className || '(no class)';
  const tagName = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const componentName = getComponentName(className);

  const styles = window.getComputedStyle(element);
  const overflow = getOverflowInfo(element);
  const parent = getParentInfo(element);
  const diagnostics = getDiagnostics(element, parent, overflow);

  const serializedStyles: Record<string, string> = {};
  for (const prop of SERIALIZED_STYLE_PROPS) {
    serializedStyles[prop] = styles[prop as keyof CSSStyleDeclaration] as string;
  }

  return {
    componentName,
    tagName,
    id,
    className,
    styles,
    element,
    cssFile: componentFileMap[componentName] || null,
    hierarchy: getComponentHierarchy(element),
    overflow,
    parent,
    children: getChildrenInfo(element),
    imageInfo: getImageInfo(element),
    canvasPosition: getSlideCanvasPosition(element),
    diagnostics,
    serializedStyles,
  };
}
