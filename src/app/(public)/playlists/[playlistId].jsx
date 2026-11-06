import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useIsFocused } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { cssInterop } from 'nativewind';
import Svg, { Path, Circle } from 'react-native-svg';

/* ───────────── data (was constants/data) ───────────── */
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

// lets <LinearGradient className="..." /> work (skip if already in a shared setup file)
cssInterop(LinearGradient, { className: 'style' });

// keep in sync with `screen` in tailwind.config.js
const SCREEN = '#0b0b0e';
const AMBER = '#e0a030';
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

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

const NoteIcon = ({ size = 56 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M9 18V5l11-2v13" />
    <Circle cx={6} cy={18} r={3} />
    <Circle cx={17} cy={16} r={3} />
  </Svg>
);

function Equalizer({ color = AMBER, isScreenActive = true }) {
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
    <View className="flex-row items-end h-4 gap-[2px]">
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

function RoundBtn({ children, onPress, className = '' }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      hitSlop={HIT}
      className={`w-10 h-10 rounded-full items-center justify-center ${className}`}
    >
      {children}
    </TouchableOpacity>
  );
}

/* ───────────── track row ───────────── */
function TrackRow({ track, index, current, playing, liked, onPress, onLike, isScreenActive = true }) {
  return (
    <TouchableOpacity
      className="flex-row items-center h-16"
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View className="w-9 items-center">
        {current && playing ? (
          <Equalizer isScreenActive={isScreenActive} />
        ) : (
          <Text textTransform="capitalize"  className={`text-sm font-semibold ${current ? 'text-amb' : 'text-mut'}`}>{index + 1}</Text>
        )}
      </View>
      <View className="flex-1 min-w-0 pr-3">
        <Text textTransform="capitalize"  className={`text-base font-semibold ${current ? 'text-amb' : 'text-fg'}`} numberOfLines={1}>
          {track.title}
        </Text>
        <Text textTransform="capitalize"  className="text-xs text-mut mt-1" numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
      <TouchableOpacity onPress={onLike} hitSlop={HIT} activeOpacity={0.7} className="w-9 h-9 items-center justify-center">
        <Svg
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill={liked ? '#ff5c85' : 'none'}
          stroke={liked ? '#ff5c85' : '#8a8a94'}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d={PATHS.heart} />
        </Svg>
      </TouchableOpacity>
      <Text textTransform="capitalize"  className="w-11 text-right text-xs text-mut">{fmt(track.seconds)}</Text>
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
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  /* not found */
  if (!playlist) {
    return (
      <View className="flex-1 bg-screen items-center justify-center px-8" style={{ paddingTop: insets.top }}>
        <Text textTransform="capitalize"  className="text-2xl font-bold text-fg">Playlist not found</Text>
        <Text textTransform="capitalize"  className="mt-2 text-sm text-mut text-center">This playlist may have been removed.</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-6 h-12 px-6 rounded-full bg-amb items-center justify-center"
        >
          <Text textTransform="capitalize"  className="text-base font-bold text-tabActive">Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const grad = playlist.gradient;

  return (
    <View className="flex-1 bg-screen">
      <Animated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
      >
        {/* ── hero ── */}
        <View className="items-center px-5 pb-6" style={{ paddingTop: heroTop }}>
          <LinearGradient
            colors={[`${grad[0]}b0`, `${grad[1]}30`, SCREEN]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            className="absolute inset-0"
          />

          <Animated.View style={{ transform: [{ scale: coverScale }], opacity: coverOpacity }}>
            <View
              className="rounded-[32px] shadow-2xl"
              style={{
                shadowColor: grad[0],
                shadowOpacity: 0.45,
                shadowRadius: 28,
                shadowOffset: { width: 0, height: 16 },
                elevation: 16,
              }}
            >
              <LinearGradient
                colors={grad}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 1, y: 1 }}
                className="rounded-[32px] overflow-hidden items-center justify-center"
                style={{ width: coverW, height: coverW }}
              >
                <View className="absolute -right-12 -top-12 w-[180px] h-[180px] rounded-full bg-white/10" />
                <View className="absolute -left-10 -bottom-10 w-[140px] h-[140px] rounded-full bg-black/10" />
                <NoteIcon size={coverW * 0.28} />
              </LinearGradient>
            </View>
          </Animated.View>

          <Text textTransform="capitalize"  className="mt-7 text-[32px] leading-[38px] font-bold tracking-tight text-fg text-center" numberOfLines={2}>
            {playlist.title}
            <Text textTransform="capitalize"  className="text-[#ff2d55]">.</Text>
          </Text>
          <Text textTransform="capitalize"  className="mt-2 text-sm text-mut">
            By Waveform • {tracks.length} songs • {totalMin} min
          </Text>
        </View>

        {/* ── actions ── */}
        <View className="flex-row items-center justify-between px-5">
          <View className="flex-row items-center gap-5">
            <TouchableOpacity onPress={() => setLiked((v) => !v)} hitSlop={HIT} activeOpacity={0.7}>
              <Svg
                width={28}
                height={28}
                viewBox="0 0 24 24"
                fill={liked ? '#ff5c85' : 'none'}
                stroke={liked ? '#ff5c85' : '#fff'}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d={PATHS.heart} />
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSaved((v) => !v)} hitSlop={HIT} activeOpacity={0.7}>
              <Icon name="download" size={28} color={saved ? AMBER : '#fff'} />
            </TouchableOpacity>
          </View>

          <View className="flex-row items-center gap-4">
            <RoundBtn onPress={() => setShuffle((v) => !v)} className={shuffle ? 'bg-amb/20' : 'bg-chip'}>
              <Icon name="shuffle" size={20} color={shuffle ? AMBER : '#c4c4cc'} />
            </RoundBtn>
            <TouchableOpacity
              onPress={playAll}
              activeOpacity={0.85}
              className="w-16 h-16 rounded-full bg-amb items-center justify-center shadow-lg"
            >
              <Icon name={playing ? 'pause' : 'play'} size={24} color="#2a1500" filled />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── tracks ── */}
        <View className="flex-row items-baseline justify-between mt-8 mb-1 px-5">
          <Text textTransform="capitalize"  className="text-xl font-bold text-fg">Tracks</Text>
          <Text textTransform="capitalize"  className="text-sm text-mut">{tracks.length} songs</Text>
        </View>
        <View className="px-5">
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
      <View
        pointerEvents="box-none"
        className="absolute left-0 right-0 top-0"
        style={{ paddingTop: insets.top }}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: SCREEN,
            opacity: barBg,
          }}
        />
        <View className="flex-row items-center justify-between px-5 h-14">
          <RoundBtn onPress={() => router.back()} className="bg-black/30">
            <Icon name="back" size={22} />
          </RoundBtn>
          <Animated.View style={{ flex: 1, opacity: barBg, marginHorizontal: 12 }}>
            <Text textTransform="capitalize"  className="text-base font-bold text-fg text-center" numberOfLines={1}>
              {playlist.title}
            </Text>
          </Animated.View>
          <View className="w-10" />
        </View>
      </View>
    </View>
  );
}