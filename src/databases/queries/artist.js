import { db } from "../db";

/* ──────────────────────────────────────────────────────────────
   Artist repository.
   All queries are read-only SELECTs; writes live in
   src/services/artistService.js so that multi-table syncs can run
   inside a single transaction.
   ────────────────────────────────────────────────────────────── */

// ── artists ────────────────────────────────────────────────────

export const getArtistById = (id) =>
  db.getFirstSync("SELECT * FROM artists WHERE id = ?", [id]);

export const getArtistByNormalized = (normalized) =>
  db.getFirstSync(
    "SELECT * FROM artists WHERE normalized_name = ?",
    [normalized]
  );

export const getArtists = () =>
  db.getAllSync(
    "SELECT * FROM artists ORDER BY name COLLATE NOCASE ASC"
  );

export const searchArtists = (query) => {
  const term = `%${query.trim()}%`;
  return db.getAllSync(
    `SELECT * FROM artists
     WHERE name LIKE ?
     ORDER BY name COLLATE NOCASE ASC`,
    [term]
  );
};

// ── song ↔ artist relationships ────────────────────────────────

export const getSongArtists = (songId) =>
  db.getAllSync(
    `SELECT sa.*, a.name, a.normalized_name
     FROM song_artists sa
     JOIN artists a ON a.id = sa.artist_id
     WHERE sa.song_id = ?
     ORDER BY sa.position ASC`,
    [songId]
  );

export const getArtistSongs = (artistId) =>
  db.getAllSync(
    `SELECT s.*, sa.role
     FROM song_artists sa
     JOIN songs s ON s.id = sa.song_id
     WHERE sa.artist_id = ?
     ORDER BY s.added_at DESC, s.id DESC`,
    [artistId]
  );

export const getArtistSongCount = (artistId) =>
  db.getFirstSync(
    "SELECT COUNT(DISTINCT song_id) AS total FROM song_artists WHERE artist_id = ?",
    [artistId]
  )?.total ?? 0;

// Distinct albums for an artist (used by the Albums section).
export const getArtistAlbums = (artistId) =>
  db.getAllSync(
    `SELECT album, COUNT(*) AS songs, MAX(year) AS year
     FROM song_artists sa
     JOIN songs s ON s.id = sa.song_id
     WHERE sa.artist_id = ? AND s.album IS NOT NULL AND s.album <> ''
     GROUP BY s.album
     ORDER BY s.album COLLATE NOCASE ASC`,
    [artistId]
  );

// ── artist relationships (similar / collaboration / genre_match) ─

export const getArtistRelationships = (artistId) =>
  db.getAllSync(
    `SELECT ar.*, a.name, a.image_uri, a.normalized_name
     FROM artist_relationships ar
     JOIN artists a ON a.id = ar.related_artist_id
     WHERE ar.artist_id = ? AND ar.related_artist_id <> ?
     ORDER BY ar.score DESC, a.name COLLATE NOCASE ASC`,
    [artistId, artistId]
  );

export const getCollaboratorArtists = (artistId) =>
  db.getAllSync(
    `SELECT DISTINCT a.id, a.name, a.image_uri, a.normalized_name
     FROM song_artists sa1
     JOIN song_artists sa2
       ON sa1.song_id = sa2.song_id AND sa1.artist_id <> sa2.artist_id
     JOIN artists a ON a.id = sa2.artist_id
     WHERE sa1.artist_id = ? AND sa1.role = 'primary'
     ORDER BY a.name COLLATE NOCASE ASC`,
    [artistId]
  );

// ── following ──────────────────────────────────────────────────

export const isFollowing = (artistId) =>
  db.getFirstSync(
    "SELECT 1 AS followed FROM artist_following WHERE artist_id = ?",
    [artistId]
  )?.followed === 1;

export const getFollowingArtists = () =>
  db.getAllSync(
    `SELECT a.* FROM artist_following af
     JOIN artists a ON a.id = af.artist_id
     ORDER BY a.name COLLATE NOCASE ASC`
  );

// ── enrichment cache ───────────────────────────────────────────

export const getArtistEnrichment = (artistId) =>
  db.getFirstSync(
    "SELECT * FROM artist_enrichment WHERE artist_id = ?",
    [artistId]
  );

export const getEnrichedArtists = () =>
  db.getAllSync(
    "SELECT ae.*, a.name FROM artist_enrichment ae JOIN artists a ON a.id = ae.artist_id"
  );