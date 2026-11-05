import * as FileSystem from "expo-file-system/legacy";

const AUDIO_EXTENSIONS = [
  ".mp3",
  ".m4a",
  ".aac",
  ".wav",
  ".flac",
  ".ogg",
  ".opus",
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

const scanDirectoryRecursive = async (folderUri, audioUris) => {
  let entries;
  try {
    entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(
      folderUri
    );
  } catch (error) {
    console.warn(`Skipping inaccessible folder ${folderUri}:`, error.message);
    return;
  }

  for (const entryUri of entries) {
    const filename = decodeURIComponent(entryUri.split("/").pop() || "")
      .toLowerCase();

    if (AUDIO_EXTENSIONS.some((ext) => filename.endsWith(ext))) {
      audioUris.push(entryUri);
    } else if ((await isLikelyDirectory(entryUri))) {
      await scanDirectoryRecursive(entryUri, audioUris);
    }
  }
};

export const scanSelectedFolder = async (folderUri) => {
  if (!folderUri) {
    throw new Error("No music folder selected.");
  }

  const audioFiles = [];
  await scanDirectoryRecursive(folderUri, audioFiles);

  console.log("Audio files found:", audioFiles.length);
  console.log("Audio files:", audioFiles);

  return audioFiles;
};

// Utility functions exported for use by musicImporter.js
export const getFilenameFromUri = (fileUri) => {
  const lastSegment = fileUri.split("/").pop() || "";

  const decoded = decodeURIComponent(lastSegment);

  // SAF may encode the entire storage path in one URI segment
  return decoded.split(/[\\/]/).pop() || "";
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
  if (!filename) {
    return { title: "Unknown Title", artist: "Unknown Artist", album: "Single" };
  }

  let clean = filename
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
  if (fileUri) {
    const parts = decodeURIComponent(fileUri).split(/[\\/]/);
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