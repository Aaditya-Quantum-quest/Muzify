import { addSong, getAllSongs, updateSong } from "../databases/queries/song.js";
import { getMetadata, getAudioProperties, getDurationSeconds } from "./audioMetadata";
import { getCachedArtwork } from "./artworkCache";
import { readJsTags, resetFolderCoverIndex } from "./jsTagReader";
import { cleanSongTitle, getFilenameFromUri, looksLikeUri, parseMetadataFromFilename } from "./folderScanner.js";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";
import Constants from "expo-constants";
import { onSongAdded, rebuildCollaborations, backfillAllSongs, notifyArtistsChanged } from "./artists/artistSync";
import { db } from "../databases/db.js";

/**
 * Normalize metadata extracted from audio files.
 * Falls back to filename-based values when embedded metadata is missing.
 */
function normalizeMetadata(raw, fileUri) {
  const filename = getFilenameFromUri(fileUri);
  const parsed = parseMetadataFromFilename(filename, fileUri);

  const rawArtist = raw?.artist?.trim();
  const rawTitle = raw?.title?.trim();
  const rawAlbum = raw?.album?.trim();

  const isGenericArtist = !rawArtist || rawArtist === "Unknown Artist" || rawArtist === "Unknown";
  const isGenericAlbum = !rawAlbum || rawAlbum === "Unknown Album" || rawAlbum === "Unknown";
  const isGenericTitle =
    !rawTitle ||
    rawTitle === "Unknown Title" ||
    rawTitle === "Unknown" ||
    looksLikeUri(rawTitle);

  const artist = !isGenericArtist ? rawArtist : parsed.artist;
  const title = !isGenericTitle ? rawTitle : parsed.title;
  const album = !isGenericAlbum ? rawAlbum : parsed.album;

  return {
    title: title || parsed.title || "Unknown Title",
    artist: artist || "Unknown Artist",
    album: album || "Single",
    album_artist: raw?.album_artist?.trim() || artist || "Unknown Artist",
    composer: raw?.composer?.trim() || "Unknown",
    genre: raw?.genre?.trim() || "Unknown",
    year: parseYear(raw?.year),
    track_number: raw?.track_number ?? 0,
    duration: toDurationSeconds(raw?.duration),
  };
}

function toDurationSeconds(rawDuration) {
  const n = Number(rawDuration) || 0;
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 10000) return Math.round(n / 1000);
  return Math.round(n);
}

function mergeMetadata(primary, fallback) {
  const a = primary || {};
  const b = fallback || {};
  const out = { ...b, ...a };
  for (const key of [
    "title",
    "artist",
    "album",
    "album_artist",
    "composer",
    "genre",
    "year",
    "track_number",
    "duration",
  ]) {
    const value = a[key];
    const empty = value == null || value === "" || value === 0;
    if (empty && b[key]) out[key] = b[key];
  }
  return out;
}

async function readMergedMetadata(fileUri) {
  const native = (await getMetadata(fileUri)) || {};
  const nativeThin =
    Object.keys(native).length === 0 ||
    !native.duration ||
    !native.artist ||
    !native.title;
  if (!nativeThin) return native;
  const js = await readJsTags(fileUri);
  return mergeMetadata(native, js);
}

function parseYear(yearValue) {
  if (!yearValue) return 0;
  const str = String(yearValue).trim();
  const match = str.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : 0;
}

/**
 * Resolve a displayable audio format label from a MIME type or file name.
 * "audio/mpeg" → "MP3", "audio/mp4a" → "M4A", "audio/x-flac" → "FLAC".
 * Falls back to the file extension when the MIME type is unknown.
 */
function resolveAudioFormat(mimeType, fileUri) {
  if (mimeType) {
    const map = {
      "audio/mpeg": "MP3",
      "audio/mp4": "M4A",
      "audio/mp4a": "M4A",
      "audio/x-m4a": "M4A",
      "audio/x-flac": "FLAC",
      "audio/flac": "FLAC",
      "audio/x-wav": "WAV",
      "audio/wav": "WAV",
      "audio/x-aiff": "AIFF",
      "audio/aiff": "AIFF",
      "audio/x-aac": "AAC",
      "audio/aac": "AAC",
      "audio/ogg": "OGG",
      "audio/opus": "OPUS",
      "audio/x-opus": "OPUS",
      "audio/webm": "WEBM",
    };
    const label = map[mimeType.toLowerCase()];
    if (label) return label;
  }

  const filename = getFilenameFromUri(fileUri);
  const ext = String(filename ?? "")
    .split("?")[0]
    .split(".")
    .pop()
    .toLowerCase();
  return ext && ext.length <= 5 ? ext.toUpperCase() : "";
}

/**
 * Build a complete song record from a file URI.
 * Extracts real metadata, artwork, and audio stream properties.
 * Falls back to filename parsing when embedded metadata is missing.
 */
export async function buildSongFromUri(fileUri) {
  const raw = await readMergedMetadata(fileUri);
  const meta = normalizeMetadata(raw, fileUri);
  if (!meta.duration) {
    const probed = await getDurationSeconds(fileUri);
    if (probed > 0) meta.duration = Math.round(probed);
  }

  const artworkUri = await getCachedArtwork(fileUri);

  // Extract raw audio stream properties (bitrate, sample rate, channels, mime).
  const props = await getAudioProperties(fileUri);

  // File size / format from the filesystem. SAF content:// URIs may not be
  // readable by expo-file-system, so this is best-effort and never blocks.
  let fileSize = 0;
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info && info.exists && typeof info.size === "number") {
      fileSize = info.size;
    }
  } catch {
    // Content URIs are not always stat-able; leave file_size as 0.
  }

  const format = resolveAudioFormat(props.mimeType, fileUri);

  return {
    track_number: meta.track_number,
    year: meta.year,
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    genre: meta.genre,
    album_artist: meta.album_artist,
    composer: meta.composer,
    comments: "",
    description: "",
    lyrics: "",
    artwork_uri: artworkUri,
    file_format: format,
    file_size: fileSize,
    bitrate: props.bitrate ?? 0,
    sample_rate: props.sampleRate ?? 0,
    channels: props.channels ?? 0,
    added_at: Date.now(),
    duration: meta.duration,
    file_uri: fileUri,
    played_times: 0,
    last_played: 0,
  };
}

/**
 * Import audio files into SQLite.
 * For new files: extracts full metadata and artwork.
 * For existing files: updates only missing/invalid fields.
 */
export const importAudioFiles = async (audioFiles) => {
  const totalFiles = audioFiles.length;

  let imported = 0;
  let skipped = 0;
  let updated = 0;
  let failed = 0;

  const existingSongs = getAllSongs();

  const existingMap = new Map(
    existingSongs.map((song) => [song.file_uri, song])
  );

  for (const fileUri of audioFiles) {
    try {
      const existingSong = existingMap.get(fileUri);

      if (existingSong) {
        // Update existing song with missing metadata
        const needsUpdate = await updateExistingSong(existingSong, fileUri);
        if (needsUpdate) {
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

      // New file - full metadata extraction
      const song = await buildSongFromUri(fileUri);
      const result = addSong(song);
      song.id = result.lastInsertRowid;
      onSongAdded(song);

      imported++;
      existingMap.set(fileUri, song);

    } catch (error) {
      console.error("Failed to import:", fileUri, error);
      failed++;
    }
  }

  // Rebuild collaboration relationships once for the whole import.
  rebuildCollaborations();

  return {
    totalFiles,
    imported,
    updated,
    skipped,
    failed,
  };
}

/**
 * Update an existing song with missing metadata fields.
 * Only fills in fields that are empty, "Unknown", or placeholder values.
 * Preserves user-edited metadata.
 */
async function updateExistingSong(existingSong, fileUri) {
  const updates = {};
  let hasUpdates = false;

  const raw = await readMergedMetadata(fileUri);
  const meta = normalizeMetadata(raw, fileUri);
  if (!meta.duration) {
    const probed = await getDurationSeconds(fileUri);
    if (probed > 0) meta.duration = Math.round(probed);
  }

  // Update title if it's a filename-derived placeholder or a SAF URI
  if (
    !existingSong.title ||
    existingSong.title === "Unknown Title" ||
    looksLikeUri(existingSong.title) ||
    existingSong.title.includes("primary:Download/") ||
    existingSong.title === cleanSongTitle(getFilenameFromUri(fileUri))
  ) {
    if (meta.title && meta.title !== existingSong.title) {
      updates.title = meta.title;
      hasUpdates = true;
    }
  }

  // Update artist if unknown
  if (!existingSong.artist || existingSong.artist === "Unknown Artist") {
    if (meta.artist && meta.artist !== "Unknown Artist") {
      updates.artist = meta.artist;
      hasUpdates = true;
    }
  }

  // Update album if unknown
  if (!existingSong.album || existingSong.album === "Unknown Album") {
    if (meta.album && meta.album !== "Unknown Album") {
      updates.album = meta.album;
      hasUpdates = true;
    }
  }

  // Update album_artist if unknown
  if (!existingSong.album_artist || existingSong.album_artist === "Unknown Artist") {
    if (meta.album_artist && meta.album_artist !== "Unknown Artist") {
      updates.album_artist = meta.album_artist;
      hasUpdates = true;
    }
  }

  // Update genre if unknown
  if (!existingSong.genre || existingSong.genre === "Unknown") {
    if (meta.genre && meta.genre !== "Unknown") {
      updates.genre = meta.genre;
      hasUpdates = true;
    }
  }

  // Update year if missing or zero
  if (!existingSong.year || existingSong.year === 0) {
    if (meta.year > 0) {
      updates.year = meta.year;
      hasUpdates = true;
    }
  }

  // Update track_number if missing
  if (!existingSong.track_number || existingSong.track_number === 0) {
    if (meta.track_number > 0) {
      updates.track_number = meta.track_number;
      hasUpdates = true;
    }
  }

  // Update composer if unknown
  if (!existingSong.composer || existingSong.composer === "Unknown") {
    if (meta.composer && meta.composer !== "Unknown") {
      updates.composer = meta.composer;
      hasUpdates = true;
    }
  }

  // Update artwork if missing
  if (!existingSong.artwork_uri) {
    const artworkUri = await getCachedArtwork(fileUri);
    if (artworkUri) {
      updates.artwork_uri = artworkUri;
      hasUpdates = true;
    }
  }

  if (!existingSong.duration || existingSong.duration === 180 || existingSong.duration <= 0) {
    let duration = meta.duration;
    if (!duration || duration <= 0) {
      duration = await getDurationSeconds(fileUri);
    }
    if (duration > 0) {
      updates.duration = duration;
      hasUpdates = true;
    }
  }

  // Fill in audio stream properties when the record has none. These come from
  // a separate MediaExtractor pass and are never "user-edited", so always
  // overwrite zeros/placeholders rather than skipping them.
  const props = await getAudioProperties(fileUri);
  if (props && Object.keys(props).length > 0) {
    if (!existingSong.bitrate && props.bitrate) {
      updates.bitrate = props.bitrate;
      hasUpdates = true;
    }
    if (!existingSong.sample_rate && props.sampleRate) {
      updates.sample_rate = props.sampleRate;
      hasUpdates = true;
    }
    if (!existingSong.channels && props.channels) {
      updates.channels = props.channels;
      hasUpdates = true;
    }
    if (!existingSong.file_format) {
      const format = resolveAudioFormat(props.mimeType, fileUri);
      if (format) {
        updates.file_format = format;
        hasUpdates = true;
      }
    }
  }

  if (hasUpdates) {
    updateSong(existingSong.id, updates);
    return true;
  }

  return false;
}

/**
 * Full music import flow: scan the selected folder then import discovered files.
 */
export const importMusicFromSavedFolder = async () => {
  const { getSavedMusicFolder } = await import("./musicFolder.js");
  const { scanSelectedFolder } = await import("./folderScanner.js");

  const savedFolder = getSavedMusicFolder();

  if (!savedFolder) {
    console.warn("No music folder selected.");

    return {
      totalFiles: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    };
  }

  const audioFiles = await scanSelectedFolder(savedFolder.uri);
  resetFolderCoverIndex();
  return importAudioFiles(audioFiles);
}

/**
 * Enrich existing songs in the database with missing metadata.
 * Processes in batches to avoid blocking the UI.
 * Can be called manually from Settings or automatically on first run.
 */
export const enrichExistingSongs = async (options = {}) => {
  const { batchSize = 20, onProgress } = options;

  const existingSongs = getAllSongs();

  // Find songs that need enrichment. Includes songs whose audio stream
  // properties (bitrate / sample rate / channels / format) are still empty,
  // since those come from a separate MediaExtractor pass and may lag behind.
  const candidates = existingSongs.filter((song) =>
    !song.title ||
    song.title === "Unknown Title" ||
    looksLikeUri(song.title) ||
    song.title.includes("primary:Download/") ||
    !song.artist ||
    song.artist === "Unknown Artist" ||
    !song.album ||
    song.album === "Unknown Album" ||
    !song.genre ||
    song.genre === "Unknown" ||
    !song.year ||
    song.year === 0 ||
    !song.artwork_uri ||
    !song.duration ||
    song.duration === 180 ||
    !song.bitrate ||
    !song.sample_rate ||
    !song.channels ||
    !song.file_format
  );

  const total = candidates.length;
  let processed = 0;
  let updated = 0;

  for (const song of candidates) {
    try {
      const changed = await updateExistingSong(song, song.file_uri);
      if (changed) updated++;
    } catch (error) {
      console.warn("Enrichment failed for:", song.file_uri, error);
    }

    processed++;

    if (onProgress) {
      onProgress({ processed, total, updated });
    }

    // Yield to event loop between batches
    if (processed % batchSize === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return { total, processed, updated };
}

let repairInFlight = null;

/**
 * Inspect all songs in SQLite and repair missing artist, album, and duration.
 * Uses smart filename parsing and MediaLibrary duration matching.
 * Re-runs backfillAllSongs if any songs were repaired so the Artists screen is populated.
 */
export async function repairLibraryMetadata() {
  if (repairInFlight) return repairInFlight;

  repairInFlight = (async () => {
    try {
      const songs = getAllSongs();
      if (!songs || songs.length === 0) return { repaired: 0 };

      // Check if any songs need repair
      const needsRepair = (s) =>
        !s.title ||
        looksLikeUri(s.title) ||
        !s.artist ||
        s.artist === "Unknown Artist" ||
        s.artist === "Unknown" ||
        !s.album ||
        s.album === "Unknown Album" ||
        s.album === "Unknown" ||
        !s.duration ||
        s.duration <= 0 ||
        s.duration === 180;

      const candidates = songs.filter(needsRepair);

      if (candidates.length === 0) return { repaired: 0 };

      // Query MediaLibrary for durations (indexed by Android MediaStore)
      const durationMap = new Map();
      const isExpoGo = Constants.appOwnership === "expo";
      try {
        const perm = isExpoGo
          ? { granted: false }
          : await MediaLibrary.getPermissionsAsync(false, ["audio"]);
        if (perm?.granted) {
          let after = undefined;
          let hasNext = true;
          let pages = 0;
          while (hasNext && pages < 10) {
            const page = await MediaLibrary.getAssetsAsync({
              mediaType: MediaLibrary.MediaType.audio,
              first: 100,
              after,
            });
            for (const asset of page.assets) {
              if (asset.duration && asset.duration > 0) {
                const durSec = Math.round(asset.duration);
                durationMap.set(asset.filename.toLowerCase(), durSec);
                if (asset.uri) durationMap.set(asset.uri, durSec);
              }
            }
            hasNext = page.hasNextPage;
            after = page.endCursor;
            pages++;
          }
        }
      } catch (err) {
        console.warn("MediaLibrary duration fetch failed:", err);
      }

      let repaired = 0;
      db.execSync("BEGIN TRANSACTION");
      try {
        for (const song of candidates) {
          const filename = getFilenameFromUri(song.file_uri) || song.title || "";
          const parsed = parseMetadataFromFilename(filename, song.file_uri);

          const updates = {};
          const isBadTitle = !song.title || looksLikeUri(song.title);
          const isBadArtist = !song.artist || song.artist === "Unknown Artist" || song.artist === "Unknown";
          const isBadAlbum = !song.album || song.album === "Unknown Album" || song.album === "Unknown";
          const isBadDuration = !song.duration || song.duration <= 0 || song.duration === 180;

          if (isBadTitle && parsed.title && !looksLikeUri(parsed.title)) {
            updates.title = parsed.title;
          }
          if (isBadArtist && parsed.artist && parsed.artist !== "Unknown Artist") {
            updates.artist = parsed.artist;
            if (!updates.title && parsed.title && parsed.title !== song.title && !looksLikeUri(parsed.title)) {
              updates.title = parsed.title;
            }
          }
          if (isBadAlbum) {
            updates.album = parsed.album || "Single";
          }
          if (isBadDuration) {
            const foundDur =
              durationMap.get(filename.toLowerCase()) ||
              durationMap.get(song.file_uri);
            if (foundDur && foundDur > 0) {
              updates.duration = foundDur;
            }
          }

          if (Object.keys(updates).length > 0) {
            updateSong(song.id, updates);
            repaired++;
          }
        }
        db.execSync("COMMIT");
      } catch (err) {
        db.execSync("ROLLBACK");
        console.error("Failed to commit repairLibraryMetadata:", err);
      }

      const candidateIds = new Set(candidates.map((s) => s.id));
      const remaining = getAllSongs().filter((s) => {
        const badDur = !s.duration || s.duration <= 0 || s.duration === 180;
        return badDur || (candidateIds.has(s.id) && !s.artwork_uri);
      });
      let probed = 0;
      for (const song of remaining) {
        try {
          const changed = await updateExistingSong(song, song.file_uri);
          if (changed) repaired++;
        } catch (error) {
          console.warn("Repair probe failed for:", song.file_uri, error);
        }
        probed++;
        if (probed % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      if (repaired > 0) {
        console.log(`Repaired ${repaired} songs in SQLite library with real artist/album/duration/artwork.`);
        try {
          db.runSync("DELETE FROM app_settings WHERE key = 'artist_backfill_done'");
          await backfillAllSongs();
        } catch (e) {
          console.warn("Re-backfill after repair failed:", e);
        }
        notifyArtistsChanged();
      }

      return { repaired };
    } finally {
      repairInFlight = null;
    }
  })();

  return repairInFlight;
}

export default { importAudioFiles, importMusicFromSavedFolder, enrichExistingSongs, buildSongFromUri, repairLibraryMetadata };