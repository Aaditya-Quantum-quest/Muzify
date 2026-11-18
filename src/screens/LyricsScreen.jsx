import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useIsFocused } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { usePlayer } from '../context/player-context';
import { playbackQueue } from '../services/audio/PlaybackQueue';

/*
  Real lyrics screen (flat AMOLED look): reads the current track from the
  player context and its `lyrics` column, syncs to the actual engine position,
  and every control drives real playback.

  Performance:
  - `visible` = screen focused + app foregrounded + `active` prop. Every timer,
    poll and scroll below hangs off it, so a blurred / backgrounded / off-screen
    lyrics screen does no work at all.
  - Position lives in a Reanimated shared value (UI thread); React only hears
    about it once per second (time labels) and once per lyric line (highlight).
  - Rows are memoized; only the active line changes styling.
  - All styles are static StyleSheet objects (no per-render allocations).
*/

/* -------------------------------------------------------------------------- */
/* Tokens                                                                     */
/* -------------------------------------------------------------------------- */

// Flat AMOLED palette: pure black, hairline outlines, ONE amber accent.
const C = {
  bg: '#000000',
  text: '#EDEDED', // titles, icons
  line: '#A3A3A3', // inactive lyric lines
  muted: '#8A8A8A', // artist
  dim: '#7A7A7A', // stamps, time total, captions
  hair: '#1F1F1F', // dividers, scrub track
  outline: '#262626', // round buttons / artwork tile
  accent: '#FBBF24', // active line, scrub fill, elapsed time
};

const F = {
  regular: 'Quicksand_400Regular',
  medium: 'Quicksand_500Medium',
  semibold: 'Quicksand_600SemiBold',
  bold: 'Quicksand_700Bold',
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  title: { fontFamily: F.semibold, fontSize: 15, color: C.text },
  artist: { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 1 },
  stamp: { fontFamily: F.medium, fontSize: 10, color: C.dim, marginBottom: 4 },
  line: { fontFamily: F.regular, fontSize: 17, lineHeight: 24, color: C.line },
  lineActive: { fontFamily: F.bold, fontSize: 23, lineHeight: 31, color: C.accent },
  small: { fontFamily: F.medium, fontSize: 10, color: C.dim },
  smallAccent: { fontFamily: F.medium, fontSize: 10, color: C.accent },
  row: { paddingVertical: 10 },
  backBtn: { borderWidth: 1, borderColor: C.outline },
  headerSpacer: { width: 44 },
  scrubHit: { height: 20, justifyContent: 'center' },
  scrubTrack: { height: 3, borderRadius: 2, backgroundColor: C.hair, overflow: 'hidden' },
  scrubFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: C.accent,
  },
  playBtn: { borderWidth: 1, borderColor: C.text, backgroundColor: 'transparent' },
  caption: { marginTop: 6, textAlign: 'center' },
  emptyTile: {
    width: 132,
    height: 132,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: C.outline,
    overflow: 'hidden',
  },
  emptyImg: { width: 132, height: 132 },
  emptyTitle: { marginTop: 18, fontSize: 17 },
  emptyBody: { marginTop: 6, textAlign: 'center', fontSize: 13, lineHeight: 19 },
  footer: { borderTopColor: C.hair },
  listContent: { paddingHorizontal: 26, paddingVertical: 28 },
  timeStrip: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  roundBtn: {
    height: 44,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
  },
  listWrap: { flex: 1 },
  footerBlock: { borderTopWidth: 1, paddingHorizontal: 22, paddingTop: 12 },
  controls: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  playBtnSize: {
    height: 62,
    width: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
  },
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const clamp01 = (v) => {
  'worklet';
  return Math.min(1, Math.max(0, v));
};

const fmt = (sec) => {
  const total = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

// Song rows store seconds, but some importers persist milliseconds.
const toSecs = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 10000 ? Math.round(n / 1000) : Math.round(n);
};

const STAMP_RE = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

// Accepts LRC ("[01:23.45] line") or plain text, one line per row.
function parseLyrics(raw) {
  const text = typeof raw === 'string' ? raw : '';
  if (!text.trim()) return { lines: [], timed: false };

  const out = [];
  let seq = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const stamps = [...rawLine.matchAll(STAMP_RE)];
    const body = rawLine.replace(STAMP_RE, '').trim();
    if (!body) continue;
    if (!stamps.length) {
      seq += 1;
      out.push({ id: `l${seq}`, at: null, text: body });
      continue;
    }
    for (const m of stamps) {
      const frac = m[3] ? Number(`0.${m[3]}`) : 0;
      seq += 1;
      out.push({
        id: `l${seq}`,
        at: Number(m[1]) * 60 + Number(m[2]) + frac,
        text: body,
      });
    }
  }

  const timed = out.some((l) => l.at != null);
  if (timed) {
    const timedLines = out.filter((l) => l.at != null).sort((a, b) => a.at - b.at);
    return { lines: timedLines, timed: true };
  }
  return { lines: out, timed: false };
}

const keyExtractor = (item) => item.id;

/* -------------------------------------------------------------------------- */
/* Visibility gate: focused + app foregrounded + `active` prop                */
/* -------------------------------------------------------------------------- */

function useIsVisible(active) {
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setAppActive(st === 'active'));
    return () => sub.remove();
  }, []);

  return active && focused && appActive;
}

/* -------------------------------------------------------------------------- */
/* Gestures                                                                   */
/* -------------------------------------------------------------------------- */

function useScrub(width, onScrub, onRelease) {
  const start = useRef(0);
  const live = useRef({ width, onScrub, onRelease });
  useEffect(() => {
    live.current = { width, onScrub, onRelease };
  }, [width, onScrub, onRelease]);

  const [pan] = useState(
    // eslint-disable-next-line react-hooks/refs
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          start.current = e.nativeEvent.locationX;
          live.current.onScrub(clamp(start.current / live.current.width));
        },
        onPanResponderMove: (_, g) => {
          const { width: w, onScrub: s2 } = live.current;
          s2(clamp((start.current + g.dx) / w));
        },
        onPanResponderRelease: (_, g) => {
          const { width: w, onRelease: r } = live.current;
          r?.(clamp((start.current + g.dx) / w));
        },
      }),
  );
  return pan.panHandlers;
}

/* -------------------------------------------------------------------------- */
/* Scrub bar (UI-thread fill)                                                 */
/* -------------------------------------------------------------------------- */

const TimeStrip = memo(function TimeStrip({ progress, duration }) {
  const [secs, setSecs] = useState(0);

  useAnimatedReaction(
    () => (duration > 0 ? Math.floor(clamp01(progress.value) * duration) : 0),
    (cur, prev) => {
      if (cur !== prev) runOnJS(setSecs)(cur);
    },
    [duration],
  );

  return (
    <View style={s.timeStrip}>
      <Text style={s.smallAccent}>{fmt(secs)}</Text>
      <Text style={s.small}>{fmt(duration)}</Text>
    </View>
  );
});

const ScrubBar = memo(function ScrubBar({ progress, duration, onScrub, onRelease }) {
  const [w, setW] = useState(1);
  const pan = useScrub(w, onScrub, onRelease);
  const onLayout = useCallback((e) => setW(e.nativeEvent.layout.width || 1), []);
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (clamp01(progress.value) - 1) * w }],
  }));

  return (
    <View>
      <View
        {...pan}
        onLayout={onLayout}
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
        style={s.scrubHit}
      >
        <View pointerEvents="none" style={s.scrubTrack}>
          <Animated.View style={[s.scrubFill, fillStyle]} />
        </View>
      </View>
      <TimeStrip progress={progress} duration={duration} />
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

const LineRow = memo(function LineRow({ line, index, active, timed, onPress }) {
  const handlePress = useCallback(() => onPress(line, index), [onPress, line, index]);
  return (
    <Pressable onPress={handlePress} disabled={!timed || line.at == null} style={s.row}>
      {timed && line.at != null ? <Text style={s.stamp}>{fmt(line.at)}</Text> : null}
      <Text style={active ? s.lineActive : s.line}>{line.text}</Text>
    </Pressable>
  );
});

const EmptyLyrics = memo(function EmptyLyrics({ track }) {
  const uri = track?.artwork_uri || null;
  return (
    <View style={s.emptyWrap}>
      <View style={s.emptyTile}>
        {uri ? (
          <Image source={{ uri }} style={s.emptyImg} resizeMode="cover" fadeDuration={0} />
        ) : (
          <View style={s.emptyInner}>
            <MaterialIcons name="lyrics" size={44} color={C.dim} />
          </View>
        )}
      </View>
      <Text style={[s.title, s.emptyTitle]}>No lyrics available</Text>
      <Text style={[s.artist, s.emptyBody]}>
        Lyrics weren’t found for “{track?.title || 'this track'}”. Playback, seeking and track
        controls below all work.
      </Text>
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

const noop = () => {};

export default function LyricsScreen({ onBack = noop, active = true }) {
  const insets = useSafeAreaInsets();
  const visible = useIsVisible(active);

  const { track, playing, togglePlay, seekTo, goPrev, goNext } = usePlayer();

  const trackId = track?.id ?? null;
  const { lines, timed } = useMemo(() => parseLyrics(track?.lyrics), [track?.lyrics]);
  const times = useMemo(() => (timed ? lines.map((line) => line.at) : []), [lines, timed]);

  const storedDur = toSecs(track?.duration);
  const [engineDur, setEngineDur] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEngineDur(0);
  }, [trackId]);
  const duration = storedDur > 0 ? storedDur : engineDur;

  const progress = useSharedValue(0);
  const dragging = useRef(false);
  // After a committed seek the engine can lag one tick; ignore reads briefly
  // so the bar never snaps back to the old position.
  const holdUntil = useRef(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    progress.value = 0;
  }, [trackId, progress]);

  // Position poll: runs only while visible AND playing. Re-syncs once on
  // becoming visible again so the bar is correct the moment it appears.
  useEffect(() => {
    if (!visible) return undefined;
    const read = () => {
      if (dragging.current || Date.now() < holdUntil.current) return;
      const dur = duration || playbackQueue.engine?.getDuration?.() || 0;
      if (dur <= 0) return;
      // eslint-disable-next-line react-hooks/immutability
      progress.value = clamp((playbackQueue.getCurrentPosition() || 0) / dur);
    };
    read();
    if (!playing) return undefined;
    const id = setInterval(read, 250);
    return () => clearInterval(id);
  }, [visible, playing, duration, progress]);

  // Engine duration poll (only when the stored duration is missing).
  useEffect(() => {
    if (!visible || !playing || storedDur > 0) return undefined;
    const id = setInterval(() => {
      const d = playbackQueue.engine?.getDuration?.() || 0;
      if (d > 0) setEngineDur((prev) => (Math.abs(prev - d) >= 1 ? Math.round(d) : prev));
    }, 1000);
    return () => clearInterval(id);
  }, [visible, playing, storedDur]);

  const [activeIdx, setActiveIdx] = useState(-1);

  // Highlight index changes at most once per line, never per tick.
  useAnimatedReaction(
    () => {
      if (!times.length || duration <= 0) return -1;
      const secs = clamp01(progress.value) * duration;
      let found = -1;
      for (let i = 0; i < times.length; i += 1) {
        if (times[i] <= secs + 0.15) found = i;
        else break;
      }
      return found;
    },
    (cur, prev) => {
      if (cur !== prev) runOnJS(setActiveIdx)(cur);
    },
    [times, duration],
  );

  const listRef = useRef(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIdx(-1);
  }, [trackId]);

  // Auto-scroll only while visible; on returning it snaps to the current line.
  useEffect(() => {
    if (!visible || activeIdx < 0) return undefined;
    const t = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: activeIdx, viewPosition: 0.42, animated: true });
    }, 80);
    return () => clearTimeout(t);
  }, [visible, activeIdx]);

  const onScrollToIndexFailed = useCallback(({ index, averageItemLength }) => {
    listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
  }, []);

  const seekRatio = useCallback(
    (ratio, commit) => {
      // eslint-disable-next-line react-hooks/immutability
      progress.value = ratio;
      if (!commit) return;
      const dur = duration || playbackQueue.engine?.getDuration?.() || 0;
      if (dur > 0) {
        holdUntil.current = Date.now() + 300;
        seekTo(ratio * dur);
      }
    },
    [duration, progress, seekTo],
  );

  const onScrub = useCallback(
    (ratio) => {
      dragging.current = true;
      seekRatio(ratio, false);
    },
    [seekRatio],
  );

  const onRelease = useCallback(
    (ratio) => {
      dragging.current = false;
      seekRatio(ratio, true);
    },
    [seekRatio],
  );

  const seekBy = useCallback(
    (delta) => {
      const dur = duration || playbackQueue.engine?.getDuration?.() || 0;
      if (dur <= 0) return;
      const next = clamp(((playbackQueue.getCurrentPosition() || 0) + delta) / dur);
      seekRatio(next, true);
    },
    [duration, seekRatio],
  );

  const rewind = useCallback(() => seekBy(-10), [seekBy]);
  const forward = useCallback(() => seekBy(10), [seekBy]);

  const handleLine = useCallback(
    (line) => {
      const dur = duration || playbackQueue.engine?.getDuration?.() || 0;
      if (line.at == null || dur <= 0) return;
      seekRatio(clamp(line.at / dur), true);
    },
    [duration, seekRatio],
  );

  const renderItem = useCallback(
    ({ item, index }) => (
      <LineRow line={item} index={index} active={index === activeIdx} timed={timed} onPress={handleLine} />
    ),
    [activeIdx, timed, handleLine],
  );

  const screenStyle = useMemo(() => [s.screen, { paddingTop: insets.top }], [insets.top]);
  const footerStyle = useMemo(() => [s.footer, { paddingBottom: insets.bottom + 10 }], [insets.bottom]);

  return (
    <View style={screenStyle}>
      <View style={s.header}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to player"
          activeOpacity={0.6}
          style={[s.roundBtn, s.backBtn]}
        >
          <MaterialIcons name="arrow-back" size={24} color={C.text} />
        </Pressable>

        <View style={s.headerCenter}>
          <Text numberOfLines={1} style={s.title}>
            {track?.title || 'Nothing playing'}
          </Text>
          <Text numberOfLines={1} style={s.artist}>
            {track?.artist || 'Unknown artist'}
          </Text>
        </View>

        <View style={s.headerSpacer} />
      </View>

      {!track || lines.length === 0 ? (
        <EmptyLyrics track={track} />
      ) : (
        <View style={s.listWrap}>
          <FlatList
            ref={listRef}
            data={lines}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            extraData={activeIdx}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={24}
            maxToRenderPerBatch={16}
            windowSize={9}
            removeClippedSubviews
            onScrollToIndexFailed={onScrollToIndexFailed}
          />
        </View>
      )}

      <View style={[s.footerBlock, footerStyle]}>
        <ScrubBar progress={progress} duration={duration} onScrub={onScrub} onRelease={onRelease} />

        <View style={s.controls}>
          <Pressable
            onPress={goPrev}
            accessibilityRole="button"
            accessibilityLabel="Previous song"
            activeOpacity={0.6}
            style={s.roundBtn}
          >
            <MaterialIcons name="skip-previous" size={24} color={C.text} />
          </Pressable>

          <Pressable
            onPress={rewind}
            accessibilityRole="button"
            accessibilityLabel="Rewind 10 seconds"
            activeOpacity={0.6}
            style={s.roundBtn}
          >
            <MaterialIcons name="replay-10" size={26} color={C.text} />
          </Pressable>

          <Pressable
            onPress={togglePlay}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            activeOpacity={0.85}
            style={[s.playBtnSize, s.playBtn]}
          >
            <MaterialIcons name={playing ? 'pause' : 'play-arrow'} size={32} color={C.text} />
          </Pressable>

          <Pressable
            onPress={forward}
            accessibilityRole="button"
            accessibilityLabel="Forward 10 seconds"
            activeOpacity={0.6}
            style={s.roundBtn}
          >
            <MaterialIcons name="forward-10" size={26} color={C.text} />
          </Pressable>

          <Pressable
            onPress={goNext}
            accessibilityRole="button"
            accessibilityLabel="Next song"
            activeOpacity={0.6}
            style={s.roundBtn}
          >
            <MaterialIcons name="skip-next" size={24} color={C.text} />
          </Pressable>
        </View>

        <Text style={[s.small, s.caption]}>
          {lines.length === 0
            ? 'NO LYRICS FOR THIS TRACK'
            : timed
              ? 'SYNCED · TAP A LINE TO SEEK'
              : 'UNTIMED LYRICS'}
        </Text>
      </View>
    </View>
  );
}