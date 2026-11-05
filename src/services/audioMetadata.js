import { NativeModules, Platform } from "react-native";
import { updateSong } from "../databases/queries/song.js";

const { AudioMetadata } = NativeModules;

// Bitrate from MediaMetadataRetriever is in bits/sec; convert to kbps.
const BITRATE_DIVISOR = 1000;

/**
 * Extract text metadata from an audio file via SAF content URI.
 * Uses MediaMetadataRetriever.setDataSource(context, Uri) so content:// URIs
 * from the folder picker work without resolving them to a filesystem path.
 */
export async function getMetadata(contentUri) {
  if (Platform.OS !== "android") {
    return {};
  }

  if (!AudioMetadata) {
    console.warn("AudioMetadata native module not available - rebuilding dev client required");
    return {};
  }

  try {
    const result = await AudioMetadata.getMetadata(contentUri);
    return result || {};
  } catch (error) {
    console.warn("Metadata extraction failed:", error);
    return {};
  }
}

/**
 * Extract embedded album artwork as a base64 JPEG data URI.
 * Returns null when the file has no embedded picture.
 */
export async function getArtwork(contentUri) {
  if (Platform.OS !== "android") {
    return null;
  }

  if (!AudioMetadata) {
    console.warn("AudioMetadata native module not available - rebuilding dev client required");
    return null;
  }

  try {
    return await AudioMetadata.getArtwork(contentUri);
  } catch (error) {
    console.warn("Artwork extraction failed:", error);
    return null;
  }
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
    console.warn("AudioMetadata native module not available - rebuilding dev client required");
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