import { useState } from 'react';
import type { FC, ReactNode } from 'react';
import type { StyleProperty, StyleTweak, StyleValues, TextCase, TweakScope, TweakSelection } from '../types/styleTweak.types';
import {
  FONT_CHOICES,
  PROPERTY_LABELS,
  changedProperties,
  effectiveValues,
  formatValue,
  isNeutral,
  lightness,
  neutralGray,
  sameTarget,
} from '../utils/styleTweaks';
import './StyleTweaksSidebar.css';

interface StyleTweaksSidebarProps {
  presentationId: string;
  isActive: boolean;
  tweaks: StyleTweak[];
  selection: TweakSelection | null;
  currentSlide: number;
  onToggleActive: () => void;
  onSetValue: <Key extends StyleProperty>(property: Key, value: StyleValues[Key]) => void;
  onSetScope: (scope: TweakScope) => void;
  onResetSelection: () => void;
  onSelectTweak: (tweak: StyleTweak) => void;
  onRemoveTweak: (id: string) => void;
  onCopyAll: () => Promise<boolean>;
  onClearAll: () => void;
}

interface RowProps {
  label: string;
  value: string;
  changed: boolean;
  onReset: () => void;
  children: ReactNode;
}

const Row: FC<RowProps> = ({ label, value, changed, onReset, children }) => (
  <div className={`style-tweaks__row ${changed ? 'style-tweaks__row--changed' : ''}`}>
    <div className="style-tweaks__row-head">
      <span className="style-tweaks__row-label">{label}</span>
      <span className="style-tweaks__row-value">{value}</span>
      {changed && (
        <button type="button" className="style-tweaks__row-reset" onClick={onReset} aria-label={`Reset ${label}`} title={`Reset ${label}`}>
          reset
        </button>
      )}
    </div>
    {children}
  </div>
);

const StyleTweaksSidebar: FC<StyleTweaksSidebarProps> = ({
  presentationId,
  isActive,
  tweaks,
  selection,
  currentSlide,
  onToggleActive,
  onSetValue,
  onSetScope,
  onResetSelection,
  onSelectTweak,
  onRemoveTweak,
  onCopyAll,
  onClearAll,
}) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const target = selection?.target.presentationId === presentationId ? selection.target : null;
  const tweak = target ? tweaks.find((candidate) => sameTarget(candidate, target)) : undefined;
  const values = target ? effectiveValues(target.original, tweak?.values ?? {}) : null;
  const changed = (property: StyleProperty) => tweak?.values[property] !== undefined;
  const reset = (property: StyleProperty) => () => target && onSetValue(property, target.original[property]);
  const changedTweaks = tweaks.filter((candidate) => changedProperties(candidate.values).length > 0);
  const fonts = values && !FONT_CHOICES.some((font) => font === values.fontFamily)
    ? [values.fontFamily, ...FONT_CHOICES]
    : [...FONT_CHOICES];

  const copy = async () => {
    const copied = await onCopyAll();
    setCopyState(copied ? 'copied' : 'failed');
    window.setTimeout(() => setCopyState('idle'), 2000);
  };

  return (
    <div className="style-tweaks">
      <div className="style-tweaks__header">
        <button
          type="button"
          className={`style-tweaks__mode ${isActive ? 'style-tweaks__mode--on' : ''}`}
          onClick={onToggleActive}
          aria-pressed={isActive}
        >
          {isActive ? 'Picking text: click any text on the slide' : 'Start picking text'}
        </button>
        <p className="style-tweaks__hint">
          {isActive
            ? 'Clicks on the slide select text instead of advancing. Arrow keys still change slides. Esc stops picking.'
            : 'Tweaks stay on the slides until you remove them.'}
        </p>
      </div>

      <div className="style-tweaks__content">
        {target && values ? (
          <section className="style-tweaks__editor" aria-label="Selected text">
            <div className="style-tweaks__target">
              <span className="style-tweaks__target-meta">
                Slide {target.slideIndex + 1} · {target.slideTemplate} · &lt;{target.tag}{target.className ? `.${target.className.split(/\s+/)[0]}` : ''}&gt;
                {target.slideIndex !== currentSlide && ' · not on this slide'}
              </span>
              <span className="style-tweaks__target-text">“{target.text.length > 90 ? `${target.text.slice(0, 89)}…` : target.text}”</span>
            </div>

            <fieldset className="style-tweaks__scope">
              <legend>Preview on</legend>
              <label>
                <input type="radio" name="style-tweak-scope" checked={selection?.scope === 'element'} onChange={() => onSetScope('element')} />
                This element
              </label>
              <label>
                <input type="radio" name="style-tweak-scope" checked={selection?.scope === 'role'} onChange={() => onSetScope('role')} />
                Every <code>{target.roleSelector}</code>
              </label>
            </fieldset>

            <Row label="Font" value={values.fontFamily} changed={changed('fontFamily')} onReset={reset('fontFamily')}>
              <select
                aria-label="Font"
                value={values.fontFamily}
                onChange={(event) => onSetValue('fontFamily', event.target.value)}
                style={{ fontFamily: `'${values.fontFamily}'` }}
              >
                {fonts.map((font) => <option key={font} value={font} style={{ fontFamily: `'${font}'` }}>{font}</option>)}
              </select>
            </Row>

            <Row label="Size" value={`${values.fontSize}px`} changed={changed('fontSize')} onReset={reset('fontSize')}>
              <input type="range" aria-label="Size" min={12} max={240} step={1} value={values.fontSize}
                onChange={(event) => onSetValue('fontSize', Number(event.target.value))} />
            </Row>

            <Row label="Weight" value={String(values.fontWeight)} changed={changed('fontWeight')} onReset={reset('fontWeight')}>
              <input type="range" aria-label="Weight" min={100} max={900} step={100} value={values.fontWeight}
                onChange={(event) => onSetValue('fontWeight', Number(event.target.value))} />
            </Row>

            <Row label="Line height" value={values.lineHeight.toFixed(2)} changed={changed('lineHeight')} onReset={reset('lineHeight')}>
              <input type="range" aria-label="Line height" min={0.8} max={2} step={0.01} value={values.lineHeight}
                onChange={(event) => onSetValue('lineHeight', Number(event.target.value))} />
            </Row>

            <Row label="Letter spacing" value={`${values.letterSpacing}em`} changed={changed('letterSpacing')} onReset={reset('letterSpacing')}>
              <input type="range" aria-label="Letter spacing" min={-0.1} max={0.3} step={0.005} value={values.letterSpacing}
                onChange={(event) => onSetValue('letterSpacing', Number(event.target.value))} />
            </Row>

            <Row label="Color" value={values.color} changed={changed('color')} onReset={reset('color')}>
              <div className="style-tweaks__color">
                <input type="color" aria-label="Color" value={values.color}
                  onChange={(event) => onSetValue('color', event.target.value)} />
                <input type="text" aria-label="Color hex" value={values.color} spellCheck={false}
                  onChange={(event) => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) onSetValue('color', event.target.value.toLowerCase()); }} />
              </div>
            </Row>

            <Row
              label="Shade of black"
              value={isNeutral(values.color) ? `${lightness(values.color)}% gray` : 'not a gray'}
              changed={changed('color')}
              onReset={reset('color')}
            >
              <input type="range" aria-label="Shade of black" min={0} max={90} step={1} value={lightness(values.color)}
                onChange={(event) => onSetValue('color', neutralGray(Number(event.target.value)))} />
            </Row>

            <div className="style-tweaks__pair">
              <Row label="Style" value={values.fontStyle} changed={changed('fontStyle')} onReset={reset('fontStyle')}>
                <select aria-label="Style" value={values.fontStyle} onChange={(event) => onSetValue('fontStyle', event.target.value as 'normal' | 'italic')}>
                  <option value="normal">Normal</option>
                  <option value="italic">Italic</option>
                </select>
              </Row>
              <Row label="Case" value={values.textTransform} changed={changed('textTransform')} onReset={reset('textTransform')}>
                <select aria-label="Case" value={values.textTransform} onChange={(event) => onSetValue('textTransform', event.target.value as TextCase)}>
                  <option value="none">As written</option>
                  <option value="uppercase">Uppercase</option>
                  <option value="lowercase">Lowercase</option>
                  <option value="capitalize">Capitalize</option>
                </select>
              </Row>
            </div>

            {tweak && (
              <button type="button" className="style-tweaks__button" onClick={onResetSelection}>Reset this element</button>
            )}
          </section>
        ) : (
          <p className="style-tweaks__empty">
            {isActive ? 'Click any text on the slide to tweak it.' : 'Turn on picking, then click any text on the slide.'}
          </p>
        )}

        <section className="style-tweaks__list" aria-label="Tweaks">
          <h3>Tweaks in this deck ({changedTweaks.length})</h3>
          {changedTweaks.length === 0 && <p className="style-tweaks__empty">None yet.</p>}
          <ol>
            {changedTweaks.map((candidate) => (
              <li key={candidate.id} className={target && sameTarget(candidate, target) ? 'style-tweaks__item--selected' : ''}>
                <button type="button" className="style-tweaks__item" onClick={() => onSelectTweak(candidate)}>
                  <span className="style-tweaks__item-title">
                    Slide {candidate.slideIndex + 1} · {candidate.scope === 'role' ? candidate.roleSelector : `<${candidate.tag}>`}
                  </span>
                  <span className="style-tweaks__item-text">{candidate.text}</span>
                  <span className="style-tweaks__item-changes">
                    {changedProperties(candidate.values)
                      .map((property) => `${PROPERTY_LABELS[property]} ${formatValue(property, candidate.values[property] as never)}`)
                      .join(' · ')}
                  </span>
                </button>
                <button type="button" className="style-tweaks__remove" onClick={() => onRemoveTweak(candidate.id)} aria-label="Remove tweak" title="Remove tweak">×</button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="style-tweaks__footer">
        <button type="button" className="style-tweaks__button style-tweaks__button--primary" onClick={copy} disabled={changedTweaks.length === 0}>
          {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : `Copy all tweaks (${changedTweaks.length})`}
        </button>
        <button type="button" className="style-tweaks__button" onClick={onClearAll} disabled={changedTweaks.length === 0}>Clear all</button>
      </div>
    </div>
  );
};

export default StyleTweaksSidebar;
