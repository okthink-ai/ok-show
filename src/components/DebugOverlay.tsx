import type { FC } from 'react';
import { useEffect, useState } from 'react';
import './DebugOverlay.css';

interface DebugOverlayProps {
  currentSlide: number;
  slideTitle: string;
  slideTemplate: string;
}

interface DebugData {
  slide: Record<string, string>;
  slideContent: Record<string, string> | null;
  slideComponent: Record<string, string> | null;
  dimensions: {
    slideScrollHeight: number;
    slideOffsetHeight: number;
    hasOverflow: boolean;
  };
}

const DebugOverlay: FC<DebugOverlayProps> = ({ currentSlide, slideTitle, slideTemplate }) => {
  const [debugData, setDebugData] = useState<DebugData | null>(null);

  useEffect(() => {
    const activeSlide = document.querySelector('.slide--active');
    if (!activeSlide) {
      return;
    }

    const styles = window.getComputedStyle(activeSlide);
    const slideContent = activeSlide.querySelector('.slide__content');
    const contentStyles = slideContent ? window.getComputedStyle(slideContent) : null;

    const slideComponent = slideContent?.firstElementChild;
    const componentStyles = slideComponent ? window.getComputedStyle(slideComponent) : null;

    setDebugData({
      slide: {
        class: activeSlide.className,
        width: styles.width,
        height: styles.height,
        padding: styles.padding,
        display: styles.display,
        position: styles.position,
        transform: styles.transform,
        overflow: styles.overflow,
      },
      slideContent: contentStyles ? {
        width: contentStyles.width,
        height: contentStyles.height,
        display: contentStyles.display,
        flex: contentStyles.flex,
        minWidth: contentStyles.minWidth,
        minHeight: contentStyles.minHeight,
        overflow: contentStyles.overflow,
      } : null,
      slideComponent: componentStyles ? {
        class: slideComponent?.className || '',
        width: componentStyles.width,
        height: componentStyles.height,
        display: componentStyles.display,
        flex: componentStyles.flex,
        flexDirection: componentStyles.flexDirection,
        minWidth: componentStyles.minWidth,
        minHeight: componentStyles.minHeight,
        overflow: componentStyles.overflow,
        padding: componentStyles.padding,
      } : null,
      dimensions: {
        slideScrollHeight: (activeSlide as HTMLElement).scrollHeight,
        slideOffsetHeight: (activeSlide as HTMLElement).offsetHeight,
        hasOverflow: (activeSlide as HTMLElement).scrollHeight > (activeSlide as HTMLElement).offsetHeight,
      }
    });
  }, [currentSlide]);

  if (!debugData) return null;

  return (
    <div className="debug-overlay">
      <div className="debug-overlay__content">
        <div className="debug-overlay__header">
          <h3>🐛 Debug Info</h3>
          <p className="debug-overlay__subtitle">
            Slide {currentSlide + 1}: {slideTitle} ({slideTemplate})
          </p>
        </div>

        <div className="debug-overlay__section">
          <h4>.slide--active</h4>
          <table>
            <tbody>
              {Object.entries(debugData.slide).map(([key, value]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {debugData.slideContent && (
          <div className="debug-overlay__section">
            <h4>.slide__content</h4>
            <table>
              <tbody>
                {Object.entries(debugData.slideContent).map(([key, value]) => (
                  <tr key={key}>
                    <td>{key}</td>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {debugData.slideComponent && (
          <div className="debug-overlay__section">
            <h4>Slide Component</h4>
            <table>
              <tbody>
                {Object.entries(debugData.slideComponent).map(([key, value]) => (
                  <tr key={key}>
                    <td>{key}</td>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="debug-overlay__section">
          <h4>Overflow Check</h4>
          <table>
            <tbody>
              <tr>
                <td>scrollHeight</td>
                <td>{debugData.dimensions.slideScrollHeight}px</td>
              </tr>
              <tr>
                <td>offsetHeight</td>
                <td>{debugData.dimensions.slideOffsetHeight}px</td>
              </tr>
              <tr className={debugData.dimensions.hasOverflow ? 'debug-overlay__warning' : ''}>
                <td>hasOverflow</td>
                <td>{debugData.dimensions.hasOverflow ? '⚠️ YES' : '✅ NO'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="debug-overlay__footer">
          <p>Press Cmd+D (Ctrl+D) to close</p>
        </div>
      </div>
    </div>
  );
};

export default DebugOverlay;
