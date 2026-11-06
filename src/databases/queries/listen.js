import { db } from "../db";

export const insertListenEvent = ({
  songId,
  startedAt,
  durationMs = 0,
  completed = 0,
  skipped = 0,
} = {}) => {
  return db.runSync(
    `INSERT INTO listen_events (song_id, started_at, duration_ms, completed, skipped)
     VALUES (?, ?, ?, ?, ?)`,
    [songId ?? null, startedAt, durationMs, completed ? 1 : 0, skipped ? 1 : 0],
  );
};

export const updateListenEvent = (
  id,
  { durationMs, completed, skipped } = {},
) => {
  return db.runSync(
    `UPDATE listen_events
     SET duration_ms = ?, completed = ?, skipped = ?
     WHERE id = ?`,
    [durationMs ?? 0, completed ? 1 : 0, skipped ? 1 : 0, id],
  );
};

export const getListenMsBetween = (from, to) => {
  return (
    db.getFirstSync(
      `SELECT COALESCE(SUM(duration_ms), 0) AS total
       FROM listen_events
       WHERE started_at >= ? AND started_at < ?`,
      [from, to],
    )?.total ?? 0
  );
};

export const getListenMsByBucket = (from, to, bucketMs) => {
  if (!bucketMs) return [];
  return db.getAllSync(
    `SELECT CAST((started_at - ?) / ? AS INTEGER) AS bucket,
            COALESCE(SUM(duration_ms), 0) AS total
     FROM listen_events
     WHERE started_at >= ? AND started_at < ?
     GROUP BY bucket`,
    [from, bucketMs, from, to],
  );
};

export const getListenMsByDay = (from, to) => {
  return db.getAllSync(
    `SELECT date(started_at / 1000, 'unixepoch', 'localtime') AS day,
            COALESCE(SUM(duration_ms), 0) AS total
     FROM listen_events
     WHERE started_at >= ? AND started_at < ?
     GROUP BY day`,
    [from, to],
  );
};

export const getListenMsByMonthOfYear = (from, to) => {
  return db.getAllSync(
    `SELECT CAST(strftime('%m', started_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS month,
            COALESCE(SUM(duration_ms), 0) AS total
     FROM listen_events
     WHERE started_at >= ? AND started_at < ?
     GROUP BY month`,
    [from, to],
  );
};

export const getListenPlaysByHour = (from, to) => {
  return db.getAllSync(
    `SELECT CAST(strftime('%H', started_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS hour,
            COUNT(*) AS plays
     FROM listen_events
     WHERE started_at >= ? AND started_at < ?
     GROUP BY hour`,
    [from, to],
  );
};

export const getListenMsByWeekdayHour = (from, to) => {
  return db.getAllSync(
    `SELECT CAST(strftime('%w', started_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS dow,
            CAST(strftime('%H', started_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS hour,
            COUNT(*) AS plays,
            COALESCE(SUM(duration_ms), 0) AS total
     FROM listen_events
     WHERE started_at >= ? AND started_at < ?
     GROUP BY dow, hour`,
    [from, to],
  );
};

export const getSkipCountsByBucket = (from, to, bucketMs) => {
  if (!bucketMs) return [];
  return db.getAllSync(
    `SELECT CAST((started_at - ?) / ? AS INTEGER) AS bucket,
            COALESCE(SUM(skipped), 0) AS skips
     FROM listen_events
     WHERE started_at >= ? AND started_at < ?
     GROUP BY bucket`,
    [from, to, from, to],
  );
};

export const getListenSummary = (from, to) => {
  return (
    db.getFirstSync(
      `SELECT
         COALESCE(SUM(duration_ms), 0) AS total_ms,
         COUNT(*) AS plays,
         COALESCE(SUM(skipped), 0) AS skips,
         COALESCE(MAX(duration_ms), 0) AS longest_ms
       FROM listen_events
       WHERE started_at >= ? AND started_at < ?`,
      [from, to],
    ) ?? { total_ms: 0, plays: 0, skips: 0, longest_ms: 0 }
  );
};

export const getTopListenedSongs = (from, to, limit = 5) => {
  return db.getAllSync(
    `SELECT s.id, s.title, s.artist,
            COUNT(e.id) AS plays,
            COALESCE(SUM(e.duration_ms), 0) AS total_ms
     FROM listen_events e
     JOIN songs s ON s.id = e.song_id
     WHERE e.started_at >= ? AND e.started_at < ?
     GROUP BY e.song_id
     ORDER BY total_ms DESC, plays DESC
     LIMIT ?`,
    [from, to, limit],
  );
};

export const getTopListenedArtists = (from, to, limit = 5) => {
  return db.getAllSync(
    `SELECT
       COALESCE(NULLIF(s.artist, ''), 'Unknown') AS artist,
       COUNT(e.id) AS plays,
       COALESCE(SUM(e.duration_ms), 0) AS total_ms
     FROM listen_events e
     JOIN songs s ON s.id = e.song_id
     WHERE e.started_at >= ? AND e.started_at < ?
     GROUP BY COALESCE(NULLIF(s.artist, ''), 'Unknown')
     ORDER BY total_ms DESC, plays DESC
     LIMIT ?`,
    [from, to, limit],
  );
};

export const getGenreListenStats = (from, to) => {
  return db.getAllSync(
    `SELECT
       COALESCE(NULLIF(s.genre, ''), 'Unknown') AS genre,
       COUNT(e.id) AS plays,
       COALESCE(SUM(e.duration_ms), 0) AS total_ms
     FROM listen_events e
     JOIN songs s ON s.id = e.song_id
     WHERE e.started_at >= ? AND e.started_at < ?
     GROUP BY COALESCE(NULLIF(s.genre, ''), 'Unknown')
     ORDER BY total_ms DESC, plays DESC`,
    [from, to],
  );
};

export const getQualityListenStats = (from, to) => {
  return db.getAllSync(
    `SELECT
       s.file_format AS file_format,
       s.bitrate AS bitrate,
       s.bit_depth AS bit_depth,
       COALESCE(SUM(e.duration_ms), 0) AS total_ms,
       COUNT(e.id) AS plays
     FROM listen_events e
     JOIN songs s ON s.id = e.song_id
     WHERE e.started_at >= ? AND e.started_at < ?
     GROUP BY s.file_format, s.bitrate, s.bit_depth`,
    [from, to],
  );
};

export const getFirstListen = () => {
  return db.getFirstSync(
    `SELECT e.started_at, s.title
     FROM listen_events e
     LEFT JOIN songs s ON s.id = e.song_id
     ORDER BY e.started_at ASC
     LIMIT 1`,
  );
};

export const getLastListen = () => {
  return db.getFirstSync(
    `SELECT e.started_at, s.title
     FROM listen_events e
     LEFT JOIN songs s ON s.id = e.song_id
     ORDER BY e.started_at DESC
     LIMIT 1`,
  );
};

export const getLibraryPlayStats = () => {
  return (
    db.getFirstSync(
      `SELECT
         COALESCE(SUM(COALESCE(play_count, played_times, 0)), 0) AS plays,
         COALESCE(SUM(CASE WHEN COALESCE(play_count, played_times, 0) = 0 THEN 1 ELSE 0 END), 0) AS never_played,
         COALESCE(SUM(COALESCE(play_count, played_times, 0) * COALESCE(duration, 0)), 0) AS duration_sec,
         COUNT(*) AS songs
       FROM songs`,
    ) ?? { plays: 0, never_played: 0, duration_sec: 0, songs: 0 }
  );
};

export const getTopSongsByPlayCount = (limit = 5) => {
  return db.getAllSync(
    `SELECT title, artist, COALESCE(play_count, played_times, 0) AS plays,
            COALESCE(duration, 0) AS duration
     FROM songs
     WHERE COALESCE(play_count, played_times, 0) > 0
     ORDER BY plays DESC, last_played DESC
     LIMIT ?`,
    [limit],
  );
};

export const getTopArtistsByPlayCount = (limit = 5) => {
  return db.getAllSync(
    `SELECT
       COALESCE(NULLIF(artist, ''), 'Unknown') AS artist,
       COALESCE(SUM(COALESCE(play_count, played_times, 0)), 0) AS plays,
       COALESCE(SUM(COALESCE(play_count, played_times, 0) * COALESCE(duration, 0)), 0) AS duration_sec
     FROM songs
     GROUP BY COALESCE(NULLIF(artist, ''), 'Unknown')
     HAVING plays > 0
     ORDER BY duration_sec DESC, plays DESC
     LIMIT ?`,
    [limit],
  );
};

export const getGenrePlayCounts = () => {
  return db.getAllSync(
    `SELECT
       COALESCE(NULLIF(genre, ''), 'Unknown') AS genre,
       COALESCE(SUM(COALESCE(play_count, played_times, 0)), 0) AS plays
     FROM songs
     GROUP BY COALESCE(NULLIF(genre, ''), 'Unknown')
     HAVING plays > 0
     ORDER BY plays DESC`,
  );
};

export const getQualityLibraryStats = () => {
  return db.getAllSync(
    `SELECT file_format, bitrate, bit_depth, COUNT(*) AS songs
     FROM songs
     GROUP BY file_format, bitrate, bit_depth`,
  );
};

export const getDiscoveriesByBucket = (from, to, bucketMs) => {
  if (!bucketMs) return [];
  return db.getAllSync(
    `SELECT CAST((added_at - ?) / ? AS INTEGER) AS bucket,
            COUNT(*) AS total
     FROM songs
     WHERE added_at >= ? AND added_at < ?
     GROUP BY bucket`,
    [from, bucketMs, from, to],
  );
};

export const getHabitBounds = () => {
  return db.getFirstSync(
    `SELECT
       MIN(CASE WHEN last_played > 0 THEN last_played END) AS first_played,
       MAX(CASE WHEN last_played > 0 THEN last_played END) AS last_played
     FROM songs`,
  );
};

export const getRepeatPlays = () => {
  return (
    db.getFirstSync(
      `SELECT
         COALESCE(SUM(CASE WHEN COALESCE(play_count, played_times, 0) > 1
           THEN COALESCE(play_count, played_times, 0) - 1 ELSE 0 END), 0) AS repeats,
         COALESCE(SUM(COALESCE(play_count, played_times, 0)), 0) AS plays
       FROM songs`,
    ) ?? { repeats: 0, plays: 0 }
  );
};
