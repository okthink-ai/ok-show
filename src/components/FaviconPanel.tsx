import { type FC, useRef, useEffect, useState } from 'react';
import MaterialIcon from './MaterialIcon';
import './FaviconPanel.css';

interface FaviconPanelProps {
  onClose: () => void;
}

const FaviconPanel: FC<FaviconPanelProps> = ({ onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [selectedSize, setSelectedSize] = useState(512);
  const sizes = [16, 32, 48, 64, 128, 256, 512];

  const drawFavicon = (canvas: HTMLCanvasElement, size: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = size;
    canvas.height = size;

    // Background (matches --color-surface: #121212)
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, size, size);

    // Blue gradient glow at top right (inspired by --gradient-glow but more visible at small sizes)
    const blueGradient = ctx.createRadialGradient(
      size, 0, 0,
      size, 0, size * 1.2
    );
    blueGradient.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
    blueGradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.08)');
    blueGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = blueGradient;
    ctx.fillRect(0, 0, size, size);

    // Text - large so it's visible at small sizes
    const fontSize = size * 0.65;
    ctx.font = `400 ${fontSize}px Ovo, serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('okt', size / 2, size / 2 + fontSize * 0.05);
  };

  useEffect(() => {
    if (canvasRef.current) {
      drawFavicon(canvasRef.current, selectedSize);
    }
  }, [selectedSize]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `favicon-${selectedSize}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const handleCopy = async () => {
    if (!canvasRef.current) return;
    try {
      const blob = await new Promise<Blob>((resolve) => {
        canvasRef.current!.toBlob((b) => resolve(b!), 'image/png');
      });
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownloadAll = () => {
    const tempCanvas = document.createElement('canvas');
    sizes.forEach((size) => {
      drawFavicon(tempCanvas, size);
      const link = document.createElement('a');
      link.download = `favicon-${size}.png`;
      link.href = tempCanvas.toDataURL('image/png');
      link.click();
    });
  };

  return (
    <div className="favicon-panel">
      <div className="favicon-panel__header">
        <h2 className="favicon-panel__title">Favicon Generator</h2>
        <button
          className="favicon-panel__close"
          onClick={onClose}
          aria-label="Close panel"
        >
          <MaterialIcon name="close" size="small" />
        </button>
      </div>

      <div className="favicon-panel__content">
        {/* Canvas preview */}
        <div className="favicon-panel__main-preview">
          <canvas
            ref={canvasRef}
            className="favicon-panel__canvas"
            style={{ width: 256, height: 256 }}
          />
        </div>

        {/* Size selector */}
        <div className="favicon-panel__size-selector">
          {sizes.map((size) => (
            <button
              key={size}
              className={`favicon-panel__size-btn ${selectedSize === size ? 'active' : ''}`}
              onClick={() => setSelectedSize(size)}
            >
              {size}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="favicon-panel__actions">
          <button className="favicon-panel__btn" onClick={handleCopy}>
            <MaterialIcon name={copied ? 'check' : 'content_copy'} size="small" />
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
          <button className="favicon-panel__btn" onClick={handleDownload}>
            <MaterialIcon name="download" size="small" />
            Download {selectedSize}px
          </button>
          <button className="favicon-panel__btn favicon-panel__btn--secondary" onClick={handleDownloadAll}>
            <MaterialIcon name="folder_zip" size="small" />
            Download All Sizes
          </button>
        </div>
      </div>
    </div>
  );
};

export default FaviconPanel;
