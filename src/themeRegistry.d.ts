// Generated from themeRegistry.js by debug-cli/generate-theme-types.mjs. Do not edit.
export const THEME_MANIFEST: readonly [
  {
    readonly id: "midnight";
    readonly name: "Midnight";
    readonly description: "Quiet, polished, and cinematic";
    readonly swatches: readonly ["#09090b", "#1c1c1e", "#6b8acd"];
    readonly fonts: "Ovo + Plus Jakarta Sans";
  },
  {
    readonly id: "ocean";
    readonly name: "Ocean";
    readonly description: "Confident steel blue with crisp contrast";
    readonly swatches: readonly ["#081521", "#132a3d", "#5fa8d3"];
    readonly fonts: "Space Grotesk + DM Sans";
  },
  {
    readonly id: "paper";
    readonly name: "Paper";
    readonly description: "Editorial warmth on a light canvas";
    readonly swatches: readonly ["#f7f3ea", "#ffffff", "#9a4f35"];
    readonly fonts: "Cormorant Garamond + IBM Plex Sans";
  },
  {
    readonly id: "ember";
    readonly name: "Ember";
    readonly description: "Dramatic charcoal with warm energy";
    readonly swatches: readonly ["#170e0b", "#2b1914", "#ff7a45"];
    readonly fonts: "Lora + Manrope";
  },
  {
    readonly id: "forest";
    readonly name: "Forest";
    readonly description: "Grounded greens and natural neutrals";
    readonly swatches: readonly ["#0d1712", "#18271f", "#74b88a"];
    readonly fonts: "Lora + IBM Plex Sans";
  },
  {
    readonly id: "mono";
    readonly name: "Mono";
    readonly description: "Black-and-white editorial clarity";
    readonly swatches: readonly ["#ffffff", "#050505", "#555555"];
    readonly fonts: "Helvetica Neue + SF Mono";
  },
];

export type ThemeManifestEntry = (typeof THEME_MANIFEST)[number];
export type ThemeId = ThemeManifestEntry['id'];
export const THEME_IDS: readonly ThemeId[];
