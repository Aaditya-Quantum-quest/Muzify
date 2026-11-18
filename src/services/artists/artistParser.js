// src/services/artists/artistParser.js
// Pure utility to parse artist credit strings into structured components.
// Follows the specification rules (feat., &, commas, protected names, etc.).

import { protectedNames } from './protectedNames.js';

/** Public alias for the protected-name list (spec export name). */
export const PROTECTED_NAMES = protectedNames;

/** Normalized set of protected names for O(1) lookup. */
const PROTECTED_SET = new Set(protectedNames.map((n) => normalizeArtistName(n)));

/**
 * Normalize a name for deduplication/comparison.
 * Unicode NFKC, trim, collapse spaces, lowercase.
 */
export function normalizeArtistName(name) {
  if (name == null) return '';
  return name
    .toString()
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Trim/collapse whitespace without changing casing. */
export function displayClean(name) {
  if (name == null) return '';
  return name
    .toString()
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Is this a generic placeholder that should be ignored? */
export function isGeneric(name) {
  if (!name) return true;
  return /^(Various Artists|VA|Unknown Artist|Unknown|\s*)$/i.test(name.trim());
}

/** Check if name is in protected list or known set. */
export function isProtectedName(name, knownNames = null) {
  const norm = normalizeArtistName(name);
  if (PROTECTED_SET.has(norm)) return true;
  if (knownNames && knownNames.has(norm)) return true;
  return false;
}

/**
 * Split a credit string into primary and featured parts.
 * Handles feat., feat, ft., ft, featuring (word-bounded, case-insensitive),
 * including inside () / [] / etc.
 */
export function splitFeatured(credit) {
  if (!credit) return { primary: '', featured: null };
  const str = credit.toString();

  // Look for featured marker, possibly preceded by open paren/bracket
  const featRegex = /(?:\s*[\(\[]\s*|\s+)\b(?:feat\.?|ft\.?|featuring)\b\s*[:\-\.]?\s*/i;
  const match = str.match(featRegex);
  if (!match) return { primary: str.trim(), featured: null };

  const idx = match.index;
  const before = str.slice(0, idx).replace(/[\(\[]\s*$/, '').trim();
  const after = str.slice(idx + match[0].length).replace(/[\)\]]\s*$/, '').trim();

  return {
    primary: before,
    featured: after.length ? after : null,
  };
}

/**
 * Split segment using primary separators:
 * &, x (spaces required), and , with , ;, / (spaces required), and ,
 * Never split on protected names or inside protected names.
 */
function splitSegment(segment, knownNames = null) {
  const trimmed = displayClean(segment);
  if (!trimmed) return [];

  if (isProtectedName(trimmed, knownNames)) {
    return [trimmed];
  }

  // Separators ordered per spec:
  // 1. & (with or without spaces)
  // 2. x (spaces required)
  // 3. and (spaces required)
  // 4. with (spaces required)
  // 5. ; (semicolon)
  // 6. / (spaces required: " / ")
  // 7. , (comma)
  const separators = [
    /\s*&\s*/,
    /\s+[xX]\s+/,
    /\s+and\s+/i,
    /\s+with\s+/i,
    /\s*;\s*/,
    /\s+\/\s+/,
    /\s*,\s*/,
  ];

  let parts = [trimmed];

  for (const sep of separators) {
    const nextParts = [];
    for (const p of parts) {
      if (isProtectedName(p, knownNames)) {
        nextParts.push(p);
        continue;
      }
      const split = p.split(sep).map((s) => s.trim()).filter(Boolean);
      if (split.length > 1) {
        nextParts.push(...split);
      } else {
        nextParts.push(p);
      }
    }
    parts = nextParts;
  }

  return parts.map(displayClean).filter(Boolean);
}

/**
 * Parse artist credits according to specification.
 *
 * @param {Object} input - { artist, albumArtist, album_artist, title, artistTags, knownNames }
 * @returns {Object} { raw, artists: [{ name, role, position }] }
 */
export function parseArtistCredits(input = {}) {
  const {
    artist = '',
    albumArtist,
    album_artist,
    title = '',
    artistTags,
    knownNames = null,
  } = input || {};

  // 1. Multi-value artist tags override raw string if present
  if (Array.isArray(artistTags) && artistTags.length > 0) {
    const artists = [];
    const seen = new Set();
    artistTags.forEach((tag, idx) => {
      const cleaned = displayClean(tag);
      if (!cleaned || isGeneric(cleaned)) return;
      const norm = normalizeArtistName(cleaned);
      if (seen.has(norm)) return;
      seen.add(norm);
      artists.push({ name: cleaned, role: 'primary', position: idx });
    });
    if (artists.length > 0) {
      return { raw: artist || '', artists };
    }
  }

  const raw = (artist ?? '').toString();

  // Step 1: Featured credits split
  let { primary, featured } = splitFeatured(raw);

  // If featured credit is missing from artist field, check song title
  if (!featured && title) {
    const titleFeat = splitFeatured(title);
    if (titleFeat.featured) {
      featured = titleFeat.featured;
    }
  }

  // Clean brackets from primary if any left
  const cleanedPrimary = primary.replace(/^[()\[\]]+/, '').replace(/[()\[\]]+$/, '').trim();

  // Step 2 & 3: Split primary and featured parts
  const primaryNames = splitSegment(cleanedPrimary, knownNames);
  const featuredNames = featured ? splitSegment(featured, knownNames) : [];

  // Step 5: Add album_artist if real and different
  const albumCredit = albumArtist || album_artist;
  if (albumCredit && !isGeneric(albumCredit)) {
    const cleanedAlbum = displayClean(albumCredit);
    const normAlbum = normalizeArtistName(cleanedAlbum);
    const normPrimary0 = primaryNames.length ? normalizeArtistName(primaryNames[0]) : '';
    if (normAlbum && normAlbum !== normPrimary0 && !primaryNames.some((n) => normalizeArtistName(n) === normAlbum)) {
      primaryNames.push(cleanedAlbum);
    }
  }

  // Step 6: Dedupe by normalized name per song; primary beats featured
  const artists = [];
  const seen = new Set();

  primaryNames.forEach((name) => {
    const cleaned = displayClean(name);
    if (!cleaned || isGeneric(cleaned)) return;
    const norm = normalizeArtistName(cleaned);
    if (seen.has(norm)) return;
    seen.add(norm);
    artists.push({
      name: cleaned,
      role: 'primary',
      position: artists.length,
    });
  });

  featuredNames.forEach((name) => {
    const cleaned = displayClean(name);
    if (!cleaned || isGeneric(cleaned)) return;
    const norm = normalizeArtistName(cleaned);
    if (seen.has(norm)) return;
    seen.add(norm);
    artists.push({
      name: cleaned,
      role: 'featured',
      position: artists.length,
    });
  });

  // Step 7: If nothing parses -> Unknown Artist
  if (artists.length === 0) {
    artists.push({
      name: 'Unknown Artist',
      role: 'primary',
      position: 0,
    });
  }

  return { raw, artists };
}
