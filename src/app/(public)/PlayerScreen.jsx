/**
 * PlayerScreen.jsx  -  Expo + React Native (single file)
 *
 * INSTALL
 *   npx expo install react-native-reanimated react-native-gesture-handler \
 *     expo-linear-gradient react-native-safe-area-context @expo/vector-icons \
 *     expo-status-bar react-native-image-colors
 *   - react-native-reanimated/plugin must be LAST in babel.config.js plugins.
 *   - Wrap your app root (app/_layout.jsx) in <GestureHandlerRootView style={{flex:1}}>.
 *   - react-native-image-colors needs a dev build (not Expo Go). The native
 *     module is probed with requireOptionalNativeModule before the package is
 *     imported, so when it is missing the track keeps `track.palette` if
 *     provided, otherwise the static FALLBACK_PALETTE is used.
 *
 * PERFORMANCE
 *   - Renders ONLY while the screen is focused (useIsFocused). Unfocused = empty View.
 *   - Playback position is one Reanimated shared value driven on the UI thread
 *     (linear withTiming). No JS re-render per frame, no setInterval.
 *   - Waveform = a small pool of recycled bars animated on the UI thread.
 *   - Only the elapsed-time chip re-renders (once per second).
 *   - Every piece is memo()'d; handlers are stable (useCallback); palettes are cached.
 *
 * REPLACE THE DEMO STATE
 *   Position / playing / track / shuffle / repeat live in <PlayerScreen/> at the bottom.
 *   Swap them for your usePlayer() context. Keep `pos` (seconds) as a shared value.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/* =====================================================================================
 *  >>>  TWEAK EVERYTHING HERE  <<<
 *
 *  All numbers are "design pixels" for a 392px-wide phone. They scale automatically to
 *  the real screen width, so 20 means "20 on the reference phone", not a fixed 20dp.
 *
 *  Quick knobs:
 *    uiScale ............ makes EVERYTHING bigger/smaller (1.1 = 10% bigger)
 *    *Top ............... margin ABOVE that element  (negative = pull it up)
 *    sidePad ............ left/right padding of the whole screen
 *    *PadX / *PadY ...... inner padding of pills (horizontal / vertical)
 *    *Font .............. font size of that text
 *    *Size / *Icon ...... button diameter / icon size
 * ===================================================================================== */
const C = {
  uiScale: 1,

  /* ---- SCREEN SPACING ---- */
  topPad: 8, // extra space under the status bar
  sidePad: 14, // left/right padding of pills + time chips
  bottomPad: 14, // space under the spec chip (add more if you place a bar below)

  /* ---- ALBUM ART ---- */
  artZoneHeightPct: 0.34, // height of the art area, % of screen height (fixed => no layout jump)
  artMaxWidthPct: 0.92, // widest the art may be, % of screen width
  artMaxHeightPct: 0.31, // tallest the art may be, % of screen height
  artRadius: 18, // corner radius of the art
  artTop: 6, // gap above the art

  /* ---- TITLE + ARTIST PILLS ---- */
  titleTop: 4,
  titleFont: 18,
  titlePadX: 16,
  titlePadY: 5,
  titleMaxWidthPct: 0.86, // longer titles get "..." at this width
  artistTop: 8,
  artistFont: 14,
  artistPadX: 12,
  artistPadY: 3,

  /* ---- ROW 1: like / dislike / queue / more ---- */
  actionsTop: 10,
  actionSize: 38,
  actionIcon: 19,
  actionGap: 8,

  /* ---- ROW 2: equalizer, timer (left)  repeat, shuffle (right) ---- */
  pillsTop: 18,
  pillW: 64,
  pillH: 38,
  pillIcon: 21,
  pillGap: 8,

  /* ---- ROW 3: the 5 buttons + waveform ---- */
  controlsTop: 14, // minimum gap above the control row
  waveRowH: 130, // height of the waveform area (must be >= barMaxH)
  playSize: 90, // big center button
  playIcon: 42,
  navSize: 60, // previous / next
  navIcon: 28,
  sideSize: 40, // faded -10s / +10s buttons
  sideIcon: 18,
  btnGap: 6, // space between the 5 buttons
  seekStepSec: 10, // what the faded buttons skip

  /* ---- TIME CHIPS + SPEC CHIP ---- */
  timeTop: -6, // negative pulls the chips up over the waveform
  timeFont: 12,
  timePadX: 10,
  timePadY: 3,
  specTop: 12,
  specFont: 11,
  specText: '44.1 KHZ  128 KBPS  AAC LC',

  /* ---- WAVEFORM LOOK + SPEED ---- */
  barW: 6, // bar thickness
  barPitch: 11.5, // distance between bars (smaller = denser)
  barMinH: 10, // shortest bar
  barMaxH: 108, // tallest bar
  secPerBar: 2.4, // seconds per bar. HIGHER = scrolls slower, LOWER = faster
  upcomingAlpha: 0.72, // opacity of bars still to play (right side)
  playedAlphaMax: 0.26, // opacity of just-played bars (near the center)
  playedAlphaMin: 0.04, // opacity of old bars (far left)
  playedShrink: 0.45, // how much played bars shrink (0 = none, 0.45 = to 55% height)

  /* ---- BACKGROUND ---- */
  fadeMs: 600, // background cross-fade time when the song changes
  bottomShade: 0.45, // darkness at the very bottom (0 - 1)
};

const REF_WIDTH = 392;
const FALLBACK_PALETTE = ['#6fb7e8', '#2f6fb5', '#7a3a5a', '#1b2a4a']; // TL, TR, BL, BR

/* =====================================================================================
 *  DEMO DATA  ->  replace with your real tracks / usePlayer()
 *  art ......... image uri
 *  ratio ....... width / height of the art (optional, measured automatically if missing)
 *  palette ..... optional [topLeft, topRight, bottomLeft, bottomRight]; skips extraction
 *  peaks ....... optional array of 0..1 numbers (real waveform); fake one is generated
 * ===================================================================================== */
const TRACKS = [
  { id: 'a', title: 'Bye Bye Bye', artist: '*NSYNC', duration: 200, ratio: 9 / 16, art: 'https://picsum.photos/id/1011/540/960' },
  { id: 'b', title: 'Shaamat: Ankit Tiwari Version', artist: 'T-Series', duration: 335, ratio: 1, art: 'https://picsum.photos/id/1025/800/800' },
  { id: 'c', title: 'Shameless', artist: 'Camila Cabello', duration: 219, ratio: 16 / 9, art: 'https://picsum.photos/id/1039/960/540' },
  { id: 'd', title: 'Shayad [ Jubin\'s Version ]', artist: 'Jubin Nautiyal', duration: 246, ratio: 4 / 3, art: 'https://picsum.photos/id/1043/800/600' },
];

/* ------------------------------------ helpers -------------------------------------- */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const fmt = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const rgba = (c, a) => {
  if (typeof c !== 'string' || c[0] !== '#') return c;
  let h = c.slice(1);
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return c;
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

// Fake but stable waveform. Replace with real peaks if you have them.
const makePeaks = (seedStr, count) => {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);
  return Array.from({ length: count }, (_, i) => {
    const v = Math.abs(Math.sin(i * 1.37 + seed) * Math.cos(i * 0.47 + seed * 0.3));
    return 0.18 + 0.82 * v;
  });
};

/* -------------------------- album art -> 4 colour palette -------------------------- */
const paletteCache = new Map();

const pick = (...cols) => cols.find((c) => typeof c === 'string' && c.startsWith('#'));

async function extractPalette(uri) {
  if (paletteCache.has(uri)) return paletteCache.get(uri);
  let out = FALLBACK_PALETTE;
  // 'react-native-image-colors' runs requireNativeModule('ImageColors') the
  // moment it is imported, which throws when the native module is absent
  // (Expo Go, or a dev build that predates the dependency). Probe for the
  // module first so the package is never evaluated when it can't work; the
  // static palette is used instead and the error never reaches the app.
  if (requireOptionalNativeModule('ImageColors')) {
    try {
      const { getColors } = await import('react-native-image-colors');
      const r = await getColors(uri, { fallback: FALLBACK_PALETTE[1], cache: true, key: uri, quality: 'low' });
      if (r.platform === 'ios') {
        out = [
          pick(r.primary, r.background) || out[0],
          pick(r.secondary, r.primary) || out[1],
          pick(r.background, r.detail) || out[2],
          pick(r.detail, r.background) || out[3],
        ];
      } else {
        // android + web
        out = [
          pick(r.lightVibrant, r.vibrant, r.dominant) || out[0],
          pick(r.vibrant, r.dominant, r.average) || out[1],
          pick(r.darkMuted, r.muted, r.dominant) || out[2],
          pick(r.darkVibrant, r.average, r.darkMuted) || out[3],
        ];
      }
    } catch {
      /* extraction failed - keep fallback */
    }
  }
  paletteCache.set(uri, out);
  return out;
}

function usePalette(track) {
  const [palette, setPalette] = useState(() => track.palette || paletteCache.get(track.art) || FALLBACK_PALETTE);
  useEffect(() => {
    if (track.palette) return setPalette(track.palette);
    let alive = true;
    extractPalette(track.art).then((p) => alive && setPalette(p));
    return () => {
      alive = false;
    };
  }, [track.id, track.art, track.palette]);
  return palette;
}

const ratioCache = new Map();
function useArtRatio(track) {
  const [ratio, setRatio] = useState(track.ratio || ratioCache.get(track.art) || 1);
  useEffect(() => {
    if (track.ratio) return setRatio(track.ratio);
    if (ratioCache.has(track.art)) return setRatio(ratioCache.get(track.art));
    let alive = true;
    Image.getSize(
      track.art,
      (w, h) => {
        ratioCache.set(track.art, w / h);
        if (alive) setRatio(w / h);
      },
      () => {}
    );
    return () => {
      alive = false;
    };
  }, [track.id, track.art, track.ratio]);
  return ratio;
}

/* ====================================== BACKDROP ===================================== */
const Layer = memo(function Layer({ p }) {
  const corners = [
    [p[0], { x: 0, y: 0 }, { x: 1, y: 1 }],
    [p[1], { x: 1, y: 0 }, { x: 0, y: 1 }],
    [p[2], { x: 0, y: 1 }, { x: 1, y: 0 }],
    [p[3], { x: 1, y: 1 }, { x: 0, y: 0 }],
  ];
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: p[1] }]}>
      {corners.map(([c, start, end], i) => (
        <LinearGradient key={i} colors={[c, rgba(c, 0)]} start={start} end={end} style={StyleSheet.absoluteFill} />
      ))}
    </View>
  );
});

const Backdrop = memo(function Backdrop({ palette }) {
  const [layers, setLayers] = useState({ from: palette, to: palette });
  const fade = useSharedValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setLayers((l) => ({ from: l.to, to: palette }));
    fade.value = 0;
    fade.value = withTiming(1, { duration: C.fadeMs });
  }, [palette, fade]);

  const topStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Layer p={layers.from} />
      <Animated.View style={[StyleSheet.absoluteFill, topStyle]}>
        <Layer p={layers.to} />
      </Animated.View>
      <LinearGradient
        colors={['rgba(0,0,0,0)', `rgba(0,0,0,${C.bottomShade})`]}
        locations={[0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
});

/* ====================================== ALBUM ART ==================================== */
const ArtZone = memo(function ArtZone({ track, ratio, s, width, height }) {
  const zoneH = height * C.artZoneHeightPct;
  const maxW = width * C.artMaxWidthPct;
  const maxH = height * C.artMaxHeightPct;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return (
    <View style={{ height: zoneH, alignItems: 'center', justifyContent: 'center', paddingTop: C.artTop * s }}>
      <Animated.View key={track.id} entering={FadeIn.duration(350)}>
        <Image
          source={{ uri: track.art }}
          style={{ width: w, height: h, borderRadius: C.artRadius * s, backgroundColor: 'rgba(0,0,0,0.25)' }}
          resizeMode="cover"
        />
      </Animated.View>
    </View>
  );
});

/* ===================================== TITLE ROW ===================================== */
const TitleBlock = memo(function TitleBlock({ track, s, width }) {
  return (
    <View style={[styles.center, { paddingHorizontal: C.sidePad * s }]}>
      <View
        style={[
          styles.titlePill,
          {
            marginTop: C.titleTop * s,
            maxWidth: width * C.titleMaxWidthPct,
            paddingHorizontal: C.titlePadX * s,
            paddingVertical: C.titlePadY * s,
          },
        ]}
      >
        <Text numberOfLines={1} style={[styles.whiteText, { fontSize: C.titleFont * s, fontWeight: '700' }]}>
          {track.title}
        </Text>
      </View>
      <View
        style={[
          styles.titlePill,
          {
            marginTop: C.artistTop * s,
            maxWidth: width * C.titleMaxWidthPct,
            paddingHorizontal: C.artistPadX * s,
            paddingVertical: C.artistPadY * s,
          },
        ]}
      >
        <Text numberOfLines={1} style={[styles.whiteText, { fontSize: C.artistFont * s, fontWeight: '600' }]}>
          {track.artist}
        </Text>
      </View>
    </View>
  );
});

/* ================================ ROW 1: ACTION BUTTONS =============================== */
const ActionBtn = memo(function ActionBtn({ name, active, onPress, s, label }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      hitSlop={6}
      activeOpacity={0.7}
      style={[styles.actionBtn, { width: C.actionSize * s, height: C.actionSize * s }]}
    >
      <Icon name={name} size={C.actionIcon * s} color={active ? '#ffffff' : 'rgba(255,255,255,0.92)'} />
    </Pressable>
  );
});

// own state => only this row re-renders when you like/dislike (remounted per track via key)
const ActionRow = memo(function ActionRow({ s }) {
  const [reaction, setReaction] = useState(null); // 'up' | 'down' | null
  const up = useCallback(() => setReaction((r) => (r === 'up' ? null : 'up')), []);
  const down = useCallback(() => setReaction((r) => (r === 'down' ? null : 'down')), []);
  const noop = useCallback(() => {}, []); // hook up: open queue / more menu
  return (
    <View style={[styles.rowCenter, { marginTop: C.actionsTop * s, gap: C.actionGap * s }]}>
      <ActionBtn s={s} label="Like" name={reaction === 'up' ? 'thumb-up' : 'thumb-up-outline'} active={reaction === 'up'} onPress={up} />
      <ActionBtn s={s} label="Dislike" name={reaction === 'down' ? 'thumb-down' : 'thumb-down-outline'} active={reaction === 'down'} onPress={down} />
      <ActionBtn s={s} label="Queue" name="menu" onPress={noop} />
      <ActionBtn s={s} label="More" name="dots-vertical" onPress={noop} />
    </View>
  );
});

/* ================================= ROW 2: PILL BUTTONS =============================== */
const PillBtn = memo(function PillBtn({ name, active, onPress, s, label }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      activeOpacity={0.7}
      style={[
        styles.pillBtn,
        { width: C.pillW * s, height: C.pillH * s },
        active ? styles.pillActive : styles.pillInactive,
      ]}
    >
      <Icon name={name} size={C.pillIcon * s} color="#ffffff" />
    </Pressable>
  );
});

const PillRow = memo(function PillRow({ s, shuffle, repeat, onShuffle, onRepeat }) {
  const noop = useCallback(() => {}, []); // hook up: open equalizer / sleep timer
  return (
    <View style={[styles.rowBetween, { marginTop: C.pillsTop * s, paddingHorizontal: C.sidePad * s }]}>
      <View style={[styles.row, { gap: C.pillGap * s }]}>
        <PillBtn s={s} label="Equalizer" name="waveform" onPress={noop} />
        <PillBtn s={s} label="Sleep timer" name="clock-outline" onPress={noop} />
      </View>
      <View style={[styles.row, { gap: C.pillGap * s }]}>
        <PillBtn s={s} label="Repeat" name="repeat" active={repeat} onPress={onRepeat} />
        <PillBtn s={s} label="Shuffle" name="shuffle-variant" active={shuffle} onPress={onShuffle} />
      </View>
    </View>
  );
});

/* =================================== WAVEFORM SEEK BAR ================================ */
// One recycled bar. Slot -> absolute bar index is worked out on the UI thread every frame.
const Bar = memo(function Bar({ slot, slots, pos, peaks, g }) {
  const style = useAnimatedStyle(() => {
    const head = pos.value / g.secPerBar; // fractional bar index under the center
    const left = Math.floor(head - g.cx / g.pitch) - 1; // first visible bar index
    const i = left + ((((slot - left) % slots) + slots) % slots);
    const x = g.cx + (i - head) * g.pitch;

    if (i < 0 || i >= peaks.length) {
      return { opacity: 0, height: 0, top: g.rowH / 2, transform: [{ translateX: x }] };
    }
    const t = Math.min(1, Math.max(0, head - i)); // 0 = upcoming, 1 = played
    const h = g.minH + peaks[i] * (g.maxH - g.minH) * (1 - g.shrink * t);
    const playedA = g.pMin + g.pMax * Math.min(1, Math.max(0, x / g.cx));
    return {
      opacity: g.upA + t * (playedA - g.upA),
      height: h,
      top: (g.rowH - h) / 2,
      transform: [{ translateX: x - g.barW / 2 }],
    };
  });
  return (
    <Animated.View
      style={[{ position: 'absolute', left: 0, width: g.barW, borderRadius: g.barW / 2, backgroundColor: '#ffffff' }, style]}
    />
  );
});

const Waveform = memo(function Waveform({ pos, peaks, duration, onScrubEnd, s, width }) {
  const g = useMemo(
    () => ({
      cx: width / 2,
      pitch: C.barPitch * s,
      barW: C.barW * s,
      minH: C.barMinH * s,
      maxH: C.barMaxH * s,
      rowH: C.waveRowH * s,
      secPerBar: C.secPerBar,
      upA: C.upcomingAlpha,
      pMax: C.playedAlphaMax,
      pMin: C.playedAlphaMin,
      shrink: C.playedShrink,
    }),
    [s, width]
  );
  const slots = Math.ceil(width / g.pitch) + 3;
  const startPos = useSharedValue(0);

  // drag the waveform to scrub: dragging left = forward in time (same as the scroll direction)
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-8, 8])
        .onStart(() => {
          cancelAnimation(pos);
          startPos.value = pos.value;
        })
        .onUpdate((e) => {
          const next = startPos.value - (e.translationX / g.pitch) * g.secPerBar;
          pos.value = Math.min(duration, Math.max(0, next));
        })
        .onFinalize((_e, success) => {
          if (success) runOnJS(onScrubEnd)();
        }),
    [pos, startPos, g, duration, onScrubEnd]
  );

  const bars = useMemo(() => Array.from({ length: slots }, (_, k) => k), [slots]);

  return (
    <GestureDetector gesture={pan}>
      <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
        {bars.map((k) => (
          <Bar key={k} slot={k} slots={slots} pos={pos} peaks={peaks} g={g} />
        ))}
      </View>
    </GestureDetector>
  );
});

/* ========================== ROW 3: THE 5 BUTTONS (above waveform) ===================== */
const RoundBtn = memo(function RoundBtn({ name, size, icon, faded, onPress, s, label }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      hitSlop={4}
      activeOpacity={0.7}
      style={[
        styles.pillBtn,
        { width: size * s, height: size * s },
        faded ? styles.fadedBg : styles.blackBg,
      ]}
    >
      <Icon name={name} size={icon * s} color={faded ? 'rgba(255,255,255,0.55)' : '#ffffff'} />
    </Pressable>
  );
});

const Controls = memo(function Controls({ pos, peaks, duration, playing, s, width, onToggle, onPrev, onNext, onBack, onFwd, onScrubEnd }) {
  return (
    <View style={{ height: C.waveRowH * s, marginTop: C.controlsTop * s }}>
      <Waveform pos={pos} peaks={peaks} duration={duration} onScrubEnd={onScrubEnd} s={s} width={width} />
      <View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: C.btnGap * s }]}
      >
        <RoundBtn s={s} label="Back 10 seconds" faded name="skip-backward" size={C.sideSize} icon={C.sideIcon} onPress={onBack} />
        <RoundBtn s={s} label="Previous" name="rewind" size={C.navSize} icon={C.navIcon} onPress={onPrev} />
        <RoundBtn s={s} label={playing ? 'Pause' : 'Play'} name={playing ? 'pause' : 'play'} size={C.playSize} icon={C.playIcon} onPress={onToggle} />
        <RoundBtn s={s} label="Next" name="fast-forward" size={C.navSize} icon={C.navIcon} onPress={onNext} />
        <RoundBtn s={s} label="Forward 10 seconds" faded name="skip-forward" size={C.sideSize} icon={C.sideIcon} onPress={onFwd} />
      </View>
    </View>
  );
});

/* ===================================== TIME CHIPS ===================================== */
const Chip = ({ text, s }) => (
  <View style={[styles.chip, { paddingHorizontal: C.timePadX * s, paddingVertical: C.timePadY * s }]}>
    <Text style={[styles.whiteText, { fontSize: C.timeFont * s, fontWeight: '700' }]}>
      {text}
    </Text>
  </View>
);

// The only component that re-renders as time passes (once per second).
const ElapsedChip = memo(function ElapsedChip({ pos, s }) {
  const [sec, setSec] = useState(0);
  useAnimatedReaction(
    () => Math.floor(pos.value),
    (cur, prev) => {
      if (cur !== prev) runOnJS(setSec)(cur);
    }
  );
  return <Chip s={s} text={fmt(sec)} />;
});

const TimeRow = memo(function TimeRow({ pos, duration, s }) {
  return (
    <View style={[styles.rowBetween, { marginTop: C.timeTop * s, paddingHorizontal: C.sidePad * s }]}>
      <ElapsedChip pos={pos} s={s} />
      <Chip s={s} text={fmt(duration)} />
    </View>
  );
});

const SpecChip = memo(function SpecChip({ s }) {
  return (
    <View style={[styles.center, { marginTop: C.specTop * s }]}>
      <View style={[styles.chip, styles.blackBg20, { paddingHorizontal: 12 * s, paddingVertical: 3 * s }]}>
        <Text style={[styles.white90Text, { fontSize: C.specFont * s, fontWeight: '600', letterSpacing: 0.4 }]}>
          {C.specText}
        </Text>
      </View>
    </View>
  );
});

/* ==================================== SCREEN BODY ===================================== */
const PlayerBody = memo(function PlayerBody(props) {
  const { track, pos, playing, shuffle, repeat } = props;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const s = Math.min(width / REF_WIDTH, 1.3) * C.uiScale;

  const palette = usePalette(track);
  const ratio = useArtRatio(track);
  const peaks = useMemo(() => track.peaks || makePeaks(track.id, Math.ceil(track.duration / C.secPerBar) + 2), [track]);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Backdrop palette={palette} />
      <View style={[styles.flex, { paddingTop: insets.top + C.topPad * s, paddingBottom: insets.bottom + C.bottomPad * s }]}>
        <ArtZone track={track} ratio={ratio} s={s} width={width} height={height} />
        <TitleBlock track={track} s={s} width={width} />
        <ActionRow key={track.id} s={s} />
        <PillRow s={s} shuffle={shuffle} repeat={repeat} onShuffle={props.onShuffle} onRepeat={props.onRepeat} />

        <View style={styles.flex} />

        <Controls
          pos={pos}
          peaks={peaks}
          duration={track.duration}
          playing={playing}
          s={s}
          width={width}
          onToggle={props.onToggle}
          onPrev={props.onPrev}
          onNext={props.onNext}
          onBack={props.onBack}
          onFwd={props.onFwd}
          onScrubEnd={props.onScrubEnd}
        />
        <TimeRow pos={pos} duration={track.duration} s={s} />
        <SpecChip s={s} />
      </View>
    </View>
  );
});

/* ================================ SCREEN (focus + state) ============================== */
export default function PlayerScreen() {
  const isFocused = useIsFocused();

  // ---- demo player state: replace with usePlayer() ----
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const pos = useSharedValue(0); // seconds elapsed, animated on the UI thread

  const track = TRACKS[index];
  const playingRef = useRef(playing);
  const trackRef = useRef(track);
  playingRef.current = playing;
  trackRef.current = track;

  const goTo = useCallback((fn) => {
    pos.value = 0;
    setIndex(fn);
  }, [pos]);

  const goNext = useCallback(() => goTo((i) => (i + 1) % TRACKS.length), [goTo]);

  const handleEnded = useCallback(() => {
    if (repeat) {
      pos.value = 0;
      startTimer(); // eslint-disable-line no-use-before-define
    } else {
      goNext();
    }
  }, [repeat, goNext, pos]); // eslint-disable-line react-hooks/exhaustive-deps

  const startTimer = useCallback(() => {
    const d = trackRef.current.duration;
    const remaining = Math.max(0, d - pos.value);
    pos.value = withTiming(d, { duration: remaining * 1000, easing: Easing.linear }, (finished) => {
      'worklet';
      if (finished) runOnJS(handleEnded)();
    });
  }, [pos, handleEnded]);

  useEffect(() => {
    if (playing) startTimer();
    else cancelAnimation(pos);
    return () => cancelAnimation(pos);
  }, [playing, track.id, startTimer, pos]);

  const onToggle = useCallback(() => setPlaying((p) => !p), []);
  const onNext = useCallback(() => goNext(), [goNext]);

  const onPrev = useCallback(() => {
    if (pos.value > 3) {
      cancelAnimation(pos);
      pos.value = 0;
      if (playingRef.current) startTimer();
    } else {
      goTo((i) => (i - 1 + TRACKS.length) % TRACKS.length);
    }
  }, [pos, startTimer, goTo]);

  const seekBy = useCallback(
    (delta) => {
      cancelAnimation(pos);
      pos.value = clamp(pos.value + delta, 0, trackRef.current.duration);
      if (playingRef.current) startTimer();
    },
    [pos, startTimer]
  );
  const onBack = useCallback(() => seekBy(-C.seekStepSec), [seekBy]);
  const onFwd = useCallback(() => seekBy(C.seekStepSec), [seekBy]);

  const onScrubEnd = useCallback(() => {
    if (playingRef.current) startTimer();
  }, [startTimer]);

  const onShuffle = useCallback(() => setShuffle((v) => !v), []);
  const onRepeat = useCallback(() => setRepeat((v) => !v), []);

  // Not focused => render nothing heavy. Playback state above keeps running.
  if (!isFocused) return <View style={styles.screen} />;

  return (
    <PlayerBody
      track={track}
      pos={pos}
      playing={playing}
      shuffle={shuffle}
      repeat={repeat}
      onToggle={onToggle}
      onPrev={onPrev}
      onNext={onNext}
      onBack={onBack}
      onFwd={onFwd}
      onScrubEnd={onScrubEnd}
      onShuffle={onShuffle}
      onRepeat={onRepeat}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: '#000000' },
  center: { alignItems: 'center' },
  row: { flexDirection: 'row' },
  rowCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  whiteText: { color: '#ffffff' },
  white90Text: { color: 'rgba(255,255,255,0.9)' },
  titlePill: { borderRadius: 9999, backgroundColor: 'rgba(0,0,0,0.3)' },
  actionBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: 9999, backgroundColor: 'rgba(0,0,0,0.3)' },
  pillBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: 9999 },
  pillActive: { backgroundColor: 'rgba(255,255,255,0.45)' },
  pillInactive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  chip: { borderRadius: 9999, backgroundColor: '#000000' },
  fadedBg: { backgroundColor: 'rgba(0,0,0,0.3)' },
  blackBg: { backgroundColor: '#000000' },
  blackBg20: { backgroundColor: 'rgba(0,0,0,0.2)' },
});