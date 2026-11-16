import type { FC } from 'react';
import type { StyleTweak, TweakSelection } from '../types/styleTweak.types';
import { TWEAK_HOVER_ATTR, TWEAK_LAYER_ID, buildTweakCss, tweakSelector } from '../utils/styleTweaks';

interface StyleTweakLayerProps {
  presentationId: string;
  tweaks: StyleTweak[];
  selection: TweakSelection | null;
  isActive: boolean;
}

/**
 * Previews the current deck's style tweaks as one stylesheet. The tweaks stay
 * visible after the picking mode ends, until they are cleared. The pick outlines
 * live in a separate sheet so reading an original value never disables them.
 */
const StyleTweakLayer: FC<StyleTweakLayerProps> = ({ presentationId, tweaks, selection, isActive }) => {
  const css = buildTweakCss(tweaks.filter((tweak) => tweak.presentationId === presentationId));
  const selected = isActive && selection?.target.presentationId === presentationId
    ? `${tweakSelector(selection.target, 'element')} { outline: 3px solid #3b6cff; outline-offset: 8px; }`
    : '';
  const picking = isActive
    ? `body.is-style-tweaking .slide--active > .slide__content { cursor: crosshair; }
[${TWEAK_HOVER_ATTR}] { outline: 2px dashed #3b6cff; outline-offset: 8px; cursor: pointer; }`
    : '';

  return (
    <>
      <style id={TWEAK_LAYER_ID}>{css}</style>
      <style>{`${picking}\n${selected}`}</style>
    </>
  );
};

export default StyleTweakLayer;
