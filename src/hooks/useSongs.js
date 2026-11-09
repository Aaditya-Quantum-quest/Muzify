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

import { importMusicFromSavedFolder, enrichExistingSongs } from "../services/musicImporter.js";

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

      setSongs(data);
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
    enrichSongs,
  };
};