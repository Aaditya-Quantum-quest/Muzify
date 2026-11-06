import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { getArtwork } from "./audioMetadata";
import { findFolderCover, readJsArtwork } from "./jsTagReader";

/**
 * Artwork cache directory - uses app's cache directory which persists across restarts.
 * For truly permanent storage, we could use documentDirectory, but cacheDirectory
 * is sufficient for artwork since it can be re-extracted if needed.
 */
const ARTWORK_CACHE_DIR = FileSystem.cacheDirectory + "artwork/";

/**
 * Ensure the artwork cache directory exists.
 */
async function ensureArtworkDir() {
  const info = await FileSystem.getInfoAsync(ARTWORK_CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ARTWORK_CACHE_DIR, { intermediates: true });
  }
}

/**
 * Generate a deterministic cache key from a content URI.
 * Uses a simple hash to avoid filename collisions and keep paths safe.
 */
function artworkCacheKey(contentUri) {
  let hash = 0;
  for (let i = 0; i < contentUri.length; i++) {
    hash = ((hash << 5) - hash) + contentUri.charCodeAt(i);
    hash |= 0; // 32-bit integer
  }
  return `art_${Math.abs(hash)}.jpg`;
}

/**
 * Get or extract and cache artwork for an audio file.
 * Returns a local file:// URI that can be stored in SQLite and displayed by the UI.
 */
export async function getCachedArtwork(contentUri) {
  if (Platform.OS !== "android") {
    return null;
  }

  await ensureArtworkDir();

  const cacheKey = artworkCacheKey(contentUri);
  const localUri = ARTWORK_CACHE_DIR + cacheKey;

  // Check if already cached
  const info = await FileSystem.getInfoAsync(localUri);
  if (info.exists) {
    return localUri;
  }

  const writeDataUri = async (dataUri) => {
    const base64 = dataUri.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    await FileSystem.writeAsStringAsync(localUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return localUri;
  };

  const dataUri = await getArtwork(contentUri);
  if (dataUri) {
    try {
      return await writeDataUri(dataUri);
    } catch (error) {
      console.warn("Failed to cache artwork:", error);
    }
  }

  const folderCover = await findFolderCover(contentUri);
  if (folderCover) {
    try {
      await FileSystem.copyAsync({ from: folderCover, to: localUri });
      const copied = await FileSystem.getInfoAsync(localUri);
      if (copied.exists) return localUri;
    } catch (error) {
      console.warn("Failed to cache folder cover:", error);
    }
  }

  const jsArt = await readJsArtwork(contentUri);
  if (jsArt) {
    try {
      return await writeDataUri(jsArt);
    } catch (error) {
      console.warn("Failed to cache JS artwork:", error);
    }
  }

  return null;
}

/**
 * Clear all cached artwork (for debugging or storage management).
 */
export async function clearArtworkCache() {
  try {
    await FileSystem.deleteAsync(ARTWORK_CACHE_DIR, { idempotent: true });
  } catch (error) {
    console.warn("Failed to clear artwork cache:", error);
  }
}

export default { getCachedArtwork, clearArtworkCache };
