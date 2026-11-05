import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";

import {
  getSongsPage,
  getSongsCount,
  addSong as insertSong,
  updateSong as updateSongQuery,
  deleteSong as deleteSongQuery,
} from "../databases/queries/song.js";
import { syncSongUpdated, syncSongDeleted } from "../services/artists/artistSync.js";

import { importMusicFromSavedFolder, enrichExistingSongs } from "../services/musicImporter.js";

const PAGE_SIZE = 30;

export const useSongs = ({ search = "", sort = 0 } = {}) => {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalSongs, setTotalSongs] = useState(0);

  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  // Enrichment state
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(null);

  const loadingMoreRef = useRef(false);
  const requestIdRef = useRef(0);

  // LOAD FIRST 30 SONGS
  const refreshSongs = useCallback(() => {
    const requestId = ++requestIdRef.current;

    loadingMoreRef.current = false;
    setLoading(true);
    setLoadingMore(false);
    setError(null);

    try {
      const total = getSongsCount(search);
      const data = getSongsPage(
        PAGE_SIZE,
        0,
        search,
        sort
      );

      if (requestId !== requestIdRef.current) return;

      setSongs(data);
      setTotalSongs(total);
      setHasMore(data.length < total);
    } catch (err) {
      console.error("Failed to load songs:", err);
      setError(err);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [search, sort]);

  // LOAD NEXT 30 SONGS
  const loadMoreSongs = useCallback(() => {
    if (
      loading ||
      loadingMoreRef.current ||
      !hasMore
    ) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);

    const requestId = requestIdRef.current;
    const offset = songs.length;

    try {
      const nextSongs = getSongsPage(
        PAGE_SIZE,
        offset,
        search,
        sort
      );

      if (requestId !== requestIdRef.current) return;

      setSongs((previous) => {
        const existingIds = new Set(
          previous.map((song) => song.id)
        );

        const uniqueSongs = nextSongs.filter(
          (song) => !existingIds.has(song.id)
        );

        return [...previous, ...uniqueSongs];
      });

      setHasMore(offset + nextSongs.length < totalSongs);
    } catch (err) {
      if (requestId === requestIdRef.current) {
        console.error("Failed to load more songs:", err);
        setError(err);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [
    loading,
    hasMore,
    songs.length,
    search,
    sort,
    totalSongs,
  ]);

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
    loadingMore,
    hasMore,
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
    loadMoreSongs,
    scanAndImport,
    enrichSongs,
  };
};