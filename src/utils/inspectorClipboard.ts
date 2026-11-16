import { isValidElement, type ReactElement } from 'react';
import type { SlideData } from '../types/slide.types';
import type { ElementInfo } from './elementInfo';

interface SlideContext {
  currentSlide: number;
  totalSlides: number;
  aspectRatio: '16:9' | '9:16';
  slides: SlideData[];
}

export function getSlideProps(slides: SlideData[], currentSlide: number) {
  const currentSlideData = slides[currentSlide];
  if (!currentSlideData) return null;

  const propsMap: Record<string, unknown> = {};

  const content = currentSlideData.content;
  if (isValidElement(content)) {
    const element = content as ReactElement;
    if (element.props) {
      Object.entries(element.props).forEach(([key, value]) => {
        if (key !== 'orientation' && key !== 'children') {
          propsMap[key] = value;
        }
      });
    }
  }

  return {
    template: currentSlideData.template,
    title: currentSlideData.title,
    props: propsMap,
  };
}

export function formatInspectorClipboard(info: ElementInfo, ctx: SlideContext): string {
  const { currentSlide, totalSlides, aspectRatio, slides } = ctx;
  const slideProps = getSlideProps(slides, currentSlide);

  const textContent = info.element?.textContent?.trim() ?? '';
  const textPreview =
    textContent.length > 100 ? textContent.substring(0, 100) + '...' : textContent;

  const sections: string[] = [];

  // Section 1: Slide Context
  if (slideProps) {
    sections.push(`Slide Context:
  Slide: ${currentSlide + 1} of ${totalSlides}
  Template: ${slideProps.template}
  Title: ${slideProps.title}
  Orientation: ${aspectRatio === '16:9' ? 'landscape (1920x1080)' : 'portrait (1080x1920)'}`);
  }

  // Section 2: Component & Hierarchy
  sections.push(`Component: ${info.componentName}
Hierarchy: ${info.hierarchy.join(' > ')}
Element: <${info.tagName}${info.id} class="${info.className}">${info.cssFile ? `\nCSS File: ${info.cssFile}` : ''}`);

  // Section 3: Text content (if any)
  if (textContent) {
    sections.push(`Text Content: ${textPreview}`);
  }

  // Section 4: Overflow Detection
  if (info.overflow.isOverflowingX || info.overflow.isOverflowingY) {
    sections.push(`OVERFLOW DETECTED:
  Overflowing X: ${info.overflow.isOverflowingX} (scroll: ${info.overflow.scrollWidth}px > client: ${info.overflow.clientWidth}px)
  Overflowing Y: ${info.overflow.isOverflowingY} (scroll: ${info.overflow.scrollHeight}px > client: ${info.overflow.clientHeight}px)`);
  }

  // Section 5: This Element's Styles
  if (info.styles) {
    sections.push(`Computed Styles:
  box-sizing: ${info.styles.boxSizing}
  display: ${info.styles.display}
  flex-grow: ${info.styles.flexGrow}
  flex-shrink: ${info.styles.flexShrink}
  flex-basis: ${info.styles.flexBasis}
  flex-direction: ${info.styles.flexDirection}
  justify-content: ${info.styles.justifyContent}
  align-items: ${info.styles.alignItems}
  align-self: ${info.styles.alignSelf}
  gap: ${info.styles.gap}
  width: ${info.styles.width}
  height: ${info.styles.height}
  min-width: ${info.styles.minWidth}
  min-height: ${info.styles.minHeight}
  max-width: ${info.styles.maxWidth}
  max-height: ${info.styles.maxHeight}
  padding: ${info.styles.padding}
  margin: ${info.styles.margin}
  overflow: ${info.styles.overflow}
  position: ${info.styles.position}`);
  }

  // Section 6: Parent Element
  if (info.parent) {
    sections.push(`Parent Element: <${info.parent.tagName} class="${info.parent.className}">
  display: ${info.parent.display}
  flex-direction: ${info.parent.flexDirection}
  justify-content: ${info.parent.justifyContent}
  align-items: ${info.parent.alignItems}
  gap: ${info.parent.gap}
  width: ${info.parent.width}
  height: ${info.parent.height}`);
  }

  // Section 7: Children Summary
  if (info.children.count > 0) {
    const childList = info.children.tags.join(', ') + (info.children.hasMore ? ', ...' : '');
    sections.push(`Children: ${info.children.count} [${childList}]`);
  }

  // Section 8: Image-specific info
  if (info.imageInfo) {
    sections.push(`Image Info:
  Natural Size: ${info.imageInfo.naturalWidth}x${info.imageInfo.naturalHeight}
  Aspect Ratio: ${info.imageInfo.aspectRatio}
  object-fit: ${info.imageInfo.objectFit}
  object-position: ${info.imageInfo.objectPosition}
  src: ${info.imageInfo.src}`);
  }

  // Section 9: Canvas Position
  if (info.canvasPosition) {
    sections.push(`Position in Slide Canvas (unscaled):
  x: ${info.canvasPosition.x}px, y: ${info.canvasPosition.y}px
  size: ${info.canvasPosition.width}x${info.canvasPosition.height}px
  current display scale: ${info.canvasPosition.scale}`);
  }

  // Section 10: Diagnostics
  if (info.diagnostics.length > 0) {
    sections.push(
      `Potential Issues Detected:\n${info.diagnostics.map((issue) => `  ⚠️ ${issue}`).join('\n')}`,
    );
  }

  return sections.join('\n\n');
}
