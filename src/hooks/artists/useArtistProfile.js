import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getArtistById,
  getArtistStats,
  getArtistSongs,
  getArtistAlbums,
  getRelatedArtists,
  followArtist,
  unfollowArtist,
  isFollowing,
} from '../../services/artists/artistRepository.js';
import { onArtistsChanged } from '../../services/artists/artistSync.js';
import { enqueueArtist } from '../../services/artists/enrichmentService.js';

/**
 * Hook to retrieve full artist profile data.
 * Re-queries when library changes or artistId changes.
 */
export const useArtistProfile = (artistId, { sort = 'popular', album = null } = {}) => {
  const [artist, setArtist] = useState(null);
  const [stats, setStats] = useState(null);
  const [songs, setSongs] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [related, setRelated] = useState([]);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const requestIdRef = useRef(0);

  const refresh = useCallback(() => {
    if (artistId == null || isNaN(Number(artistId))) {
      setArtist(null);
      setLoading(false);
      return;
    }

    const id = Number(artistId);
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const a = getArtistById(id);
      if (!a) {
        if (requestId !== requestIdRef.current) return;
        setArtist(null);
        setStats(null);
        setSongs([]);
        setAlbums([]);
        setRelated([]);
        setFollowing(false);
        return;
      }

      // Enqueue artist for background enrichment
      try {
        enqueueArtist(id, 'open');
      } catch (_) {}

      const s = getArtistStats(id);
      const songList = getArtistSongs(id, { sort, album, limit: 100 });
      const albumList = getArtistAlbums(id);
      const relatedList = getRelatedArtists(id, { limit: 12 });
      const isF = isFollowing(id);

      if (requestId !== requestIdRef.current) return;
      setArtist(a);
      setStats(s);
      setSongs(songList);
      setAlbums(albumList);
      setRelated(relatedList);
      setFollowing(isF);
    } catch (err) {
      console.error('Failed to load artist profile:', err);
      if (requestId === requestIdRef.current) setError(err);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [artistId, sort, album]);

  useEffect(() => {
    queueMicrotask(() => refresh());
    return onArtistsChanged(refresh);
  }, [refresh]);

  const toggleFollow = useCallback(() => {
    if (artistId == null) return;
    const id = Number(artistId);
    const next = !following;
    setFollowing(next); // optimistic update
    const ok = next ? followArtist(id) : unfollowArtist(id);
    if (!ok) {
      setFollowing(!next); // revert on failure
    } else if (next) {
      try {
        enqueueArtist(id, 'followed');
      } catch (_) {}
    }
  }, [artistId, following]);

  return {
    artist,
    stats,
    songs,
    albums,
    related,
    following,
    loading,
    error,
    refresh,
    toggleFollow,
  };
};
