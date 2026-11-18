import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  useFocusEffect,
  useIsFocused,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlayer } from '../context/player-context';
import { playbackQueue } from '../services/audio/PlaybackQueue';
import { getMixSongs } from '../databases/queries/mix';

/* ───────────────────────── constants ───────────────────────── */

const ACC = '#cdbcff';
const BG = '#0b0b10';
const ROW_H = 72;
const ROW_GAP = 8;
const ITEM_LEN = ROW_H + ROW_GAP;
const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });
const TINTS = ['#b0403a', '#7f6bd6', '#5b8ec4', '#4aa392', '#7a52c8'];

// MediaLibrary reports bitrate in bits per second, so only bit depth and
// sample rate identify hi-res audio reliably.
const isHiRes = (song) =>
  Boolean(
    (song.bit_depth && song.bit_depth > 16) ||
      (song.sample_rate && song.sample_rate > 48000)
  );

const fmt = (s) => {
  const t = Math.max(0, Math.floor(s || 0));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/* ─────────────── position store (ticks without re-rendering the screen) ───────────────
   Only <Progress/>, <RowTime/> and <RowLine/> subscribe, so a one-second tick
   re-renders three tiny components instead of the whole list.
   If your app already exposes `pos` from usePlayer(), swap usePos() for it. */

const posStore = (() => {
  let value = 0;
  const subs = new Set();
  return {
    get: () => value,
    set: (n) => {
      if (n === value) return;
      value = n;
      subs.forEach((fn) => fn());
    },
    sub: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
})();

const usePos = () => useSyncExternalStore(posStore.sub, posStore.get);

/* ─────────────── playback state (shared queue) ───────────────
   Audio lives in the singleton playbackQueue, so the mix screen, the mini
   player and the full player all drive the same playback. */

function usePlayback(songs, mixId) {
  const { track, playing, shuffle, togglePlay, toggleShuffle, playSongs, seekTo } =
    usePlayer();

  const currentId = track?.id ?? null;
  const hasCurrent = useMemo(
    () => currentId != null && songs.some((song) => song.id === currentId),
    [songs, currentId]
  );
  const idx = useMemo(
    () => (hasCurrent ? songs.findIndex((song) => song.id === currentId) : -1),
    [songs, hasCurrent, currentId]
  );

  const play = useCallback(
    (i) => {
      const song = songs[i];
      if (!song) return;
      if (song.id === currentId) {
        togglePlay();
        return;
      }
      posStore.set(0);
      playSongs(songs, i);
      // setQueue clears this, so it has to be set after the queue loads.
      playbackQueue.mixSource = mixId;
    },
    [songs, mixId, currentId, togglePlay, playSongs]
  );

  const seek = useCallback(
    (sec) => {
      if (!hasCurrent) return;
      const next = Math.max(0, Math.round(sec));
      posStore.set(next);
      seekTo(next);
    },
    [hasCurrent, seekTo]
  );

  return { idx, playing: playing && hasCurrent, shuffle, play, seek, toggleShuffle };
}

/* ───────────────────────── building blocks ───────────────────────── */

const toSource = (src) => (typeof src === 'string' ? { uri: src } : src);

const Art = memo(function Art({ src, size }) {
  if (src) {
    return <Image source={toSource(src)} style={{ width: '100%', height: '100%' }} resizeMode="cover" />;
  }
  return (
    <View style={styles.artFallback}>
      <Ionicons name="musical-notes" size={size} color={ACC} />
    </View>
  );
});

const Glow = ({ color }) => (
  <LinearGradient
    colors={[color, `${color}00`]}
    style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 460 }}
  />
);

const IconBtn = memo(function IconBtn({ name, onPress, label, style }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      hitSlop={8}
      style={[styles.iconBtn, style]}
    >
      <Ionicons name={name} size={22} color="#fff" />
    </Pressable>
  );
});

const Hero = memo(function Hero({ song, width, topInset, onBack, onMenu }) {
  const [prev, setPrev] = useState(null);
  const shown = useRef(song);
  const fade = useRef(new Animated.Value(1)).current;

  useLayoutEffect(() => {
    if (shown.current.id === song.id) return;
    setPrev(shown.current);
    shown.current = song;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 520, useNativeDriver: true }).start(
      ({ finished }) => finished && setPrev(null)
    );
  }, [song, fade]);

  const archW = width - 28;
  const archH = Math.round(archW * 0.93);
  const btnTop = topInset + 8;

  return (
    <View style={{ width }}>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 460, opacity: 0.38 }}
      >
        {prev ? <Glow color={prev.tint} /> : null}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <Glow color={song.tint} />
        </Animated.View>
      </View>

      <View
        style={{
          width: archW,
          height: archH,
          marginHorizontal: 14,
          borderBottomLeftRadius: archW / 2,
          borderBottomRightRadius: archW / 2,
          overflow: 'hidden',
          backgroundColor: '#15131c',
        }}
      >
        {prev ? (
          <View style={StyleSheet.absoluteFill}>
            <Art src={prev.art} size={84} />
          </View>
        ) : null}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <Art src={song.art} size={84} />
        </Animated.View>

        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(8,8,12,0.9)']}
          locations={[0.38, 1]}
          style={StyleSheet.absoluteFill}
        />

        <IconBtn name="chevron-back" label="Back" onPress={onBack} style={{ position: 'absolute', top: btnTop, left: 14 }} />
        <IconBtn name="menu" label="Menu" onPress={onMenu} style={{ position: 'absolute', top: btnTop, right: 14 }} />

        <View style={[styles.heroCaption, { bottom: 46 }]}>
          <Text
            numberOfLines={1}
            style={[styles.heroTitle, { fontFamily: SERIF, fontStyle: 'italic' }]}
          >
            {song.title}
          </Text>
          <Text numberOfLines={1} style={styles.heroArtist}>
            {song.artist}
          </Text>
        </View>
      </View>
    </View>
  );
});

const Progress = memo(function Progress({ duration, onSeek }) {
  const pos = usePos();
  const [trackW, setTrackW] = useState(1);
  const pct = duration ? Math.min(100, (pos / duration) * 100) : 0;

  return (
    <View style={styles.progressRow}>
      <Text style={[styles.time, { fontVariant: ['tabular-nums'] }]}>
        {fmt(pos)}
      </Text>
      <Pressable
        style={[styles.progressTrack, { height: 28 }]}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width || 1)}
        onPress={(e) => onSeek((e.nativeEvent.locationX / trackW) * duration)}
      >
        <View style={styles.trackBg}>
          <View style={[styles.trackFill, { width: `${pct}%`, backgroundColor: ACC }]} />
        </View>
      </Pressable>
      <Text style={[styles.timeRight, { fontVariant: ['tabular-nums'] }]}>
        {fmt(duration)}
      </Text>
    </View>
  );
});

const Pill = memo(function Pill({ icon, label, extra, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, active ? styles.pillActive : styles.pillIdle]}
    >
      <Ionicons name={icon} size={19} color={active ? ACC : 'rgba(255,255,255,0.75)'} />
      <Text style={[styles.pillLabel, active ? styles.pillLabelActive : styles.pillLabelIdle]}>{label}</Text>
      {extra ? <Text style={styles.pillExtra}>{extra}</Text> : null}
    </Pressable>
  );
});

const Equalizer = memo(function Equalizer({ playing }) {
  const bars = useRef([0, 1, 2].map(() => new Animated.Value(6))).current;

  useEffect(() => {
    if (!playing) {
      bars.forEach((b) => {
        b.stopAnimation();
        b.setValue(6);
      });
      return undefined;
    }
    const runs = bars.map((b, i) => {
      const dur = 420 + i * 90;
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(b, { toValue: 13, duration: dur, useNativeDriver: false }),
          Animated.timing(b, { toValue: 3, duration: dur, useNativeDriver: false }),
        ])
      );
      const t = setTimeout(() => loop.start(), i * 160);
      return { loop, t };
    });
    return () =>
      runs.forEach(({ loop, t }) => {
        clearTimeout(t);
        loop.stop();
      });
  }, [playing, bars]);

  return (
    <View style={[styles.eqRow, { height: 13 }]}>
      {bars.map((b, i) => (
        <Animated.View
          key={i}
          style={{ width: 3, height: b, marginRight: i < 2 ? 2 : 0, borderRadius: 2, backgroundColor: ACC }}
        />
      ))}
    </View>
  );
});

const RowTime = memo(function RowTime({ playing }) {
  const pos = usePos();
  return (
    <View style={styles.eqTimeRow}>
      <Equalizer playing={playing} />
      <Text style={[styles.rowTime, { fontVariant: ['tabular-nums'] }]}>
        {fmt(pos)}
      </Text>
    </View>
  );
});

const RowLine = memo(function RowLine({ duration }) {
  const pos = usePos();
  const pct = duration ? Math.min(100, (pos / duration) * 100) : 0;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, bottom: 0, height: 2, width: `${pct}%`, backgroundColor: ACC }}
    />
  );
});

const Row = memo(function Row({ song, index, active, playing, onPress }) {
  return (
    <Pressable
      onPress={() => onPress(index)}
      style={[
        styles.row,
        active ? styles.rowActive : styles.rowIdle,
        { height: ROW_H, marginBottom: ROW_GAP },
      ]}
    >
      <View style={styles.rowArt}>
        <Art src={song.thumb ?? song.art} size={22} />
      </View>

      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {song.title}
        </Text>
        <View style={styles.rowMeta}>
          <Text numberOfLines={1} style={styles.rowArtist}>
            {song.artist}
          </Text>
          {song.hiRes ? (
            <View style={styles.hiresBadge}>
              <Text style={styles.hiresText}>Hi-Res</Text>
            </View>
          ) : null}
        </View>
      </View>

      {active ? (
        <RowTime playing={playing} />
      ) : (
        <Text style={[styles.rowTimeIdle, { fontVariant: ['tabular-nums'] }]}>
          {fmt(song.duration)}
        </Text>
      )}
      {active ? <RowLine duration={song.duration} /> : null}
    </Pressable>
  );
});

/* ───────────────────────── screen ───────────────────────── */

const keyExtractor = (item) => String(item.id);
const getItemLayout = (_, index) => ({ length: ITEM_LEN, offset: ITEM_LEN * index, index });

function Library({ songs, idx, playing, shuffle, onPlay, onSeek, onShuffle, onQueue, onMenu }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const current = songs[idx] ?? songs[0];

  const goBack = useCallback(() => {
    // Popping leaves the tab navigator that pushed this screen intact; a
    // replace would re-enter the tabs group and remount it.
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }, [router]);

  const renderItem = useCallback(
    ({ item, index }) => (
      <Row song={item} index={index} active={index === idx} playing={playing} onPress={onPlay} />
    ),
    [idx, playing, onPlay]
  );

  if (!current) {
    return (
      <View style={[styles.empty, { backgroundColor: BG }]}>
        <StatusBar style="light" />
        <Text style={styles.emptyTitle}>Your library is empty</Text>
        <Text style={styles.emptyBody}>Add music to your device and it'll show up here.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: BG }]}>
      <StatusBar style="light" />

      <Hero song={current} width={width} topInset={insets.top} onBack={goBack} onMenu={onMenu} />
      <Progress duration={current.duration} onSeek={onSeek} />

      <View style={styles.actions}>
        <Pill icon="shuffle" label="Shuffle" active={shuffle} onPress={onShuffle} />
        <Pill icon="list" label="Queue" extra={`· ${songs.length}`} onPress={onQueue} />
      </View>

      <FlatList
        data={songs}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 24 }}
      />
    </View>
  );
}

/* The stack screen stays mounted while it animates away, so the closing
   swipe keeps the list on screen instead of a blank frame. Playback state
   lives in the shared queue, so an unmount loses nothing. */

export default function MusicLibraryScreen({ onQueuePress, onMenuPress }) {
  const focused = useIsFocused();
  const params = useLocalSearchParams();
  const { playSongs } = usePlayer();

  const mixId = typeof params.mixId === 'string' ? params.mixId : 'most-played';
  const autoplay = params.autoplay === '1';

  // null until the query runs. The empty frame paints first and the SQLite
  // read runs one tick later, so mounting the list never delays the slide.
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      posStore.set(0);
      setRows(getMixSongs(mixId));
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mixId]);

  // The first focus is covered by the deferred load above; only refresh when
  // the screen is focused again after being covered.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return undefined;
      }
      const timer = setTimeout(() => setRows(getMixSongs(mixId)), 0);
      return () => clearTimeout(timer);
    }, [mixId])
  );

  const songs = useMemo(
    () =>
      (rows ?? []).map((song, i) => ({
        ...song,
        title: song.title || 'Unknown title',
        artist: song.artist || 'Unknown artist',
        duration: song.duration || 0,
        art: song.art ?? song.artwork_uri ?? null,
        thumb: song.thumb ?? song.art ?? song.artwork_uri ?? null,
        hiRes: song.hiRes ?? isHiRes(song),
        tint: song.tint ?? TINTS[i % TINTS.length],
      })),
    [rows]
  );

  const pb = usePlayback(songs, mixId);

  const mixIds = useMemo(() => new Set(songs.map((song) => song.id)), [songs]);

  // Feed the real engine position into the store that Progress/RowTime/RowLine
  // subscribe to, so the tick re-renders three tiny components, not the list.
  useEffect(() => {
    if (!focused) return undefined;
    const sync = () => {
      const queued = playbackQueue.getCurrentTrack();
      posStore.set(
        queued && mixIds.has(queued.id) ? playbackQueue.getCurrentPosition() : 0
      );
    };
    sync();
    const timer = setInterval(sync, 500);
    return () => clearInterval(timer);
  }, [focused, mixIds]);

  const started = useRef(false);
  useEffect(() => {
    if (!autoplay || started.current) return;
    if (!focused || songs.length === 0) return;
    started.current = true;
    playSongs(songs, 0);
    playbackQueue.mixSource = mixId;
  }, [autoplay, focused, songs, playSongs, mixId]);

  if (!rows) {
    return (
      <View style={[styles.screen, styles.loading, { backgroundColor: BG }]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={ACC} />
        <Text style={styles.loadingText}>Loading your mix...</Text>
      </View>
    );
  }

  return (
    <Library
      songs={songs}
      idx={pb.idx}
      playing={pb.playing}
      shuffle={pb.shuffle}
      onPlay={pb.play}
      onSeek={pb.seek}
      onShuffle={pb.toggleShuffle}
      onQueue={onQueuePress}
      onMenu={onMenuPress}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: 'rgba(255,255,255,0.6)' },

  artFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1822',
  },

  iconBtn: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },

  heroCaption: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  heroTitle: { textAlign: 'center', fontSize: 28, color: '#ffffff' },
  heroArtist: { marginTop: 4, fontSize: 13, color: 'rgba(255,255,255,0.7)' },

  progressRow: {
    marginHorizontal: 40,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  time: { width: 44, fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  timeRight: {
    width: 44,
    textAlign: 'right',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  progressTrack: { flex: 1, justifyContent: 'center' },
  trackBg: {
    height: 4,
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  trackFill: { height: 4, borderRadius: 9999 },

  pill: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  pillActive: {
    borderColor: 'rgba(205,188,255,0.45)',
    backgroundColor: 'rgba(205,188,255,0.1)',
  },
  pillIdle: {
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pillLabel: { marginLeft: 8, fontSize: 14 },
  pillLabelActive: { color: '#cdbcff' },
  pillLabelIdle: { color: 'rgba(255,255,255,0.75)' },
  pillExtra: { marginLeft: 4, fontSize: 12, color: 'rgba(255,255,255,0.45)' },

  eqRow: { flexDirection: 'row', alignItems: 'flex-end' },
  eqTimeRow: { flexDirection: 'row', alignItems: 'center' },
  rowTime: {
    marginLeft: 8,
    width: 44,
    textAlign: 'right',
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  rowTimeIdle: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  rowActive: {
    borderColor: 'rgba(205,188,255,0.4)',
    backgroundColor: 'rgba(205,188,255,0.1)',
  },
  rowIdle: {
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  rowArt: {
    height: 52,
    width: 52,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#1a1822',
  },
  rowBody: { marginLeft: 12, flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '500', color: '#ffffff' },
  rowMeta: { marginTop: 2, flexDirection: 'row', alignItems: 'center' },
  rowArtist: { flexShrink: 1, fontSize: 13, color: 'rgba(255,255,255,0.55)' },
  hiresBadge: {
    marginLeft: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(205,188,255,0.4)',
    paddingHorizontal: 6,
  },
  hiresText: { fontSize: 11, color: '#cdbcff' },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: '#ffffff' },
  emptyBody: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
  },

  actions: {
    marginHorizontal: 20,
    marginBottom: 12,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
