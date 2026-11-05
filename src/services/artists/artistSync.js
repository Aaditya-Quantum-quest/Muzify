// src/services/artists/artistSync.js
// Bridges the scanner / song repository with the artist tables.
// Every song write (add, rescan, delete, metadata edit) is wrapped in a single transaction.

import { db } from '../../databases/db.js';
import { parseArtistCredits } from './artistParser.js';
import {
  removeSongArtists,
  cleanupOrphanArtists,
  upsertArtistsForSong as upsertArtistsForSongRepo,
  rebuildArtistsForSong as rebuildArtistsForSongRepo,
} from './artistRepository.js';
import { buildCollaborationRelationships } from './recommendationService.js';
import {
  subscribeArtistsChanged,
  notifyArtistsChanged,
} from './artistEvents.js';

// Change emitter
export const onArtistsChanged = subscribeArtistsChanged;
export { notifyArtistsChanged };

const GENERIC = /^(Various Artists|VA|Unknown Artist|\s*)$/i;

/** Parse a song record into credits and upsert artists + links in one txn. */
export function upsertArtistsForSong(songId, song) {
  const credits = parseArtistCredits(song);
  if (credits.artists.length === 1 && GENERIC.test(credits.artists[0].name)) {
    removeSongArtists(songId);
    return;
  }
  upsertArtistsForSongRepo(songId, credits);
}

/** A new song was inserted. Parse credits and link them. */
export function syncSongAdded(song) {
  if (!song || song.id == null) return;
  try {
    upsertArtistsForSong(song.id, song);
    notifyArtistsChanged();
  } catch (err) {
    console.warn('syncSongAdded artist sync failed', song.id, err);
  }
}
export const onSongAdded = syncSongAdded;

/** Rebuild collaboration relationships from the current song_artists table. */
export function rebuildCollaborations() {
  try {
    buildCollaborationRelationships();
    notifyArtistsChanged();
  } catch (err) {
    console.warn('rebuildCollaborations failed', err);
  }
}

/** A song was deleted. Cascade removes links, then cleanup orphans. */
export function syncSongDeleted(songId) {
  try {
    cleanupOrphanArtists();
    buildCollaborationRelationships();
    notifyArtistsChanged();
  } catch (err) {
    console.warn('syncSongDeleted cleanup failed', songId, err);
  }
}
export const onSongDeleted = syncSongDeleted;

/** A song's metadata changed. Rebuild links and update collaborations. */
export function syncSongUpdated(songId) {
  if (songId == null) return;
  try {
    rebuildArtistsForSongRepo(songId);
    buildCollaborationRelationships();
    notifyArtistsChanged();
  } catch (err) {
    console.warn('syncSongUpdated artist sync failed', songId, err);
  }
}
export const onSongEdited = syncSongUpdated;

// ────────────────────────────────────────────── One-time Backfill ────────
const BACKFILL_FLAG = 'artist_backfill_done';
const BACKFILL_BATCH = 300;

let backfillPromise = null;

/**
 * One-time backfill: for every existing song, parse credits and build artists + links.
 * Runs in batches of 200-500 songs per transaction, off the UI thread path.
 */
export function backfillAllSongs() {
  if (backfillPromise) return backfillPromise;

  backfillPromise = (async () => {
    try {
      const done = db.getFirstSync(
        'SELECT value FROM app_settings WHERE key = ?',
        [BACKFILL_FLAG]
      )?.value;

      if (done === '1') return;

      let offset = 0;
      // Yield to event loop between batches
      while (true) {
        await new Promise((res) => setTimeout(res, 10));

        const songs = db.getAllSync(
          'SELECT * FROM songs ORDER BY id ASC LIMIT ? OFFSET ?',
          [BACKFILL_BATCH, offset]
        );

        if (!songs || songs.length === 0) break;

        db.execSync('BEGIN TRANSACTION');
        try {
          for (const song of songs) {
            const credits = parseArtistCredits(song);
            if (credits.artists.length === 1 && GENERIC.test(credits.artists[0].name)) {
              removeSongArtists(song.id);
            } else {
              upsertArtistsForSongRepo(song.id, credits);
            }
          }
          db.execSync('COMMIT');
        } catch (err) {
          db.execSync('ROLLBACK');
          throw err;
        }

        notifyArtistsChanged();
        offset += songs.length;
        if (songs.length < BACKFILL_BATCH) break;
      }

      // Rebuild collaboration relationships after full backfill
      try {
        buildCollaborationRelationships();
      } catch (_) {}

      db.runSync(
        'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
        [BACKFILL_FLAG, '1']
      );
      notifyArtistsChanged();
    } catch (err) {
      console.warn('backfillAllSongs failed', err);
    } finally {
      backfillPromise = null;
    }
  })();

  return backfillPromise;
}

/**
 * Artist rename / merge: if a name is re-normalized and collides with an existing
 * normalized_name, merge (re-point links, keep follow and image).
 */
export function mergeArtist(artistId, targetId) {
  if (artistId === targetId || artistId == null || targetId == null) return;
  db.execSync('BEGIN TRANSACTION');
  try {
    db.runSync(
      'UPDATE OR IGNORE song_artists SET artist_id = ? WHERE artist_id = ?',
      [targetId, artistId]
    );
    db.runSync('DELETE FROM song_artists WHERE artist_id = ?', [artistId]);

    db.runSync(
      'UPDATE OR IGNORE artist_follows SET artist_id = ? WHERE artist_id = ?',
      [targetId, artistId]
    );
    db.runSync('DELETE FROM artist_follows WHERE artist_id = ?', [artistId]);

    db.runSync(
      'UPDATE OR IGNORE artist_following SET artist_id = ? WHERE artist_id = ?',
      [targetId, artistId]
    );
    db.runSync('DELETE FROM artist_following WHERE artist_id = ?', [artistId]);

    db.runSync('DELETE FROM artists WHERE id = ?', [artistId]);
    db.execSync('COMMIT');
    buildCollaborationRelationships();
    notifyArtistsChanged();
  } catch (err) {
    db.execSync('ROLLBACK');
    throw err;
  }
}
