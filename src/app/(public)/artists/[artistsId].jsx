import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useIsFocused } from 'expo-router';
import Svg, {
  Path,
  Circle,
  Rect,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
} from 'react-native-svg';

import { useArtistProfile } from '../../../hooks/artists/useArtistProfile.js';
import { getArtistPlayableQueue } from '../../../services/artists/artistRepository.js';
import {
  getArtistGradient,
  getArtistInitials,
} from '../../../services/artists/artistArtwork.js';
import { usePlayer } from '../../../context/player-context.jsx';

/* ───────────── Helpers ───────────── */
const fmt = (s) => {
  if (!s || isNaN(s)) return '0:00';
  const min = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return `${min}:${sec}`;
};

const cn = (v) => {
  if (v == null || isNaN(v)) return '0';
  if (v >= 1000000) {
    return `${(v / 1000000).toFixed(1).replace('.0', '')}M`;
  }
  if (v >= 1000) {
    return `${(v / 1000).toFixed(1).replace('.0', '')}K`;
  }
  return `${v}`;
};

const SORTS = ['Popular', 'Newest', 'A–Z'];
const SORT_MAP = {
  0: 'popular',
  1: 'newest',
  2: 'az',
};

/* ───────────── Icons ───────────── */
const IconBack = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#1d1233" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 5l-7 7 7 7" />
  </Svg>
);

const IconPlus = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);

const IconCheck = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#b3157a" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="m5 13 4 4L19 7" />
  </Svg>
);

const IconPlay = ({ size = 16, color = '#fff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z" />
  </Svg>
);

const IconPause = ({ size = 16, color = '#fff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M6 5h4v14H6zm8 0h4v14h-4z" />
  </Svg>
);

const IconNext = ({ size = 18, color = '#1d1233' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M6 4.5v15a1 1 0 0 0 1.5.9L16 13.8V19a1 1 0 1 0 2 0V5a1 1 0 1 0-2 0v5.2L7.5 3.6A1 1 0 0 0 6 4.5Z" />
  </Svg>
);

const CardGradient = ({ id, colors }) => (
  <Svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
    <Defs>
      <SvgGradient id={`prof_g_${id}`} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={colors[0]} />
        <Stop offset="1" stopColor={colors[1]} />
      </SvgGradient>
    </Defs>
    <Rect width="100%" height="100%" fill={`url(#prof_g_${id})`} />
  </Svg>
);

/* ───────────── Equalizer Bars (Now Playing) ───────────── */
function EqualizerBar({ delay, active, playing, isScreenActive = true }) {
  const [anim] = useState(() => new Animated.Value(0.3));

  useEffect(() => {
    if (!isScreenActive || !active || !playing) {
      anim.setValue(0.3);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 350 + delay * 100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0.25,
          duration: 350 + delay * 100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [anim, active, playing, delay, isScreenActive]);

  return (
    <Animated.View
      className="h-3.5 w-[3px] rounded-sm bg-[#ff3fa4]"
      style={{ transform: [{ scaleY: anim }] }}
    />
  );
}

/* ───────────── Song Row Component ───────────── */
const SongRow = React.memo(({ song, rank, active, playing, onPress, isScreenActive = true }) => {
  const colors = useMemo(() => getArtistGradient(song.artist || song.title), [song.artist, song.title]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`mb-2 flex-row items-center gap-3 rounded-2xl p-2.5 ${
        active ? 'bg-[#4a1e8c]/[0.12]' : 'bg-transparent'
      }`}
    >
      {rank !== undefined && (
        <Text className="w-5 text-center text-sm font-bold text-[#665b84]">
          {rank}
        </Text>
      )}

      {/* Album Artwork */}
      <View className="h-12 w-12 overflow-hidden rounded-xl bg-purple-900/20">
        {song.artwork_uri ? (
          <Image
            source={{ uri: song.artwork_uri }}
            className="h-full w-full"
            resizeMode="cover"
          />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <CardGradient id={`row_${song.id}`} colors={colors} />
            <Text className="text-xs font-bold text-white/90">
              {getArtistInitials(song.title)}
            </Text>
          </View>
        )}
      </View>

      {/* Song Info */}
      <View className="min-w-0 flex-1 justify-center">
        <Text
          numberOfLines={1}
          className={`text-sm font-semibold ${
            active ? 'text-[#b3157a]' : 'text-[#1d1233]'
          }`}
        >
          {song.title}
        </Text>

        <Text numberOfLines={1} className="mt-0.5 text-xs text-[#665b84]">
          {song.artist || 'Unknown Artist'} {song.album ? `· ${song.album}` : ''}
        </Text>
      </View>

      {/* Duration or Equalizer */}
      {active && playing ? (
        <View className="flex-row items-center gap-1 px-2">
          <EqualizerBar delay={0} active={active} playing={playing} isScreenActive={isScreenActive} />
          <EqualizerBar delay={1} active={active} playing={playing} isScreenActive={isScreenActive} />
          <EqualizerBar delay={2} active={active} playing={playing} isScreenActive={isScreenActive} />
        </View>
      ) : (
        <Text className="text-xs font-medium text-[#665b84]">
          {fmt(song.duration)}
        </Text>
      )}
    </TouchableOpacity>
  );
});
SongRow.displayName = 'SongRow';

/* ───────────── Album Card Component ───────────── */
const AlbumCard = React.memo(({ album, isSelected, onPress }) => {
  const colors = useMemo(() => getArtistGradient(album.name), [album.name]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={`w-[140px] rounded-3xl p-1 ${
        isSelected ? 'border-2 border-[#b3157a]' : ''
      }`}
    >
      <View className="h-[132px] w-[132px] overflow-hidden rounded-2xl bg-purple-900/20">
        {album.artwork_uri ? (
          <Image
            source={{ uri: album.artwork_uri }}
            className="h-full w-full"
            resizeMode="cover"
          />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <CardGradient id={`alb_${album.name}`} colors={colors} />
            <Text className="text-center text-sm font-bold text-white/90 px-2">
              {album.name}
            </Text>
          </View>
        )}
      </View>

      <Text
        numberOfLines={1}
        className="mt-2 text-sm font-semibold text-[#1d1233]"
      >
        {album.name}
      </Text>

      <Text className="text-xs text-[#665b84]">
        {album.year ? `${album.year} · ` : ''}
        {album.trackCount} {album.trackCount === 1 ? 'song' : 'songs'}
      </Text>
    </TouchableOpacity>
  );
});
AlbumCard.displayName = 'AlbumCard';

/* ───────────── Inner Artist Profile Component ───────────── */
function ArtistProfileContent({ artistId }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();

  const {
    track: currentTrack,
    playing: isPlayingGlobal,
    pos: playbackPos,
    playSongs,
    togglePlay,
    goNext,
  } = usePlayer();

  const [sortIndex, setSortIndex] = useState(0);
  const [albumFilter, setAlbumFilter] = useState(null);
  const [shownCount, setShownCount] = useState(30);

  const activeSort = SORT_MAP[sortIndex] || 'popular';

  const {
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
  } = useArtistProfile(artistId, {
    sort: activeSort,
    album: albumFilter,
  });

  const scrollRef = useRef(null);

  const artistColors = useMemo(() => {
    return artist?.name ? getArtistGradient(artist.name) : ['#ff3fa4', '#9650ff'];
  }, [artist]);

  const artistInitials = useMemo(() => {
    return artist?.name ? getArtistInitials(artist.name) : '??';
  }, [artist]);

  // Top 5 popular songs
  const popularTop5 = useMemo(() => {
    if (!songs || songs.length === 0) return [];
    return songs.slice(0, 5);
  }, [songs]);

  // Visible songs with pagination limit
  const visibleSongs = useMemo(() => {
    if (!songs) return [];
    return songs.slice(0, shownCount);
  }, [songs, shownCount]);

  const remainingSongs = Math.max(0, (songs?.length ?? 0) - visibleSongs.length);

  /* Actions */
  const handlePlayHero = useCallback(() => {
    if (!artistId) return;
    try {
      const queue = getArtistPlayableQueue(artistId, { sort: activeSort, album: albumFilter });
      if (queue && queue.length > 0) {
        playSongs(queue, 0);
      }
    } catch (err) {
      console.warn('handlePlayHero failed', err);
    }
  }, [artistId, activeSort, albumFilter, playSongs]);

  const handlePlaySong = useCallback((index) => {
    if (!songs || songs.length === 0) return;
    playSongs(songs, index);
  }, [songs, playSongs]);

  const handleSelectRelated = useCallback((relatedId) => {
    router.push({
      pathname: '/(public)/artists/[artistsId]',
      params: { artistsId: relatedId },
    });
  }, [router]);

  // Mini-player progress ring calculation
  const currentDuration = currentTrack?.duration || 1;
  const currentPos = playbackPos || 0;
  const ringProgress = Math.min(Math.max(currentPos / currentDuration, 0), 1);
  const ringOffset = 150.8 * (1 - ringProgress);

  /* ───────────── Loading / Error / Not Found States ───────────── */
  if (loading && !artist) {
    return (
      <View className="flex-1 bg-[#f4eeff] items-center justify-center">
        <ActivityIndicator size="large" color="#ff3fa4" />
        <Text className="mt-3 text-sm font-medium text-[#665b84]">
          Loading artist profile...
        </Text>
      </View>
    );
  }

  if (error && !artist) {
    return (
      <View className="flex-1 bg-[#f4eeff] px-6" style={{ paddingTop: insets.top + 20 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full bg-[#4a1e8c]/[0.08]"
        >
          <IconBack />
        </TouchableOpacity>
        <View className="flex-1 items-center justify-center">
          <Text className="text-lg font-bold text-[#b3157a]">
            Error Loading Artist
          </Text>
          <Text className="mt-1 text-sm text-[#665b84] text-center">
            {error.message || 'An error occurred while reading from the music library.'}
          </Text>
          <TouchableOpacity
            onPress={refresh}
            className="mt-5 rounded-full bg-[#b3157a] px-6 py-2.5"
          >
            <Text className="font-semibold text-white">Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!artist) {
    return (
      <View className="flex-1 bg-[#f4eeff] px-6" style={{ paddingTop: insets.top + 20 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full bg-[#4a1e8c]/[0.08]"
        >
          <IconBack />
        </TouchableOpacity>
        <View className="flex-1 items-center justify-center">
          <Text className="text-lg font-bold text-[#1d1233]">
            Artist Not Found
          </Text>
          <Text className="mt-1 text-sm text-[#665b84] text-center">
            This artist could not be located in your local music database.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            className="mt-5 rounded-full bg-[#b3157a] px-6 py-2.5"
          >
            <Text className="font-semibold text-white">Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#f4eeff]">
      {/* Background glow */}
      <View pointerEvents="none" className="absolute inset-0">
        <View className="absolute left-0 top-0 h-[45%] w-[90%] rounded-full bg-[#9650ff]/40" />
        <View className="absolute right-0 top-[8%] h-[38%] w-[70%] rounded-full bg-[#ff3caa]/30" />
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 10,
          paddingBottom: currentTrack ? 150 : 60,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Back Button */}
        <TouchableOpacity
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full bg-[#4a1e8c]/[0.08]"
        >
          <IconBack />
        </TouchableOpacity>

        {/* Hero Section */}
        <View className="mt-2 flex-row items-center gap-[18px]">
          <View
            className="h-28 w-28 items-center justify-center rounded-full p-1"
            style={{
              backgroundColor: '#ff3fa4',
              shadowColor: '#ff3fa4',
              shadowOpacity: 0.55,
              shadowRadius: 30,
            }}
          >
            <View className="h-full w-full overflow-hidden rounded-full border-4 border-[#f4eeff] items-center justify-center bg-purple-900/30">
              {artist.image_uri ? (
                <Image
                  source={{ uri: artist.image_uri }}
                  className="h-full w-full"
                  resizeMode="cover"
                />
              ) : (
                <View className="h-full w-full items-center justify-center">
                  <CardGradient id={artist.id} colors={artistColors} />
                  <Text className="text-2xl font-bold text-white">
                    {artistInitials}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View className="flex-1">
            <Text
              numberOfLines={2}
              className="text-[26px] font-bold leading-[1.14] tracking-tight text-[#1d1233]"
            >
              {artist.name}
            </Text>

            <View className="mt-3.5 flex-row items-center gap-3">
              <TouchableOpacity
                onPress={toggleFollow}
                activeOpacity={0.8}
                className={`h-9 w-32 flex-row items-center justify-between rounded-full pl-3.5 pr-1 ${
                  following
                    ? 'bg-[#b3157a]'
                    : 'border border-[#4a1e8c]/[0.16] bg-[#4a1e8c]/[0.08]'
                }`}
              >
                <Text
                  className={`text-[11.5px] font-semibold ${
                    following ? 'text-white' : 'text-[#1d1233]'
                  }`}
                >
                  {following ? 'Following' : 'Follow'}
                </Text>

                <View
                  className={`h-7 w-7 items-center justify-center rounded-full ${
                    following ? 'bg-white/95' : 'bg-[#e8208a]'
                  }`}
                >
                  {following ? <IconCheck /> : <IconPlus />}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePlayHero}
                activeOpacity={0.8}
                className="h-10 w-10 items-center justify-center rounded-full border border-[#4a1e8c]/[0.16] bg-[#4a1e8c]/[0.08]"
              >
                <IconPlay size={18} color="#1d1233" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Stats Section */}
        <View className="my-[26px] mb-2 flex-row text-center">
          {stats?.followerCount != null ? (
            <View className="flex-1 items-center">
              <Text className="text-[22px] font-bold text-[#1d1233]">
                {cn(stats.followerCount)}
              </Text>
              <Text className="text-xs text-[#665b84]">Listeners</Text>
            </View>
          ) : (
            <View className="flex-1 items-center">
              <Text className="text-[17px] font-bold text-[#1d1233]">
                {following ? 'Followed' : 'Local'}
              </Text>
              <Text className="text-xs text-[#665b84]">Status</Text>
            </View>
          )}

          <View className="flex-1 items-center border-l border-[#4a1e8c]/[0.16]">
            <Text className="text-[22px] font-bold text-[#1d1233]">
              {stats?.songCount ?? 0}
            </Text>
            <Text className="text-xs text-[#665b84]">Songs</Text>
          </View>

          <View className="flex-1 items-center border-l border-[#4a1e8c]/[0.16]">
            <Text className="text-[22px] font-bold text-[#1d1233]">
              {stats?.albumCount ?? 0}
            </Text>
            <Text className="text-xs text-[#665b84]">Albums</Text>
          </View>
        </View>

        {/* Bio (if enriched) */}
        {artist.bio ? (
          <View className="mt-3 rounded-2xl bg-[#4a1e8c]/[0.05] p-3.5">
            <Text numberOfLines={3} className="text-xs leading-relaxed text-[#51436e]">
              {artist.bio}
            </Text>
          </View>
        ) : null}

        {/* Similar Singers Section (Real data only, hidden when empty) */}
        {related && related.length > 0 && (
          <View className="mt-[26px]">
            <Text className="mb-3 text-[15px] font-bold text-[#1d1233]">
              Similar singers
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="-mx-5"
              contentContainerStyle={{
                paddingHorizontal: 20,
                gap: 14,
                paddingBottom: 6,
              }}
            >
              {related.map((rel) => {
                const relColors = getArtistGradient(rel.name);
                const relInitials = getArtistInitials(rel.name);

                return (
                  <TouchableOpacity
                    key={rel.id}
                    onPress={() => handleSelectRelated(rel.id)}
                    className="w-[68px] items-center"
                    activeOpacity={0.8}
                  >
                    <View
                      className="h-16 w-16 items-center justify-center rounded-full p-[3px]"
                      style={{ backgroundColor: relColors[0] }}
                    >
                      <View className="h-full w-full overflow-hidden rounded-full border-[3px] border-[#f4eeff] items-center justify-center bg-purple-950/20">
                        {rel.image_uri ? (
                          <Image
                            source={{ uri: rel.image_uri }}
                            className="h-full w-full"
                            resizeMode="cover"
                          />
                        ) : (
                          <View className="h-full w-full items-center justify-center">
                            <CardGradient id={`rel_${rel.id}`} colors={relColors} />
                            <Text className="text-xs font-bold text-white">
                              {relInitials}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <Text
                      numberOfLines={1}
                      className="mt-[7px] text-[10px] font-semibold tracking-[0.04em] text-[#665b84]"
                    >
                      {rel.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Popular Top 5 */}
        {popularTop5.length > 0 && (
          <View className="mt-[26px]">
            <View className="mb-3 flex-row items-baseline justify-between">
              <Text className="text-[15px] font-bold text-[#1d1233]">
                Popular{' '}
                <Text className="text-xs font-medium text-[#665b84]">Top {popularTop5.length}</Text>
              </Text>
            </View>

            <View>
              {popularTop5.map((song, rank) => {
                const isCurrent = currentTrack?.id === song.id;
                return (
                  <SongRow
                    key={`pop_${song.id}`}
                    song={song}
                    rank={rank + 1}
                    active={isCurrent}
                    playing={isPlayingGlobal}
                    onPress={() => handlePlaySong(rank)}
                    isScreenActive={isFocused}
                  />
                );
              })}
            </View>
          </View>
        )}

        {/* Albums Section (Real from DB) */}
        {albums && albums.length > 0 && (
          <View className="mt-[26px]">
            <Text className="mb-3 text-[15px] font-bold text-[#1d1233]">
              Albums
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="-mx-5"
              contentContainerStyle={{
                paddingHorizontal: 20,
                gap: 14,
                paddingBottom: 6,
              }}
            >
              {albums.map((alb) => {
                const isSelected = albumFilter === alb.name;
                return (
                  <AlbumCard
                    key={alb.name}
                    album={alb}
                    isSelected={isSelected}
                    onPress={() => {
                      setAlbumFilter(isSelected ? null : alb.name);
                      setShownCount(30);
                    }}
                  />
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* All Songs Header + Sort Chips */}
        <View className="mt-[26px]">
          <View className="mb-3 flex-row items-baseline justify-between">
            <Text className="text-[15px] font-bold text-[#1d1233]">
              All songs{' '}
              <Text className="text-xs font-medium text-[#665b84]">
                {songs?.length ?? 0}{' '}
                {albumFilter ? `(filtered by "${albumFilter}")` : 'songs'}
              </Text>
            </Text>
          </View>

          {/* Sort Chips */}
          <View className="mb-2 flex-row flex-wrap gap-2">
            {SORTS.map((label, k) => (
              <TouchableOpacity
                key={label}
                onPress={() => {
                  setSortIndex(k);
                  setShownCount(30);
                }}
                className={`h-[34px] items-center justify-center rounded-full px-4 ${
                  sortIndex === k
                    ? 'bg-[#b3157a]'
                    : 'bg-[#4a1e8c]/[0.08]'
                }`}
              >
                <Text
                  className={`text-[12.5px] font-semibold ${
                    sortIndex === k ? 'text-white' : 'text-[#1d1233]'
                  }`}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Album Filter Active Chip */}
          {albumFilter && (
            <TouchableOpacity
              onPress={() => {
                setAlbumFilter(null);
                setShownCount(30);
              }}
              className="mb-2 h-[30px] flex-row items-center gap-2 self-start rounded-full border border-[#d61f88] bg-[#4a1e8c]/[0.08] px-3"
            >
              <Text className="text-xs font-semibold text-[#1d1233]">
                {albumFilter}
              </Text>
              <Text className="text-xs font-semibold text-[#d61f88]">×</Text>
            </TouchableOpacity>
          )}

          {/* Song Rows */}
          {visibleSongs.length === 0 ? (
            <View className="py-8 items-center justify-center">
              <Text className="text-sm font-medium text-[#665b84]">
                No songs found.
              </Text>
            </View>
          ) : (
            <View>
              {visibleSongs.map((song, idx) => {
                const isCurrent = currentTrack?.id === song.id;
                return (
                  <SongRow
                    key={song.id}
                    song={song}
                    active={isCurrent}
                    playing={isPlayingGlobal}
                    onPress={() => handlePlaySong(idx)}
                    isScreenActive={isFocused}
                  />
                );
              })}
            </View>
          )}

          {/* Show More Button */}
          {remainingSongs > 0 && (
            <TouchableOpacity
              onPress={() => setShownCount((s) => s + 30)}
              className="mt-2.5 h-11 items-center justify-center rounded-full border border-[#4a1e8c]/[0.16]"
            >
              <Text className="text-[13px] font-semibold text-[#1d1233]">
                Show {Math.min(30, remainingSongs)} more
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Docked Mini Player connected to global player */}
      {currentTrack && (
        <View
          pointerEvents="box-none"
          className="absolute inset-x-0 bottom-0 items-center px-4"
          style={{
            paddingTop: 30,
            paddingBottom: insets.bottom + 14,
            backgroundColor: 'transparent',
          }}
        >
          <View className="w-full max-w-[398px] flex-row items-center gap-3 rounded-full border border-[#4a1e8c]/[0.16] bg-[#e9defc]/95 px-2 py-[7px] shadow-lg">
            <View className="h-11 w-11 overflow-hidden rounded-full bg-purple-900/30 items-center justify-center">
              {currentTrack.artwork_uri ? (
                <Image
                  source={{ uri: currentTrack.artwork_uri }}
                  className="h-full w-full"
                  resizeMode="cover"
                />
              ) : (
                <View className="h-full w-full items-center justify-center">
                  <CardGradient
                    id="mini_cur"
                    colors={getArtistGradient(currentTrack.artist || currentTrack.title)}
                  />
                  <Text className="text-xs font-bold text-white">
                    {getArtistInitials(currentTrack.title)}
                  </Text>
                </View>
              )}
            </View>

            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-sm font-semibold text-[#1d1233]">
                {currentTrack.title}
              </Text>

              <Text numberOfLines={1} className="text-xs text-[#665b84]">
                {currentTrack.artist || 'Unknown Artist'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={goNext}
              className="h-10 w-10 items-center justify-center rounded-full"
            >
              <IconNext />
            </TouchableOpacity>

            <View className="relative h-[52px] w-[52px] items-center justify-center">
              <Svg
                width={52}
                height={52}
                viewBox="0 0 52 52"
                className="absolute inset-0"
                style={{ transform: [{ rotate: '-90deg' }] }}
              >
                <Circle
                  cx={26}
                  cy={26}
                  r={24}
                  fill="none"
                  stroke="rgba(70,30,140,0.16)"
                  strokeWidth={3}
                />
                <Circle
                  cx={26}
                  cy={26}
                  r={24}
                  fill="none"
                  stroke="#ff3fa4"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray={150.8}
                  strokeDashoffset={ringOffset}
                />
              </Svg>

              <TouchableOpacity
                onPress={togglePlay}
                className="absolute inset-1.5 items-center justify-center rounded-full bg-[#b3157a]"
              >
                {isPlayingGlobal ? (
                  <IconPause size={18} />
                ) : (
                  <IconPlay size={18} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

export default function ArtistScreen() {
  const params = useLocalSearchParams();
  const rawId = params.artistsId ?? params.artistsid ?? params.id;
  const artistId = rawId ? Number(rawId) : null;

  return <ArtistProfileContent key={artistId} artistId={artistId} />;
}
