import { writeMetadata } from "./audioMetadata";
import { updateSong } from "../databases/queries/song.js";

/**
 * Write metadata to an audio file and sync SQLite only after success.
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
  if (fields.track_number !== undefined) updates.track_number = fields.track_number ? parseInt(fields.track_number, 10) : 0;
  if (fields.comments !== undefined) updates.comments = fields.comments;

  if (Object.keys(updates).length > 0 && songId) {
    updateSong(songId, updates);
  }

  return result;
}

export default { writeMetadataAndSync };