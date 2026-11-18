import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useIsFocused } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';

/* ───────────── theme ───────────── */
const COLORS = {
  screen: '#0b0b0e',
  amber: '#e0a030',
  amberSoft: 'rgba(224,160,48,0.2)',
  fg: '#f5f5f7',
  muted: '#8a8a94',
  chip: '#1c1c22',
  onAmber: '#2a1500',
  like: '#ff5c85',
  accent: '#ff2d55',
};
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

/* ───────────── data ───────────── */
// each item: { id, title, songs, gradient: [from, to] }
const PLAYLISTS = [
  { id: 1, title: 'Chill Sunset', songs: 8, gradient: ['#dea962', '#c98a5a'] },
  { id: 2, title: 'Neon Night Drive', songs: 10, gradient: ['#3b2a7a', '#1b1240'] },
  { id: 3, title: 'Golden Hour Pop', songs: 12, gradient: ['#f2b134', '#e0603a'] },
  { id: 4, title: 'Rainy Day Lo-fi', songs: 15, gradient: ['#7fa7d6', '#3c5f8f'] },
  { id: 5, title: 'Gym Power Mix', songs: 20, gradient: ['#6fd06f', '#2f8f4a'] },
  { id: 6, title: 'Midnight Echoes', songs: 14, gradient: ['#6a4fd8', '#2a1d6e'] },
  { id: 7, title: 'Ocean Breeze', songs: 11, gradient: ['#4f8fd8', '#1d3a6e'] },
  { id: 8, title: 'Sunset Boulevard', songs: 9, gradient: ['#e69a12', '#c25d1a'] },
  { id: 9, title: 'Forest Walk', songs: 16, gradient: ['#4fd88a', '#1d6e45'] },
  { id: 10, title: 'Fresh Finds', songs: 7, gradient: ['#ec6f8e', '#8e2a55'] },
  { id: 11, title: 'New In Pop', songs: 12, gradient: ['#dea962', '#e09a66'] },
  { id: 12, title: 'Indie Drops', songs: 9, gradient: ['#4f8fd8', '#1d3a6e'] },
  { id: 13, title: 'Weekly Radar', songs: 15, gradient: ['#6a4fd8', '#2a1d6e'] },
  { id: 14, title: 'Morning Boost', songs: 18, gradient: ['#f2b134', '#e0603a'] },
  { id: 15, title: 'Focus Flow', songs: 22, gradient: ['#4fd88a', '#1d6e45'] },
];

/* ───────────── mock tracks (replace with real data) ───────────── */
const TITLES = [
  'Midnight Drive', 'Golden Hour', 'Paper Planes', 'Slow Burn', 'Neon Rain', 'Static Hearts',
  'Afterglow', 'Velvet Sky', 'Low Tide', 'Echo Park', 'Satellite', 'Daydream',
  'Wildflower', 'Pale Light', 'Ocean Eyes', 'Runaway', 'Blue Hour', 'Soft Static',
  'Late Bloom', 'Northbound', 'Glass Houses', 'Moon Phase', 'Honey Roads', 'Skyline',
];
const ARTISTS = ['Nova Lane', 'The Static', 'Mira Vale', 'Kairo', 'Lumen', 'Ola Reyes', 'Harbor', 'Sundial'];

const seeded = (n) => {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

function buildTracks(playlistId, count) {
  const base = Math.floor(seeded(playlistId) * TITLES.length);
  return Array.from({ length: count }, (_, i) => ({
    id: `${playlistId}-${i}`,
    title: TITLES[(base + i) % TITLES.length],
    artist: ARTISTS[Math.floor(seeded(playlistId * 31 + i) * ARTISTS.length)],
    seconds: 150 + Math.floor(seeded(playlistId * 17 + i) * 110), // 2:30 – 4:20
  }));
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/* ───────────── icons ───────────── */
const PATHS = {
  back: 'm15 18-6-6 6-6',
  play: 'M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  heart: 'M12 20.5s-7.5-4.5-7.5-10A4.3 4.3 0 0 1 12 7.8a4.3 4.3 0 0 1 7.5 2.7c0 5.5-7.5 10-7.5 10Z',
  download: 'M12 3v12m0 0-4-4m4 4 4-4M5 21h14',
  shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
};

function Icon({ name, size = 24, color = '#fff', filled = false, stroke = 1.8 }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={filled ? 'none' : color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={PATHS[name]} />
    </Svg>
  );
}

function HeartIcon({ size, active, inactiveColor }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={active ? COLORS.like : 'none'}
      stroke={active ? COLORS.like : inactiveColor}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={PATHS.heart} />
    </Svg>
  );
}

const NoteIcon = ({ size = 56 }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fff"
    strokeWidth={1.3}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M9 18V5l11-2v13" />
    <Circle cx={6} cy={18} r={3} />
    <Circle cx={17} cy={16} r={3} />
  </Svg>
);

function Equalizer({ color = COLORS.amber, isScreenActive = true }) {
  const bars = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!isScreenActive) {
      bars.forEach((v) => v.setValue(0));
      return undefined;
    }
    const loops = bars.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 360 + i * 140, useNativeDriver: false }),
          Animated.timing(v, { toValue: 0, duration: 360 + i * 140, useNativeDriver: false }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [bars, isScreenActive]);

  return (
    <View style={styles.equalizer}>
      {bars.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            borderRadius: 2,
            backgroundColor: color,
            height: v.interpolate({ inputRange: [0, 1], outputRange: [4, 16] }),
          }}
        />
      ))}
    </View>
  );
}

function RoundBtn({ children, onPress, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      hitSlop={HIT}
      style={[styles.roundBtn, style]}
    >
      {children}
    </TouchableOpacity>
  );
}

/* ───────────── track row ───────────── */
function TrackRow({ track, index, current, playing, liked, onPress, onLike, isScreenActive = true }) {
  return (
    <TouchableOpacity style={styles.trackRow} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.trackIndexWrap}>
        {current && playing ? (
          <Equalizer isScreenActive={isScreenActive} />
        ) : (
          <Text style={[styles.trackIndex, { color: current ? COLORS.amber : COLORS.muted }]}>
            {index + 1}
          </Text>
        )}
      </View>

      <View style={styles.trackInfo}>
        <Text
          style={[styles.trackTitle, { color: current ? COLORS.amber : COLORS.fg }]}
          numberOfLines={1}
        >
          {track.title}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>

      <TouchableOpacity onPress={onLike} hitSlop={HIT} activeOpacity={0.7} style={styles.trackLikeBtn}>
        <HeartIcon size={20} active={liked} inactiveColor={COLORS.muted} />
      </TouchableOpacity>

      <Text style={styles.trackDuration}>{fmt(track.seconds)}</Text>
    </TouchableOpacity>
  );
}

/* ───────────── screen ───────────── */
export default function PlaylistDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  const { playlistId } = useLocalSearchParams();
  const { width } = useWindowDimensions();

  const playlist = useMemo(
    () => PLAYLISTS.find((p) => String(p.id) === String(playlistId)),
    [playlistId],
  );
  const tracks = useMemo(
    () => (playlist ? buildTracks(Number(playlist.id) || 1, Math.max(Number(playlist.songs) || 8, 1)) : []),
    [playlist],
  );

  const [currentIdx, setCurrentIdx] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likedTracks, setLikedTracks] = useState(() => new Set());

  const scrollY = useRef(new Animated.Value(0)).current;

  const coverW = Math.min(width * 0.62, 260);
  const heroTop = insets.top + 72;

  const totalMin = Math.round(tracks.reduce((s, t) => s + t.seconds, 0) / 60);

  /* animations */
  const coverScale = scrollY.interpolate({
    inputRange: [-150, 0, 260],
    outputRange: [1.15, 1, 0.82],
    extrapolate: 'clamp',
  });
  const coverOpacity = scrollY.interpolate({
    inputRange: [0, 260],
    outputRange: [1, 0.25],
    extrapolate: 'clamp',
  });
  const barStart = heroTop + coverW * 0.8;
  const barBg = scrollY.interpolate({
    inputRange: [barStart, barStart + 50],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  /* actions */
  const playTrack = (i) => {
    if (currentIdx === i) {
      setPlaying((p) => !p);
    } else {
      setCurrentIdx(i);
      setPlaying(true);
    }
  };
  const playAll = () => {
    if (currentIdx === null) {
      setCurrentIdx(shuffle ? Math.floor(Math.random() * tracks.length) : 0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  };
  const toggleTrackLike = (id) =>
    setLikedTracks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* not found */
  if (!playlist) {
    return (
      <View style={[styles.notFound, { paddingTop: insets.top }]}>
        <Text style={styles.notFoundTitle}>Playlist not found</Text>
        <Text style={styles.notFoundText}>This playlist may have been removed.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.notFoundBtn}>
          <Text style={styles.notFoundBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const grad = playlist.gradient;

  return (
    <View style={styles.root}>
      <Animated.ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
      >
        {/* ── hero ── */}
        <View style={[styles.hero, { paddingTop: heroTop }]}>
          <LinearGradient
            colors={[`${grad[0]}b0`, `${grad[1]}30`, COLORS.screen]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <Animated.View style={{ transform: [{ scale: coverScale }], opacity: coverOpacity }}>
            <View
              style={[
                styles.coverShadow,
                {
                  shadowColor: grad[0],
                  shadowOpacity: 0.45,
                  shadowRadius: 28,
                  shadowOffset: { width: 0, height: 16 },
                  elevation: 16,
                },
              ]}
            >
              <LinearGradient
                colors={grad}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.cover, { width: coverW, height: coverW }]}
              >
                <View style={styles.coverCircleTop} />
                <View style={styles.coverCircleBottom} />
                <NoteIcon size={coverW * 0.28} />
              </LinearGradient>
            </View>
          </Animated.View>

          <Text style={styles.title} numberOfLines={2}>
            {playlist.title}
            <Text style={styles.titleDot}>.</Text>
          </Text>
          <Text style={styles.subtitle}>
            By Waveform • {tracks.length} songs • {totalMin} min
          </Text>
        </View>

        {/* ── actions ── */}
        <View style={styles.actionsRow}>
          <View style={styles.actionsLeft}>
            <TouchableOpacity onPress={() => setLiked((v) => !v)} hitSlop={HIT} activeOpacity={0.7}>
              <HeartIcon size={28} active={liked} inactiveColor="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSaved((v) => !v)} hitSlop={HIT} activeOpacity={0.7}>
              <Icon name="download" size={28} color={saved ? COLORS.amber : '#fff'} />
            </TouchableOpacity>
          </View>

          <View style={styles.actionsRight}>
            <RoundBtn
              onPress={() => setShuffle((v) => !v)}
              style={{ backgroundColor: shuffle ? COLORS.amberSoft : COLORS.chip }}
            >
              <Icon name="shuffle" size={20} color={shuffle ? COLORS.amber : '#c4c4cc'} />
            </RoundBtn>
            <TouchableOpacity onPress={playAll} activeOpacity={0.85} style={styles.playBtn}>
              <Icon name={playing ? 'pause' : 'play'} size={24} color={COLORS.onAmber} filled />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── tracks ── */}
        <View style={styles.tracksHeader}>
          <Text style={styles.tracksHeading}>Tracks</Text>
          <Text style={styles.tracksCount}>{tracks.length} songs</Text>
        </View>
        <View style={styles.tracksList}>
          {tracks.map((t, i) => (
            <TrackRow
              key={t.id}
              track={t}
              index={i}
              current={currentIdx === i}
              playing={playing}
              liked={likedTracks.has(t.id)}
              onPress={() => playTrack(i)}
              onLike={() => toggleTrackLike(t.id)}
              isScreenActive={isFocused}
            />
          ))}
        </View>
      </Animated.ScrollView>

      {/* ── sticky top bar ── */}
      <View pointerEvents="box-none" style={[styles.topBar, { paddingTop: insets.top }]}>
        <Animated.View pointerEvents="none" style={[styles.topBarBg, { opacity: barBg }]} />
        <View style={styles.topBarRow}>
          <RoundBtn onPress={() => router.back()} style={styles.backBtn}>
            <Icon name="back" size={22} />
          </RoundBtn>
          <Animated.View style={[styles.topBarTitleWrap, { opacity: barBg }]}>
            <Text style={styles.topBarTitle} numberOfLines={1}>
              {playlist.title}
            </Text>
          </Animated.View>
          <View style={styles.topBarSpacer} />
        </View>
      </View>
    </View>
  );
}

/* ───────────── styles ───────────── */
const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: COLORS.screen },
  scrollContent: { paddingBottom: 130 },

  /* not found */
  notFound: {
    flex: 1,
    backgroundColor: COLORS.screen,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  notFoundTitle: { fontSize: 24, fontWeight: '700', color: COLORS.fg },
  notFoundText: { marginTop: 8, fontSize: 14, color: COLORS.muted, textAlign: 'center' },
  notFoundBtn: {
    marginTop: 24,
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.onAmber },

  /* hero */
  hero: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 24 },
  coverShadow: { borderRadius: 32 },
  cover: {
    borderRadius: 32,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverCircleTop: {
    position: 'absolute',
    right: -48,
    top: -48,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  coverCircleBottom: {
    position: 'absolute',
    left: -40,
    bottom: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  title: {
    marginTop: 28,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: COLORS.fg,
    textAlign: 'center',
  },
  titleDot: { color: COLORS.accent },
  subtitle: { marginTop: 8, fontSize: 14, color: COLORS.muted },

  /* actions */
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  actionsLeft: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  actionsRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },

  /* tracks */
  tracksHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 32,
    marginBottom: 4,
    paddingHorizontal: 20,
  },
  tracksHeading: { fontSize: 20, fontWeight: '700', color: COLORS.fg },
  tracksCount: { fontSize: 14, color: COLORS.muted },
  tracksList: { paddingHorizontal: 20 },

  /* track row */
  trackRow: { flexDirection: 'row', alignItems: 'center', height: 64 },
  trackIndexWrap: { width: 36, alignItems: 'center' },
  trackIndex: { fontSize: 14, fontWeight: '600' },
  trackInfo: { flex: 1, minWidth: 0, paddingRight: 12 },
  trackTitle: { fontSize: 16, fontWeight: '600' },
  trackArtist: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  trackLikeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  trackDuration: { width: 44, textAlign: 'right', fontSize: 12, color: COLORS.muted },

  /* equalizer */
  equalizer: { flexDirection: 'row', alignItems: 'flex-end', height: 16, gap: 2 },

  /* sticky top bar */
  topBar: { position: 'absolute', left: 0, right: 0, top: 0 },
  topBarBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: COLORS.screen,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    height: 56,
  },
  backBtn: { backgroundColor: 'rgba(0,0,0,0.3)' },
  topBarTitleWrap: { flex: 1, marginHorizontal: 12 },
  topBarTitle: { fontSize: 16, fontWeight: '700', color: COLORS.fg, textAlign: 'center' },
  topBarSpacer: { width: 40 },
});