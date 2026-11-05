import * as FileSystem from "expo-file-system/legacy";

import {
  saveSetting,
  getSetting,
} from "../databases/queries/settings.js";

// Key used when the folder is selected in PermissionsScreen.jsx
const MUSIC_FOLDER_URI_KEY = "music_folder_uri";
const MUSIC_FOLDER_NAME_KEY = "music_folder_name";

// SELECT AND SAVE MUSIC FOLDER
export const selectMusicFolder = async () => {
  try {
    const permission =
      await FileSystem.StorageAccessFramework
        .requestDirectoryPermissionsAsync();

    if (!permission.granted) {
      console.log("Music folder permission denied");
      return null;
    }

    const folder = {
      name: permission.directoryUri.split("/").pop(),
      uri: permission.directoryUri,
    };

    saveSetting(MUSIC_FOLDER_URI_KEY, folder.uri);
    saveSetting(MUSIC_FOLDER_NAME_KEY, folder.name);

    console.log("Music folder saved:", folder);

    return folder;
  } catch (error) {
    console.error("Folder selection failed:", error);
    throw error;
  }
};

// GET SAVED MUSIC FOLDER
export const getSavedMusicFolder = () => {
  try {
    const uri = getSetting(MUSIC_FOLDER_URI_KEY);

    if (!uri) return null;

    const name = getSetting(MUSIC_FOLDER_NAME_KEY) || "Music Folder";

    return { name, uri };
  } catch (error) {
    console.error("Failed to retrieve music folder:", error);
    return null;
  }
};
