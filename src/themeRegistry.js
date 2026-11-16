/** Runtime-safe theme manifest shared by the browser application and Node tools. */
export const THEME_MANIFEST = Object.freeze([
  { id: 'midnight', name: 'Midnight', description: 'Quiet, polished, and cinematic', swatches: ['#09090b', '#1c1c1e', '#6b8acd'], fonts: 'Ovo + Plus Jakarta Sans' },
  { id: 'ocean', name: 'Ocean', description: 'Confident steel blue with crisp contrast', swatches: ['#081521', '#132a3d', '#5fa8d3'], fonts: 'Space Grotesk + DM Sans' },
  { id: 'paper', name: 'Paper', description: 'Editorial warmth on a light canvas', swatches: ['#f7f3ea', '#ffffff', '#9a4f35'], fonts: 'Cormorant Garamond + IBM Plex Sans' },
  { id: 'ember', name: 'Ember', description: 'Dramatic charcoal with warm energy', swatches: ['#170e0b', '#2b1914', '#ff7a45'], fonts: 'Lora + Manrope' },
  { id: 'forest', name: 'Forest', description: 'Grounded greens and natural neutrals', swatches: ['#0d1712', '#18271f', '#74b88a'], fonts: 'Lora + IBM Plex Sans' },
  { id: 'mono', name: 'Mono', description: 'Black-and-white editorial clarity', swatches: ['#ffffff', '#050505', '#555555'], fonts: 'Helvetica Neue + SF Mono' },
]);

export const THEME_IDS = Object.freeze(THEME_MANIFEST.map((theme) => theme.id));
