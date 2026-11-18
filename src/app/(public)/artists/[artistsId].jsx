/**
 * ArtistScreen — "Obsidian" redesign (approved preview), performance build
 *
 * Same data layer as before: useArtistProfile, getArtistPlayableQueue,
 * getArtistGradient / getArtistInitials and the global usePlayer().
 *
 * "Render only what is on screen":
 *  - The whole page is ONE virtualized FlatList. Song rows are mounted only
 *    near the viewport (windowed) and un-mounted again when scrolled away,
 *    so the old "Show N more" pagination is gone; every song is reachable.
 *  - Albums / similar artists are horizontal FlatLists (windowed as well).
 *  - The list header is a memoized element: it does not re-render when the
 *    track, play state or playback position changes.
 *  - Rows, cards and artwork are React.memo with stable callbacks (index /
 *    name based), so a track change re-renders only the 2 affected rows.
 *  - The equalizer is ONE native-driven animation per active row (not 3),
 *    and it only runs while the row is mounted, active, playing AND the
 *    screen is focused. Off-screen rows have no animation at all.
 *  - The playback position lives in a tiny <ProgressLine /> so ticks never
 *    touch the list.
 *
 * Needs: react-native-svg, react-native-safe-area-context, expo-router.
 *        No new dependencies.
 */
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useIsFocused } from 'expo-router';
import Svg, {
  Path,
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

/* ───────────── Theme ───────────── */
const GROUND = '#0A0A0B';
const IVORY = '#F2EEE6';
const MUTED = '#9A968C';
const AMBER = '#E3B462';

// Condensed display face. Android ships "sans-serif-condensed", so no font
// package is needed. To use Barlow Condensed instead, load it with
// @expo-google-fonts/barlow-condensed and set DISPLAY to its family name.
const DISPLAY = Platform.select({ android: 'sans-serif-condensed', default: undefined });

const ROW_H = 68;
const SORTS = ['Popular', 'Newest', 'A–Z'];
const SORT_MAP = { 0: 'popular', 1: 'newest', 2: 'az' };

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

const keyOfSong = (s) => String(s.id);
const keyOfAlbum = (a) => a.name;
const keyOfRelated = (r) => String(r.id);

/* ───────────── Icons ───────────── */
const IconBack = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={IVORY} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 5l-7 7 7 7" />
  </Svg>
);
const IconPlay = ({ size = 18, color = GROUND }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z" />
  </Svg>
);
const IconPause = ({ size = 18, color = GROUND }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M6 5h4v14H6zm8 0h4v14h-4z" />
  </Svg>
);
const IconNext = ({ size = 20, color = IVORY }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M6 4.5v15a1 1 0 0 0 1.5.9L16 13.8V19a1 1 0 1 0 2 0V5a1 1 0 1 0-2 0v5.2L7.5 3.6A1 1 0 0 0 6 4.5Z" />
  </Svg>
);

/* ───────────── Building blocks ───────────── */

/** Fills its (overflow-hidden, rounded) parent with a diagonal gradient. */
const Grad = React.memo(({ id, colors }) => (
  <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
    <Defs>
      <SvgGradient id={gid(id)} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={colors[0]} />
        <Stop offset="1" stopColor={colors[1]} />
      </SvgGradient>
    </Defs>
    <Rect width="100%" height="100%" fill={`url(#${gid(id)})`} />
  </Svg>
));
Grad.displayName = 'Grad';

/** Vertical fade from transparent into the page ground. */
const FadeToGround = React.memo(({ height }) => (
  <Svg width="100%" height={height} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} pointerEvents="none">
    <Defs>
      <SvgGradient id="hero_fade" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={GROUND} stopOpacity={0} />
        <Stop offset="1" stopColor={GROUND} stopOpacity={1} />
      </SvgGradient>
    </Defs>
    <Rect width="100%" height="100%" fill="url(#hero_fade)" />
  </Svg>
));
FadeToGround.displayName = 'FadeToGround';

/** Curved-corner picture holder: real image, or gradient + initials. */
const Art = React.memo(({ id, uri, colors, label, style, textStyle = styles.artTextSmall }) => (
  <View style={[styles.artClip, style]}>
    {uri ? (
      <Image
        source={{ uri }}
        style={styles.artFill}
        resizeMode="cover"
        resizeMethod="resize"
        fadeDuration={0}
      />
    ) : (
      <View style={styles.artInner}>
        <Grad id={id} colors={colors} />
        <Text style={[styles.artText, textStyle, { fontFamily: DISPLAY }]}>
          {label}
        </Text>
      </View>
    )}
  </View>
));
Art.displayName = 'Art';

/* ───────────── Equalizer (one native-driven loop, runs only when needed) ───────────── */
const EQ_PATTERNS = [
  [0.3, 1, 0.45, 0.9, 0.3],
  [0.8, 0.35, 1, 0.4, 0.8],
  [0.5, 0.9, 0.3, 1, 0.5],
];

const EqualizerBars = React.memo(({ running }) => {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!running) {
      t.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [running, t]);

  const bars = useMemo(
    () =>
      EQ_PATTERNS.map((out) =>
        t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: out })
      ),
    [t]
  );

  return (
    <View style={styles.eqWrap}>
      {bars.map((scaleY, i) => (
        <Animated.View
          key={i}
          style={[styles.eqBar, { transform: [{ scaleY }] }]}
        />
      ))}
    </View>
  );
});
EqualizerBars.displayName = 'EqualizerBars';

/* ───────────── Song row (mounted only near the viewport) ───────────── */
const SongRow = React.memo(({ song, index, active, playing, focused, onPlay }) => {
  const colors = useMemo(
    () => getArtistGradient(song.album || song.artist || song.title),
    [song.album, song.artist, song.title]
  );
  const handlePress = useCallback(() => onPlay(index), [onPlay, index]);
  const showBars = active && playing;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Play ${song.title}`}
      style={[styles.songRow, { height: ROW_H }]}
    >
      <Art
        id={`row_${song.id}`}
        uri={song.artwork_uri}
        colors={colors}
        label={getArtistInitials(song.title)}
        style={styles.songRowArt}
      />

      <View style={styles.songInfo}>
        <Text
          numberOfLines={1}
          style={[styles.songTitle, { color: active ? '#E3B462' : '#F2EEE6' }]}
        >
          {song.title}
        </Text>
        <Text numberOfLines={1} style={styles.songArtist}>
          {song.artist || 'Unknown Artist'}
          {song.album ? ` · ${song.album}` : ''}
        </Text>
      </View>

      {showBars ? (
        <EqualizerBars running={focused} />
      ) : (
        <Text style={[styles.songDuration, { fontVariant: ['tabular-nums'] }]}>
          {fmt(song.duration)}
        </Text>
      )}
    </TouchableOpacity>
  );
});
SongRow.displayName = 'SongRow';

/* ───────────── Album tile ───────────── */
const AlbumCard = React.memo(({ album, isSelected, onSelect }) => {
  const colors = useMemo(() => getArtistGradient(album.name), [album.name]);
  const handlePress = useCallback(() => onSelect(album.name), [onSelect, album.name]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Filter by album ${album.name}`}
      accessibilityState={{ selected: isSelected }}
      style={[styles.albumCard, isSelected ? styles.albumCardSelected : null]}
    >
      {album.artwork_uri ? (
        <>
          <Image
            source={{ uri: album.artwork_uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            resizeMethod="resize"
            fadeDuration={0}
          />
          <View style={styles.albumScrim} />
        </>
      ) : (
        <Grad id={`alb_${album.name}`} colors={colors} />
      )}

      {album.year ? (
        <Text style={styles.albumYear}>{album.year}</Text>
      ) : null}

      <Text
        numberOfLines={2}
        style={[styles.albumName, { fontFamily: DISPLAY }]}
      >
        {album.name}
      </Text>
    </TouchableOpacity>
  );
});
AlbumCard.displayName = 'AlbumCard';

/* ───────────── Similar artist tile ───────────── */
const RelatedItem = React.memo(({ rel, onOpen }) => {
  const colors = useMemo(() => getArtistGradient(rel.name), [rel.name]);
  const handlePress = useCallback(() => onOpen(rel.id), [onOpen, rel.id]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Open ${rel.name}`}
      style={styles.relatedItem}
    >
      <Art
        id={`rel_${rel.id}`}
        uri={rel.image_uri}
        colors={colors}
        label={getArtistInitials(rel.name)}
        style={styles.relatedArt}
        textStyle={styles.relatedArtText}
      />
      <Text numberOfLines={1} style={styles.relatedName}>
        {rel.name}
      </Text>
    </TouchableOpacity>
  );
});
RelatedItem.displayName = 'RelatedItem';

/* ───────────── Docked mini player ───────────── */

/** Only this tiny view re-renders on playback-position ticks. */
const ProgressLine = React.memo(() => {
  const { track, pos } = usePlayer();
  const duration = track?.duration || 1;
  const progress = Math.min(Math.max((pos || 0) / duration, 0), 1);
  return (
    <View
      pointerEvents="none"
      style={[styles.progressLine, { width: `${progress * 100}%` }]}
    />
  );
});
ProgressLine.displayName = 'ProgressLine';

const MiniPlayer = React.memo(({ track, playing, bottom, onNext, onToggle }) => {
  const colors = useMemo(
    () => getArtistGradient(track?.album || track?.artist || track?.title || ''),
    [track?.album, track?.artist, track?.title]
  );

  return (
    <View
      style={[styles.miniPlayer, { bottom }]}
    >
      <Art
        id="mini_cur"
        uri={track.artwork_uri}
        colors={colors}
        label={getArtistInitials(track.title)}
        style={styles.miniArt}
      />

      <View style={styles.miniInfo}>
        <Text numberOfLines={1} style={styles.miniTitle}>
          {track.title}
        </Text>
        <Text numberOfLines={1} style={styles.miniArtist}>
          {track.artist || 'Unknown Artist'}
        </Text>
      </View>

      <TouchableOpacity
        onPress={onNext}
        accessibilityRole="button"
        accessibilityLabel="Next song"
        style={styles.miniNextBtn}
      >
        <IconNext />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause' : 'Play'}
        style={styles.miniPlayBtn}
      >
        {playing ? <IconPause /> : <IconPlay />}
      </TouchableOpacity>

      <ProgressLine />
    </View>
  );
});
MiniPlayer.displayName = 'MiniPlayer';

/* ───────────── Screen content ───────────── */
function ArtistProfileContent({ artistId }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();

  // NOTE: `pos` is intentionally NOT read here (see <ProgressLine />).
  const { track: currentTrack, playing: isPlayingGlobal, playSongs, togglePlay, goNext } = usePlayer();

  const [sortIndex, setSortIndex] = useState(0);
  const [albumFilter, setAlbumFilter] = useState(null);

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
    () => (artist?.name ? getArtistGradient(artist.name) : ['#4a3516', '#1a1208']),
    [artist?.name]
  );
  const artistInitials = useMemo(
    () => (artist?.name ? getArtistInitials(artist.name) : '??'),
    [artist?.name]
  );

  /* Actions (all stable, so memoized children never re-render for them) */
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

  const handleSelectAlbum = useCallback(
    (name) => setAlbumFilter((prev) => (prev === name ? null : name)),
    []
  );
  const clearAlbum = useCallback(() => setAlbumFilter(null), []);
  const goBack = useCallback(() => router.back(), [router]);

  const currentId = currentTrack?.id;

  /* List renderers */
  const renderSong = useCallback(
    ({ item, index }) => (
      <SongRow
        song={item}
        index={index}
        active={currentId === item.id}
        playing={isPlayingGlobal}
        focused={isFocused}
        onPlay={handlePlaySong}
      />
    ),
    [currentId, isPlayingGlobal, isFocused, handlePlaySong]
  );

  const renderAlbum = useCallback(
    ({ item }) => (
      <AlbumCard album={item} isSelected={albumFilter === item.name} onSelect={handleSelectAlbum} />
    ),
    [albumFilter, handleSelectAlbum]
  );

  const renderRelated = useCallback(
    ({ item }) => <RelatedItem rel={item} onOpen={handleSelectRelated} />,
    [handleSelectRelated]
  );

  // Only changes when the current track / play state / focus changes.
  const extraData = useMemo(
    () => `${currentId}|${isPlayingGlobal}|${isFocused}`,
    [currentId, isPlayingGlobal, isFocused]
  );

  const songCount = songs?.length ?? 0;
  const topInset = insets.top;

  /* List header: hero, stats, actions, similar, albums, sort. Memoized so
     playback changes never re-render it. */
  const header = useMemo(() => {
    if (!artist) return null;
    return (
      <View>
        {/* Hero */}
        <View style={{ height: 410 + topInset }}>
          {artist.image_uri ? (
            <Image
              source={{ uri: artist.image_uri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              resizeMethod="resize"
            />
          ) : (
            <>
              <Grad id={`hero_${artist.id}`} colors={artistColors} />
              <View style={styles.heroScrim} />
              <Text
                allowFontScaling={false}
                style={[
                  styles.heroInitials,
                  {
                    right: -24,
                    top: topInset + 40,
                    fontSize: 300,
                    lineHeight: 300,
                    letterSpacing: -6,
                    fontFamily: DISPLAY,
                  },
                ]}
              >
                {artistInitials}
              </Text>
            </>
          )}
          <FadeToGround height={260} />

          <TouchableOpacity
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={[styles.heroBackBtn, { top: topInset + 8 }]}
          >
            <IconBack />
          </TouchableOpacity>

          <View style={styles.heroTitleWrap}>
            <Text style={styles.heroKicker}>ARTIST</Text>
            <Text
              numberOfLines={3}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              style={[styles.heroName, { fontFamily: DISPLAY, fontSize: 72, lineHeight: 66 }]}
            >
              {artist.name}
            </Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { fontFamily: DISPLAY }]}>
              {stats?.songCount ?? 0}
            </Text>
            <Text style={styles.statLabel}>SONGS</Text>
          </View>
          <View style={styles.statCellDivider}>
            <Text style={[styles.statValue, { fontFamily: DISPLAY }]}>
              {stats?.albumCount ?? 0}
            </Text>
            <Text style={styles.statLabel}>ALBUMS</Text>
          </View>
          <View style={styles.statCellDivider}>
            {stats?.followerCount != null ? (
              <>
                <Text style={[styles.statValue, { fontFamily: DISPLAY }]}>
                  {cn(stats.followerCount)}
                </Text>
                <Text style={styles.statLabel}>LISTENERS</Text>
              </>
            ) : (
              <>
                <Text style={[styles.statValue, { fontFamily: DISPLAY }]}>
                  {following ? 'Followed' : 'Local'}
                </Text>
                <Text style={styles.statLabel}>STATUS</Text>
              </>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={handlePlayHero}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Play all"
            style={styles.playAllBtn}
          >
            <IconPlay size={16} />
            <Text style={styles.playAllText}>Play all</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={toggleFollow}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={following ? 'Unfollow artist' : 'Follow artist'}
            style={[styles.followBtn, following ? styles.followBtnActive : styles.followBtnInactive]}
          >
            <Text
              style={[styles.followText, { color: following ? '#E3B462' : '#F2EEE6' }]}
            >
              {following ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Similar artists (real data only, hidden when empty) */}
        {related && related.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>SIMILAR ARTISTS</Text>
            <FlatList
              horizontal
              data={related}
              renderItem={renderRelated}
              keyExtractor={keyOfRelated}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 14 }}
              initialNumToRender={5}
              maxToRenderPerBatch={4}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
            />
          </View>
        ) : null}

        {/* Albums (real data; tap to filter songs) */}
        {albums && albums.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>ALBUMS</Text>
            <FlatList
              horizontal
              data={albums}
              extraData={albumFilter}
              renderItem={renderAlbum}
              keyExtractor={keyOfAlbum}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 14 }}
              initialNumToRender={3}
              maxToRenderPerBatch={3}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
            />
          </View>
        ) : null}

        {/* All songs: title + sort tabs + active filter */}
        <View style={styles.allSongs}>
          <View style={styles.allSongsHeader}>
            <Text style={styles.sectionHeadingPlain}>ALL SONGS</Text>
            <Text style={styles.songCount}>
              {songCount} {songCount === 1 ? 'song' : 'songs'}
            </Text>
          </View>

          <View style={styles.sortRow}>
            {SORTS.map((label, k) => {
              const on = sortIndex === k;
              return (
                <TouchableOpacity
                  key={label}
                  onPress={() => setSortIndex(k)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.sortTab, on ? styles.sortTabActive : styles.sortTabInactive]}
                >
                  <Text style={[styles.sortTabText, { color: on ? '#F2EEE6' : '#9A968C' }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {albumFilter ? (
            <TouchableOpacity
              onPress={clearAlbum}
              accessibilityRole="button"
              accessibilityLabel={`Clear album filter ${albumFilter}`}
              style={styles.albumChip}
            >
              <Text style={styles.albumChipText}>{albumFilter}</Text>
              <Text style={styles.albumChipX}>×</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.spacer} />
        </View>
      </View>
    );
  }, [
    artist,
    artistColors,
    artistInitials,
    topInset,
    stats,
    following,
    related,
    albums,
    albumFilter,
    sortIndex,
    songCount,
    toggleFollow,
    handlePlayHero,
    goBack,
    clearAlbum,
    renderAlbum,
    renderRelated,
  ]);

  const listContentStyle = useMemo(
    () => ({ paddingBottom: currentTrack ? 120 + insets.bottom : 60 }),
    [currentTrack, insets.bottom]
  );

  const empty = useMemo(
    () => (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No songs found.</Text>
      </View>
    ),
    []
  );

  /* ───────────── Loading / error / not found ───────────── */
  const BackButton = (
    <TouchableOpacity
      onPress={goBack}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={styles.loadBackBtn}
    >
      <IconBack />
    </TouchableOpacity>
  );

  if (loading && !artist) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={AMBER} />
        <Text style={styles.loadingText}>Loading artist profile...</Text>
      </View>
    );
  }

  if (error && !artist) {
    return (
      <View style={[styles.screenPad, { paddingTop: topInset + 20 }]}>
        {BackButton}
        <View style={styles.centerFill}>
          <Text style={styles.errorTitle}>Error loading artist</Text>
          <Text style={styles.errorText}>
            {error.message || 'An error occurred while reading from the music library.'}
          </Text>
          <TouchableOpacity
            onPress={refresh}
            style={styles.pillBtn}
          >
            <Text style={styles.pillBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!artist) {
    return (
      <View style={[styles.screenPad, { paddingTop: topInset + 20 }]}>
        {BackButton}
        <View style={styles.centerFill}>
          <Text style={styles.notFoundTitle}>Artist not found</Text>
          <Text style={styles.errorText}>
            This artist could not be located in your local music database.
          </Text>
          <TouchableOpacity
            onPress={goBack}
            style={styles.pillBtn}
          >
            <Text style={styles.pillBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={songs ?? []}
        extraData={extraData}
        renderItem={renderSong}
        keyExtractor={keyOfSong}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={listContentStyle}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      {currentTrack ? (
        <MiniPlayer
          track={currentTrack}
          playing={isPlayingGlobal}
          bottom={insets.bottom + 24}
          onNext={goNext}
          onToggle={togglePlay}
        />
      ) : null}
    </View>
  );
}

export default function ArtistScreen() {
  const params = useLocalSearchParams();
  const rawId = params.artistsId ?? params.artistsid ?? params.id;
  const artistId = rawId ? Number(rawId) : null;

  return <ArtistProfileContent key={artistId} artistId={artistId} />;
}

const styles = StyleSheet.create({
  /* Art */
  artClip: { overflow: 'hidden' },
  artFill: { height: '100%', width: '100%' },
  artInner: { height: '100%', width: '100%', alignItems: 'center', justifyContent: 'center' },
  artText: { fontWeight: '600', color: '#ffffff' },
  artTextSmall: { fontSize: 13 },

  /* Equalizer */
  eqWrap: { height: 16, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  eqBar: { height: 14, width: 2, borderRadius: 2, backgroundColor: '#E3B462' },

  /* Song row */
  songRow: {
    marginHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  songRowArt: { height: 48, width: 48, borderRadius: 16 },
  songInfo: { minWidth: 0, flex: 1, justifyContent: 'center' },
  songTitle: { fontSize: 15, fontWeight: '500' },
  songArtist: { marginTop: 3, fontSize: 12, color: '#9A968C' },
  songDuration: { fontSize: 12, color: '#9A968C' },

  /* Album tile */
  albumCard: {
    marginRight: 14,
    height: 150,
    width: 150,
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  albumCardSelected: { borderColor: '#F2EEE6' },
  albumScrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  albumYear: { position: 'absolute', left: 16, top: 14, fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  albumName: {
    position: 'absolute',
    bottom: 14,
    left: 16,
    right: 16,
    fontSize: 26,
    fontWeight: '600',
    textTransform: 'uppercase',
    lineHeight: 26,
    color: '#F2EEE6',
  },

  /* Similar artist */
  relatedItem: { marginRight: 16, width: 64 },
  relatedArt: { height: 64, width: 64, borderRadius: 20 },
  relatedArtText: { fontSize: 22 },
  relatedName: { marginTop: 8, fontSize: 11, color: '#9A968C' },

  /* Progress line */
  progressLine: { position: 'absolute', bottom: 0, left: 0, height: 2, backgroundColor: '#E3B462' },

  /* Mini player */
  miniPlayer: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#18171A',
    paddingLeft: 10,
    paddingRight: 12,
  },
  miniArt: { height: 46, width: 46, borderRadius: 15 },
  miniInfo: { minWidth: 0, flex: 1 },
  miniTitle: { fontSize: 14, fontWeight: '600', color: '#F2EEE6' },
  miniArtist: { marginTop: 2, fontSize: 12, color: '#9A968C' },
  miniNextBtn: { height: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
  miniPlayBtn: { height: 46, width: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 9999, backgroundColor: '#E3B462' },

  /* Hero */
  heroScrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(10,10,11,0.6)' },
  heroInitials: { position: 'absolute', fontWeight: '600', color: 'rgba(227,180,98,0.13)' },
  heroBackBtn: {
    position: 'absolute',
    left: 20,
    height: 44,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  heroTitleWrap: { position: 'absolute', bottom: 18, left: 24, right: 24 },
  heroKicker: { fontSize: 11, fontWeight: '500', letterSpacing: 3, color: '#E3B462' },
  heroName: { marginTop: 8, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: '#F2EEE6' },

  /* Stats */
  statsRow: { marginHorizontal: 24, flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  statCell: { flex: 1, paddingVertical: 16 },
  statCellDivider: { flex: 1, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.14)', paddingVertical: 16, paddingLeft: 20 },
  statValue: { fontSize: 30, fontWeight: '500', color: '#F2EEE6' },
  statLabel: { fontSize: 11, letterSpacing: 2, color: '#9A968C' },

  /* Actions */
  actionsRow: { marginHorizontal: 24, marginTop: 20, flexDirection: 'row', gap: 12 },
  playAllBtn: {
    height: 52,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 26,
    backgroundColor: '#F2EEE6',
  },
  playAllText: { fontSize: 14, fontWeight: '600', letterSpacing: 1, color: '#0A0A0B' },
  followBtn: { height: 52, width: 140, alignItems: 'center', justifyContent: 'center', borderRadius: 26, borderWidth: 1 },
  followBtnActive: { borderColor: '#E3B462' },
  followBtnInactive: { borderColor: 'rgba(255,255,255,0.3)' },
  followText: { fontSize: 14, fontWeight: '600', letterSpacing: 1 },

  /* Sections */
  section: { marginTop: 34 },
  sectionHeading: { marginHorizontal: 24, fontSize: 11, letterSpacing: 3, color: '#9A968C' },
  allSongs: { marginHorizontal: 24, marginTop: 36 },
  allSongsHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionHeadingPlain: { fontSize: 11, letterSpacing: 3, color: '#9A968C' },
  songCount: { fontSize: 12, color: '#9A968C' },
  sortRow: { marginTop: 6, flexDirection: 'row', gap: 26, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.14)' },
  sortTab: { marginBottom: -1, height: 44, justifyContent: 'center', borderBottomWidth: 2 },
  sortTabActive: { borderBottomColor: '#E3B462' },
  sortTabInactive: { borderBottomColor: 'transparent' },
  sortTabText: { fontSize: 13, fontWeight: '500' },
  albumChip: {
    marginTop: 12,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
  },
  albumChipText: { fontSize: 12, color: '#F2EEE6' },
  albumChipX: { fontSize: 12, fontWeight: '600', color: '#E3B462' },
  spacer: { height: 8 },

  /* Empty */
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 14, fontWeight: '500', color: '#9A968C' },

  /* Loading / error / not found */
  centerScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0B' },
  loadingText: { marginTop: 12, fontSize: 14, fontWeight: '500', color: '#9A968C' },
  screenPad: { flex: 1, backgroundColor: '#0A0A0B', paddingHorizontal: 24 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadBackBtn: {
    height: 44,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  errorTitle: { fontSize: 18, fontWeight: '600', color: '#E3B462' },
  notFoundTitle: { fontSize: 18, fontWeight: '600', color: '#F2EEE6' },
  errorText: { marginTop: 4, textAlign: 'center', fontSize: 14, color: '#9A968C' },
  pillBtn: {
    marginTop: 20,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: '#F2EEE6',
    paddingHorizontal: 24,
  },
  pillBtnText: { fontSize: 14, fontWeight: '600', color: '#0A0A0B' },

  /* Screen */
  root: { flex: 1, backgroundColor: '#0A0A0B' },
});