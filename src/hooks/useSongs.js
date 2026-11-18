import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";

import {
  getSongsFiltered,
  addSong as insertSong,
  updateSong as updateSongQuery,
  deleteSong as deleteSongQuery,
} from "../databases/queries/song.js";
import { syncSongUpdated, syncSongDeleted } from "../services/artists/artistSync.js";

import { importMusicFromSavedFolder, enrichExistingSongs, syncSavedFolder } from "../services/musicImporter.js";

// SQLite hands back fresh row objects on every query. Keeping the previous
// array when nothing actually changed stops every memoized list/row from
// re-rendering on focus refreshes and on the 3s poll during a scan.
const rowEqual = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (a[key] !== b[key]) return false;
  }
  return true;
};

const listsEqual = (prev, next) => {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < next.length; i += 1) {
    if (!rowEqual(prev[i], next[i])) return false;
  }
  return true;
};

/**
 * Read the song library.
 *
 * Every row is returned in one array, in the requested order.
 */
export const useSongs = ({ search = "", sort = 0 } = {}) => {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalSongs, setTotalSongs] = useState(0);

  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  // Enrichment state
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(null);

  const requestIdRef = useRef(0);

  const refreshSongs = useCallback(() => {
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);

    try {
      const data = getSongsFiltered(search, sort);

      if (requestId !== requestIdRef.current) return;

      setSongs((prev) => (listsEqual(prev, data) ? prev : data));
      setTotalSongs(data.length);
    } catch (err) {
      console.error("Failed to load songs:", err);
      setError(err);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [search, sort]);

  // SCAN AND IMPORT
  const scanAndImport = useCallback(async () => {
    setScanning(true);
    setError(null);

    try {
      const result = await importMusicFromSavedFolder();

      setScanResult(result);
      refreshSongs();

      return result;
    } catch (err) {
      console.error("Scan and import failed:", err);
      setError(err);
      throw err;
    } finally {
      setScanning(false);
    }
  }, [refreshSongs]);

  // Re-list the saved folder and import only files missing from SQLite. Cheap
  // enough to run on focus, unlike the full import above.
  const syncLibrary = useCallback(async () => {
    setScanning(true);
    setError(null);

    try {
      const result = await syncSavedFolder();

      setScanResult(result);
      refreshSongs();

      return result;
    } catch (err) {
      console.error("Library sync failed:", err);
      setError(err);
      throw err;
    } finally {
      setScanning(false);
    }
  }, [refreshSongs]);

  // ENRICH EXISTING SONGS
  const enrichSongs = useCallback(async (options = {}) => {
    setEnriching(true);
    setEnrichProgress({ processed: 0, total: 0, updated: 0 });
    setError(null);

    try {
      const result = await enrichExistingSongs({
        batchSize: options.batchSize ?? 20,
        onProgress: (progress) => {
          setEnrichProgress(progress);
        },
      });

      if (result.updated > 0) {
        refreshSongs();
      }

      return result;
    } catch (err) {
      console.error("Enrichment failed:", err);
      setError(err);
      throw err;
    } finally {
      setEnriching(false);
      setEnrichProgress(null);
    }
  }, [refreshSongs]);

  // ADD SONG
  const addSong = useCallback(
    (song) => {
      try {
        const result = insertSong(song);
        refreshSongs();
        return result;
      } catch (err) {
        setError(err);
        throw err;
      }
    },
    [refreshSongs]
  );

  // UPDATE SONG
  const updateSong = useCallback(
    (id, updates) => {
      try {
        const result = updateSongQuery(id, updates);
        // Notify artist sync of metadata change
        try { syncSongUpdated(id); } catch (e) { console.warn('syncSongUpdated error', e); }
        refreshSongs();
        return result;
      } catch (err) {
        setError(err);
        throw err;
      }
    },
    [refreshSongs]
  );

  // DELETE SONG
  const deleteSong = useCallback(
    (id) => {
      try {
        const result = deleteSongQuery(id);
        // Notify artist sync of song removal
        try { syncSongDeleted(id); } catch (e) { console.warn('syncSongDeleted error', e); }
        refreshSongs();
        return result;
      } catch (err) {
        setError(err);
        throw err;
      }
    },
    [refreshSongs]
  );

  // RELOAD WHEN SEARCH OR SORT CHANGES
  useEffect(() => {
    // Defer to avoid synchronous state updates.
    queueMicrotask(() => refreshSongs());
  }, [refreshSongs]);

  return {
    songs,
    loading,
    totalSongs,
    error,
    scanning,
    scanResult,
    enriching,
    enrichProgress,
    addSong,
    updateSong,
    deleteSong,
    refreshSongs,
    scanAndImport,
    syncLibrary,
    enrichSongs,
  };
};