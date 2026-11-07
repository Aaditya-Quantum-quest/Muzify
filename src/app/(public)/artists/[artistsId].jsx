/**
 * ArtistScreen — "Neon Orchid" redesign (approved preview)
 *
 * Same data layer as before: useArtistProfile, getArtistPlayableQueue,
 * getArtistGradient / getArtistInitials and the global usePlayer().
 * Only the UI changed. Every picture holder is a curved-corner rounded
 * square (no circles); real artwork is used when present, otherwise a
 * gradient + initials placeholder.
 *
 * Needs: nativewind (v4 style classes), react-native-svg,
 *        react-native-safe-area-context, expo-router. No new dependencies.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useIsFocused } from 'expo-router';
import Svg, {
  Path,
  Rect,
  Defs,
  LinearGradient as SvgGradient,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import { useArtistProfile } from '../../../hooks/artists/useArtistProfile.js';
import { getArtistPlayableQueue } from '../../../services/artists/artistRepository.js';
import {
  getArtistGradient,
  getArtistInitials,
} from '../../../services/artists/artistArtwork.js';
import { usePlayer } from '../../../context/player-context.jsx';

/* ───────────── Theme ───────────── */
const PINK_GRAD = ['#D4208A', '#7A3CF0']; // action gradient (follow, active chip, play)
const RING_GRAD = ['#FF3FA4', '#6A5BFF']; // artist photo ring
const PAGE_SIZE = 30;

/* ───────────── Helpers ───────────── */
const fmt = (s) => {
  if (!s || isNaN(s)) return '0:00';
  const min = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return `${min}:${sec}`;
};

const cn = (v) => {
  if (v == null || isNaN(v)) return '0';
  if (v >= 1000000) return `${(v / 1000000).toFixed(1).replace('.0', '')}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace('.0', '')}K`;
  return `${v}`;
};

// svg gradient ids must be safe for url(#id)
const gid = (v) => `g_${String(v).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

const SORTS = ['Popular', 'Newest', 'A–Z'];
const SORT_MAP = { 0: 'popular', 1: 'newest', 2: 'az' };

/* ───────────── Icons ───────────── */
const IconBack = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 5l-7 7 7 7" />
  </Svg>
);
const IconPlus = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);
const IconCheck = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#C2137E" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <Path d="m5 13 4 4L19 7" />
  </Svg>
);
const IconPlay = ({ size = 18, color = '#fff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z" />
  </Svg>
);
const IconPause = ({ size = 18, color = '#fff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M6 5h4v14H6zm8 0h4v14h-4z" />
  </Svg>
);
const IconNext = ({ size = 20, color = '#fff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M6 4.5v15a1 1 0 0 0 1.5.9L16 13.8V19a1 1 0 1 0 2 0V5a1 1 0 1 0-2 0v5.2L7.5 3.6A1 1 0 0 0 6 4.5Z" />
  </Svg>
);

/* ───────────── Building blocks ───────────── */

/** Fills its (overflow-hidden, rounded) parent with a diagonal gradient. */
const Grad = ({ id, colors }) => (
  <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
    <Defs>
      <SvgGradient id={gid(id)} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={colors[0]} />
        <Stop offset="1" stopColor={colors[1]} />
      </SvgGradient>
    </Defs>
    <Rect width="100%" height="100%" fill={`url(#${gid(id)})`} />
  </Svg>
);

/** Soft radial colour glow for the page background. */
const Glow = ({ id, color, size, opacity, style }) => (
  <View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={gid(id)} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${gid(id)})`} />
    </Svg>
  </View>
);

/** Curved-corner picture holder: real image, or gradient + initials. */
const Art = ({ id, uri, colors, label, className = '', textClass = 'text-[13px]' }) => (
  <View className={`overflow-hidden ${className}`}>
    {uri ? (
      <Image source={{ uri }} className="h-full w-full" resizeMode="cover" />
    ) : (
      <View className="h-full w-full items-center justify-center">
        <Grad id={id} colors={colors} />
        <Text className={`font-bold text-white ${textClass}`}>{label}</Text>
      </View>
    )}
  </View>
);

/* ───────────── Equalizer bars (now playing) ───────────── */
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
      className="h-4 w-[3px] rounded-sm bg-[#ff7cc4]"
      style={{ transform: [{ scaleY: anim }] }}
    />
  );
}

/* ───────────── Song row ───────────── */
const SongRow = React.memo(({ song, active, playing, onPress, isScreenActive = true }) => {
  const colors = useMemo(
    () => getArtistGradient(song.album || song.artist || song.title),
    [song.album, song.artist, song.title]
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Play ${song.title}`}
      className={`mb-1 h-[68px] flex-row items-center gap-3.5 rounded-[22px] px-2.5 ${
        active ? 'bg-white/10' : 'bg-transparent'
      }`}
    >
      <Art
        id={`row_${song.id}`}
        uri={song.artwork_uri}
        colors={colors}
        label={getArtistInitials(song.title)}
        className="h-12 w-12 rounded-2xl"
      />

      <View className="min-w-0 flex-1 justify-center">
        <Text
          numberOfLines={1}
          className={`text-sm font-semibold ${active ? 'text-[#ff7cc4]' : 'text-white'}`}
        >
          {song.title}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-xs text-[#bbaae6]">
          {song.artist || 'Unknown Artist'}
          {song.album ? ` · ${song.album}` : ''}
        </Text>
      </View>

      {active && playing ? (
        <View className="flex-row items-end gap-[3px] px-1">
          <EqualizerBar delay={0} active={active} playing={playing} isScreenActive={isScreenActive} />
          <EqualizerBar delay={1} active={active} playing={playing} isScreenActive={isScreenActive} />
          <EqualizerBar delay={2} active={active} playing={playing} isScreenActive={isScreenActive} />
        </View>
      ) : (
        <Text
          className={`text-xs font-medium ${active ? 'text-[#ff7cc4]' : 'text-[#bbaae6]'}`}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {fmt(song.duration)}
        </Text>
      )}
    </TouchableOpacity>
  );
});
SongRow.displayName = 'SongRow';

/* ───────────── Album tile ───────────── */
const AlbumCard = React.memo(({ album, isSelected, onPress }) => {
  const colors = useMemo(() => getArtistGradient(album.name), [album.name]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Filter by album ${album.name}`}
      accessibilityState={{ selected: isSelected }}
      className={`h-[148px] w-[148px] overflow-hidden rounded-[30px] border-2 ${
        isSelected ? 'border-white' : 'border-transparent'
      }`}
    >
      {album.artwork_uri ? (
        <>
          <Image source={{ uri: album.artwork_uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View className="absolute inset-0 bg-black/30" />
        </>
      ) : (
        <Grad id={`alb_${album.name}`} colors={colors} />
      )}

      {album.year ? (
        <Text className="absolute left-4 top-3.5 text-xs font-medium text-white/85">
          {album.year}
        </Text>
      ) : null}

      <Text
        numberOfLines={2}
        className="absolute bottom-4 left-4 right-4 text-lg font-bold leading-[21px] text-white"
      >
        {album.name}
      </Text>
    </TouchableOpacity>
  );
});
AlbumCard.displayName = 'AlbumCard';

/* ───────────── Screen content ───────────── */
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
  const [shownCount, setShownCount] = useState(PAGE_SIZE);

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
  } = useArtistProfile(artistId, { sort: activeSort, album: albumFilter });

  const artistColors = useMemo(
    () => (artist?.name ? getArtistGradient(artist.name) : RING_GRAD),
    [artist]
  );
  const artistInitials = useMemo(
    () => (artist?.name ? getArtistInitials(artist.name) : '??'),
    [artist]
  );
  const currentColors = useMemo(
    () => getArtistGradient(currentTrack?.album || currentTrack?.artist || currentTrack?.title || ''),
    [currentTrack]
  );

  const visibleSongs = useMemo(() => (songs ? songs.slice(0, shownCount) : []), [songs, shownCount]);
  const remainingSongs = Math.max(0, (songs?.length ?? 0) - visibleSongs.length);

  /* Actions */
  const handlePlayHero = useCallback(() => {
    if (!artistId) return;
    try {
      const queue = getArtistPlayableQueue(artistId, { sort: activeSort, album: albumFilter });
      if (queue && queue.length > 0) playSongs(queue, 0);
    } catch (err) {
      console.warn('handlePlayHero failed', err);
    }
  }, [artistId, activeSort, albumFilter, playSongs]);

  const handlePlaySong = useCallback(
    (index) => {
      if (!songs || songs.length === 0) return;
      playSongs(songs, index);
    },
    [songs, playSongs]
  );

  const handleSelectRelated = useCallback(
    (relatedId) => {
      router.push({
        pathname: '/(public)/artists/[artistsId]',
        params: { artistsId: relatedId },
      });
    },
    [router]
  );

  const setSort = (k) => {
    setSortIndex(k);
    setShownCount(PAGE_SIZE);
  };
  const clearAlbum = () => {
    setAlbumFilter(null);
    setShownCount(PAGE_SIZE);
  };

  // mini-player progress (0..1)
  const currentDuration = currentTrack?.duration || 1;
  const progress = Math.min(Math.max((playbackPos || 0) / currentDuration, 0), 1);

  /* ───────────── Loading / error / not found ───────────── */
  const BackButton = (
    <TouchableOpacity
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Back"
      className="h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.14] bg-white/[0.09]"
    >
      <IconBack />
    </TouchableOpacity>
  );

  if (loading && !artist) {
    return (
      <View className="flex-1 items-center justify-center bg-[#150a33]">
        <ActivityIndicator size="large" color="#ff7cc4" />
        <Text className="mt-3 text-sm font-medium text-[#bbaae6]">Loading artist profile...</Text>
      </View>
    );
  }

  if (error && !artist) {
    return (
      <View className="flex-1 bg-[#150a33] px-5" style={{ paddingTop: insets.top + 20 }}>
        {BackButton}
        <View className="flex-1 items-center justify-center">
          <Text className="text-lg font-bold text-[#ff7cc4]">Error Loading Artist</Text>
          <Text className="mt-1 text-center text-sm text-[#bbaae6]">
            {error.message || 'An error occurred while reading from the music library.'}
          </Text>
          <TouchableOpacity onPress={refresh} className="mt-5 overflow-hidden rounded-full px-6 py-2.5">
            <Grad id="retry" colors={PINK_GRAD} />
            <Text className="font-semibold text-white">Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!artist) {
    return (
      <View className="flex-1 bg-[#150a33] px-5" style={{ paddingTop: insets.top + 20 }}>
        {BackButton}
        <View className="flex-1 items-center justify-center">
          <Text className="text-lg font-bold text-white">Artist Not Found</Text>
          <Text className="mt-1 text-center text-sm text-[#bbaae6]">
            This artist could not be located in your local music database.
          </Text>
          <TouchableOpacity onPress={() => router.back()} className="mt-5 overflow-hidden rounded-full px-6 py-2.5">
            <Grad id="goback" colors={PINK_GRAD} />
            <Text className="font-semibold text-white">Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#150a33]">
      {/* Background glows */}
      <Glow id="glow_a" color="#7B2FF7" size={440} opacity={0.75} style={{ left: -150, top: -110 }} />
      <Glow id="glow_b" color="#F0299B" size={400} opacity={0.55} style={{ right: -170, top: 40 }} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 12,
          paddingBottom: currentTrack ? 140 : 60,
        }}
        showsVerticalScrollIndicator={false}
      >
        {BackButton}

        {/* Hero: curved-corner photo + name + actions */}
        <View className="mt-3 flex-row items-center gap-[18px]">
          <View
            style={{
              shadowColor: '#ff3fa4',
              shadowOpacity: 0.4,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
              elevation: 10,
            }}
          >
            <View className="h-[118px] w-[118px] overflow-hidden rounded-[36px]">
              <Grad id="hero_ring" colors={RING_GRAD} />
              <View className="m-[3px] flex-1 overflow-hidden rounded-[33px] bg-[#1b0c45]">
                {artist.image_uri ? (
                  <Image source={{ uri: artist.image_uri }} className="h-full w-full" resizeMode="cover" />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Grad id={`hero_${artist.id}`} colors={artistColors} />
                    <Text className="text-[40px] font-bold tracking-tight text-white">
                      {artistInitials}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View className="min-w-0 flex-1">
            <Text
              numberOfLines={2}
              className="text-[28px] font-bold leading-[31px] tracking-tight text-white"
            >
              {artist.name}
            </Text>

            <View className="mt-3.5 flex-row items-center gap-2.5">
              <TouchableOpacity
                onPress={toggleFollow}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={following ? 'Unfollow artist' : 'Follow artist'}
                className="h-10 w-[136px] flex-row items-center justify-between overflow-hidden rounded-full border border-white/20 pl-4 pr-[5px]"
                style={following ? null : { backgroundColor: 'rgba(255,255,255,0.1)' }}
              >
                {following ? <Grad id="follow_on" colors={PINK_GRAD} /> : null}
                <Text className="text-xs font-semibold text-white">
                  {following ? 'Following' : 'Follow'}
                </Text>
                <View
                  className={`h-[30px] w-[30px] items-center justify-center overflow-hidden rounded-full ${
                    following ? 'bg-white' : ''
                  }`}
                >
                  {following ? (
                    <IconCheck />
                  ) : (
                    <>
                      <Grad id="follow_chip" colors={PINK_GRAD} />
                      <IconPlus />
                    </>
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePlayHero}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Play all"
                className="h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.14] bg-white/[0.09]"
              >
                <IconPlay />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View className="mt-7 flex-row">
          <View className="flex-1 items-center">
            <Text className="text-[22px] font-bold text-white">{stats?.songCount ?? 0}</Text>
            <Text className="text-xs text-[#bbaae6]">Songs</Text>
          </View>

          <View className="flex-1 items-center border-l border-white/[0.16]">
            <Text className="text-[22px] font-bold text-white">{stats?.albumCount ?? 0}</Text>
            <Text className="text-xs text-[#bbaae6]">Albums</Text>
          </View>

          <View className="flex-1 items-center border-l border-white/[0.16]">
            {stats?.followerCount != null ? (
              <>
                <Text className="text-[22px] font-bold text-white">{cn(stats.followerCount)}</Text>
                <Text className="text-xs text-[#bbaae6]">Listeners</Text>
              </>
            ) : (
              <>
                <Text className="text-[22px] font-bold text-white">
                  {following ? 'Followed' : 'Local'}
                </Text>
                <Text className="text-xs text-[#bbaae6]">Status</Text>
              </>
            )}
          </View>
        </View>

        {/* Bio (when enriched) */}
        {artist.bio ? (
          <View className="mt-5 rounded-3xl border border-white/[0.14] bg-white/[0.09] p-4">
            <Text numberOfLines={3} className="text-xs leading-5 text-[#d9ccf5]">
              {artist.bio}
            </Text>
          </View>
        ) : null}

        {/* Similar artists (real data only, hidden when empty) */}
        {related && related.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-5 mt-[26px]"
            contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}
          >
            {related.map((rel) => (
              <TouchableOpacity
                key={rel.id}
                onPress={() => handleSelectRelated(rel.id)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Open ${rel.name}`}
                className="w-[68px] items-center"
              >
                <Art
                  id={`rel_${rel.id}`}
                  uri={rel.image_uri}
                  colors={getArtistGradient(rel.name)}
                  label={getArtistInitials(rel.name)}
                  className="h-16 w-16 rounded-[22px]"
                  textClass="text-base"
                />
                <Text
                  numberOfLines={1}
                  className="mt-2 text-[11px] font-medium text-[#bbaae6]"
                >
                  {rel.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Albums (real data; tap to filter songs) */}
        {albums && albums.length > 0 && (
          <View className="mt-[30px]">
            <Text className="text-[15px] font-bold text-white">Albums</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="-mx-5 mt-3"
              contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
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
                      setShownCount(PAGE_SIZE);
                    }}
                  />
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* All songs */}
        <View className="mt-[30px]">
          <View className="flex-row items-baseline justify-between">
            <Text className="text-[15px] font-bold text-white">All songs</Text>
            <Text className="text-xs text-[#bbaae6]">
              {songs?.length ?? 0} {songs?.length === 1 ? 'song' : 'songs'}
            </Text>
          </View>

          {/* Sort chips */}
          <View className="mt-3 flex-row gap-2">
            {SORTS.map((label, k) => {
              const on = sortIndex === k;
              return (
                <TouchableOpacity
                  key={label}
                  onPress={() => setSort(k)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  className="h-11 items-center justify-center overflow-hidden rounded-full border border-white/[0.14] px-[18px]"
                  style={on ? null : { backgroundColor: 'rgba(255,255,255,0.08)' }}
                >
                  {on ? <Grad id="sort_on" colors={PINK_GRAD} /> : null}
                  <Text className="text-[13px] font-semibold text-white">{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Active album filter */}
          {albumFilter ? (
            <TouchableOpacity
              onPress={clearAlbum}
              accessibilityRole="button"
              accessibilityLabel={`Clear album filter ${albumFilter}`}
              className="mt-2.5 h-[38px] flex-row items-center gap-2 self-start rounded-full border border-white/[0.14] bg-white/[0.09] px-3.5"
            >
              <Text className="text-[13px] font-medium text-white">{albumFilter}</Text>
              <Text className="text-[13px] font-semibold text-[#ff7cc4]">×</Text>
            </TouchableOpacity>
          ) : null}

          {/* Rows */}
          <View className="mt-2.5">
            {visibleSongs.length === 0 ? (
              <View className="items-center justify-center py-8">
                <Text className="text-sm font-medium text-[#bbaae6]">No songs found.</Text>
              </View>
            ) : (
              visibleSongs.map((song, idx) => (
                <SongRow
                  key={song.id}
                  song={song}
                  active={currentTrack?.id === song.id}
                  playing={isPlayingGlobal}
                  onPress={() => handlePlaySong(idx)}
                  isScreenActive={isFocused}
                />
              ))
            )}
          </View>

          {remainingSongs > 0 && (
            <TouchableOpacity
              onPress={() => setShownCount((s) => s + PAGE_SIZE)}
              accessibilityRole="button"
              className="mt-2.5 h-11 items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.09]"
            >
              <Text className="text-[13px] font-semibold text-white">
                Show {Math.min(PAGE_SIZE, remainingSongs)} more
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Docked mini player (global player) */}
      {currentTrack && (
        <View
          className="absolute left-3 right-3 h-[68px] flex-row items-center gap-3 overflow-hidden rounded-[28px] border border-white/[0.16] bg-[#28125c]/90 px-2.5"
          style={{ bottom: insets.bottom + 12 }}
        >
          <Art
            id="mini_cur"
            uri={currentTrack.artwork_uri}
            colors={currentColors}
            label={getArtistInitials(currentTrack.title)}
            className="h-12 w-12 rounded-2xl"
          />

          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm font-semibold text-white">
              {currentTrack.title}
            </Text>
            <Text numberOfLines={1} className="mt-0.5 text-xs text-[#bbaae6]">
              {currentTrack.artist || 'Unknown Artist'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={goNext}
            accessibilityRole="button"
            accessibilityLabel="Next song"
            className="h-11 w-11 items-center justify-center"
          >
            <IconNext />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={togglePlay}
            accessibilityRole="button"
            accessibilityLabel={isPlayingGlobal ? 'Pause' : 'Play'}
            className="h-12 w-12 items-center justify-center overflow-hidden rounded-full"
          >
            <Grad id="mini_play" colors={PINK_GRAD} />
            {isPlayingGlobal ? <IconPause /> : <IconPlay />}
          </TouchableOpacity>

          {/* progress line */}
          <View
            pointerEvents="none"
            className="absolute bottom-0 left-0 h-[3px] bg-[#ff7cc4]"
            style={{ width: `${progress * 100}%` }}
          />
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