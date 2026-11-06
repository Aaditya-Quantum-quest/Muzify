import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";

// expo-sqlite's web build drives a Web Worker, which needs SharedArrayBuffer
// — and therefore Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy
// response headers the dev server does not set. openDatabaseSync() throws
// synchronously at import time on web and crashes the whole app before any
// error boundary can catch it, so on web we use a no-op stub instead.
export const db =
  Platform.OS === "web"
    ? {
        getAllSync: () => [],
        getFirstSync: () => null,
        runSync: () => {},
        execSync: () => {},
        close: () => {},
      }
    : SQLite.openDatabaseSync("muzify.db");

/**
 * Add any missing columns to the songs table without touching existing rows.
 * Safe to call repeatedly: it queries the current schema first and only
 * issues ALTER TABLE for columns that are absent, so it never corrupts a
 * database created by an older version of the app.
 */
function migrateSongsSchema() {
  const columns = db
    .getAllSync("PRAGMA table_info(songs)")
    .map((row) => row.name);

  const additions = [
    "disc_number INTEGER",
    "file_format TEXT",
    "file_size INTEGER",
    "bitrate INTEGER",
    "sample_rate INTEGER",
    "bit_depth INTEGER",
    "channels INTEGER",
    "play_count INTEGER DEFAULT 0",
  ];

  for (const def of additions) {
    const name = def.split(" ")[0];
    if (columns.includes(name)) continue;
    try {
      db.execSync(`ALTER TABLE songs ADD COLUMN ${def}`);
    } catch (error) {
      console.warn("Failed to add column", name, error);
    }
  }
}

/**
 * Artist discovery schema.
 *
 * Normalized, deduplicated artist records linked to songs via a join table,
 * plus relationship (similar/collaboration/genre_match) and following tables.
 * All tables use IF NOT EXISTS so this is safe to call on every app start,
 * and a column-migration loop adds new columns to existing tables without
 * touching existing rows (same pattern as migrateSongsSchema).
 */
function migrateArtistSchema() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      image_uri TEXT,
      bio TEXT,
      genres TEXT,
      country TEXT,
      external_id TEXT,
      follower_count INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS song_artists (
      song_id INTEGER NOT NULL,
      artist_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'primary',
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (song_id, artist_id),
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
      FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artist_relationships (
      artist_id INTEGER NOT NULL,
      related_artist_id INTEGER NOT NULL,
      relationship_type TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'library',
      PRIMARY KEY (artist_id, related_artist_id, relationship_type),
      FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
      FOREIGN KEY (related_artist_id) REFERENCES artists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artist_following (
      artist_id INTEGER PRIMARY KEY,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artist_follows (
      artist_id   INTEGER PRIMARY KEY,
      followed_at INTEGER NOT NULL,
      FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artist_enrichment (
      artist_id INTEGER PRIMARY KEY,
      bio TEXT,
      genres TEXT,
      country TEXT,
      image_uri TEXT,
      external_id TEXT,
      fetched_at INTEGER NOT NULL,
      FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artist_external_cache (
      artist_id  INTEGER NOT NULL,
      provider   TEXT NOT NULL,          -- musicbrainz|lastfm
      payload    TEXT,
      status     TEXT NOT NULL,          -- ok|not_found|error
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (artist_id, provider),
      FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
    );
  `);

  // Indexes used by the artist discovery queries.
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_song_artists_artist ON song_artists(artist_id)",
    "CREATE INDEX IF NOT EXISTS idx_song_artists_song ON song_artists(song_id)",
    "CREATE INDEX IF NOT EXISTS idx_artist_relationships_artist ON artist_relationships(artist_id)",
    "CREATE INDEX IF NOT EXISTS idx_artists_normalized ON artists(normalized_name)",
    "CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name COLLATE NOCASE)",
    "CREATE INDEX IF NOT EXISTS idx_artists_created ON artists(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_rel_artist ON artist_relationships(artist_id, score DESC)",
    "CREATE INDEX IF NOT EXISTS idx_sa_artist ON song_artists(artist_id)",
    "CREATE INDEX IF NOT EXISTS idx_sa_song ON song_artists(song_id)",
  ];

  for (const sql of indexes) {
    try {
      db.execSync(sql);
    } catch (error) {
      console.warn("Failed to create index", sql, error);
    }
  }

  // Sync existing artist_following with artist_follows if needed
  try {
    db.execSync("INSERT OR IGNORE INTO artist_follows(artist_id, followed_at) SELECT artist_id, created_at FROM artist_following");
  } catch (error) {
    // ignore
  }

  // recommendationService inserts `updated_at` into artist_relationships, but
  // the original schema predates that column. SQLite cannot ALTER a column, so
  // add it with a default rather than rebuilding the table and risking data.
  const relColumns = db
    .getAllSync("PRAGMA table_info(artist_relationships)")
    .map((row) => row.name);
  if (!relColumns.includes("updated_at")) {
    try {
      db.execSync(
        "ALTER TABLE artist_relationships ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0"
      );
    } catch (error) {
      console.warn("Failed to add artist_relationships.updated_at", error);
    }
  }

  // recommendationService stores float scores (Jaccard similarity, shared-song
  // ratios), but the original schema declared `score INTEGER`, whose affinity
  // silently truncates 0.33 -> 0. SQLite cannot change a column type, so rebuild
  // the table when the type is wrong. artist_relationships is fully derived from
  // song_artists (repopulated on every scan), so nothing user-authored is lost.
  const relScoreType = db
    .getAllSync("PRAGMA table_info(artist_relationships)")
    .find((row) => row.name === "score")?.type;
  if (relScoreType && relScoreType.toUpperCase() !== "REAL") {
    try {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS artist_relationships_new (
          artist_id         INTEGER NOT NULL,
          related_artist_id INTEGER NOT NULL,
          relationship_type TEXT NOT NULL,
          score             REAL NOT NULL DEFAULT 0,
          source            TEXT NOT NULL DEFAULT 'library',
          updated_at        INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (artist_id, related_artist_id, relationship_type),
          CHECK (artist_id <> related_artist_id),
          FOREIGN KEY (artist_id)         REFERENCES artists(id) ON DELETE CASCADE,
          FOREIGN KEY (related_artist_id) REFERENCES artists(id) ON DELETE CASCADE
        );
        INSERT INTO artist_relationships_new SELECT artist_id, related_artist_id, relationship_type, score, source, updated_at FROM artist_relationships;
        DROP TABLE artist_relationships;
        ALTER TABLE artist_relationships_new RENAME TO artist_relationships;
      `);
    } catch (error) {
      console.warn("Failed to rebuild artist_relationships for REAL score", error);
    }
  }

  // Forward-compatible column additions for the artists table.
  const artistColumns = db
    .getAllSync("PRAGMA table_info(artists)")
    .map((row) => row.name);

  const artistAdditions = [
    "mood TEXT",
    "style TEXT",
    "similar_artists TEXT",
    "follower_count INTEGER",
    "enriched_at INTEGER",
    "enrich_status TEXT DEFAULT 'pending'",
  ];

  for (const def of artistAdditions) {
    const name = def.split(" ")[0];
    if (artistColumns.includes(name)) continue;
    try {
      db.execSync(`ALTER TABLE artists ADD COLUMN ${def}`);
    } catch (error) {
      console.warn("Failed to add artist column", name, error);
    }
  }
}

function migrateListenSchema() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS listen_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id INTEGER,
      started_at INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0
    );
  `);

  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_listen_started ON listen_events(started_at)",
    "CREATE INDEX IF NOT EXISTS idx_listen_song ON listen_events(song_id)",
  ];

  for (const sql of indexes) {
    try {
      db.execSync(sql);
    } catch (error) {
      console.warn("Failed to create listen index", sql, error);
    }
  }
}

export function initializeDatabase() {
  db.execSync("PRAGMA foreign_keys = ON");
  db.execSync(`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_number INTEGER,
      year INTEGER,
      title TEXT,
      artist TEXT,
      album TEXT,
      genre TEXT,
      album_artist TEXT,
      composer TEXT,
      comments TEXT,
      description TEXT,
      lyrics TEXT,
      artwork_uri TEXT,
      added_at INTEGER NOT NULL,
      duration INTEGER,
      file_uri TEXT NOT NULL UNIQUE,
      played_times INTEGER NOT NULL DEFAULT 0,
      last_played INTEGER
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  migrateSongsSchema();
  migrateArtistSchema();
  migrateListenSchema();
}
