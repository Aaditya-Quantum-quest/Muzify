
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

// INSERT SONG
export const addSong = (song) => {
  const fields = SONG_FIELDS.filter(
    (field) => song[field] !== undefined
  );

  if (!song.file_uri) {
    throw new Error("Song file_uri is required");
  }

  const columns = fields.join(", ");
  const placeholders = fields.map(() => "?").join(", ");
  const values = fields.map((field) => song[field]);

  return db.runSync(
    `INSERT INTO songs (${columns}) VALUES (${placeholders})`,
    values
  );
};

// GET ALL SONGS
export const getAllSongs = () => {
  return db.getAllSync(
    "SELECT * FROM songs ORDER BY title COLLATE NOCASE ASC"
  );
};



// GET SONGS IN BATCHES
export const getSongsPage = (
  limit = 30,
  offset = 0,
  search = "",
  sort = 0
) => {
  const searchTerm = `%${search.trim()}%`;

  const orderBy = {
    0: "added_at DESC, id DESC",
    1: "title COLLATE NOCASE ASC",
    2: "title COLLATE NOCASE ASC",
  };

  const safeOrder = orderBy[sort] || orderBy[0];

  return db.getAllSync(
    `
      SELECT * FROM songs
      WHERE title LIKE ?
         OR artist LIKE ?
         OR album LIKE ?
      ORDER BY ${safeOrder}
      LIMIT ? OFFSET ?
    `,
    [searchTerm, searchTerm, searchTerm, limit, offset]
  );
};

// GET TOTAL SONG COUNT
export const getSongsCount = (search = "") => {
  const searchTerm = `%${search.trim()}%`;

  const result = db.getFirstSync(
    `
      SELECT COUNT(*) AS total
      FROM songs
      WHERE title LIKE ?
         OR artist LIKE ?
         OR album LIKE ?
    `,
    [searchTerm, searchTerm, searchTerm]
  );

  return result?.total ?? 0;
};


// GET SONG BY ID
export const getSongById = (id) => {
  return db.getFirstSync(
    "SELECT * FROM songs WHERE id = ?",
    [id]
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
