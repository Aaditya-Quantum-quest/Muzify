import { NativeModules, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { updateSong } from "../databases/queries/song.js";
import { getFilenameFromUri } from "./folderScanner.js";
import { readTagsFromFile } from "./jsTagReader.js";

const { AudioMetadata } = NativeModules;

// Bitrate from MediaMetadataRetriever is in bits/sec; convert to kbps.
const BITRATE_DIVISOR = 1000;
const jsMetaCache = new Map();
let warnedNativeMissing = false;

function warnNativeMissingOnce() {
  if (warnedNativeMissing) return;
  warnedNativeMissing = true;
  console.warn(
    "AudioMetadata native module not available; using JS metadata fallback",
  );
}

function toArtworkDataUri(artwork) {
  if (!artwork || typeof artwork !== "string") return null;
  if (artwork.startsWith("data:")) return artwork;
  return `data:image/jpeg;base64,${artwork}`;
}

function hashUri(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

async function copySafToCache(contentUri) {
  const filename = getFilenameFromUri(contentUri) || "audio.m4a";
  const ext = filename.split(".").pop()?.toLowerCase() || "m4a";
  const dir = `${FileSystem.cacheDirectory}meta/`;
  const dest = `${dir}${hashUri(contentUri)}.${ext}`;

  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }

  const destInfo = await FileSystem.getInfoAsync(dest);
  if (destInfo.exists) return dest;

  await FileSystem.copyAsync({ from: contentUri, to: dest });
  return dest;
}

async function extractJsMetadata(contentUri) {
  if (jsMetaCache.has(contentUri)) {
    return jsMetaCache.get(contentUri);
  }

  const pending = (async () => {
    const merge = (meta) => ({
      title: meta.title || meta.name,
      artist: meta.artist,
      album: meta.album,
      album_artist: meta.album_artist || meta.albumArtist,
      year: meta.year,
      track_number: meta.track_number || meta.track,
      duration: meta.duration,
      artwork: toArtworkDataUri(meta.artwork),
    });

    try {
      const local = await readTagsFromFile(contentUri);
      if (local && (local.title || local.artist || local.artwork || local.duration)) {
        return merge(local);
      }
    } catch {
      // Fall through to the package reader / copied file.
    }

    try {
      const { getAudioMetadata } = await import("@missingcore/audio-metadata");
      const wanted = [
        "album",
        "albumArtist",
        "artist",
        "artwork",
        "name",
        "track",
        "year",
      ];
      let data;
      try {
        data = await getAudioMetadata(contentUri, wanted);
      } catch {
        const localUri = await copySafToCache(contentUri);
        const copied = await readTagsFromFile(localUri);
        if (copied && (copied.title || copied.artist || copied.artwork || copied.duration)) {
          return merge(copied);
        }
        data = await getAudioMetadata(localUri, wanted);
      }
      const meta = data?.metadata || {};
      return merge({
        title: meta.name,
        artist: meta.artist,
        album: meta.album,
        album_artist: meta.albumArtist,
        year: meta.year,
        track_number: meta.track,
        artwork: meta.artwork,
      });
    } catch (error) {
      console.warn("JS metadata extraction failed:", error);
      return {};
    }
  })();

  jsMetaCache.set(contentUri, pending);
  return pending;
}

export async function getDurationSeconds(contentUri, timeoutMs = 2500) {
  if (!contentUri) return 0;
  try {
    const { createAudioPlayer } = await import("expo-audio");
    const player = createAudioPlayer({ uri: contentUri }, { updateInterval: 80 });
    try {
      return await new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(Number.isFinite(value) && value > 0 ? value : 0);
        };
        const timer = setTimeout(() => finish(player.duration || 0), timeoutMs);
        const sub = player.addListener("playbackStatusUpdate", (status) => {
          const duration = status?.duration ?? player.duration;
          if (duration > 0) {
            clearTimeout(timer);
            try {
              sub.remove();
            } catch {
              // ignore
            }
            finish(duration);
          }
        });
      });
    } finally {
      try {
        player.remove();
      } catch {
        // ignore
      }
    }
  } catch (error) {
    console.warn("Duration probe failed:", error);
    return 0;
  }
}

/**
 * Extract text metadata from an audio file via SAF content URI.
 * Uses MediaMetadataRetriever.setDataSource(context, Uri) so content:// URIs
 * from the folder picker work without resolving them to a filesystem path.
 */
export async function getMetadata(contentUri) {
  if (Platform.OS !== "android") {
    return extractJsMetadata(contentUri);
  }

  if (!AudioMetadata) {
    warnNativeMissingOnce();
    return extractJsMetadata(contentUri);
  }

  try {
    const result = await AudioMetadata.getMetadata(contentUri);
    if (result && Object.keys(result).length > 0) {
      return result;
    }
  } catch (error) {
    console.warn("Metadata extraction failed:", error);
  }

  return extractJsMetadata(contentUri);
}

/**
 * Extract embedded album artwork as a base64 JPEG data URI.
 * Returns null when the file has no embedded picture.
 */
export async function getArtwork(contentUri) {
  if (AudioMetadata && Platform.OS === "android") {
    try {
      const nativeArt = await AudioMetadata.getArtwork(contentUri);
      if (nativeArt) return nativeArt;
    } catch (error) {
      console.warn("Artwork extraction failed:", error);
    }
  } else if (Platform.OS === "android") {
    warnNativeMissingOnce();
  }

  const jsMeta = await extractJsMetadata(contentUri);
  return jsMeta?.artwork || null;
}

/**
 * Extract raw audio stream properties (bitrate, sample rate, channel count,
 * mime type). Returns an empty object when the file exposes none.
 */
export async function getAudioProperties(contentUri) {
  if (Platform.OS !== "android") {
    return {};
  }

  if (!AudioMetadata) {
    warnNativeMissingOnce();
    return {};
  }

  try {
    const result = await AudioMetadata.getAudioProperties(contentUri);
    if (!result) return {};

    const normalized = {};
    if (result.bitrate != null) {
      normalized.bitrate = Math.round(Number(result.bitrate) / BITRATE_DIVISOR);
    }
    if (result.sampleRate != null) {
      normalized.sampleRate = Math.round(Number(result.sampleRate));
    }
    if (result.channels != null) {
      normalized.channels = Math.round(Number(result.channels));
    }
    if (result.mimeType) {
      normalized.mimeType = String(result.mimeType);
    }
    return normalized;
  } catch (error) {
    console.warn("Audio properties extraction failed:", error);
    return {};
  }
}

/**
 * Write embedded metadata to an audio file via the native AudioMetadata module.
 *
 * Safety contract:
 *   - Original file is copied to a cache temp file by the native side.
 *   - Jaudiotagger modifies the temp copy; original stays byte-identical.
 *   - Modified bytes are streamed back only after validation succeeds.
 *
 * Returns { success: boolean, artworkWritten: boolean } on success,
 * or throws an Error with a native error code/message on failure.
 */
export async function writeMetadata(contentUri, fields) {
  if (Platform.OS !== "android") {
    throw new Error("Metadata writing is not supported on iOS.");
  }

  if (!AudioMetadata || typeof AudioMetadata.writeMetadata !== "function") {
    throw new Error("AudioMetadata native module not available - rebuilding dev client required.");
  }

  try {
    const result = await AudioMetadata.writeMetadata(contentUri, fields);
    return result || { success: true };
  } catch (error) {
    // Map native error codes to clear JS errors.
    const message = error?.message || String(error);
    throw new Error(message || "Unknown error writing metadata");
  }
}

/**
 * Write metadata to an audio file and sync SQLite only after success.
 * This is the entry point used by the Edit Tags UI.
 *
 * @param {string} contentUri - content:// URI of the audio file.
 * @param {Object} fields - metadata fields to write.
 * @param {number} songId - SQLite id of the song record to update on success.
 * @returns {Promise<{success: boolean, artworkWritten?: boolean}>}
 */
export async function writeMetadataAndSync(contentUri, fields, songId) {
  const result = await writeMetadata(contentUri, fields);

  // Only sync SQLite after the native file write has been verified.
  const updates = {};
  if (fields.title !== undefined) updates.title = fields.title;
  if (fields.artist !== undefined) updates.artist = fields.artist;
  if (fields.album !== undefined) updates.album = fields.album;
  if (fields.genre !== undefined) updates.genre = fields.genre;
  if (fields.composer !== undefined) updates.composer = fields.composer;
  if (fields.year !== undefined) updates.year = fields.year ? parseInt(fields.year, 10) : 0;
  if (fields.track_number !== undefined)
    updates.track_number = fields.track_number ? parseInt(fields.track_number, 10) : 0;
  if (fields.comments !== undefined) updates.comments = fields.comments;

  if (Object.keys(updates).length > 0 && songId) {
    updateSong(songId, updates);
  }

  return result;
}

/**
 * Re-read metadata to verify a prior write actually took effect.
 * Thin wrapper over getMetadata; used by the Song Info screen after saving.
 */
export async function verifyMetadata(contentUri) {
  return getMetadata(contentUri);
}

export default { getMetadata, getArtwork, getAudioProperties, writeMetadata, writeMetadataAndSync, verifyMetadata };