import { NativeModules } from "react-native";

/**
 * Muzify native audio metadata extractor.
 *
 * Thin JS boundary over the native AudioMetadata TurboModule. The importer
 * depends on this file, never on native implementation details.
 */

const { AudioMetadata } = NativeModules;

export interface AudioMetadataResult {
  title?: string;
  artist?: string;
  album?: string;
  album_artist?: string;
  composer?: string;
  genre?: string;
  year?: string;
  track_number?: number;
  /** Duration in milliseconds, as returned by MediaMetadataRetriever. */
  duration?: number;
}

export interface ArtworkResult {
  /** data URI (base64 JPEG) or null when the file has no embedded art. */
  dataUri: string | null;
}

export interface AudioPropertiesResult {
  bitrate?: number; // kbps
  sampleRate?: number; // Hz
  channels?: number; // 1 = mono, 2 = stereo, ...
  mimeType?: string; // e.g. audio/mpeg, audio/mp4a, audio/opus
}

/**
 * Result of a tag-writing operation.
 */
export interface WriteResult {
  success: boolean;
  artworkWritten?: boolean;
}

/**
 * Metadata fields accepted by the native writeMetadata method.
 * All values are strings (the native side parses year/track as ints).
 */
export interface MetadataFields {
  title?: string;
  artist?: string;
  album?: string;
  album_artist?: string;
  composer?: string;
  genre?: string;
  year?: string;
  track_number?: string;
  comments?: string;
  artwork?: string; // base64 data URI, e.g. "data:image/jpeg;base64,..."
}

function ensureModule() {
  if (!AudioMetadata) {
    throw new Error(
      "AudioMetadata native module is not available. " +
      "Rebuild the development client (prebuild + EAS build) after adding the module."
    );
  }
  return AudioMetadata;
}

/**
 * Extract text metadata from an audio file via SAF content URI.
 * Uses MediaMetadataRetriever.setDataSource(context, Uri) so content:// URIs
 * from the folder picker work without resolving them to a filesystem path.
 */
export function getMetadata(contentUri: string): Promise<AudioMetadataResult> {
  return ensureModule().getMetadata(contentUri);
}

/**
 * Extract embedded album artwork as a base64 JPEG data URI.
 * Returns null when the file has no embedded picture.
 */
export function getArtwork(contentUri: string): Promise<string | null> {
  return ensureModule().getArtwork(contentUri);
}

/**
 * Extract raw audio stream properties (bitrate, sample rate, channel count,
 * mime type). Returns an empty object when the file exposes none.
 */
export function getAudioProperties(
  contentUri: string
): Promise<AudioPropertiesResult> {
  return ensureModule().getAudioProperties(contentUri);
}

/**
 * Write embedded metadata to an audio file via SAF content URI.
 *
 * Safety contract (native side):
 *   - Original file is copied to a cache-dir temp file (never modified directly).
 *   - Jaudiotagger modifies the temp copy; original stays byte-identical.
 *   - Modified bytes are streamed back only after validation succeeds.
 *   - Any failure leaves the original file untouched; temp file is deleted.
 *
 * Throws an Error with a native error code/message on failure.
 */
export function writeMetadata(
  contentUri: string,
  fields: MetadataFields
): Promise<WriteResult> {
  return ensureModule().writeMetadata(contentUri, fields);
}

export default {
  getMetadata,
  getArtwork,
  getAudioProperties,
  writeMetadata,
};