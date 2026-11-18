
import { db } from "../db";

// Fields allowed when inserting or updating a song
const SONG_FIELDS = [
  "track_number",
  "disc_number",
  "year",
  "title",
  "artist",
  "album",
  "genre",
  "album_artist",
  "composer",
  "comments",
  "description",
  "lyrics",
  "artwork_uri",
  "file_format",
  "file_size",
  "bitrate",
  "sample_rate",
  "bit_depth",
  "channels",
  "added_at",
  "duration",
  "file_uri",
  "played_times",
  "play_count",
  "last_played",
];

// Build the column/placeholder/values triple shared by every INSERT.
const insertParts = (song) => {
  const fields = SONG_FIELDS.filter(
    (field) => song[field] !== undefined
  );

  if (!song.file_uri) {
    throw new Error("Song file_uri is required");
  }

  return {
    columns: fields.join(", "),
    placeholders: fields.map(() => "?").join(", "),
    values: fields.map((field) => song[field]),
  };
};

// INSERT SONG
export const addSong = (song) => {
  const { columns, placeholders, values } = insertParts(song);

  return db.runSync(
    `INSERT INTO songs (${columns}) VALUES (${placeholders})`,
    values
  );
};

/**
 * INSERT SONG unless its file_uri is already stored.
 *
 * Two imports can discover the same file (a scanned folder containing a
 * duplicate entry, or a scan overlapping the poll that retries an incomplete
 * folder). `file_uri` is UNIQUE, so the second INSERT would throw and the file
 * would be reported as failed even though it is in the library. Doing the
 * conflict resolution in SQL keeps the import idempotent and race-free.
 *
 * Returns expo-sqlite's run result: `changes` is 0 when the row already
 * existed, in which case `lastInsertRowid` is not the song's id.
 */
export const insertSongIfAbsent = (song) => {
  const { columns, placeholders, values } = insertParts(song);

  return db.runSync(
    `INSERT INTO songs (${columns}) VALUES (${placeholders})
     ON CONFLICT(file_uri) DO NOTHING`,
    values
  );
};

// GET ALL SONGS
export const getAllSongs = () => {
  return db.getAllSync(
    "SELECT * FROM songs ORDER BY title COLLATE NOCASE ASC"
  );
};

// Every ordering ends with `id` so that rows with equal sort keys always come
// back in the same order.
const SONG_ORDER_BY = {
  0: "added_at DESC, id DESC",
  1: "title COLLATE NOCASE ASC, id ASC",
  2: "title COLLATE NOCASE ASC, id ASC",
};

// A `LIKE '%%'` filter silently drops rows whose title, artist AND album are
// all NULL — exactly the freshly scanned rows that still need metadata repair,
// which then never become visible. So "no term" means "no WHERE clause".
const searchClause = (term) =>
  term ? "WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?" : "";

const searchArgs = (term) => (term ? [`%${term}%`, `%${term}%`, `%${term}%`] : []);

export const getSongsFiltered = (search = "", sort = 0) => {
  const safeOrder = SONG_ORDER_BY[sort] || SONG_ORDER_BY[0];
  const term = search.trim();

  return db.getAllSync(
    `SELECT * FROM songs ${searchClause(term)} ORDER BY ${safeOrder}`,
    searchArgs(term)
  );
};

// GET SONG BY ID
export const getSongById = (id) => {
  return db.getFirstSync(
    "SELECT * FROM songs WHERE id = ?",
    [id]
  );
};

// GET SONG BY FILE URI — lets the importer resolve a row that a concurrent
// insert won the race for (see insertSongIfAbsent).
export const getSongByFileUri = (fileUri) => {
  return db.getFirstSync(
    "SELECT * FROM songs WHERE file_uri = ? LIMIT 1",
    [fileUri]
  );
};

// UPDATE SONG
export const updateSong = (id, updates) => {
  const fields = SONG_FIELDS.filter(
    (field) => updates[field] !== undefined
  );

  if (fields.length === 0) {
    throw new Error("No valid song fields provided");
  }

  const setClause = fields
    .map((field) => `${field} = ?`)
    .join(", ");

  const values = fields.map((field) => updates[field]);

  return db.runSync(
    `UPDATE songs SET ${setClause} WHERE id = ?`,
    [...values, id]
  );
};

// DELETE SONG
export const deleteSong = (id) => {
  return db.runSync(
    "DELETE FROM songs WHERE id = ?",
    [id]
  );
};
