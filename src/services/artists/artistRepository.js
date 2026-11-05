// src/services/artists/artistRepository.js
// All SQL queries for the Artist database and discovery system live here.
// No SQL in UI components.

import { db } from '../../databases/db.js';
import { normalizeArtistName, parseArtistCredits } from './artistParser.js';
import { subscribeArtistsChanged } from './artistEvents.js';

/* ───────────── In-memory LRU Cache for Artist Profile ───────────── */
const PROFILE_CACHE_MAX = 30;
const profileCache = new Map();

export function clearProfileCache() {
  profileCache.clear();
}

// Clear LRU cache whenever artist data mutations occur
subscribeArtistsChanged(() => {
  clearProfileCache();
});

function getCachedProfile(key) {
  if (!profileCache.has(key)) return null;
  const val = profileCache.get(key);
  // refresh key order
  profileCache.delete(key);
  profileCache.set(key, val);
  return val;
}

function setCachedProfile(key, val) {
  if (profileCache.has(key)) {
    profileCache.delete(key);
  } else if (profileCache.size >= PROFILE_CACHE_MAX) {
    const oldestKey = profileCache.keys().next().value;
    profileCache.delete(oldestKey);
  }
  profileCache.set(key, val);
}

/* ───────────── READ OPERATIONS ───────────── */

/** Total number of songs in the entire library (header metric). */
export function getTotalSongCount() {
  const row = db.getFirstSync('SELECT COUNT(*) AS total FROM songs');
  return row?.total ?? 0;
}

/** Total count of artists matching optional search. */
export function getArtistCount({ search = '' } = {}) {
  let sql = `
    SELECT COUNT(DISTINCT artists.id) AS total
    FROM artists
    JOIN song_artists sa ON sa.artist_id = artists.id
    WHERE artists.normalized_name <> 'unknown artist'
  `;
  const params = [];
  if (search.trim()) {
    sql += ' AND artists.normalized_name LIKE ?';
    params.push(`%${normalizeArtistName(search)}%`);
  }
  return db.getFirstSync(sql, params)?.total ?? 0;
}

/**
 * Returns artists for the library with live song count.
 * Excludes Unknown Artist and artists with 0 songs.
 */
export function getArtists({ search = '', sort = 'az', limit = 200, offset = 0 } = {}) {
  let sql = `
    SELECT
      artists.*,
      COUNT(DISTINCT sa.song_id) AS songCount,
      MAX(s.added_at) AS lastAddedAt
    FROM artists
    JOIN song_artists sa ON sa.artist_id = artists.id
    JOIN songs s ON s.id = sa.song_id
    WHERE artists.normalized_name <> 'unknown artist'
  `;
  const params = [];

  if (search.trim()) {
    sql += ' AND artists.normalized_name LIKE ?';
    params.push(`%${normalizeArtistName(search)}%`);
  }

  sql += ' GROUP BY artists.id HAVING songCount > 0';

  switch (sort) {
    case 'songs':
      sql += ' ORDER BY songCount DESC, artists.name COLLATE NOCASE ASC';
      break;
    case 'recent':
      sql += ' ORDER BY lastAddedAt DESC NULLS LAST, artists.name COLLATE NOCASE ASC';
      break;
    case 'az':
    default:
      sql += ' ORDER BY artists.name COLLATE NOCASE ASC';
      break;
  }

  sql += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.getAllSync(sql, params);
}

/** Retrieve single artist by ID. */
export function getArtistById(id) {
  if (id == null) return null;
  return db.getFirstSync('SELECT * FROM artists WHERE id = ?', [id]);
}

/** Artist statistics: songCount, albumCount, followerCount|null, isFollowing. */
export function getArtistStats(id) {
  if (id == null) return { songCount: 0, albumCount: 0, followerCount: null, isFollowing: false };

  const cacheKey = `stats_${id}`;
  const cached = getCachedProfile(cacheKey);
  if (cached) return cached;

  const artist = getArtistById(id);
  const songRow = db.getFirstSync(
    'SELECT COUNT(DISTINCT sa.song_id) AS count FROM song_artists sa WHERE sa.artist_id = ?',
    [id]
  );
  const albumRow = db.getFirstSync(
    `SELECT COUNT(DISTINCT s.album) AS count
     FROM song_artists sa
     JOIN songs s ON s.id = sa.song_id
     WHERE sa.artist_id = ? AND s.album IS NOT NULL AND TRIM(s.album) <> ''`,
    [id]
  );

  const following = isFollowing(id);

  // follower_count only if real external number (> 0)
  const followerCount =
    typeof artist?.follower_count === 'number' && artist.follower_count > 0
      ? artist.follower_count
      : null;

  const result = {
    songCount: songRow?.count ?? 0,
    albumCount: albumRow?.count ?? 0,
    followerCount,
    isFollowing: following,
  };

  setCachedProfile(cacheKey, result);
  return result;
}

/**
 * Retrieve an artist's songs with sorting and optional album filter.
 * Sort: 'popular' | 'newest' | 'az'
 */
export function getArtistSongs(id, { sort = 'popular', album = null, limit = 50, offset = 0 } = {}) {
  if (id == null) return [];

  let sql = `
    SELECT s.*, sa.role, sa.position
    FROM song_artists sa
    JOIN songs s ON s.id = sa.song_id
    WHERE sa.artist_id = ?
  `;
  const params = [id];

  if (album && typeof album === 'string' && album.trim()) {
    sql += ' AND s.album = ?';
    params.push(album.trim());
  }

  if (sort === 'newest') {
    sql += ' ORDER BY s.added_at DESC, s.id DESC';
  } else if (sort === 'az') {
    sql += ' ORDER BY s.title COLLATE NOCASE ASC';
  } else {
    // popular: ordered by play count if tracked, else added_at
    sql += ' ORDER BY COALESCE(s.play_count, s.played_times, 0) DESC, s.added_at DESC, s.id DESC';
  }

  sql += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.getAllSync(sql, params);
}

/**
 * Retrieve all distinct albums for an artist:
 * name, album, artwork_uri, year, trackCount.
 */
export function getArtistAlbums(id) {
  if (id == null) return [];

  const cacheKey = `albums_${id}`;
  const cached = getCachedProfile(cacheKey);
  if (cached) return cached;

  const rows = db.getAllSync(
    `SELECT
       s.album AS name,
       s.album,
       MIN(s.artwork_uri) AS artwork_uri,
       MAX(s.year) AS year,
       COUNT(DISTINCT s.id) AS trackCount
     FROM song_artists sa
     JOIN songs s ON s.id = sa.song_id
     WHERE sa.artist_id = ? AND s.album IS NOT NULL AND TRIM(s.album) <> ''
     GROUP BY s.album
     ORDER BY s.album COLLATE NOCASE ASC`,
    [id]
  );

  setCachedProfile(cacheKey, rows);
  return rows;
}

/**
 * Complete playable song queue for an artist (no pagination limit).
 */
export function getArtistPlayableQueue(id, { sort = 'popular', album = null } = {}) {
  if (id == null) return [];

  let sql = `
    SELECT s.*
    FROM song_artists sa
    JOIN songs s ON s.id = sa.song_id
    WHERE sa.artist_id = ?
  `;
  const params = [id];

  if (album && typeof album === 'string' && album.trim()) {
    sql += ' AND s.album = ?';
    params.push(album.trim());
  }

  if (sort === 'newest') {
    sql += ' ORDER BY s.added_at DESC, s.id DESC';
  } else if (sort === 'az') {
    sql += ' ORDER BY s.title COLLATE NOCASE ASC';
  } else {
    sql += ' ORDER BY COALESCE(s.play_count, s.played_times, 0) DESC, s.added_at DESC, s.id DESC';
  }

  return db.getAllSync(sql, params);
}

/**
 * Retrieve related artists (similar / collaboration / genre_match).
 * Excludes self, excludes artists with 0 songs.
 */
export function getRelatedArtists(id, { limit = 12 } = {}) {
  if (id == null) return [];

  const cacheKey = `related_${id}_${limit}`;
  const cached = getCachedProfile(cacheKey);
  if (cached) return cached;

  const rows = db.getAllSync(
    `SELECT
       ar.related_artist_id AS id,
       a.name,
       a.normalized_name,
       a.image_uri,
       MAX(ar.score) AS score,
       ar.relationship_type,
       COUNT(DISTINCT sa.song_id) AS songCount
     FROM artist_relationships ar
     JOIN artists a ON a.id = ar.related_artist_id
     JOIN song_artists sa ON sa.artist_id = a.id
     WHERE ar.artist_id = ? AND ar.related_artist_id <> ?
     GROUP BY ar.related_artist_id
     HAVING songCount > 0
     ORDER BY score DESC, a.name COLLATE NOCASE ASC
     LIMIT ?`,
    [id, id, limit]
  );

  setCachedProfile(cacheKey, rows);
  return rows;
}

/* ───────────── WRITE OPERATIONS ───────────── */

/**
 * Upsert an artist row; returns existing or newly created ID.
 */
export function upsertArtist(artist) {
  const { name, normalized_name, image_uri, bio, genres, country, external_id } = artist;
  const existing = db.getFirstSync('SELECT id FROM artists WHERE normalized_name = ?', [normalized_name]);

  const now = Date.now();
  if (existing) {
    db.runSync(
      `UPDATE artists
       SET name = ?,
           image_uri = COALESCE(?, image_uri),
           bio = COALESCE(?, bio),
           genres = COALESCE(?, genres),
           country = COALESCE(?, country),
           external_id = COALESCE(?, external_id),
           updated_at = ?
       WHERE id = ?`,
      [name, image_uri, bio, genres, country, external_id, now, existing.id]
    );
    return existing.id;
  }

  const result = db.runSync(
    `INSERT INTO artists (name, normalized_name, image_uri, bio, genres, country, external_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, normalized_name, image_uri, bio, genres, country, external_id, now, now]
  );
  return result.lastInsertRowid;
}

/** Remove all artist links for a song. */
export function removeSongArtists(songId) {
  db.runSync('DELETE FROM song_artists WHERE song_id = ?', [songId]);
}

function applyArtistsForSong(songId, artists) {
  removeSongArtists(songId);
  for (const a of artists) {
    const normalized = normalizeArtistName(a.name);
    if (!normalized || normalized === 'unknown artist') continue;
    const artistId = upsertArtist({
      name: a.name,
      normalized_name: normalized,
    });
    db.runSync(
      'INSERT OR IGNORE INTO song_artists (song_id, artist_id, role, position) VALUES (?, ?, ?, ?)',
      [songId, artistId, a.role || 'primary', a.position ?? 0]
    );
  }
}

/**
 * Upsert parsed artist credits for a song.
 * Pass alreadyInTransaction when the caller already opened a SQLite txn
 * (nested BEGIN is rejected by expo-sqlite).
 */
export function upsertArtistsForSong(songId, parsedCredits, { alreadyInTransaction = false } = {}) {
  const { artists = [] } = parsedCredits || {};
  if (songId == null || !artists.length) return;

  if (alreadyInTransaction) {
    applyArtistsForSong(songId, artists);
    return;
  }

  db.execSync('BEGIN TRANSACTION');
  try {
    applyArtistsForSong(songId, artists);
    db.execSync('COMMIT');
  } catch (err) {
    db.execSync('ROLLBACK');
    throw err;
  }
}

/**
 * Rebuild artist links for a song after a metadata edit with diff logic.
 */
export function rebuildArtistsForSong(songId) {
  const song = db.getFirstSync('SELECT * FROM songs WHERE id = ?', [songId]);
  if (!song) return;

  const parsed = parseArtistCredits(song);
  const existingLinks = db.getAllSync(
    'SELECT artist_id, role, position FROM song_artists WHERE song_id = ?',
    [songId]
  );
  const existingById = new Map(existingLinks.map((r) => [r.artist_id, r]));

  const newLinks = [];
  const seenNorm = new Map();

  for (const a of parsed.artists) {
    const normalized = normalizeArtistName(a.name);
    if (!normalized || normalized === 'unknown artist') continue;
    let artistId;
    if (seenNorm.has(normalized)) {
      artistId = seenNorm.get(normalized);
    } else {
      artistId = upsertArtist({ name: a.name, normalized_name: normalized });
      seenNorm.set(normalized, artistId);
    }
    newLinks.push({ artistId, role: a.role || 'primary', position: a.position ?? 0 });
  }

  const newIds = new Set(newLinks.map((l) => l.artistId));

  db.execSync('BEGIN TRANSACTION');
  try {
    // Delete stale links
    for (const [artId] of existingById) {
      if (!newIds.has(artId)) {
        db.runSync('DELETE FROM song_artists WHERE song_id = ? AND artist_id = ?', [songId, artId]);
      }
    }
    // Insert or update new links
    for (const link of newLinks) {
      const prev = existingById.get(link.artistId);
      if (prev && prev.role === link.role && prev.position === link.position) {
        continue;
      }
      db.runSync(
        'INSERT OR REPLACE INTO song_artists (song_id, artist_id, role, position) VALUES (?, ?, ?, ?)',
        [songId, link.artistId, link.role, link.position]
      );
    }
    db.execSync('COMMIT');
  } catch (err) {
    db.execSync('ROLLBACK');
    throw err;
  }
}

/** Cleanup orphan artists that have 0 songs and are not followed. */
export function cleanupOrphanArtists() {
  db.execSync(`
    DELETE FROM artists
    WHERE id NOT IN (SELECT DISTINCT artist_id FROM song_artists)
      AND id NOT IN (SELECT artist_id FROM artist_follows)
      AND id NOT IN (SELECT artist_id FROM artist_following)
  `);
}

/** Follow an artist. Returns true on success. */
export function followArtist(id) {
  if (id == null) return false;
  try {
    const now = Date.now();
    db.runSync('INSERT OR IGNORE INTO artist_follows (artist_id, followed_at) VALUES (?, ?)', [id, now]);
    db.runSync('INSERT OR IGNORE INTO artist_following (artist_id, created_at) VALUES (?, ?)', [id, now]);
    clearProfileCache();
    return true;
  } catch (err) {
    console.warn('followArtist failed', id, err);
    return false;
  }
}

/** Unfollow an artist. Returns true on success. */
export function unfollowArtist(id) {
  if (id == null) return false;
  try {
    db.runSync('DELETE FROM artist_follows WHERE artist_id = ?', [id]);
    db.runSync('DELETE FROM artist_following WHERE artist_id = ?', [id]);
    clearProfileCache();
    return true;
  } catch (err) {
    console.warn('unfollowArtist failed', id, err);
    return false;
  }
}

/** Check if artist is followed. */
export function isFollowing(id) {
  if (id == null) return false;
  const row = db.getFirstSync(
    'SELECT 1 AS followed FROM artist_follows WHERE artist_id = ? UNION SELECT 1 AS followed FROM artist_following WHERE artist_id = ?',
    [id, id]
  );
  return !!(row && row.followed === 1);
}

/** Toggle follow state. Returns new boolean following state. */
export function toggleFollow(id) {
  if (id == null) return false;
  if (isFollowing(id)) {
    unfollowArtist(id);
    return false;
  } else {
    followArtist(id);
    return true;
  }
}
