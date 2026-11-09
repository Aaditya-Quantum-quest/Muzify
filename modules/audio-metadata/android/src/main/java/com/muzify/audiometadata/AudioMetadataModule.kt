package com.muzify.audiometadata

import android.content.ContentResolver
import android.net.Uri
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableMapKeySetIterator
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import org.jaudiotagger.audio.AudioFile
import org.jaudiotagger.audio.AudioFileIO
import org.jaudiotagger.tag.FieldKey
import org.jaudiotagger.tag.Tag
import org.jaudiotagger.tag.images.Artwork
import org.jaudiotagger.tag.images.ArtworkFactory

/**
 * Native Android metadata extractor + writer.
 *
 * Read path uses MediaMetadataRetriever (read-only, SAF-safe via content:// URIs).
 * Write path uses Jaudiotagger on a temporary cache copy of the original file,
 * then streams the modified bytes back to the original content URI so the
 * original file is never opened directly for writing and is never left partial.
 *
 * Jaudiotagger supported formats: MP3 (ID3v2), M4A/AAC (MP4), FLAC, OGG, OPUS.
 * WAV/AIFF are explicitly unsupported (no standard tag container).
 */
@ReactModule(name = AudioMetadataModule.NAME)
class AudioMetadataModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "AudioMetadata"
    private const val TAG = "MuzifyAudioMetadata"

    // Formats Jaudiotagger can actually read/write (verified against 3.0.1 jar).
    // WAV / AIFF deliberately excluded: no standard tag frame container.
    private val SUPPORTED_EXTENSIONS = listOf("mp3", "m4a", "aac", "flac", "ogg", "opus")

    private const val TEMP_DIR_NAME = "muzify_tag_edit"
  }

  override fun getName(): String = NAME

  // ───── READ PATH (unchanged, preserved) ─────

  @ReactMethod
  fun getMetadata(contentUri: String, promise: Promise) {
    val retriever = android.media.MediaMetadataRetriever()
    try {
      retriever.setDataSource(reactApplicationContext, Uri.parse(contentUri))

      val result = Arguments.createMap()

      putIfBlank(result, "title",
        retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_TITLE))
      putIfBlank(result, "artist",
        retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_ARTIST))
      putIfBlank(result, "album",
        retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_ALBUM))
      putIfBlank(result, "album_artist",
        retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST))
      putIfBlank(result, "composer",
        retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_COMPOSER))
      putIfBlank(result, "genre",
        retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_GENRE))
      putIfBlank(result, "year",
        retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_YEAR))

      retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER)
        ?.takeIf { it.isNotBlank() }?.let { raw ->
          val track = raw.split('/', limit = 2)[0].trim().toDoubleOrNull() ?: 0.0
          result.putDouble("track_number", track)
        }

      retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)
        ?.takeIf { it.isNotBlank() }?.let {
          result.putDouble("duration", it.toDoubleOrNull() ?: 0.0)
        }

      promise.resolve(result)
    } catch (e: IllegalArgumentException) {
      promise.reject("INVALID_FILE", "Invalid file or unsupported format: ${e.message}")
    } catch (e: SecurityException) {
      promise.reject("PERMISSION_DENIED", "Permission denied: ${e.message}")
    } catch (e: Exception) {
      Log.w(TAG, "getMetadata failed", e)
      promise.reject("ERROR", "Error getting metadata: ${e.message}")
    } finally {
      try { retriever.release() } catch (e: Exception) { Log.w(TAG, "release error", e) }
    }
  }

  @ReactMethod
  fun getArtwork(contentUri: String, promise: Promise) {
    val retriever = android.media.MediaMetadataRetriever()
    try {
      retriever.setDataSource(reactApplicationContext, Uri.parse(contentUri))

      val embedded = retriever.embeddedPicture
      if (embedded == null || embedded.isEmpty()) {
        promise.resolve(null)
        return
      }

      val bitmap = android.graphics.BitmapFactory.decodeByteArray(embedded, 0, embedded.size)
        ?: run { promise.resolve(null); return }

      val scaled = downscaleToMax(bitmap, 512)
      val out = java.io.ByteArrayOutputStream()
      scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 80, out)
      val bytes = out.toByteArray()
      scaled.recycle()
      if (scaled != bitmap) bitmap.recycle()

      val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
      promise.resolve("data:image/jpeg;base64,$b64")
    } catch (e: IllegalArgumentException) {
      promise.reject("INVALID_FILE", "Invalid file or unsupported format: ${e.message}")
    } catch (e: SecurityException) {
      promise.reject("PERMISSION_DENIED", "Permission denied: ${e.message}")
    } catch (e: Exception) {
      Log.w(TAG, "getArtwork failed", e)
      promise.reject("ERROR", "Error getting artwork: ${e.message}")
    } finally {
      try { retriever.release() } catch (e: Exception) { Log.w(TAG, "release error", e) }
    }
  }

  /**
   * Extract raw audio stream properties (bitrate, sample rate, channel count).
   * MediaExtractor exposes the actual MediaFormat of each track.
   */
  @ReactMethod
  fun getAudioProperties(contentUri: String, promise: Promise) {
    val result = Arguments.createMap()

    val retriever = android.media.MediaMetadataRetriever()
    try {
      retriever.setDataSource(reactApplicationContext, Uri.parse(contentUri))

      retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_BITRATE)
        ?.takeIf { it.isNotBlank() }
        ?.let {
          val bps = it.toDoubleOrNull() ?: 0.0
          if (bps > 0) result.putDouble("bitrate", bps / 1000.0)
        }

      retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_MIMETYPE)
        ?.let { if (it.isNotBlank()) result.putString("mimeType", it) }

      val extractor = android.media.MediaExtractor()
      var pfd: android.os.ParcelFileDescriptor? = null
      try {
        val uri = Uri.parse(contentUri)
        pfd = reactApplicationContext.contentResolver.openFileDescriptor(uri, "r")
        if (pfd != null) {
          extractor.setDataSource(pfd.fileDescriptor)
        } else {
          val headers: MutableMap<String, String> = mutableMapOf()
          extractor.setDataSource(reactApplicationContext, uri, headers)
        }
        for (i in 0 until extractor.trackCount) {
          val format = extractor.getTrackFormat(i)
          if (format.containsKey(android.media.MediaFormat.KEY_MIME)) {
            val mime = format.getString(android.media.MediaFormat.KEY_MIME) ?: continue
            if (!mime.startsWith("audio/")) continue
            result.putString("mimeType", mime)
            if (format.containsKey(android.media.MediaFormat.KEY_SAMPLE_RATE)) {
              val sampleRate = format.getInteger(android.media.MediaFormat.KEY_SAMPLE_RATE)
              if (sampleRate > 0) result.putDouble("sampleRate", sampleRate.toDouble())
            }
            if (format.containsKey(android.media.MediaFormat.KEY_CHANNEL_COUNT)) {
              val channels = format.getInteger(android.media.MediaFormat.KEY_CHANNEL_COUNT)
              if (channels > 0) result.putDouble("channels", channels.toDouble())
            }
            if (format.containsKey(android.media.MediaFormat.KEY_BIT_RATE)) {
              val bps = format.getInteger(android.media.MediaFormat.KEY_BIT_RATE)
              if (bps > 0) result.putDouble("bitrate", bps / 1000.0)
            }
            break
          }
        }
      } catch (e: Exception) {
        Log.w(TAG, "MediaExtractor failed for $contentUri", e)
      } finally {
        try { pfd?.close() } catch (e: Exception) { Log.w(TAG, "pfd close error", e) }
        try { extractor.release() } catch (e: Exception) { Log.w(TAG, "extractor release error", e) }
      }

      if (!result.hasKey("mimeType")) {
        val uri = Uri.parse(contentUri)
        val fromResolver = reactApplicationContext.contentResolver.getType(uri)
        val extension = android.webkit.MimeTypeMap.getFileExtensionFromUrl(contentUri)
          ?.lowercase()
          ?: uri.lastPathSegment?.substringAfterLast('.', "")?.lowercase().orEmpty()
        val fromExtension = if (extension.isNotEmpty()) {
          android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension)
        } else {
          null
        }
        val type = fromResolver ?: fromExtension
        if (!type.isNullOrBlank()) result.putString("mimeType", type)
      }

      promise.resolve(result)
    } catch (e: IllegalArgumentException) {
      promise.reject("INVALID_FILE", "Invalid file or unsupported format: ${e.message}")
    } catch (e: SecurityException) {
      promise.reject("PERMISSION_DENIED", "Permission denied: ${e.message}")
    } catch (e: Exception) {
      Log.w(TAG, "getAudioProperties failed", e)
      promise.reject("ERROR", "Error getting audio properties: ${e.message}")
    } finally {
      try { retriever.release() } catch (e: Exception) { Log.w(TAG, "release error", e) }
    }
  }

  // ───── WRITE PATH (new) ─────

  /**
   * Write embedded metadata to an audio file identified by a content:// URI.
   *
   * Safety contract:
   *   1. Original file is copied to a cache-dir temp file (never modified directly).
   *   2. Jaudiotagger modifies the temp file in place.
   *   3. Temp file is re-read and validated before touching the original.
   *   4. Only after validation succeeds are modified bytes streamed back to the
   *      original content URI.
   *   5. Any failure leaves the original file byte-identical; temp file is deleted.
   */
  @ReactMethod
  fun writeMetadata(contentUri: String, fields: ReadableMap, promise: Promise) {
    val uri = Uri.parse(contentUri)
    val resolver: ContentResolver = reactApplicationContext.contentResolver

    // Only content:// URIs are supported (SAF URIs from the folder picker).
    if (uri.scheme != "content") {
      promise.reject("UNSUPPORTED_URI", "Only content:// URIs are supported for tag writing.")
      return
    }

    // Stage 1: stage original file to cache temp copy (original untouched).
    val tempFile = copyOriginalToTemp(resolver, uri) ?: run {
      promise.reject("STAGE_FAILED", "Could not stage original file for editing.")
      return
    }

    var audioFile: AudioFile? = null

    try {
      // Stage 2: modify metadata on the temp copy.
      audioFile = AudioFileIO.read(tempFile)

      val tag = audioFile.tag ?: audioFile.createDefaultTag()
      var changed = false

      val iterator = fields.keySetIterator()
      while (iterator.hasNextKey()) {
        val key = iterator.nextKey()
        val value = fields.getString(key)

        when (key) {
          "title" -> { if (setField(tag, FieldKey.TITLE, value)) changed = true }
          "artist" -> { if (setField(tag, FieldKey.ARTIST, value)) changed = true }
          "album" -> { if (setField(tag, FieldKey.ALBUM, value)) changed = true }
          "album_artist" -> { if (setField(tag, FieldKey.ALBUM_ARTIST, value)) changed = true }
          "composer" -> { if (setField(tag, FieldKey.COMPOSER, value)) changed = true }
          "genre" -> { if (setField(tag, FieldKey.GENRE, value)) changed = true }
          "year" -> {
            if (value != null && value.isNotBlank() && value.toIntOrNull() != null) {
              tag.setField(FieldKey.YEAR, value)
              changed = true
            }
          }
          "track_number" -> {
            if (value != null && value.isNotBlank() && value.toIntOrNull() != null) {
              tag.setField(FieldKey.TRACK, value)
              changed = true
            }
          }
          "comments" -> { if (setField(tag, FieldKey.COMMENT, value)) changed = true }
          "artwork" -> {
            // base64 data URI; null/empty = leave as-is (clear not supported safely yet).
            if (value != null && value.isNotBlank() && value.startsWith("data:")) {
              val comma = value.indexOf(',')
              if (comma > 0) {
                val mime = value.substring(5, comma)
                val b64 = value.substring(comma + 1)
                val bytes = Base64.decode(b64, Base64.DEFAULT)
                val artwork = ArtworkFactory.getNew()
                artwork.binaryData = bytes
                artwork.mimeType = mime
                artwork.pictureType = 3
                tag.setField(artwork)
                changed = true
              }
            }
          }
        }
      }

      if (!changed) {
        promise.reject("NOTHING_TO_WRITE", "No metadata fields were provided to write.")
        return
      }

      // Stage 3: validate by re-reading the temp file.
      AudioFileIO.write(audioFile)

      val validated = AudioFileIO.read(tempFile)
      val writtenTag = validated.tag
      if (writtenTag == null) {
        promise.reject("VALIDATION_FAILED", "Modified file contains no tag after write.")
        return
      }

      Log.i(TAG, "Metadata written and validated on temp file: ${tempFile.absolutePath}")

      // Stage 4: capture validated bytes, then stream back to original URI.
      val modifiedBytes = tempFile.readBytes()
      writeBytesBackToUri(resolver, uri, modifiedBytes)

      val result = Arguments.createMap()
      result.putBoolean("success", true)
      result.putBoolean("artworkWritten", fields.hasKey("artwork"))
      promise.resolve(result)

    } catch (e: org.jaudiotagger.tag.TagException) {
      Log.w(TAG, "Tag write failed", e)
      promise.reject("TAG_WRITE_FAILED", "Tag write failed: ${e.message}")
    } catch (e: org.jaudiotagger.audio.exceptions.CannotReadException) {
      Log.w(TAG, "Audio file read failed", e)
      promise.reject("READ_FAILED", "Audio file read failed: ${e.message}")
    } catch (e: org.jaudiotagger.audio.exceptions.CannotWriteException) {
      Log.w(TAG, "Audio file write failed", e)
      promise.reject("WRITE_FAILED", "Audio file write failed: ${e.message}")
    } catch (e: IOException) {
      Log.w(TAG, "IO failure during tag write", e)
      promise.reject("IO_FAILED", "IO failure during tag write: ${e.message}")
    } catch (e: Exception) {
      Log.w(TAG, "writeMetadata failed", e)
      promise.reject("ERROR", "Error writing metadata: ${e.message}")
    } finally {
      // Stage 5: cleanup — always delete the temp copy.
      try { tempFile.delete() } catch (e: Exception) { Log.w(TAG, "temp file delete error", e) }
    }
  }

  /** Copy the original content URI into a cache-dir temp file (never touches the original). */
  private fun copyOriginalToTemp(resolver: ContentResolver, uri: Uri): File? {
    val cacheDir = reactApplicationContext.cacheDir
    val tempDir = File(cacheDir, TEMP_DIR_NAME)
    if (!tempDir.exists() && !tempDir.mkdirs()) {
      Log.w(TAG, "Could not create cache dir $tempDir")
      return null
    }

    val tempFile = File(tempDir, "edit_${System.currentTimeMillis()}_${uri.lastPathSegment ?: "audio"}")
    var input: InputStream? = null
    var output: FileOutputStream? = null

    return try {
      input = resolver.openInputStream(uri) ?: return null
      output = FileOutputStream(tempFile)
      copyStream(input!!, output!!)
      output!!.flush()
      tempFile
    } catch (e: Exception) {
      Log.w(TAG, "copyOriginalToTemp failed", e)
      try { tempFile.delete() } catch (ignored: Exception) {}
      null
    } finally {
      try { input?.close() } catch (ignored: Exception) {}
      try { output?.close() } catch (ignored: Exception) {}
    }
  }

  /** Stream validated modified bytes back to the original content URI (overwrite). */
  private fun writeBytesBackToUri(resolver: ContentResolver, uri: Uri, bytes: ByteArray) {
    var output: OutputStream? = null
    try {
      output = resolver.openOutputStream(uri, "w") ?: throw IOException("openOutputStream returned null for $uri")
      output.write(bytes)
      output.flush()
    } catch (e: Exception) {
      Log.w(TAG, "writeBytesBackToUri failed — original file may be untouched", e)
      throw e
    } finally {
      try { output?.close() } catch (ignored: Exception) {}
    }
  }

  private fun copyStream(input: InputStream, output: OutputStream) {
    val buffer = ByteArray(8192)
    var read: Int
    while (input.read(buffer).also { read = it } != -1) {
      output.write(buffer, 0, read)
    }
  }

  private fun setField(tag: Tag, fieldKey: FieldKey, value: String?): Boolean {
    if (value == null || value.isBlank()) return false
    tag.setField(fieldKey, value)
    return true
  }

  private fun putIfBlank(map: WritableMap, key: String, value: String?) {
    if (!value.isNullOrBlank()) map.putString(key, value)
  }

  private fun downscaleToMax(bitmap: android.graphics.Bitmap, maxSide: Int): android.graphics.Bitmap {
    val w = bitmap.width
    val h = bitmap.height
    if (w <= maxSide && h <= maxSide) return bitmap
    val ratio = maxSide.toDouble() / Math.max(w, h)
    val newW = (w * ratio).toInt().coerceAtLeast(1)
    val newH = (h * ratio).toInt().coerceAtLeast(1)
    return android.graphics.Bitmap.createScaledBitmap(bitmap, newW, newH, true).also {
      if (it != bitmap) bitmap.recycle()
    }
  }
}