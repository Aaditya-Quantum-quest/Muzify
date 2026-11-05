# Muzify — Database Documentation

## 1. Database Technology

Muzify includes Expo SQLite.

The database is responsible for persistent application data.

Verify the actual database implementation before changing it.

## 2. Database Responsibilities

Potential responsibilities include:

- Music library records.
- Song metadata.
- Playlists.
- Playlist-song relationships.
- Recently played tracks.
- Listening statistics.
- User preferences.

Only document features that are confirmed in the actual schema and queries.

## 3. Schema Documentation

Maintain the actual schema below.

Do not invent table names or columns.

### Tables

For every table document:

- Table name.
- Purpose.
- Columns.
- Data types.
- Primary keys.
- Foreign keys.
- Indexes.
- Relationships.

### Migrations

For every migration document:

- Migration identifier.
- Previous schema version.
- New schema version.
- Changes introduced.
- Backward compatibility.
- Rollback considerations.

## 4. Query Layer

Document the actual files responsible for:

- Database initialization.
- Table creation.
- Database migrations.
- Insert operations.
- Update operations.
- Delete operations.
- Select operations.

## 5. Data Integrity Rules

- Do not silently delete user data.
- Preserve existing identifiers.
- Avoid duplicate song records.
- Use transactions for related operations when appropriate.
- Handle database errors.
- Keep playlist relationships consistent.
- Avoid unnecessary database resets.

## 6. Database Change Procedure

Before changing the database:

1. Inspect the current schema.
2. Inspect all relevant queries.
3. Identify affected screens and services.
4. Determine whether migration is required.
5. Implement migration safely.
6. Test existing data compatibility.
7. Update this document.

## 7. Current Schema

### `songs` Table
Stores local audio tracks scanned from storage:
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `track_number`, `disc_number`, `year` (INTEGER)
- `title`, `artist`, `album`, `genre`, `album_artist`, `composer` (TEXT)
- `comments`, `description`, `lyrics`, `artwork_uri`, `file_format` (TEXT)
- `file_size`, `bitrate`, `sample_rate`, `bit_depth`, `channels`, `added_at`, `duration` (INTEGER)
- `file_uri` (TEXT NOT NULL UNIQUE)
- `played_times`, `play_count` (INTEGER DEFAULT 0)
- `last_played` (INTEGER)

### `artists` Table
Stores normalized artist profiles:
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `name` (TEXT NOT NULL)
- `normalized_name` (TEXT NOT NULL UNIQUE)
- `image_uri`, `bio`, `genres`, `country`, `external_id` (TEXT)
- `follower_count` (INTEGER)
- `enriched_at` (INTEGER)
- `enrich_status` (TEXT DEFAULT 'pending')
- `created_at`, `updated_at` (INTEGER NOT NULL)

### `song_artists` Table
Join table linking songs to parsed artist credits:
- `song_id` (INTEGER NOT NULL, FK -> songs(id) ON DELETE CASCADE)
- `artist_id` (INTEGER NOT NULL, FK -> artists(id) ON DELETE CASCADE)
- `role` (TEXT NOT NULL DEFAULT 'primary')
- `position` (INTEGER NOT NULL DEFAULT 0)
- Primary Key: `(song_id, artist_id)`

### `artist_relationships` Table
Similarities, collaborations, and genre overlaps:
- `artist_id` (INTEGER NOT NULL, FK -> artists(id) ON DELETE CASCADE)
- `related_artist_id` (INTEGER NOT NULL, FK -> artists(id) ON DELETE CASCADE)
- `relationship_type` (TEXT NOT NULL)
- `score` (REAL NOT NULL DEFAULT 0)
- `source` (TEXT NOT NULL)
- `updated_at` (INTEGER NOT NULL)
- Primary Key: `(artist_id, related_artist_id, relationship_type)`

### `artist_follows` Table
Follow status for artists:
- `artist_id` (INTEGER PRIMARY KEY, FK -> artists(id) ON DELETE CASCADE)
- `followed_at` (INTEGER NOT NULL)

### `artist_external_cache` Table
Cache for external metadata provider queries:
- `artist_id` (INTEGER NOT NULL)
- `provider` (TEXT NOT NULL: 'musicbrainz' | 'lastfm')
- `payload` (TEXT)
- `status` (TEXT NOT NULL: 'ok' | 'not_found' | 'error')
- `fetched_at` (INTEGER NOT NULL)
- Primary Key: `(artist_id, provider)`