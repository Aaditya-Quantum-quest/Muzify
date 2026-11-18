// EqualizerScreen.jsx — flat AMOLED equalizer (Expo / React Native, single file)
// Needs: @react-navigation/native, react-native-safe-area-context, react-native-svg
// Uses plain StyleSheet so it works the same in any route file.
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  InteractionManager,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

/* ───────────── constants ───────────── */
const C = {
  bg: '#000000',
  line: '#1A1A1A',
  outline: '#2A2A2A',
  thumb: '#3A3A3A',
  text: '#EDEDED',
  muted: '#8A8A8A',
  accent: '#F5A524',
  off: '#444444',
};
const BANDS = ['31', '62', '125', '250', '500', '1K', '2K', '4K', '8K', '16K'];
const FLAT = BANDS.map(() => 0);
const MAX_DB = 12;
const PAD = 16; // space above/below the fader travel
const BAND_W = 40;
const PRE_W = 54;
const CURVE_H = 64;
const RESERVED = 520; // header-less UI + tab bar + mini player, used to size the faders

const PRESETS = [
  { name: 'Flat', gains: FLAT },
  { name: 'Bass Boost', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { name: 'Vocal', gains: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1] },
  { name: 'Treble', gains: [0, 0, 0, 0, 0, 1, 3, 4, 5, 6] },
  { name: 'Rock', gains: [4, 3, 1, -1, -2, 0, 2, 3, 4, 4] },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// smooth line through points (Catmull-Rom → cubic bezier)
const smoothPath = (pts) => {
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    d += ` C${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6} ${p2.x} ${p2.y}`;
  }
  return d;
};

/* ───────────── fader ───────────── */
const Ticks = memo(function Ticks() {
  return (
    <>
      <View style={[styles.ticks, { top: 5 }]}>
        <View style={styles.tick} />
        <View style={styles.tick} />
      </View>
      <View style={[styles.ticks, { bottom: 5 }]}>
        <View style={styles.tick} />
        <View style={styles.tick} />
      </View>
    </>
  );
});

// Drag is handled with an Animated.Value + native-driven transform, so only
// this one fader re-renders while moving (just for the dB label).
const Fader = memo(function Fader({ index, label, value, track, big, enabled = true, onCommit }) {
  const tw = big ? 36 : 28;
  const th = big ? 30 : 22;
  const travel = track - PAD * 2;

  const y = useRef(new Animated.Value(0)).current;
  const s = useRef({ g: value, saved: value, y: 0, start: 0, tap: 0 }).current;
  const [shown, setShown] = useState(value);

  const toY = useCallback((g) => ((MAX_DB - g) / (MAX_DB * 2)) * travel, [travel]);

  // place the thumb on mount / when the track height changes
  useEffect(() => {
    s.y = toY(s.g);
    y.setValue(s.y);
  }, [toY, s, y]);

  // follow external changes (presets, reset)
  useEffect(() => {
    if (value === s.g) return;
    s.g = value;
    s.saved = value;
    s.y = toY(value);
    setShown(value);
    Animated.timing(y, { toValue: s.y, duration: 180, useNativeDriver: true }).start();
  }, [value, toY, s, y]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          y.stopAnimation();
          s.start = s.y;
        },
        onPanResponderMove: (_, g) => {
          const ny = clamp(s.start + g.dy, 0, travel);
          s.y = ny;
          y.setValue(ny);
          const v = Math.round((MAX_DB - (ny / travel) * MAX_DB * 2) * 10) / 10 || 0;
          if (v !== s.g) {
            s.g = v;
            setShown(v);
          }
        },
        onPanResponderRelease: (_, g) => {
          const tap = Math.abs(g.dx) < 4 && Math.abs(g.dy) < 4;
          const now = Date.now();
          if (tap && now - s.tap < 300) {
            // double tap → back to 0 dB
            s.g = 0;
            s.y = toY(0);
            setShown(0);
            Animated.timing(y, { toValue: s.y, duration: 150, useNativeDriver: true }).start();
          }
          s.tap = tap ? now : 0;
          if (s.g !== s.saved) {
            s.saved = s.g;
            onCommit(index, s.g);
          }
        },
      }),
    [travel, index, onCommit, toY, s, y]
  );

  return (
    <View style={{ width: big ? PRE_W : BAND_W, alignItems: 'center' }}>
      <View style={{ height: track, width: '100%' }}>
        <View style={[styles.rail, { top: PAD, height: travel }]} />
        {!big && (
          <View style={[styles.fillClip, { top: PAD, height: travel }]}>
            <Animated.View
              style={{
                height: travel,
                backgroundColor: enabled ? C.accent : C.off,
                transform: [{ translateY: y }],
              }}
            />
          </View>
        )}
        <Ticks />
        <Animated.View
          {...pan.panHandlers}
          hitSlop={{ top: 14, bottom: 14, left: 4, right: 4 }}
          style={[
            styles.thumb,
            {
              width: tw,
              height: th,
              borderRadius: th / 2 - 2,
              marginLeft: -tw / 2,
              top: PAD - th / 2,
              transform: [{ translateY: y }],
            },
          ]}
        >
          <View style={[styles.grip, { width: tw / 3 }]} />
        </Animated.View>
      </View>
      <Text style={styles.freq}>{label}</Text>
      <Text style={styles.gain}>{shown.toFixed(1)}</Text>
    </View>
  );
});

/* ───────────── curve ───────────── */
const Curve = memo(function Curve({ gains, pre, enabled }) {
  const [w, setW] = useState(0);
  const onLayout = useCallback((e) => setW(Math.max(0, e.nativeEvent.layout.width - 2)), []);

  const d = useMemo(() => {
    if (!w) return '';
    const mid = CURVE_H / 2;
    const amp = mid - 8;
    const yOf = (g) => mid - (clamp(g + pre, -MAX_DB, MAX_DB) / MAX_DB) * amp;
    const n = gains.length;
    const pts = [
      { x: 0, y: yOf(gains[0]) },
      ...gains.map((g, i) => ({ x: ((i + 0.5) / n) * w, y: yOf(g) })),
      { x: w, y: yOf(gains[n - 1]) },
    ];
    return smoothPath(pts);
  }, [w, gains, pre]);

  return (
    <View style={styles.curve} onLayout={onLayout}>
      <View style={styles.rta} />
      {!!d && (
        <Svg width={w} height={CURVE_H - 2} style={StyleSheet.absoluteFill}>
          <Path d={d} stroke={enabled ? C.accent : C.off} strokeWidth={2} fill="none" strokeLinecap="round" />
        </Svg>
      )}
    </View>
  );
});

/* ───────────── knob ───────────── */
const Knob = memo(function Knob({ label, value, onCommit }) {
  const rot = useRef(new Animated.Value(value / 100)).current;
  const s = useRef({ v: value, start: value }).current;
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (s.v === value) return;
    s.v = value;
    rot.setValue(value / 100);
    setShown(value);
  }, [value, s, rot]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          s.start = s.v;
        },
        onPanResponderMove: (_, g) => {
          // drag up = more, drag down = less
          const v = clamp(Math.round(s.start - g.dy / 1.2), 0, 100);
          if (v !== s.v) {
            s.v = v;
            rot.setValue(v / 100);
            setShown(v);
          }
        },
        onPanResponderRelease: () => onCommit(s.v),
      }),
    [onCommit, s, rot]
  );

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['-135deg', '135deg'] });

  return (
    <View style={styles.knobWrap}>
      <View>
        <Text style={styles.knobLabel}>{label}</Text>
        <Text style={styles.knobValue}>{shown}%</Text>
      </View>
      <View style={styles.knob} hitSlop={8} {...pan.panHandlers}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
          <View style={styles.mark} />
        </Animated.View>
      </View>
    </View>
  );
});

/* ───────────── small buttons ───────────── */
const Pill = memo(function Pill({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.pill, active && styles.pillOn]}
    >
      <Text style={[styles.pillText, active && styles.pillTextOn]}>{label}</Text>
    </Pressable>
  );
});

/* ───────────── screen body (mounted only while focused) ───────────── */
function Body({ store }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const track = clamp(height - insets.top - insets.bottom - RESERVED, 200, 320);

  const [gains, setGains] = useState(store.gains);
  const [pre, setPre] = useState(store.pre);
  const [bass, setBass] = useState(store.bass);
  const [treble, setTreble] = useState(store.treble);
  const [eq, setEq] = useState(store.eq);
  const [tone, setTone] = useState(store.tone);
  const [limit, setLimit] = useState(store.limit);
  const [preset, setPreset] = useState(store.preset);

  // keep values alive while the screen is unmounted
  useEffect(() => {
    Object.assign(store, { gains, pre, bass, treble, eq, tone, limit, preset });
  }, [store, gains, pre, bass, treble, eq, tone, limit, preset]);

  const onBand = useCallback((i, g) => {
    setGains((p) => p.map((v, k) => (k === i ? g : v)));
    setPreset(null);
  }, []);
  const onPre = useCallback((_, g) => setPre(g), []);
  const onEq = useCallback(() => setEq((v) => !v), []);
  const onTone = useCallback(() => setTone((v) => !v), []);
  const onLimit = useCallback(() => setLimit((v) => !v), []);

  const onPreset = useCallback(() => {
    const i = PRESETS.findIndex((p) => p.name === preset);
    const next = PRESETS[(i + 1) % PRESETS.length];
    setGains(next.gains);
    setPre(0);
    setPreset(next.name);
  }, [preset]);

  const onReset = useCallback(() => {
    setGains(FLAT);
    setPre(0);
    setBass(0);
    setTreble(0);
    setPreset(null);
  }, []);

  const tag = ['DVC', eq && 'EQ', '10', tone && 'TON', limit && 'LMT'].filter(Boolean).join(' ');

  return (
    <View style={[styles.body, { paddingTop: insets.top + 16 }]}>
      <View style={styles.faders}>
        <Fader big index={0} label="Preamp" value={pre} track={track} enabled={eq} onCommit={onPre} />
        <View style={[styles.divider, { height: track + 40 }]} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.bands}
        >
          {BANDS.map((f, i) => (
            <Fader
              key={f}
              index={i}
              label={f}
              value={gains[i]}
              track={track}
              enabled={eq}
              onCommit={onBand}
            />
          ))}
        </ScrollView>
      </View>

      <Curve gains={gains} pre={pre} enabled={eq} />

      <View style={styles.tagWrap}>
        <Text style={styles.tag}>{tag}</Text>
      </View>

      <View style={styles.controls}>
        <View style={styles.pills}>
          <Pill label="Equ" active={eq} onPress={onEq} />
          <Pill label="Tone" active={tone} onPress={onTone} />
          <Pill label="Limit" active={limit} onPress={onLimit} />
        </View>

        <View style={styles.right}>
          <View style={styles.presetRow}>
            <Pressable onPress={onPreset} accessibilityRole="button" style={styles.presetBtn}>
              <Text style={styles.presetText}>{preset || 'Preset'}</Text>
            </Pressable>
            <Pressable
              onPress={onReset}
              accessibilityRole="button"
              accessibilityLabel="Reset equalizer"
              style={styles.dotsBtn}
            >
              <View style={styles.dot} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </Pressable>
          </View>

          <View style={styles.knobRow}>
            <Knob label="Bass" value={bass} onCommit={setBass} />
            <Knob label="Treble" value={treble} onCommit={setTreble} />
          </View>
        </View>
      </View>
    </View>
  );
}

/* ───────────── screen ───────────── */
export default function EqualizerScreen() {
  const isFocused = useIsFocused();
  const [ready, setReady] = useState(false);

  // survives unmount, never triggers a re-render
  const store = useRef({
    gains: FLAT,
    pre: 0,
    bass: 0,
    treble: 0,
    eq: true,
    tone: false,
    limit: false,
    preset: null,
  }).current;

  // mount the body only when focused, after the tab transition has finished
  useEffect(() => {
    if (!isFocused) {
      setReady(false);
      return undefined;
    }
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => task.cancel();
  }, [isFocused]);

  return <View style={styles.root}>{isFocused && ready ? <Body store={store} /> : null}</View>;
}

/* ───────────── styles ───────────── */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1 },

  faders: { flexDirection: 'row', paddingLeft: 16 },
  bands: { paddingRight: 16 },
  divider: { width: 1, backgroundColor: C.line, marginHorizontal: 11 },

  rail: { position: 'absolute', left: '50%', width: 1, marginLeft: -0.5, backgroundColor: '#1F1F1F' },
  fillClip: { position: 'absolute', left: '50%', width: 2, marginLeft: -1, overflow: 'hidden' },
  ticks: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  tick: { width: 4, height: 1, backgroundColor: C.outline },
  thumb: {
    position: 'absolute',
    left: '50%',
    borderWidth: 1,
    borderColor: C.thumb,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grip: { height: 2, borderRadius: 1, backgroundColor: C.text },
  freq: { marginTop: 10, fontSize: 12, fontWeight: '500', color: C.text },
  gain: { marginTop: 3, fontSize: 11, color: C.muted },

  curve: {
    marginHorizontal: 16,
    marginTop: 18,
    height: CURVE_H,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    overflow: 'hidden',
  },
  rta: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '76%', backgroundColor: '#0E0E0E' },

  tagWrap: { alignItems: 'center', marginTop: 14 },
  tag: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 12,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1.6,
    color: C.muted,
    overflow: 'hidden',
  },

  controls: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingTop: 20 },
  pills: { gap: 10 },
  pill: {
    width: 60,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillOn: { borderColor: C.accent },
  pillText: { fontSize: 13, fontWeight: '500', color: C.text },
  pillTextOn: { color: C.accent },

  right: { flex: 1 },
  presetRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  presetBtn: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetText: { fontSize: 14, fontWeight: '500', color: C.text },
  dotsBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.outline,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.text },

  knobRow: { flexDirection: 'row', gap: 18, marginTop: 14 },
  knobWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  knobLabel: { fontSize: 13, fontWeight: '500', color: C.text },
  knobValue: { marginTop: 4, fontSize: 12, color: C.muted },
  knob: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: C.outline },
  mark: {
    position: 'absolute',
    top: 7,
    left: '50%',
    marginLeft: -1.5,
    width: 3,
    height: 10,
    borderRadius: 2,
    backgroundColor: C.text,
  },
});