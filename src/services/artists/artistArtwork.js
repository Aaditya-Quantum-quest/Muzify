// src/services/artists/artistArtwork.js
// Deterministic gradient & initials generation for artist fallback artwork.

import { normalizeArtistName } from './artistParser.js';

export const ARTIST_GRADIENT_PALETTES = [
  ['#ec6f8e', '#f0a343'],
  ['#5b3fa0', '#2a1a5e'],
  ['#3a7ca5', '#1b3a5c'],
  ['#d3358f', '#4a1a7a'],
  ['#1f9a9a', '#0e3a5a'],
  ['#e0803a', '#a8321f'],
  ['#6a9a4a', '#2a5a3a'],
  ['#d9a03a', '#8a4a1a'],
  ['#1f9a9a', '#3cc0b8'],
  ['#8e44ad', '#2c3e50'],
  ['#e07a5f', '#3d405b'],
  ['#3d5a80', '#293241'],
];

/** Hash string into positive 32-bit integer. */
export function hashArtistName(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Get deterministic 2-color gradient for artist. */
export function getArtistGradient(name = '') {
  const norm = normalizeArtistName(name);
  const h = hashArtistName(norm);
  return ARTIST_GRADIENT_PALETTES[h % ARTIST_GRADIENT_PALETTES.length];
}

/** Get 1-2 letter initials for artist. */
export function getArtistInitials(name = '') {
  if (!name || typeof name !== 'string') return '??';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
