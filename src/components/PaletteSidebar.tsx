import type { FC } from 'react';
import { useEffect, useState } from 'react';
import './PaletteSidebar.css';
import MaterialIcon from './MaterialIcon';
import { themes } from '../themes';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setTheme } from '../store/uiSlice';

interface PaletteSidebarProps {
  onClose: () => void;
}

const CORE_COLORS = [
  { name: 'Primary 50', variable: '--color-primary-50', hex: '#eff6ff' },
  { name: 'Primary 100', variable: '--color-primary-100', hex: '#dbeafe' },
  { name: 'Primary 200', variable: '--color-primary-200', hex: '#bfdbfe' },
  { name: 'Primary 300', variable: '--color-primary-300', hex: '#93c5fd' },
  { name: 'Primary 400', variable: '--color-primary-400', hex: '#60a5fa' },
  { name: 'Primary 500', variable: '--color-primary-500', hex: '#3b82f6' },
  { name: 'Primary 600', variable: '--color-primary-600', hex: '#2563eb' },
  { name: 'Primary 700', variable: '--color-primary-700', hex: '#1d4ed8' },
  { name: 'Primary 800', variable: '--color-primary-800', hex: '#1e40af' },
  { name: 'Primary 900', variable: '--color-primary-900', hex: '#1e3a8a' },

  { name: 'Neutral 50', variable: '--color-neutral-50', hex: '#fafafa' },
  { name: 'Neutral 100', variable: '--color-neutral-100', hex: '#f5f5f5' },
  { name: 'Neutral 200', variable: '--color-neutral-200', hex: '#e5e5e5' },
  { name: 'Neutral 300', variable: '--color-neutral-300', hex: '#d4d4d4' },
  { name: 'Neutral 400', variable: '--color-neutral-400', hex: '#a3a3a3' },
  { name: 'Neutral 500', variable: '--color-neutral-500', hex: '#737373' },
  { name: 'Neutral 600', variable: '--color-neutral-600', hex: '#525252' },
  { name: 'Neutral 700', variable: '--color-neutral-700', hex: '#404040' },
  { name: 'Neutral 800', variable: '--color-neutral-800', hex: '#262626' },
  { name: 'Neutral 900', variable: '--color-neutral-900', hex: '#171717' },
  { name: 'Neutral 950', variable: '--color-neutral-950', hex: '#0a0a0a' },
];

const SEMANTIC_COLORS = [
  { name: 'Background', variable: '--color-background', hex: '#09090b' },
  { name: 'Background Secondary', variable: '--color-background-secondary', hex: '#0f0f11' },
  { name: 'Surface', variable: '--color-surface', hex: '#141416' },
  { name: 'Surface Card', variable: '--color-surface-card', hex: '#1c1c1e' },

  { name: 'Text Primary', variable: '--color-text-primary', hex: '#ffffff' },
  { name: 'Text Body', variable: '--color-text-body', hex: '#d4d4d8' },
  { name: 'Text Secondary', variable: '--color-text-secondary', hex: '#a1a1aa' },
  { name: 'Text Tertiary', variable: '--color-text-tertiary', hex: '#737373' },

  { name: 'Accent', variable: '--color-accent', hex: '#6b8acd' },
  { name: 'Accent Hover', variable: '--color-accent-hover', hex: '#8aa0d6' },

  { name: 'Success', variable: '--color-success', hex: '#10b981' },
  { name: 'Warning', variable: '--color-warning', hex: '#f59e0b' },
  { name: 'Error', variable: '--color-error', hex: '#ef4444' },
];

const PaletteSidebar: FC<PaletteSidebarProps> = ({ onClose }) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [resolvedColors, setResolvedColors] = useState<Record<string, string>>({});
  const dispatch = useAppDispatch();
  const activeTheme = useAppSelector((state) => state.ui.theme);

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    const colors = [...CORE_COLORS, ...SEMANTIC_COLORS];
    setResolvedColors(Object.fromEntries(colors.map((color) => [color.variable, styles.getPropertyValue(color.variable).trim()])));
  }, [activeTheme]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const renderColorRow = (color: { name: string, variable: string, hex: string }) => {
    const resolved = resolvedColors[color.variable] || color.hex;
    return (
    <div key={color.variable} className="palette-sidebar__item">
      <div 
        className="palette-sidebar__swatch" 
        style={{ backgroundColor: `var(${color.variable})` }}
      />
      <div className="palette-sidebar__details">
        <div 
          className="palette-sidebar__info-row"
          onClick={() => copyToClipboard(`var(${color.variable})`, `${color.variable}-var`)}
          title="Click to copy variable"
        >
          <span className="palette-sidebar__name">{color.name}</span>
          {copied === `${color.variable}-var` && <span className="palette-sidebar__copied">Copied!</span>}
        </div>
        <div 
          className="palette-sidebar__info-row"
          onClick={() => copyToClipboard(resolved, `${color.variable}-hex`)}
          title="Click to copy hex"
        >
          <span className="palette-sidebar__hex">{resolved}</span>
          {copied === `${color.variable}-hex` && <span className="palette-sidebar__copied">Copied!</span>}
        </div>
      </div>
    </div>
    );
  };

  return (
    <div className="palette-sidebar">
      <div className="palette-sidebar__header">
        <h3 className="palette-sidebar__title">Theme &amp; Palette</h3>
        <button className="palette-sidebar__close" onClick={onClose}>
          <MaterialIcon name="close" size="medium" />
        </button>
      </div>
      <div className="palette-sidebar__content">
        <div className="palette-sidebar__section">
          <h4 className="palette-sidebar__section-title">Themes</h4>
          <div className="palette-sidebar__themes">
            {themes.map((theme) => (
              <button
                type="button"
                key={theme.id}
                data-testid={`theme-option-${theme.id}`}
                className={`palette-sidebar__theme ${activeTheme === theme.id ? 'palette-sidebar__theme--active' : ''}`}
                onClick={() => dispatch(setTheme(theme.id))}
                aria-pressed={activeTheme === theme.id}
              >
                <span className="palette-sidebar__theme-swatches">
                  {theme.swatches.map((swatch) => <span key={swatch} style={{ background: swatch }} />)}
                </span>
                <span className="palette-sidebar__theme-copy">
                  <strong>{theme.name}</strong>
                  <small>{theme.description}</small>
                  <em>{theme.fonts}</em>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="palette-sidebar__section">
          <h4 className="palette-sidebar__section-title">Semantic Colors</h4>
          <div className="palette-sidebar__grid">
            {SEMANTIC_COLORS.map(renderColorRow)}
          </div>
        </div>

        <div className="palette-sidebar__section">
          <h4 className="palette-sidebar__section-title">Core Palette</h4>
          <div className="palette-sidebar__grid">
            {CORE_COLORS.map(renderColorRow)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaletteSidebar;
