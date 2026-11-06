// src/services/artists/recommendationService.js
// Build and store artist relationships from real library data and verified external links.
// Score = 0.45 * externalSimilarity + 0.30 * min(1, sharedSongs / 3) + 0.25 * genreJaccard

import { db } from '../../databases/db.js';
import { normalizeArtistName } from './artistParser.js';
import { getArtistById } from './artistRepository.js';

/** Calculate collaboration score: weight by number of shared songs (capped at 3). */
function calcCollaborationScore(sharedSongs) {
  return Math.min(1, sharedSongs / 3);
}

/**
 * Build collaboration relationships from song_artists table.
 * Runs once per scan/batch.
 */
export function buildCollaborationRelationships() {
  const now = Date.now();
  db.execSync('BEGIN TRANSACTION');
  try {
    // Clear old library collaboration relationships
    db.runSync("DELETE FROM artist_relationships WHERE relationship_type = 'collaboration' AND source = 'local'");

    // Find all pairs of distinct artists sharing songs
    const pairs = db.getAllSync(`
      SELECT
        sa1.artist_id AS a1,
        sa2.artist_id AS a2,
        COUNT(DISTINCT sa1.song_id) AS shared
      FROM song_artists sa1
      JOIN song_artists sa2
        ON sa1.song_id = sa2.song_id AND sa1.artist_id <> sa2.artist_id
      GROUP BY a1, a2
    `);

    for (const p of pairs) {
      const collab = calcCollaborationScore(p.shared);
      const score = 0.30 * collab;
      db.runSync(
        `INSERT OR REPLACE INTO artist_relationships (artist_id, related_artist_id, relationship_type, score, source, updated_at)
         VALUES (?, ?, 'collaboration', ?, 'local', ?)`,
        [p.a1, p.a2, score, now]
      );
    }

    db.execSync('COMMIT');
  } catch (err) {
    db.execSync('ROLLBACK');
    console.warn('buildCollaborationRelationships error', err);
  }
}

/**
 * Build genre match relationships between artists based on song genres & artist genres.
 */
export function buildGenreMatchRelationships() {
  const now = Date.now();
  const artists = db.getAllSync(`
    SELECT DISTINCT a.id, a.genres,
           GROUP_CONCAT(DISTINCT s.genre) AS songGenres
    FROM artists a
    JOIN song_artists sa ON sa.artist_id = a.id
    LEFT JOIN songs s ON s.id = sa.song_id
    GROUP BY a.id
  `);

  const genreMap = new Map();
  for (const a of artists) {
    const set = new Set();
    if (a.genres) {
      try {
        const parsed = JSON.parse(a.genres);
        if (Array.isArray(parsed)) {
          parsed.forEach((g) => set.add(g.toLowerCase().trim()));
        }
      } catch {
        a.genres.split(',').forEach((g) => set.add(g.toLowerCase().trim()));
      }
    }
    if (a.songGenres) {
      a.songGenres.split(',').forEach((g) => {
        const clean = g.toLowerCase().trim();
        if (clean && clean !== 'unknown') set.add(clean);
      });
    }
    if (set.size > 0) {
      genreMap.set(a.id, Array.from(set));
    }
  }

  const ids = Array.from(genreMap.keys());
  db.execSync('BEGIN TRANSACTION');
  try {
    db.runSync("DELETE FROM artist_relationships WHERE relationship_type = 'genre_match' AND source = 'local'");

    for (let i = 0; i < ids.length; i++) {
      const id1 = ids[i];
      const g1 = genreMap.get(id1);
      for (let j = i + 1; j < ids.length; j++) {
        const id2 = ids[j];
        const g2 = genreMap.get(id2);

        const intersection = g1.filter((x) => g2.includes(x)).length;
        if (!intersection) continue;

        const union = new Set([...g1, ...g2]).size;
        const jaccard = intersection / union; // 0..1
        if (jaccard < 0.15) continue;

        const score = 0.25 * jaccard;
        db.runSync(
          `INSERT OR REPLACE INTO artist_relationships (artist_id, related_artist_id, relationship_type, score, source, updated_at)
           VALUES (?, ?, 'genre_match', ?, 'local', ?)`,
          [id1, id2, score, now]
        );
        db.runSync(
          `INSERT OR REPLACE INTO artist_relationships (artist_id, related_artist_id, relationship_type, score, source, updated_at)
           VALUES (?, ?, 'genre_match', ?, 'local', ?)`,
          [id2, id1, score, now]
        );
      }
    }
    db.execSync('COMMIT');
  } catch (err) {
    db.execSync('ROLLBACK');
    console.warn('buildGenreMatchRelationships error', err);
  }
}

/**
 * Update external similar relationships from Last.fm / MusicBrainz.
 * Keeps only artists that actually exist in the local library with > 0 songs.
 */
export function updateExternalSimilar(artistId, externalNames) {
  if (!Array.isArray(externalNames) || externalNames.length === 0) return;
  const now = Date.now();

  for (let rank = 0; rank < externalNames.length; rank++) {
    const rawName = externalNames[rank];
    const norm = normalizeArtistName(rawName);
    if (!norm) continue;

    // Look for local artist with > 0 songs
    const match = db.getFirstSync(
      `SELECT a.id FROM artists a
       JOIN song_artists sa ON sa.artist_id = a.id
       WHERE a.normalized_name = ? AND a.id <> ?
       LIMIT 1`,
      [norm, artistId]
    );

    if (match) {
      // Score decays slightly with rank (1.0 down to ~0.5)
      const similarity = Math.max(0.4, 1.0 - rank * 0.05);
      const score = 0.45 * similarity;
      try {
        db.runSync(
          `INSERT OR REPLACE INTO artist_relationships (artist_id, related_artist_id, relationship_type, score, source, updated_at)
           VALUES (?, ?, 'similar', ?, 'lastfm', ?)`,
          [artistId, match.id, score, now]
        );
      } catch (err) {
        console.warn('insert external similar failed', err);
      }
    }
  }
}

/**
 * Recompute and store all relationship rows for a single artist.
 *
 * Deletes the artist's old rows from artist_relationships and re-inserts
 * fresh ones (collaboration, genre_match, similar) in one transaction.
 */
export function rebuildForArtist(artistId) {
  if (artistId == null) return;
  const artist = getArtistById(artistId);
  if (!artist) return;

  const now = Date.now();

  // ---- collaboration (shared songs) ----
  const collabRows = db.getAllSync(
    `SELECT sa2.artist_id AS related, COUNT(DISTINCT sa1.song_id) AS shared
     FROM song_artists sa1
     JOIN song_artists sa2
       ON sa1.song_id = sa2.song_id AND sa2.artist_id <> sa1.artist_id
     WHERE sa1.artist_id = ?
     GROUP BY sa2.artist_id`,
    [artistId]
  );

  // ---- genre match (Jaccard) ----
  const genreRows = db.getAllSync(
    `SELECT a.id, a.genres, GROUP_CONCAT(DISTINCT s.genre) AS songGenres
     FROM artists a
     JOIN song_artists sa ON sa.artist_id = a.id
     LEFT JOIN songs s ON s.id = sa.song_id
     GROUP BY a.id`
  );

  const genreMap = new Map();
  for (const a of genreRows) {
    const set = new Set();
    if (a.genres) {
      try {
        const parsed = JSON.parse(a.genres);
        if (Array.isArray(parsed)) {
          parsed.forEach((g) => set.add(g.toLowerCase().trim()));
        }
      } catch {
        a.genres.split(',').forEach((g) => set.add(g.toLowerCase().trim()));
      }
    }
    if (a.songGenres) {
      a.songGenres.split(',').forEach((g) => {
        const clean = g.toLowerCase().trim();
        if (clean && clean !== 'unknown') set.add(clean);
      });
    }
    if (set.size > 0) genreMap.set(a.id, Array.from(set));
  }

  const artistGenres = genreMap.get(artistId) || [];
  const genreScores = [];
  for (const [otherId, otherGenres] of genreMap) {
    if (otherId === artistId) continue;
    const intersection = artistGenres.filter((x) => otherGenres.includes(x)).length;
    if (!intersection) continue;
    const union = new Set([...artistGenres, ...otherGenres]).size;
    const jaccard = intersection / union;
    if (jaccard < 0.15) continue;
    genreScores.push({ related: otherId, jaccard });
  }

  // ---- external similar (from cache) ----
  const cacheRows = db.getAllSync(
    `SELECT payload FROM artist_external_cache WHERE artist_id = ? AND provider = 'lastfm'`,
    [artistId]
  );
  const externalNames = [];
  for (const row of cacheRows) {
    try {
      const parsed = JSON.parse(row.payload);
      if (parsed && Array.isArray(parsed.similar)) {
        parsed.similar.forEach((s) => {
          if (s && s.name) externalNames.push(s.name);
        });
      }
    } catch (_) {}
  }

  // Resolve external names to local artist ids with songs.
  const externalScores = [];
  for (let rank = 0; rank < externalNames.length; rank++) {
    const norm = normalizeArtistName(externalNames[rank]);
    if (!norm) continue;
    const match = db.getFirstSync(
      `SELECT a.id FROM artists a
       JOIN song_artists sa ON sa.artist_id = a.id
       WHERE a.normalized_name = ? AND a.id <> ? AND a.id <> ?
       LIMIT 1`,
      [norm, artistId, artistId]
    );
    if (match) {
      const similarity = Math.max(0.4, 1.0 - rank * 0.05);
      externalScores.push({ related: match.id, similarity });
    }
  }

  // ---- write everything in one transaction ----
  db.execSync('BEGIN TRANSACTION');
  try {
    db.runSync('DELETE FROM artist_relationships WHERE artist_id = ?', [artistId]);

    for (const c of collabRows) {
      const collab = calcCollaborationScore(c.shared);
      const score = 0.30 * collab;
      db.runSync(
        `INSERT OR REPLACE INTO artist_relationships (artist_id, related_artist_id, relationship_type, score, source, updated_at)
         VALUES (?, ?, 'collaboration', ?, 'local', ?)`,
        [artistId, c.related, score, now]
      );
    }

    for (const g of genreScores) {
      const score = 0.25 * g.jaccard;
      db.runSync(
        `INSERT OR REPLACE INTO artist_relationships (artist_id, related_artist_id, relationship_type, score, source, updated_at)
         VALUES (?, ?, 'genre_match', ?, 'local', ?)`,
        [artistId, g.related, score, now]
      );
    }

    for (const e of externalScores) {
      const score = 0.45 * e.similarity;
      db.runSync(
        `INSERT OR REPLACE INTO artist_relationships (artist_id, related_artist_id, relationship_type, score, source, updated_at)
         VALUES (?, ?, 'similar', ?, 'lastfm', ?)`,
        [artistId, e.related, score, now]
      );
    }

    db.execSync('COMMIT');
  } catch (err) {
    db.execSync('ROLLBACK');
    console.warn('rebuildForArtist error', artistId, err);
  }
}

/**
 * Batched rebuild for the whole library (used by backfill).
 * Rebuilds each artist's relationships in batches to keep transactions
 * small and to avoid blocking the UI thread for very large libraries.
 */
export function rebuildAll(batchSize = 500) {
  const ids = db.getAllSync('SELECT id FROM artists', []).map((r) => r.id);
  // rebuildForArtist owns its own transaction; batching here is just a
  // progress checkpoint so a very large library doesn't run one huge txn.
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    for (const id of batch) {
      rebuildForArtist(id);
    }
  }
}
