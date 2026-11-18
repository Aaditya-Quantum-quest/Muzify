import * as FileSystem from "expo-file-system/legacy";

// Formats Android's MediaExtractor can actually decode, so anything imported
// here is playable. (WMA/APE are intentionally absent — the OS cannot decode
// them, and importing them would only add unplayable rows.)
const AUDIO_EXTENSIONS = [
  ".mp3",
  ".m4a",
  ".m4b",
  ".aac",
  ".wav",
  ".flac",
  ".ogg",
  ".oga",
  ".opus",
  ".mka",
  ".amr",
  ".3gp",
  ".aif",
  ".aiff",
];

// Check whether a URI is likely a directory (folder) by probing
const isLikelyDirectory = async (uri) => {
  try {
    await FileSystem.StorageAccessFramework.readDirectoryAsync(uri);
    return true;
  } catch {
    return false;
  };
};

// A document id is percent-encoded (`...%2Ftf%2Fsong.m4a`), so the last "/"
// segment has to be decoded before its extension can be compared. decodeURIComponent
// throws URIError on a malformed escape — a literal "%" in a song title such as
// "100% Sure.m4a" — which would reject the whole scan and silently import
// nothing. Fall back to the raw segment instead: the extension still reads
// correctly in every real SAF URI, because the provider leaves the trailing
// `.m4a` unescaped.
const decodeSegment = (uri, stats) => {
  const segment = uri.split("/").pop() || "";
  try {
    return decodeURIComponent(segment);
  } catch {
    stats.decodeFailures += 1;
    return segment;
  }
};

// ".m4a" for an audio file, "" for a name with no usable extension. Only the
// display name matters here, so a dot inside a title ("Song 2.0") must not be
// mistaken for an extension.
const extensionOf = (name) => {
  const match = name.match(/\.[a-z0-9]{2,5}$/);
  return match ? match[0] : "";
};

// Counters behind the scan summary. `skipped` maps the extension of every
// entry that looked like a file but was not imported, which is what reveals a
// library smaller than the folder actually holds.
function createScanStats() {
  return {
    dirs: 0,
    unreadableDirs: 0,
    decodeFailures: 0,
    audio: 0,
    skipped: new Map(),
  };
}

function recordSkipped(stats, entryUri, name) {
  const ext = extensionOf(name);
  const key = ext || "(no extension)";
  const bucket = stats.skipped.get(key) || { count: 0, samples: [] };
  bucket.count += 1;
  if (bucket.samples.length < 2) {
    const short = getFilenameFromUri(entryUri) || name;
    bucket.samples.push(short.length > 48 ? `${short.slice(0, 48)}…` : short);
  }
  stats.skipped.set(key, bucket);
}

const scanDirectoryRecursive = async (folderUri, audioUris, stats) => {
  let entries;
  try {
    entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(
      folderUri
    );
  } catch (error) {
    stats.unreadableDirs += 1;
    if (stats.unreadableDirs <= 3) {
      console.warn(`Skipping inaccessible folder ${folderUri}:`, error.message);
    }
    return;
  }

  stats.dirs += 1;

  for (const entryUri of entries) {
    const filename = decodeSegment(entryUri, stats).toLowerCase();
    const ext = extensionOf(filename);

    if (AUDIO_EXTENSIONS.includes(ext)) {
      audioUris.push(entryUri);
      stats.audio += 1;
    } else if ((await isLikelyDirectory(entryUri))) {
      await scanDirectoryRecursive(entryUri, audioUris, stats);
    } else {
      recordSkipped(stats, entryUri, filename);
    }
  }
};

// One compact line plus the top skipped extensions, so a 1000-file folder
// produces a readable diagnosis instead of dumping every URI.
function logScanSummary(stats, found, uniqueFiles) {
  console.log(
    `[scan] dirs=${stats.dirs} unreadable=${stats.unreadableDirs} ` +
      `decodeFailures=${stats.decodeFailures} audio=${found} ` +
      `unique=${uniqueFiles} dupes=${found - uniqueFiles}`
  );

  const skipped = [...stats.skipped]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([ext, bucket]) => `${bucket.count}x ${ext} e.g. ${bucket.samples.join(" | ")}`);

  if (skipped.length > 0) {
    console.log(`[scan] files not imported:\n       ${skipped.join("\n       ")}`);
  }
}

export const scanSelectedFolder = async (folderUri) => {
  if (!folderUri) {
    throw new Error("No music folder selected.");
  }

  const stats = createScanStats();
  const audioFiles = [];
  await scanDirectoryRecursive(folderUri, audioFiles, stats);

  // A document tree can expose the same file through more than one path, and
  // the walk above has no visited set. Dedupe by URI: `songs.file_uri` is
  // UNIQUE, so importing one file twice would fail the second insert.
  const uniqueFiles = [...new Set(audioFiles)];

  if (__DEV__) logScanSummary(stats, audioFiles.length, uniqueFiles.length);

  return uniqueFiles;
};

export const looksLikeUri = (value = "") => {
  const text = String(value);
  return (
    /^content:\/\//i.test(text) ||
    /^file:\/\//i.test(text) ||
    text.includes("primary:") ||
    text.includes("com.android")
  );
};

export const getFilenameFromUri = (fileUri) => {
  if (!fileUri) return "";

  let decoded = String(fileUri);
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep the raw value when it is not URI-encoded
  }

  const withoutQuery = decoded.split("?")[0];
  const lastSegment = withoutQuery.split(/[\\/]/).pop() || "";
  const afterColon = lastSegment.includes(":")
    ? lastSegment.split(":").pop()
    : lastSegment;

  return afterColon.split(/[\\/]/).pop() || lastSegment;
};

// Clean filename and remove extension / encoding suffixes
export const cleanSongTitle = (filename) => {
  let title = filename;

  // Remove audio extension
  title = title.replace(/\.[^/.]+$/, "");

  // Remove technical suffixes such as (M4A_128K), (MP3_320K)
  title = title.replace(
    /\s*[\[(](?:M4A|MP3|AAC|WAV|FLAC|OGG|OPUS)[^\])]*[\])]\s*$/i,
    ""
  );

  // Clean unwanted separators
  title = title
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s._-]+|[\s._-]+$/g, "")
    .trim();

  return title || "Unknown Title";
};

/**
 * Smart metadata parser from audio filename and folder path.
 * Handles "Artist - Title", "Title - Artist", track numbers, clutter suffixes.
 *
 * @param {string} filename - Filename, e.g. "NEFFEX - Fight Back (Lyrics Lyric Video).m4a"
 * @param {string} fileUri - Full content:// or file:// URI
 * @returns {{ title: string, artist: string, album: string }}
 */
export const parseMetadataFromFilename = (filename, fileUri = "") => {
  const source = looksLikeUri(filename)
    ? getFilenameFromUri(filename)
    : filename;
  const uri = fileUri || (looksLikeUri(filename) ? filename : "");

  if (!source) {
    return { title: "Unknown Title", artist: "Unknown Artist", album: "Single" };
  }

  let clean = source
    .replace(/\.[a-zA-Z0-9]{2,5}$/, "") // remove audio extension
    .replace(/[_]+/g, " ")             // replace underscores with spaces
    .replace(/\s+/g, " ")              // collapse spaces
    .trim();

  // Strip common video & audio junk suffixes
  clean = clean.replace(
    /\s*[\(\[](?:official\s+(?:music\s+)?video|official\s+audio|official\s+hd|lyric\s+video|lyrics\s+lyric\s+video|lyrics|audio|visualizer|full\s+song|hd|4k|hq|remastered|video)[^\)\]]*[\)\]]/gi,
    ""
  ).trim();

  // Strip technical audio bitrate tags like (M4A 128K), [320kbps], etc.
  clean = clean.replace(
    /\s*[\[(](?:M4A|MP3|AAC|WAV|FLAC|OGG|OPUS)[^\])]*[\])]\s*$/gi,
    ""
  ).trim();

  // Strip trailing punctuation & leading track numbers like "01. ", "01 - "
  clean = clean.replace(/^[-\s._]+|[-\s._]+$/g, "").trim();
  clean = clean.replace(/^\d+[\.\-\s]+\s*/, "").trim();

  let artist = "Unknown Artist";
  let title = clean;

  // Check for common artist - title separators: " - ", " – ", " — "
  const sepMatch = clean.match(/\s+[-–—]\s+/);
  if (sepMatch) {
    const idx = sepMatch.index;
    const left = clean.slice(0, idx).trim();
    const right = clean.slice(idx + sepMatch[0].length).trim();

    if (left && right) {
      // Check if right side looks more like artist (e.g. contains "feat", "ft", "x", etc.)
      const featRegex = /\b(?:feat\.?|ft\.?|featuring|prod\.?|x|X|vs\.?)\b/;
      if (featRegex.test(right) && !featRegex.test(left)) {
        artist = right;
        title = left;
      } else {
        artist = left;
        title = right;
      }
    }
  }

  // Infer album from parent folder if available
  let album = "Single";
  if (uri) {
    let decodedUri = uri;
    try {
      decodedUri = decodeURIComponent(uri);
    } catch {
      decodedUri = uri;
    }
    const parts = decodedUri.split(/[\\/]/);
    if (parts.length >= 2) {
      const folder = parts[parts.length - 2];
      const ignoredFolders = [
        "music",
        "download",
        "downloads",
        "audio",
        "storage",
        "emulated",
        "0",
        "documents",
        "primary",
      ];
      if (folder && !ignoredFolders.includes(folder.toLowerCase())) {
        album = folder.replace(/[_]+/g, " ").trim();
      }
    }
  }

  return {
    title: title || clean || "Unknown Title",
    artist: artist || "Unknown Artist",
    album: album || "Single",
  };
};