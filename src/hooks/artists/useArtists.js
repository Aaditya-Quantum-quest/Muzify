import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getArtists,
  getTotalSongCount,
} from '../../services/artists/artistRepository.js';
import { onArtistsChanged } from '../../services/artists/artistSync.js';

const PAGE_LIMIT = 500;

/**
 * Hook to retrieve artists list with search + sort.
 * Automatically updates when library or artist data changes.
 */
export const useArtists = ({ search = '', sort = 'az' } = {}) => {
  const [artists, setArtists] = useState([]);
  const [totalSongs, setTotalSongs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const requestIdRef = useRef(0);

  const refresh = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = getArtists({ search, sort, limit: PAGE_LIMIT });
      const total = getTotalSongCount();
      if (requestId !== requestIdRef.current) return;
      setArtists(data);
      setTotalSongs(total);
    } catch (err) {
      console.error('Failed to load artists:', err);
      if (requestId === requestIdRef.current) setError(err);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [search, sort]);

  useEffect(() => {
    queueMicrotask(() => refresh());
    return onArtistsChanged(refresh);
  }, [refresh]);

  return { artists, totalSongs, loading, error, refresh };
};
