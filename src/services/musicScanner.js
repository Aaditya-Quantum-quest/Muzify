
import { Platform } from "react-native";
import * as MediaLibrary from "expo-media-library/legacy";
import Constants from "expo-constants";

import {
  addSong,
  getAllSongs,
} from "../databases/queries/song";
import { onSongAdded, rebuildCollaborations } from "../services/artists/artistSync";
import { parseMetadataFromFilename } from "./folderScanner.js";

// Remove extension from filename
const getTitleFromFilename = (filename) => {
  return filename.replace(/\.[^/.]+$/, "").trim();
};

// "song.m4a" → "M4A". Returns "" when there is no usable extension.
function getFormatFromFilename(filename) {
  const ext = String(filename ?? "")
    .split("?")[0]
    .split(".")
    .pop()
    .toLowerCase();
  return ext && ext.length <= 5 ? ext.toUpperCase() : "";
}

// Request permission to access audio files
export const requestMusicPermission = async () => {
  if (Platform.OS === "web") {
    throw new Error("Music scanning is not supported on web.");
  }

  if (Constants.appOwnership === "expo") {
    return false;
  }

  const permission =
    await MediaLibrary.requestPermissionsAsync(false, ["audio"]);

  return permission.granted;
};

// Scan device for audio files
export const scanDeviceMusic = async () => {
  const hasPermission = await requestMusicPermission();

  if (!hasPermission) {
    throw new Error("Music library permission was denied.");
  }

  const existingSongs = getAllSongs();

  const existingUris = new Set(
    existingSongs.map((song) => song.file_uri)
  );

  let imported = 0;
  let skipped = 0;
  let after;

  try {
    let hasNextPage = true;

    while (hasNextPage) {
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.audio,
        first: 100,
        after,
      });

      for (const asset of result.assets) {
        if (existingUris.has(asset.uri)) {
          skipped++;
          continue;
        }

        const parsed = parseMetadataFromFilename(asset.filename, asset.uri);

        const song = {
          title: parsed.title,
          artist: parsed.artist,
          album: parsed.album,
          duration: Math.round(asset.duration || 0),
          file_uri: asset.uri,
          file_format: getFormatFromFilename(asset.filename),
          added_at: Date.now(),
          played_times: 0,
        };

        const result = addSong(song);
        song.id = result.lastInsertRowid;
        onSongAdded(song);

        existingUris.add(asset.uri);
        imported++;
      }

      hasNextPage = result.hasNextPage;
      after = result.endCursor;
    }

    // Rebuild collaboration relationships once for the whole scan.
    rebuildCollaborations();

    return {
      success: true,
      imported,
      skipped,
    };
  } catch (error) {
    console.error("Music scanning failed:", error);
    throw error;
  }
};
