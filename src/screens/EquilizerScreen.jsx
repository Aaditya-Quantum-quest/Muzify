import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  AppState, PanResponder, Pressable, ScrollView, StyleSheet, Text, View,
  useColorScheme, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle, Line, Path } from 'react-native-svg';

/* ───────────────────────── Theme ───────────────────────── */
const DARK = { bg: '#0c0e12', ink: '#ecebe6', mute: '#7d8290', line: '#232731', acc: '#5b8aff' };
const LIGHT = { bg: '#f1f0ec', ink: '#14161b', mute: '#6b707d', line: '#d6d5cf', acc: '#2f5fe0' };

const mk = (T) => StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 10, backgroundColor: T.bg },
  headerRow: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  title: { color: T.ink, fontSize: 15, fontWeight: '500', marginLeft: 4 },
  hit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  power: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: T.mute },
  dotOn: { backgroundColor: T.acc },
  small: { color: T.mute, fontSize: 13, fontWeight: '300' },
  strong: { color: T.ink, fontSize: 13, fontWeight: '400' },
  pad: { paddingHorizontal: 24 },
  big: { color: T.ink, fontWeight: '200', letterSpacing: -4 },
  unit: { color: T.mute, fontSize: 22, fontWeight: '300' },
  pill: { height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: T.ink, borderColor: T.ink },
  pillTxt: { color: T.mute, fontSize: 13 },
  pillTxtOn: { color: T.bg },
  presets: { gap: 28, paddingHorizontal: 24, alignItems: 'center' },
  tab: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: T.acc },
  tabTxt: { color: T.mute, fontSize: 14, fontWeight: '300' },
  tabTxtOn: { color: T.ink },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: T.line, marginHorizontal: 24 },
  mod: { paddingHorizontal: 24, paddingVertical: 32, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.line },
  modTitle: { color: T.ink, fontSize: 17, fontWeight: '500' },
  modDesc: { color: T.mute, fontSize: 13, marginTop: 2, marginBottom: 20, maxWidth: 260 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  track: { height: StyleSheet.hairlineWidth * 2, backgroundColor: T.mute },
  thumb: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: T.ink },
  seg: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 },
  meter: { height: 2, backgroundColor: T.line, marginTop: 8, marginBottom: 12 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, backgroundColor: T.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: T.line, paddingTop: 12, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  play: { width: 48, height: 48, borderRadius: 24, backgroundColor: T.ink, alignItems: 'center', justifyContent: 'center' },
  dbTxt: { position: 'absolute', right: 0, color: T.mute, fontSize: 10 },
});
const cache = {};
const getS = (scheme) => {
  const k = scheme === 'light' ? 'light' : 'dark';
  return (cache[k] ??= { T: k === 'light' ? LIGHT : DARK, s: mk(k === 'light' ? LIGHT : DARK) });
};
const useS = () => getS(useColorScheme());

/* ───────────────────────── Data ───────────────────────── */
const PRESETS = {
  'Audiophile reference': [35, 40, 15, 0, -10, 20, 30, 45, 25, 15],
  'Studio flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Warm tube': [50, 45, 30, 10, 5, 0, -5, -15, -20, -30],
  'Bass presence': [70, 65, 40, 15, 0, 0, 5, 10, 15, 20],
  'Vocal clarity': [-15, -10, 0, 10, 25, 40, 45, 30, 15, 10],
};
const LABELS = ['31', '63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
const FREQ = ['31 Hz', '63 Hz', '125 Hz', '250 Hz', '500 Hz', '1 kHz', '2 kHz', '4 kHz', '8 kHz', '16 kHz'];
const ROOMS = ['Studio room', 'Concert hall', 'Intimate club'];
const HARMS = ['Silky, even harmonics', 'Punchy, odd harmonics'];
const PHASES = ['Linear phase', 'Minimum phase'];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v / 10).toFixed(1)}`;

/* ───────────────────────── State ───────────────────────── */
const INIT = {
  prof: { A: [...PRESETS['Audiophile reference']], B: [...PRESETS['Studio flat']] },
  name: { A: 'Audiophile reference', B: 'Studio flat' },
  ab: 'A', on: true, sel: 5, mute: Array(10).fill(false),
  crossfeed: true, width: 115, room: 0, drive: 28, harm: 0, phase: 0, preamp: 0, playing: true,
};

function reducer(s, a) {
  switch (a.type) {
    case 'band': {
      const cur = s.prof[s.ab];
      const v = clamp(a.v, -120, 120);
      if (cur[a.i] === v) return s;
      const arr = [...cur];
      arr[a.i] = v;
      return { ...s, prof: { ...s.prof, [s.ab]: arr }, name: { ...s.name, [s.ab]: 'Custom curve' } };
    }
    case 'nudge': return reducer(s, { type: 'band', i: s.sel, v: s.prof[s.ab][s.sel] + a.d });
    case 'preset':
      return { ...s, prof: { ...s.prof, [s.ab]: [...PRESETS[a.name]] }, name: { ...s.name, [s.ab]: a.name } };
    case 'mute': return { ...s, mute: s.mute.map((m, j) => (j === s.sel ? !m : m)) };
    case 'toggle': return { ...s, [a.k]: !s[a.k] };
    case 'set': return s[a.k] === a.v ? s : { ...s, [a.k]: a.v };
    default: return s;
  }
}

/* ───────── Visibility hooks: pause work when off-screen or app backgrounded ───────── */
function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setActive(st === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/* ───────────────────────── Primitives ───────────────────────── */
const Pill = memo(function Pill({ label, on, onPress, hint }) {
  const { s } = useS();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint={hint}
      style={[s.pill, on && s.pillOn]}>
      <Text style={[s.pillTxt, on && s.pillTxtOn]}>{label}</Text>
    </Pressable>
  );
});

const Seg = memo(function Seg({ options, index, onSelect }) {
  const { s } = useS();
  return (
    <View style={s.seg}>
      {options.map((o, i) => (
        <Pressable key={o} onPress={() => onSelect(i)} accessibilityRole="radio"
          accessibilityState={{ selected: i === index }} style={[s.tab, i === index && s.tabOn]}>
          <Text style={[s.tabTxt, i === index && s.tabTxtOn]}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
});

const Slider = memo(function Slider({ value, min, max, step = 1, onChange, onLock, disabled, label }) {
  const { s } = useS();
  const THUMB = 16;
  const [w, setW] = useState(1);
  const live = useRef({});
  const startX = useRef(0);
  useEffect(() => { live.current = { min, max, step, w, onChange, onLock, disabled }; });

  const toVal = (x) => {
    const { min: lo, max: hi, step: st, w: width } = live.current;
    const pct = clamp((x - THUMB / 2) / (width - THUMB), 0, 1);
    return clamp(Math.round((pct * (hi - lo)) / st) * st + lo, lo, hi);
  };

  // Built once; reads `live` at gesture time, never during render.
  const [pan] = useState(
    // eslint-disable-next-line react-hooks/refs
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !live.current.disabled,
        onMoveShouldSetPanResponder: () => !live.current.disabled,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          live.current.onLock?.(true);
          startX.current = e.nativeEvent.locationX;
          live.current.onChange(toVal(startX.current));
        },
        onPanResponderMove: (_, g) => live.current.onChange(toVal(startX.current + g.dx)),
        onPanResponderRelease: () => live.current.onLock?.(false),
        onPanResponderTerminate: () => live.current.onLock?.(false),
      }),
  );

  const left = ((value - min) / (max - min)) * (w - THUMB);
  return (
    <View {...pan.panHandlers} onLayout={(e) => setW(e.nativeEvent.layout.width)}
      accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value }}
      style={{ height: 40, justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      <View pointerEvents="none" style={{ height: 40, justifyContent: 'center' }}>
        <View style={s.track} />
        <View style={[s.thumb, { left, top: 12 }]} />
      </View>
    </View>
  );
});

/* ───────────────────────── EQ curve (draggable) ───────────────────────── */
const GH = 240, PAD = 22, K = (GH / 2 - 14) / 120, GRID = [-120, -60, 0, 60, 120];
const yOf = (v) => GH / 2 - v * K;

function buildPath(xs, ys, w) {
  const p = [{ x: 0, y: ys[0] }, ...xs.map((x, i) => ({ x, y: ys[i] })), { x: w, y: ys[ys.length - 1] }];
  let d = `M ${p[0].x} ${p[0].y.toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    d += ` C ${(b.x + (c.x - a.x) / 6).toFixed(1)} ${(b.y + (c.y - a.y) / 6).toFixed(1)}, ${(c.x - (e.x - b.x) / 6).toFixed(1)} ${(c.y - (e.y - b.y) / 6).toFixed(1)}, ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;
  }
  return d;
}

const EqGraph = memo(function EqGraph({ bands, on, mute, sel, dispatch, onLock }) {
  const { s, T } = useS();
  const [w, setW] = useState(0);
  const live = useRef({});
  const idx = useRef(0);
  const startY = useRef(0);
  useEffect(() => { live.current = { w, dispatch, onLock }; });

  const valAt = (y) => clamp(Math.round((GH / 2 - y) / K / 5) * 5, -120, 120);

  // Built once; reads `live` at gesture time, never during render.
  const [pan] = useState(
    // eslint-disable-next-line react-hooks/refs
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const { w: width, dispatch: d, onLock: lock } = live.current;
          const step = (width - PAD * 2) / 9;
          idx.current = clamp(Math.round((e.nativeEvent.locationX - PAD) / step), 0, 9);
          startY.current = e.nativeEvent.locationY;
          lock(true);
          d({ type: 'set', k: 'sel', v: idx.current });
          d({ type: 'band', i: idx.current, v: valAt(startY.current) });
        },
        onPanResponderMove: (_, g) =>
          live.current.dispatch({ type: 'band', i: idx.current, v: valAt(startY.current + g.dy) }),
        onPanResponderRelease: () => live.current.onLock(false),
        onPanResponderTerminate: () => live.current.onLock(false),
      }),
  );

  const step = w > 0 ? (w - PAD * 2) / 9 : 0;
  const geo = useMemo(() => {
    if (!w) return null;
    const xs = bands.map((_, i) => PAD + i * step);
    const ys = bands.map((v, i) => yOf(on && !mute[i] ? v : 0));
    const d = buildPath(xs, ys, w);
    return { xs, ys, d, area: `${d} L ${w} ${GH / 2} L 0 ${GH / 2} Z` };
  }, [bands, on, mute, w, step]);

  return (
    <View style={{ marginTop: 8 }}>
      <View {...pan.panHandlers} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: GH }}
        accessible accessibilityLabel="Equalizer curve. Drag a point up or down to change its band.">
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {geo && (
            <Svg width={w} height={GH}>
              {GRID.map((v) => (
                <Line key={v} x1={0} x2={w} y1={yOf(v)} y2={yOf(v)} stroke={T.line} strokeWidth={v ? 1 : 1.5} />
              ))}
              <Path d={geo.area} fill={T.acc} fillOpacity={0.1} />
              <Path d={geo.d} fill="none" stroke={T.ink} strokeWidth={2} strokeLinecap="round" />
              {geo.xs.map((x, i) => (
                <Circle key={i} cx={x} cy={geo.ys[i]} r={i === sel ? 9 : 6}
                  fill={i === sel ? T.acc : T.bg} stroke={i === sel ? T.acc : mute[i] ? T.mute : T.ink} strokeWidth={1.5} />
              ))}
            </Svg>
          )}
          {GRID.map((v) => (
            <Text key={v} style={[s.dbTxt, { top: yOf(v) - 14, right: 24 }]}>
              {v === 0 ? '0 dB' : `${v > 0 ? '+' : '−'}${Math.abs(v / 10)}`}
            </Text>
          ))}
        </View>
      </View>
      <View style={{ height: 36, marginTop: 4 }}>
        {LABELS.map((l, i) => (
          <Pressable key={l} onPress={() => dispatch({ type: 'set', k: 'sel', v: i })} hitSlop={6}
            accessibilityLabel={FREQ[i]}
            style={{ position: 'absolute', left: PAD + i * step - 20, width: 40, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: i === sel ? T.ink : T.mute, fontSize: 13, fontWeight: i === sel ? '500' : '300' }}>{l}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
});

/* ───────────────────────── Meters (own timer, only ticks while visible) ───────────────────────── */
const Meters = memo(function Meters({ running }) {
  const { s, T } = useS();
  const [vu, setVu] = useState({ l: 0, r: 0 });
  useEffect(() => {
    if (!running) {
      // Reset state when the meters stop (canonical "reset on prop change").
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVu({ l: 0, r: 0 });
      return undefined;
    }
    const id = setInterval(() => setVu({ l: 70 + Math.random() * 18, r: 72 + Math.random() * 18 }), 150);
    return () => clearInterval(id);
  }, [running]);
  return (
    <>
      {[['Left', vu.l], ['Right', vu.r]].map(([ch, lvl]) => (
        <View key={ch}>
          <View style={s.row}>
            <Text style={s.small}>{ch}</Text>
            <Text style={s.strong}>{lvl ? `${(-(100 - lvl) * 0.16).toFixed(1).replace('-', '−')} dBFS` : '−'}</Text>
          </View>
          <View style={s.meter}><View style={{ height: 2, width: `${lvl}%`, backgroundColor: T.ink }} /></View>
        </View>
      ))}
    </>
  );
});

/* ───────────────────────── Modules ───────────────────────── */
const Module = ({ title, desc, children }) => {
  const { s } = useS();
  return (
    <View style={s.mod}>
      <Text style={s.modTitle}>{title}</Text>
      <Text style={s.modDesc}>{desc}</Text>
      {children}
    </View>
  );
};

const Soundstage = memo(function Soundstage({ crossfeed, width, room, dispatch, onLock }) {
  const { s } = useS();
  const onW = useCallback((v) => dispatch({ type: 'set', k: 'width', v }), [dispatch]);
  const onRoom = useCallback((v) => dispatch({ type: 'set', k: 'room', v }), [dispatch]);
  return (
    <Module title="Soundstage" desc="Blend left and right channels the way ears hear a room.">
      <View style={[s.row, { alignItems: 'center' }]}>
        <Text style={s.small}>Crossfeed</Text>
        <Pill label={crossfeed ? 'On' : 'Off'} on={crossfeed} onPress={() => dispatch({ type: 'toggle', k: 'crossfeed' })} />
      </View>
      <View style={s.row}><Text style={s.small}>Width</Text><Text style={s.strong}>{width}%</Text></View>
      <Slider value={width} min={0} max={150} onChange={onW} onLock={onLock} disabled={!crossfeed} label="Soundstage width" />
      <Seg options={ROOMS} index={room} onSelect={onRoom} />
    </Module>
  );
});

const Warmth = memo(function Warmth({ drive, harm, dispatch, onLock }) {
  const { s } = useS();
  const onD = useCallback((v) => dispatch({ type: 'set', k: 'drive', v }), [dispatch]);
  const onH = useCallback((v) => dispatch({ type: 'set', k: 'harm', v }), [dispatch]);
  return (
    <Module title="Warmth" desc="Add tube-style harmonics to fill out the sound.">
      <View style={s.row}><Text style={s.small}>Drive</Text><Text style={s.strong}>+{(drive / 10).toFixed(1)} dB</Text></View>
      <Slider value={drive} min={0} max={60} onChange={onD} onLock={onLock} label="Drive" />
      <Seg options={HARMS} index={harm} onSelect={onH} />
    </Module>
  );
});

const Phase = memo(function Phase({ phase, dispatch }) {
  const onP = useCallback((v) => dispatch({ type: 'set', k: 'phase', v }), [dispatch]);
  return (
    <Module title="Phase"
      desc={phase ? 'Lowest delay, with small timing shifts.' : 'Keeps timing exact across every frequency.'}>
      <Seg options={PHASES} index={phase} onSelect={onP} />
    </Module>
  );
});

const Output = memo(function Output({ preamp, running, dispatch, onLock }) {
  const { s } = useS();
  const onG = useCallback((v) => dispatch({ type: 'set', k: 'preamp', v }), [dispatch]);
  return (
    <Module title="Output" desc="Set overall level. Clipping protection is on.">
      <View style={s.row}><Text style={s.small}>Gain</Text><Text style={s.strong}>{fmt(preamp)} dB</Text></View>
      <Slider value={preamp} min={-120} max={60} onChange={onG} onLock={onLock} label="Output gain" />
      <Meters running={running} />
    </Module>
  );
});

/* Mounts its children only once the section scrolls near the viewport. */
const Lazy = memo(function Lazy({ reach, minHeight, children }) {
  const { s } = useS();
  const [top, setTop] = useState(null);
  const show = top !== null && top < reach; // reach only grows, so this never flips back
  return (
    <View onLayout={(e) => setTop(e.nativeEvent.layout.y)} style={show ? undefined : { minHeight }}>
      {show ? children : <View style={[s.rule, { marginTop: minHeight / 2 }]} />}
    </View>
  );
});

/* ───────────────────────── Screen ───────────────────────── */
export default function AudioSettingsScreen({ onBack }) {
  const { s, T } = useS();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: winW, height: winH } = useWindowDimensions();
  const isFocused = useIsFocused();
  const appActive = useAppActive();
  const [st, dispatch] = useReducer(reducer, INIT);
  const scrollRef = useRef(null);
  const [reach, setReach] = useState(winH + 300);
  const reachRef = useRef(winH + 300);

  const goBack = onBack ?? (() => router.back());
  const onLock = useCallback((locked) => scrollRef.current?.setNativeProps({ scrollEnabled: !locked }), []);
  const onScroll = useCallback((e) => {
    const { contentOffset, layoutMeasurement } = e.nativeEvent;
    const b = contentOffset.y + layoutMeasurement.height + 300;
    if (b > reachRef.current + 80) { reachRef.current = b; setReach(b); }
  }, []);

  const bands = st.prof[st.ab];
  const effVal = st.on && !st.mute[st.sel] ? bands[st.sel] : 0;
  const running = isFocused && appActive && st.on && st.playing;
  const bigSize = Math.min(150, Math.round(winW * 0.28));
  const presetName = st.name[st.ab];
  const presetKeys = useMemo(() => Object.keys(PRESETS), []);

  // Nothing heavy renders while the screen is hidden; state lives above, so it is preserved.
  if (!isFocused) return <View style={s.root} />;

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top }]}>
        <View style={s.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable onPress={goBack} style={s.hit} accessibilityLabel="Go back">
              <MaterialIcons name="arrow-back" size={24} color={T.ink} />
            </Pressable>
            <Text style={s.title}>Parametric equalizer</Text>
          </View>
          <Pressable onPress={() => dispatch({ type: 'toggle', k: 'on' })} style={s.power}
            accessibilityRole="switch" accessibilityState={{ checked: st.on }}>
            <View style={[s.dot, st.on && s.dotOn]} />
            <Text style={s.strong}>{st.on ? 'Active' : 'Bypassed'}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={64}
        contentContainerStyle={{ paddingTop: insets.top + 56, paddingBottom: insets.bottom + 120 }}>
        {/* Hero */}
        <View style={[s.pad, { paddingTop: 24 }]}>
          <Text style={s.small}>{FREQ[st.sel]}{st.mute[st.sel] ? ' · muted' : ''}</Text>
          <Text style={[s.big, { fontSize: bigSize, lineHeight: bigSize * 1.05 }]} numberOfLines={1}
            accessibilityLiveRegion="polite">
            {fmt(effVal)}<Text style={s.unit}> dB</Text>
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 16 }}>
            <Pill label="−0.5" onPress={() => dispatch({ type: 'nudge', d: -5 })} hint="Lower this band by 0.5 decibels" />
            <Pill label="+0.5" onPress={() => dispatch({ type: 'nudge', d: 5 })} hint="Raise this band by 0.5 decibels" />
            <Pill label={st.mute[st.sel] ? 'Unmute band' : 'Mute band'} on={st.mute[st.sel]}
              onPress={() => dispatch({ type: 'mute' })} />
          </View>
        </View>

        <View style={s.pad}>
          <EqGraph bands={bands} on={st.on} mute={st.mute} sel={st.sel} dispatch={dispatch} onLock={onLock} />
        </View>

        {/* Presets + A/B */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.presets}
          style={{ marginTop: 16 }}>
          {presetKeys.map((n) => (
            <Pressable key={n} onPress={() => dispatch({ type: 'preset', name: n })}
              style={[s.tab, n === presetName && s.tabOn]}>
              <Text style={[s.tabTxt, n === presetName && s.tabTxtOn]}>{n}</Text>
            </Pressable>
          ))}
          <View style={{ flexDirection: 'row', gap: 4, marginLeft: 8 }}>
            {['A', 'B'].map((k) => (
              <Pill key={k} label={`Profile ${k}`} on={st.ab === k} onPress={() => dispatch({ type: 'set', k: 'ab', v: k })} />
            ))}
          </View>
        </ScrollView>
        <View style={[s.rule, { marginTop: 8 }]} />

        {/* Modules mount as they approach the viewport */}
        <Lazy reach={reach} minHeight={260}>
          <Soundstage crossfeed={st.crossfeed} width={st.width} room={st.room} dispatch={dispatch} onLock={onLock} />
        </Lazy>
        <Lazy reach={reach} minHeight={220}>
          <Warmth drive={st.drive} harm={st.harm} dispatch={dispatch} onLock={onLock} />
        </Lazy>
        <Lazy reach={reach} minHeight={140}>
          <Phase phase={st.phase} dispatch={dispatch} />
        </Lazy>
        <Lazy reach={reach} minHeight={280}>
          <Output preamp={st.preamp} running={running} dispatch={dispatch} onLock={onLock} />
        </Lazy>
      </ScrollView>

      {/* Transport */}
      <View style={[s.bar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[s.strong, { fontWeight: '500', fontSize: 14 }]}>Obsidian Resonance</Text>
          <Text numberOfLines={1} style={[s.small, { fontSize: 12 }]}>Kiasmos · DSD 11.2 MHz</Text>
        </View>
        <Pressable onPress={() => dispatch({ type: 'toggle', k: 'playing' })} style={s.play}
          accessibilityLabel={st.playing ? 'Pause' : 'Play'}>
          <MaterialIcons name={st.playing ? 'pause' : 'play-arrow'} size={26} color={T.bg} />
        </Pressable>
      </View>
    </View>
  );
}