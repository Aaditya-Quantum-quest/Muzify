// src/services/artists/enrichmentService.js
// Background enrichment service for MusicBrainz and Last.fm metadata.
// Works offline from SQLite data alone; fetches in background without blocking UI.

import { db } from '../../databases/db.js';
import { normalizeArtistName } from './artistParser.js';
import { notifyArtistsChanged } from './artistEvents.js';
import { updateExternalSimilar } from './recommendationService.js';

const LASTFM_API_KEY = process.env.LASTFM_API_KEY || '';
const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';
const MB_BASE = 'https://musicbrainz.org/ws/2/artist/';
const USER_AGENT = 'Muzify/1.0.0 ( contact@muzify.local )';

const CACHE_TTL_OK = 30 * 24 * 60 * 60 * 1000;       // 30 days
const CACHE_TTL_NOT_FOUND = 7 * 24 * 60 * 60 * 1000; // 7 days

/* ───────────── Background Queue ───────────── */
const queue = {
  open: new Set(),
  followed: new Set(),
  normal: new Set(),
};

let isProcessing = false;
let queueStarted = false;
let lastMbRequestTime = 0;

/** Enqueue an artist ID for background enrichment. */
export function enqueueArtist(artistId, priority = 'normal') {
  if (artistId == null) return;
  const id = Number(artistId);
  if (isNaN(id)) return;

  if (priority === 'open') {
    queue.open.add(id);
    queue.followed.delete(id);
    queue.normal.delete(id);
  } else if (priority === 'followed') {
    if (!queue.open.has(id)) {
      queue.followed.add(id);
      queue.normal.delete(id);
    }
  } else {
    if (!queue.open.has(id) && !queue.followed.has(id)) {
      queue.normal.add(id);
    }
  }

  processNext();
}

/** Start the background enrichment queue. */
export function startEnrichmentQueue() {
  if (queueStarted) return;
  queueStarted = true;
  processNext();
}

function getNextId() {
  if (queue.open.size > 0) {
    const id = queue.open.values().next().value;
    queue.open.delete(id);
    return id;
  }
  if (queue.followed.size > 0) {
    const id = queue.followed.values().next().value;
    queue.followed.delete(id);
    return id;
  }
  if (queue.normal.size > 0) {
    const id = queue.normal.values().next().value;
    queue.normal.delete(id);
    return id;
  }
  return null;
}

async function processNext() {
  if (isProcessing || !queueStarted) return;
  const artistId = getNextId();
  if (artistId == null) return;

  isProcessing = true;
  try {
    await enrichArtist(artistId);
  } catch (err) {
    console.warn('enrichArtist queue error', artistId, err);
  } finally {
    isProcessing = false;
    // Process next with a small interval
    setTimeout(() => processNext(), 500);
  }
}

/* ───────────── Helpers ───────────── */

function stripHtml(text) {
  if (!text) return '';
  return text
    .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

async function safeFetch(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.status === 429 || res.status === 503) {
      const retryAfter = res.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 10000)));
      throw new Error(`HTTP ${res.status} rate limited`);
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/** Rate-limit MusicBrainz to max 1 req/sec. */
async function mbRateLimit() {
  const now = Date.now();
  const elapsed = now - lastMbRequestTime;
  if (elapsed < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - elapsed));
  }
  lastMbRequestTime = Date.now();
}

function shouldSkipProvider(artistId, provider) {
  const cached = db.getFirstSync(
    'SELECT * FROM artist_external_cache WHERE artist_id = ? AND provider = ?',
    [artistId, provider]
  );
  if (!cached) return false;

  const age = Date.now() - cached.fetched_at;
  if (cached.status === 'ok' && age < CACHE_TTL_OK) return true;
  if (cached.status === 'not_found' && age < CACHE_TTL_NOT_FOUND) return true;
  if (cached.status === 'error' && age < 60000 * 5) return true; // 5 min backoff
  return false;
}

function saveCache(artistId, provider, status, payload) {
  try {
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
    db.runSync(
      `INSERT OR REPLACE INTO artist_external_cache (artist_id, provider, payload, status, fetched_at)
       VALUES (?, ?, ?, ?, ?)`,
      [artistId, provider, payloadStr, status, Date.now()]
    );
  } catch (err) {
    console.warn('saveCache failed', err);
  }
}

/* ───────────── Enrichment Logic ───────────── */

/**
 * Enrich single artist by ID.
 * Queries MusicBrainz and Last.fm, saves to cache & artists table.
 */
export async function enrichArtist(artistId) {
  if (artistId == null) return;
  const artist = db.getFirstSync('SELECT * FROM artists WHERE id = ?', [artistId]);
  if (!artist) return;

  const norm = normalizeArtistName(artist.name);
  if (!norm || norm === 'unknown artist') return;

  let mbData = null;
  let lastfmData = null;
  let changed = false;

  // 1. MusicBrainz
  if (!shouldSkipProvider(artistId, 'musicbrainz')) {
    try {
      await mbRateLimit();
      const query = `artist:"${artist.name.replace(/"/g, '')}"`;
      const url = `${MB_BASE}?query=${encodeURIComponent(query)}&fmt=json&limit=3`;
      const data = await safeFetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
      });

      const candidates = data?.artists || [];
      const match = candidates.find((cand) => {
        const cNorm = normalizeArtistName(cand.name);
        const score = parseInt(cand.score || '0', 10);
        return cNorm === norm || score >= 90;
      });

      if (match) {
        mbData = match;
        saveCache(artistId, 'musicbrainz', 'ok', match);
      } else {
        saveCache(artistId, 'musicbrainz', 'not_found', null);
      }
    } catch (err) {
      saveCache(artistId, 'musicbrainz', 'error', { error: err.message });
    }
  }

  // 2. Last.fm (if configured)
  if (LASTFM_API_KEY && !shouldSkipProvider(artistId, 'lastfm')) {
    try {
      const url = `${LASTFM_BASE}?method=artist.getinfo&artist=${encodeURIComponent(artist.name)}&api_key=${LASTFM_API_KEY}&format=json`;
      const data = await safeFetch(url);
      if (data?.artist) {
        lastfmData = data.artist;
        saveCache(artistId, 'lastfm', 'ok', data.artist);
      } else {
        saveCache(artistId, 'lastfm', 'not_found', null);
      }
    } catch (err) {
      saveCache(artistId, 'lastfm', 'error', { error: err.message });
    }
  }

  // Update artists table if any new info found
  const updates = [];
  const params = [];

  if (mbData) {
    if (mbData.id && !artist.external_id) {
      updates.push('external_id = ?');
      params.push(mbData.id);
      changed = true;
    }
    if (mbData.country && !artist.country) {
      updates.push('country = ?');
      params.push(mbData.country);
      changed = true;
    }
    if (Array.isArray(mbData.tags) && mbData.tags.length > 0 && !artist.genres) {
      const genreNames = mbData.tags.map((t) => t.name).filter(Boolean).slice(0, 5);
      if (genreNames.length) {
        updates.push('genres = ?');
        params.push(JSON.stringify(genreNames));
        changed = true;
      }
    }
  }

  if (lastfmData) {
    if (lastfmData.bio?.summary && !artist.bio) {
      const cleanBio = stripHtml(lastfmData.bio.summary);
      if (cleanBio) {
        updates.push('bio = ?');
        params.push(cleanBio);
        changed = true;
      }
    }
    if (lastfmData.stats?.listeners) {
      const listeners = parseInt(lastfmData.stats.listeners, 10);
      if (!isNaN(listeners) && listeners > 0) {
        updates.push('follower_count = ?');
        params.push(listeners);
        changed = true;
      }
    }
    if (Array.isArray(lastfmData.similar?.artist) && lastfmData.similar.artist.length > 0) {
      const similarList = lastfmData.similar.artist.map((a) => a.name).filter(Boolean);
      updateExternalSimilar(artistId, similarList);
    }
  }

  updates.push('enriched_at = ?');
  params.push(Date.now());
  updates.push("enrich_status = 'done'");

  if (updates.length > 0) {
    params.push(artistId);
    db.runSync(`UPDATE artists SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  if (changed) {
    notifyArtistsChanged();
  }
}
