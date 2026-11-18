import { db } from "../db";

/*
  Song selection for the "Inspired for you" mixes. Every mix returns full song
  rows (file_uri, duration, artwork_uri, ...) so the player can queue them
  directly. Listen-based mixes read listen_events and fall back to play counts /
  newest additions so a fresh library never opens an empty mix.
*/

const DAY_MS = 24 * 60 * 60 * 1000;
const LIMIT = 40;

const PLAYABLE = "s.file_uri IS NOT NULL AND s.file_uri <> ''";
// play_count only exists on rows touched since it was added; played_times is
// the older counter, so take whichever recorded the most plays.
const PLAYS = "MAX(COALESCE(s.play_count, 0), COALESCE(s.played_times, 0))";

const daySeed = (date = new Date()) =>
  date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic partial Fisher-Yates: the same set all day, a new one tomorrow.
function pickDaily(songs, count, seed) {
  const total = songs.length;
  if (total === 0) return [];

  const n = Math.min(count, total);
  const order = new Array(total);
  for (let i = 0; i < total; i += 1) order[i] = i;

  const rng = mulberry32(seed);
  for (let i = 0; i < n; i += 1) {
    const j = i + Math.floor(rng() * (total - i));
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
  }

  const picks = new Array(n);
  for (let i = 0; i < n; i += 1) picks[i] = songs[order[i]];
  return picks;
}

const firstNonEmpty = (...lists) =>
  lists.find((list) => list && list.length > 0) ?? [];

const newest = (limit) =>
  db.getAllSync(
    `SELECT s.* FROM songs s
     WHERE ${PLAYABLE}
     ORDER BY s.added_at DESC, s.id DESC
     LIMIT ?`,
    [limit],
  );

const mostPlayed = (limit) =>
  db.getAllSync(
    `SELECT s.* FROM songs s
     WHERE ${PLAYABLE} AND ${PLAYS} > 0
     ORDER BY ${PLAYS} DESC, s.last_played DESC
     LIMIT ?`,
    [limit],
  );

const loved = (limit) =>
  db.getAllSync(
    `SELECT s.* FROM songs s
     WHERE ${PLAYABLE} AND ${PLAYS} >= 2
     ORDER BY ${PLAYS} DESC, s.last_played DESC
     LIMIT ?`,
    [limit],
  );

const addedSince = (fromMs, limit) =>
  db.getAllSync(
    `SELECT s.* FROM songs s
     WHERE ${PLAYABLE} AND s.added_at >= ?
     ORDER BY s.added_at DESC, s.id DESC
     LIMIT ?`,
    [fromMs, limit],
  );

const byListens = (fromMs, limit) =>
  db.getAllSync(
    `SELECT s.*,
            COUNT(e.id) AS mix_plays,
            COALESCE(SUM(e.duration_ms), 0) AS mix_ms
     FROM listen_events e
     JOIN songs s ON s.id = e.song_id
     WHERE e.started_at >= ? AND ${PLAYABLE}
     GROUP BY s.id
     ORDER BY mix_ms DESC, mix_plays DESC
     LIMIT ?`,
    [fromMs, limit],
  );

const dailyPool = () => {
  const seen = new Set();
  const out = [];
  for (const row of [...mostPlayed(150), ...newest(150)]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
};

const BUILDERS = {
  // Weekly most-listened, based on real listening time this week.
  "weekly-featured": () =>
    firstNonEmpty(
      byListens(Date.now() - 7 * DAY_MS, LIMIT),
      mostPlayed(LIMIT),
      newest(LIMIT),
    ),

  // A fresh daily selection that stays the same for the whole day.
  "daily-mix": () =>
    firstNonEmpty(pickDaily(dailyPool(), 24, daySeed()), newest(24)),

  // Songs you keep returning to (repeated plays); top plays if none yet.
  "liked-songs": () =>
    firstNonEmpty(loved(LIMIT), mostPlayed(LIMIT), newest(LIMIT)),

  // Added within the last month; newest additions otherwise.
  "recently-added": () =>
    firstNonEmpty(addedSince(Date.now() - 31 * DAY_MS, 50), newest(50)),

  // Trending in the last month, by listens.
  "hyped-songs": () =>
    firstNonEmpty(
      byListens(Date.now() - 30 * DAY_MS, LIMIT),
      mostPlayed(LIMIT),
      newest(LIMIT),
    ),

  // All-time most played.
  "most-played": () => firstNonEmpty(mostPlayed(50), newest(50)),
};

/* ------------------------------ playlists ------------------------------ */

// Playlist ids round-trip through the /MixedPlayer route as `genre:<name>` or
// `artist:<name>`, so the screen can select songs from the title alone.
const PLAYLIST_LIMIT = 10;

const PLAYLIST_GRADIENTS = [
  ["#c2457a", "#3a1d6e"],
  ["#2f6f9a", "#14243d"],
  ["#dea962", "#7a3b1a"],
  ["#6a4fd8", "#1a1240"],
  ["#4fd88a", "#0f4a32"],
  ["#d84f7a", "#3d1230"],
  ["#4fd8d8", "#0f4a4a"],
  ["#d8c84f", "#4a3a0f"],
];

const groupByField = (field, limit) =>
  db.getAllSync(
    `SELECT TRIM(${field}) AS name, COUNT(*) AS total
     FROM songs s
     WHERE ${PLAYABLE} AND ${field} IS NOT NULL AND TRIM(${field}) <> ''
     GROUP BY LOWER(TRIM(${field}))
     ORDER BY total DESC, name COLLATE NOCASE ASC
     LIMIT ?`,
    [limit],
  );

// First song in a group — its artwork becomes the playlist card cover.
const firstSongArt = (type, name) => {
  const field = type === "genre" ? "s.genre" : "s.artist";
  const rows = db.getAllSync(
    `SELECT s.artwork_uri FROM songs s
     WHERE ${PLAYABLE} AND LOWER(TRIM(${field})) = LOWER(?)
     ORDER BY s.added_at DESC, s.id DESC
     LIMIT 1`,
    [name],
  );
  return rows[0]?.artwork_uri ?? null;
};

// Playlists come from the library itself: the biggest genres first, then the
// most represented artists when the library has fewer genres than cards.
// A `limit`-sized window rotates through the full pool every day, so with 60
// playlists and a limit of 10 you get 10 new cards each day and the same set
// repeats every 6 days.
export function getPlaylists(limit = PLAYLIST_LIMIT) {
  if (!limit || limit < 1) return [];
  try {
    const genres = groupByField("s.genre", 500).map((row) => ({
      ...row,
      type: "genre",
    }));
    const seen = new Set(genres.map((g) => g.name.toLowerCase()));
    const artists = groupByField("s.artist", 500)
      .filter((row) => !seen.has(row.name.toLowerCase()))
      .map((row) => ({ ...row, type: "artist" }));
    const pool = [...genres, ...artists];
    const total = pool.length;
    if (total === 0) return [];

    // Daily starting offset, advances by `limit` each day and wraps through
    // the pool.
    const day = Math.floor(Date.now() / DAY_MS);
    const start = (day * limit) % total;

    const rows = [];
    for (let i = 0; i < Math.min(limit, total); i += 1) {
      rows.push(pool[(start + i) % total]);
    }

    return rows.map((row, i) => ({
      id: `${row.type}:${encodeURIComponent(row.name)}`,
      title: row.name,
      songs: row.total,
      image: firstSongArt(row.type, row.name),
      gradient: PLAYLIST_GRADIENTS[i % PLAYLIST_GRADIENTS.length],
    }));
  } catch (error) {
    console.warn("[mix] playlist lookup failed:", error);
    return [];
  }
}

const byField = (field, value, limit) =>
  db.getAllSync(
    `SELECT s.* FROM songs s
     WHERE ${PLAYABLE} AND LOWER(TRIM(${field})) = LOWER(?)
     ORDER BY s.added_at DESC, s.id DESC
     LIMIT ?`,
    [value, limit],
  );

const parsePlaylistId = (mixId) => {
  if (typeof mixId !== "string") return null;
  const cut = mixId.indexOf(":");
  if (cut <= 0) return null;
  const type = mixId.slice(0, cut);
  if (type !== "genre" && type !== "artist") return null;
  const raw = mixId.slice(cut + 1);
  if (!raw) return null;
  try {
    return { type, value: decodeURIComponent(raw) };
  } catch {
    return { type, value: raw };
  }
};

// Cards for the "New songs" rail: the most recently imported tracks.
export function getNewSongs(limit = 12) {
  try {
    return newest(limit);
  } catch (error) {
    console.warn("[mix] new songs lookup failed:", error);
    return [];
  }
}

export function getSongsAddedBetween(fromMs, toMs, limit = 12) {
  try {
    return db.getAllSync(
      `SELECT s.* FROM songs s
       WHERE ${PLAYABLE} AND s.added_at >= ? AND s.added_at < ?
       ORDER BY s.added_at DESC, s.id DESC
       LIMIT ?`,
      [fromMs, toMs, limit],
    );
  } catch (error) {
    console.warn("[mix] songs-by-date lookup failed:", error);
    return [];
  }
}

// A fresh random slice of the library. Re-queried on every press, so each tap
// of the header's random button rolls a different song and order.
export function getRandomSongs(limit = 50) {
  try {
    return db.getAllSync(
      `SELECT s.* FROM songs s
       WHERE ${PLAYABLE}
       ORDER BY RANDOM()
       LIMIT ?`,
      [limit],
    );
  } catch (error) {
    console.warn("[mix] random lookup failed:", error);
    return [];
  }
}

export function getMixSongs(mixId) {
  try {
    const playlist = parsePlaylistId(mixId);
    if (playlist) {
      const rows = byField(
        playlist.type === "genre" ? "s.genre" : "s.artist",
        playlist.value,
        60,
      );
      return rows.length ? rows : newest(60);
    }
    const build = BUILDERS[mixId] ?? BUILDERS["most-played"];
    return build();
  } catch (error) {
    console.warn("[mix] song selection failed:", mixId, error);
    return [];
  }
}
