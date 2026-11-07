import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, Switch, PanResponder } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useIsFocused } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Path, Circle, Line } from 'react-native-svg';

/* ───────────────────────── Theme ───────────────────────── */
const C = {
  bg: '#131316',
  low: '#1b1b1e',
  container: '#1f1f22',
  high: '#2a2a2d',
  highest: '#353438',
  lowest: '#0e0e11',
  primary: '#ffc174',
  amber: '#f59e0b',
  onPrimary: '#472a00',
  text: '#e5e1e6',
  muted: '#d8c3ad',
  outline: '#534434',
  pink: '#ffb3b5',
};

const IMG = {
  logo: 'https://lh3.googleusercontent.com/aida/AEtjO1XrA980I8qrMTFOI_bQ3M8NDa_Lixi0_040t7RV8fjjl3n7hrlhtljIAgqNIsN3tYLKvTTMhiT6tE6RnDXn1tnLxBjvq20ZsjGHTsiPhh0eXfbWUDlZ8RB-OdyNH0DtHvqWenO7WJmjo6lq6fihfyrNWPvWNbP8cLfNy2ImW4SXEhR1Hym06YFmfKrfoQNOSCMJvvwEMs_NVLLnDujDt9yLBqVGFm_7ugElTljmDZDs',
  avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBMayXr0t_AfPd9R_ZFeOmleAs4y_q81iYXyUcMenXi-4hwpBZuqToqn1ORjhCoTVuv_eCrBelP1V6MhwAQx9uR4xJZgJ7R5vpFueERtEO2hUmc5iWHXgxbv1bC0wkYBrttFIkumM5R0TrGqUsJEd9NCtyg-2OLQTxggxDeUrKdOB-ssHfKbYEIfMcJ8abgAaZ6hRYFAknA4fJdbiMexubmXatLJRwBIa76Su5LpEE8',
  art: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCHaYhtN4RlKP_YXAg2l-sc1aweGA3TKfSz5eTBRhEvlldqQOyQP3diP2m2bKKsUn8Sj-WkVsXKEaHRfLA7OBXtVx4PdUInK9798omJ5lludIR82Rw7Zd3uZACdAlbScRem_fNuNoN1Mvs3ggVHAfDQ3xAbres_4ccQW0MQgBhg1eHXwoNEhji74aIlzWJHtOvsDEMvWLcHFTrm44Xe8MDmU2Ruj2TqZyj9FXXrlCTO',
};

/* ───────────────────────── Data ───────────────────────── */
const BAND_LABELS = ['31', '63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

const PRESETS = {
  'Audiophile Reference': [35, 40, 15, 0, -10, 20, 30, 45, 25, 15],
  'Studio Flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Warm Tube Analog': [50, 45, 30, 10, 5, 0, -5, -15, -20, -30],
  'Bass Presence': [70, 65, 40, 15, 0, 0, 5, 10, 15, 20],
  'Vocal Clarity': [-15, -10, 0, 10, 25, 40, 45, 30, 15, 10],
  'Custom Curve': [20, 25, 10, -5, -10, 15, 25, 35, 20, 10],
};

// The 5 draggable nodes on the curve map to these band indexes
const NODES = [
  { band: 0, x: 50, name: 'BASS 32Hz' },
  { band: 3, x: 120, name: 'LOW-MID 250Hz' },
  { band: 5, x: 195, name: 'MID 1.0kHz' },
  { band: 7, x: 265, name: 'HIGH-MID 4.0kHz' },
  { band: 9, x: 330, name: 'TREBLE 16kHz' },
];

const VB_W = 360;
const VB_H = 176;
const CY = 88;
const SCALE = 0.66; // ±120 (=±12dB) → ±79px

const fmt = (v) => `${v > 0 ? '+' : ''}${(v / 10).toFixed(1)}`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* Smooth curve through nodes (Catmull-Rom → cubic Bézier) */
function buildCurve(ys) {
  const pts = [
    { x: 0, y: ys[0] },
    ...NODES.map((n, i) => ({ x: n.x, y: ys[i] })),
    { x: VB_W, y: ys[ys.length - 1] },
  ];
  let d = `M ${pts[0].x} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/* ───────────────────── Custom sliders (no extra deps) ───────────────────── */
function VSlider({ value, onChange, onDrag, muted, min = -120, max = 120, step = 5, height = 144 }) {
  const THUMB = 16;
  const usable = height - THUMB;
  const live = useRef({});
  // Refs are read, never written, during render — mirror the latest callbacks
  // after paint so the PanResponder handlers always see fresh values.
  useEffect(() => {
    live.current = { onChange, onDrag, min, max, step, usable };
  }, [onChange, onDrag, min, max, step, usable]);
  const startY = useRef(0);

  const toVal = (y) => {
    const { min, max, step, usable } = live.current;
    const pct = 1 - clamp((y - THUMB / 2) / usable, 0, 1);
    const raw = min + pct * (max - min);
    return clamp(Math.round((raw - min) / step) * step + min, min, max);
  };

  // Created once via lazy useState so the handlers keep a stable reference; they
  // read live.current at gesture time, which is always fresh by then. The lazy
  // initializer closes over the `live` ref, which the React compiler flags.
  const [pan] = useState(
    // eslint-disable-next-line react-hooks/refs
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        live.current.onDrag?.(true);
        startY.current = e.nativeEvent.locationY;
        live.current.onChange(toVal(startY.current));
      },
      onPanResponderMove: (_, g) => live.current.onChange(toVal(startY.current + g.dy)),
      onPanResponderRelease: () => live.current.onDrag?.(false),
      onPanResponderTerminate: () => live.current.onDrag?.(false),
    })
  );

  const pct = (value - min) / (max - min);
  const thumbTop = (1 - pct) * usable;
  const center = height / 2;
  const fillTop = Math.min(center, thumbTop + THUMB / 2);
  const fillH = Math.abs(center - (thumbTop + THUMB / 2));
  const tint = muted ? C.outline : C.primary;

  return (
    <View {...pan.panHandlers} style={{ width: 34, height }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
        <View style={{ position: 'absolute', left: 14, width: 6, top: 0, bottom: 0, borderRadius: 3, backgroundColor: C.highest }} />
        <View style={{ position: 'absolute', left: 14, width: 6, top: fillTop, height: fillH, backgroundColor: tint, opacity: muted ? 0.5 : 0.9 }} />
        <View style={{ position: 'absolute', left: 9, width: 16, top: center, height: 1, backgroundColor: C.outline }} />
        <View
          style={{
            position: 'absolute', left: 9, top: thumbTop, width: THUMB, height: THUMB, borderRadius: 8,
            backgroundColor: tint, borderWidth: 2, borderColor: C.bg,
          }}
        />
      </View>
    </View>
  );
}

function HSlider({ value, onChange, onDrag, min, max, step = 1 }) {
  const THUMB = 18;
  const [w, setW] = useState(1);
  const live = useRef({});
  // Refs are read, never written, during render — mirror the latest callbacks
  // after paint so the PanResponder handlers always see fresh values.
  useEffect(() => {
    live.current = { onChange, onDrag, min, max, step, w };
  }, [onChange, onDrag, min, max, step, w]);
  const startX = useRef(0);

  const toVal = (x) => {
    const { min, max, step, w } = live.current;
    const pct = clamp((x - THUMB / 2) / (w - THUMB), 0, 1);
    return clamp(Math.round((min + pct * (max - min) - min) / step) * step + min, min, max);
  };

  // Created once via lazy useState so the handlers keep a stable reference; they
  // read live.current at gesture time, which is always fresh by then. The lazy
  // initializer closes over the `live` ref, which the React compiler flags.
  const [pan] = useState(
    // eslint-disable-next-line react-hooks/refs
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        live.current.onDrag?.(true);
        startX.current = e.nativeEvent.locationX;
        live.current.onChange(toVal(startX.current));
      },
      onPanResponderMove: (_, g) => live.current.onChange(toVal(startX.current + g.dx)),
      onPanResponderRelease: () => live.current.onDrag?.(false),
      onPanResponderTerminate: () => live.current.onDrag?.(false),
    })
  ).current;

  const pct = (value - min) / (max - min);
  const left = pct * (w - THUMB);

  return (
    <View {...pan.panHandlers} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 28, justifyContent: 'center' }}>
      <View pointerEvents="none" style={{ height: 28, justifyContent: 'center' }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: C.highest }} />
        <View style={{ position: 'absolute', left: 0, width: left + THUMB / 2, height: 6, borderRadius: 3, backgroundColor: C.primary }} />
        <View
          style={{
            position: 'absolute', left, width: THUMB, height: THUMB, borderRadius: THUMB / 2,
            backgroundColor: C.primary, borderWidth: 2, borderColor: C.bg,
          }}
        />
      </View>
    </View>
  );
}

/* ───────────────────────── Small pieces ───────────────────────── */
const Icon = ({ name, size = 20, color = C.primary }) => <MaterialIcons name={name} size={size} color={color} />;

const Card = ({ children, className = '' }) => (
  <View className={`rounded-2xl bg-[#1b1b1e] p-4 ${className}`} style={{ elevation: 4 }}>
    {children}
  </View>
);

const Pill = ({ children, active, onPress, className = '' }) => (
  <Pressable
    onPress={onPress}
    className={`items-center justify-center rounded-xl px-3 py-2 active:opacity-70 ${active ? 'bg-[#2a2a2d]' : 'bg-[#1f1f22]'} ${className}`}
  >
    <Text className={`text-[12px] font-semibold ${active ? 'text-[#ffc174]' : 'text-[#d8c3ad]'}`}>{children}</Text>
  </Pressable>
);

/* ───────────────────────── Screen ───────────────────────── */
export default function AudioSettingsScreen({ onBack }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  const goBack = onBack ?? (() => router.back());

  // EQ state
  const [profiles, setProfiles] = useState({ A: [...PRESETS['Audiophile Reference']], B: [...PRESETS['Studio Flat']] });
  const [names, setNames] = useState({ A: 'Audiophile Reference', B: 'Studio Flat' });
  const [ab, setAb] = useState('A');
  const [menuOpen, setMenuOpen] = useState(false);
  const [masterOn, setMasterOn] = useState(true);
  const [muted, setMuted] = useState(Array(10).fill(false));
  const [selNode, setSelNode] = useState(2);

  // DSP modules
  const [crossfeed, setCrossfeed] = useState(true);
  const [width, setWidth] = useState(115);
  const [irMode, setIrMode] = useState(0);
  const [drive, setDrive] = useState(28);
  const [harmonic, setHarmonic] = useState(0);
  const [linearPhase, setLinearPhase] = useState(true);
  const [preamp, setPreamp] = useState(0);

  // Transport / meters
  const [playing, setPlaying] = useState(true);
  const [rta, setRta] = useState([35, 55, 70, 45, 38, 50, 62, 75, 58, 48, 42, 36, 30, 22]);
  const [vu, setVu] = useState({ l: 78, r: 82 });
  const [locked, setLocked] = useState(false);

  const bands = profiles[ab];
  const presetName = names[ab];

  const setBand = (i, v) => {
    setProfiles((p) => {
      const arr = [...p[ab]];
      arr[i] = v;
      return { ...p, [ab]: arr };
    });
    setNames((n) => ({ ...n, [ab]: 'Custom Curve' }));
  };

  const applyPreset = (name) => {
    setProfiles((p) => ({ ...p, [ab]: [...PRESETS[name]] }));
    setNames((n) => ({ ...n, [ab]: name }));
    setMenuOpen(false);
  };

  const nudgeAll = (delta) => {
    setProfiles((p) => ({ ...p, [ab]: p[ab].map((v) => clamp(v + delta, -120, 120)) }));
    setNames((n) => ({ ...n, [ab]: 'Custom Curve' }));
  };

  // Effective values (bypass + muted bands read as flat)
  const eff = useMemo(() => bands.map((v, i) => (masterOn && !muted[i] ? v : 0)), [bands, masterOn, muted]);
  const ys = NODES.map((n) => CY - eff[n.band] * SCALE);
  const curve = useMemo(() => buildCurve(ys), [eff]);
  const area = `${curve} L ${VB_W} ${VB_H} L 0 ${VB_H} Z`;
  const node = NODES[selNode];

  // Live RTA + VU
  useEffect(() => {
    if (!isFocused) return undefined;
    const id = setInterval(() => {
      if (!masterOn || !playing) {
        setRta((a) => a.map(() => 6));
        setVu({ l: 4, r: 4 });
        return;
      }
      setRta((a) => a.map(() => Math.floor(Math.random() * 65) + 15));
      setVu({ l: 70 + Math.random() * 18, r: 72 + Math.random() * 18 });
    }, 150);
    return () => clearInterval(id);
  }, [masterOn, playing, isFocused]);

  const peak = Math.max(vu.l, vu.r);
  const dbfs = (-(100 - peak) * 0.16).toFixed(1);
  const valColor = (v) => (v > 0 ? C.primary : v < 0 ? C.pink : C.muted);

  return (
    <View className="flex-1 bg-[#131316]">
      {/* ───── Header ───── */}
      <View
        className="absolute left-0 right-0 top-0 z-50 bg-[#131316]/95"
        style={{ paddingTop: insets.top, elevation: 8 }}
      >
        <View className="h-16 flex-row items-center justify-between px-5">
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <Pressable
              onPress={goBack}
              hitSlop={8}
              className="-ml-1 h-11 w-11 items-center justify-center rounded-full active:bg-[#2a2a2d]"
            >
              <Icon name="arrow-back" size={24} color={C.text} />
            </Pressable>
            <Image source={{ uri: IMG.logo }} style={{ height: 28, width: 62 }} resizeMode="contain" />
            <Text numberOfLines={1} className="text-[18px] font-semibold text-[#e5e1e6]">
              Audio Settings
            </Text>
          </View>
          <View className="flex-row items-center">
            <Pressable className="h-11 w-11 items-center justify-center rounded-full active:bg-[#2a2a2d]">
              <Icon name="more-vert" size={22} color={C.muted} />
            </Pressable>
            <Pressable className="h-11 w-11 items-center justify-center rounded-full active:opacity-80">
              <Image source={{ uri: IMG.avatar }} className="h-8 w-8 rounded-full bg-[#353438]" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* ───── Content ───── */}
      <ScrollView
        scrollEnabled={!locked}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => setMenuOpen(false)}
        contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: insets.bottom + 110 }}
      >
        {/* Title + master + quick tools */}
        <View className="px-5 pb-4 pt-2" style={{ zIndex: 30, elevation: 30 }}>
          <View className="flex-row items-start justify-between gap-2">
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-2">
                <View
                  className="h-2 w-2 animate-pulse rounded-full bg-[#f59e0b]"
                  style={{ shadowColor: C.amber, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }}
                />
                <Text className="font-mono text-[12px] font-medium uppercase tracking-wider text-[#ffc174]">DSP Audio Engine</Text>
              </View>
              <Text numberOfLines={1} className="mt-0.5 text-[22px] font-semibold tracking-tight text-[#e5e1e6]">
                Parametric Equalizer
              </Text>
              <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-[#d8c3ad]">
                ES9038PRO Dual Bit-Perfect Master
              </Text>
            </View>

            <Pressable
              onPress={() => setMasterOn((v) => !v)}
              className="flex-row items-center gap-2 rounded-xl bg-[#2a2a2d] px-3 py-2 active:scale-95"
              style={{ elevation: 3 }}
            >
              <Icon name="power-settings-new" size={22} color={masterOn ? C.primary : C.muted} />
              <View>
                <Text className={`font-mono text-[12px] font-medium leading-none ${masterOn ? 'text-[#ffc174]' : 'text-[#d8c3ad]'}`}>
                  {masterOn ? 'ACTIVE' : 'BYPASS'}
                </Text>
                <Text className="font-mono text-[9px] text-[#d8c3ad]">ZERO-PHASE FIR</Text>
              </View>
            </Pressable>
          </View>

          {/* Quick tool shelf */}
          <View className="mt-4">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="items-center gap-2 pr-2">
              <Pressable
                onPress={() => setMenuOpen((v) => !v)}
                className="flex-row items-center gap-2 rounded-full bg-[#1f1f22] px-3 py-2 active:opacity-70"
              >
                <Icon name="tune" size={16} />
                <Text className="text-[13px] font-semibold text-[#e5e1e6]">{presetName}</Text>
                <Icon name="expand-more" size={16} color={C.muted} />
              </Pressable>

              <Pressable
                onPress={() => setAb((v) => (v === 'A' ? 'B' : 'A'))}
                className="flex-row items-center gap-2 rounded-full bg-[#1f1f22] px-3 py-2 active:opacity-70"
              >
                <Text className="font-mono text-[12px] font-bold text-[#ffc174]">A/B</Text>
                <Text className="text-[13px] font-semibold text-[#e5e1e6]">Profile {ab}</Text>
              </Pressable>

              <Pressable
                onPress={() => applyPreset('Studio Flat')}
                className="flex-row items-center gap-1 rounded-full bg-[#1f1f22] px-3 py-2 active:opacity-70"
              >
                <Icon name="restart-alt" size={16} color={C.muted} />
                <Text className="text-[13px] font-semibold text-[#d8c3ad]">Reset Flat</Text>
              </Pressable>

              <View className="rounded-full bg-[#1b1b1e] px-3 py-2">
                <Text className="font-mono text-[10px] uppercase tracking-wider text-[#ffc174]">FIR 4096-Tap</Text>
              </View>
            </ScrollView>

            {menuOpen && (
              <View
                className="absolute left-0 top-12 w-56 gap-0.5 rounded-xl bg-[#2a2a2d] p-1"
                style={{ zIndex: 40, elevation: 40, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12 }}
              >
                {Object.keys(PRESETS).map((name) => {
                  const active = name === presetName;
                  return (
                    <Pressable
                      key={name}
                      onPress={() => applyPreset(name)}
                      className={`flex-row items-center justify-between rounded-lg px-3 py-2.5 active:bg-[#39393c] ${active ? 'bg-[#1f1f22]' : ''}`}
                    >
                      <Text className={`text-[13px] font-semibold ${active ? 'text-[#ffc174]' : 'text-[#e5e1e6]'}`}>{name}</Text>
                      {active && <Icon name="check" size={14} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        {/* ───── EQ curve + RTA ───── */}
        <View className="mb-6 px-5">
          <View className="gap-2 overflow-hidden rounded-2xl bg-[#0e0e11] p-3" style={{ elevation: 6 }}>
            {/* HUD */}
            <View className="flex-row items-center justify-between px-1">
              <View className="flex-row items-center gap-2">
                <View className="flex-row items-center gap-1">
                  <View className="h-1.5 w-1.5 animate-ping rounded-full bg-[#ffc174]" />
                  <Text className="font-mono text-[10px] text-[#ffc174]">LIVE RTA</Text>
                </View>
                <Text className="font-mono text-[10px] text-[#d8c3ad]/60">•</Text>
                <Text className="font-mono text-[10px] text-[#d8c3ad]">A-CURVE</Text>
              </View>
              <View className="flex-row items-center gap-2">
                <Text className="font-mono text-[10px] font-medium text-[#ffc174]">
                  {node.name}: {fmt(eff[node.band])}dB
                </Text>
                <Text className="font-mono text-[10px] text-[#d8c3ad]/60">Q: 1.41</Text>
              </View>
            </View>

            {/* Graph */}
            <View className="h-44 overflow-hidden rounded-xl bg-[#1b1b1e]/70">
              {/* Grid */}
              <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" style={{ position: 'absolute', opacity: 0.2 }}>
                {[8.8, 48.4, 127.6, 167.2].map((y) => (
                  <Line key={y} x1="0" x2={VB_W} y1={y} y2={y} stroke={C.muted} strokeWidth="0.7" strokeDasharray="2 2" />
                ))}
                <Line x1="0" x2={VB_W} y1={CY} y2={CY} stroke={C.primary} strokeWidth="1" />
                {[43, 101, 162, 223, 288, 338].map((x) => (
                  <Line key={x} x1={x} x2={x} y1="0" y2={VB_H} stroke={C.muted} strokeWidth="0.5" strokeDasharray="2 3" />
                ))}
              </Svg>

              {/* RTA bars */}
              <View pointerEvents="none" className="absolute inset-x-2 bottom-0 top-6 flex-row items-end px-2" style={{ opacity: 0.4 }}>
                {rta.map((h, i) => (
                  <View
                    key={i}
                    className="mx-[1px] flex-1 rounded-t-sm bg-[#ffc174]"
                    style={{ height: `${h}%`, opacity: 0.35 + (h / 100) * 0.65 }}
                  />
                ))}
              </View>

              {/* Curve */}
              <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" style={{ position: 'absolute' }}>
                <Defs>
                  <LinearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={C.amber} stopOpacity="0.3" />
                    <Stop offset="1" stopColor={C.amber} stopOpacity="0" />
                  </LinearGradient>
                </Defs>
                <Path d={area} fill="url(#curveGradient)" />
                <Path d={curve} fill="none" stroke={C.primary} strokeOpacity="0.25" strokeWidth="7" strokeLinecap="round" />
                <Path d={curve} fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" />
                {NODES.map((n, i) => (
                  <Circle
                    key={n.name}
                    cx={n.x}
                    cy={ys[i]}
                    r={i === selNode ? 8 : 6}
                    fill={C.amber}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    onPress={() => setSelNode(i)}
                  />
                ))}
              </Svg>

              {/* dB guide */}
              <View pointerEvents="none" className="absolute bottom-2 right-2 top-2 items-end justify-between" style={{ opacity: 0.7 }}>
                <Text className="font-mono text-[9px] text-[#d8c3ad]">+12</Text>
                <Text className="font-mono text-[9px] text-[#d8c3ad]">+6</Text>
                <Text className="font-mono text-[9px] font-bold text-[#ffc174]">0dB</Text>
                <Text className="font-mono text-[9px] text-[#d8c3ad]">-6</Text>
                <Text className="font-mono text-[9px] text-[#d8c3ad]">-12</Text>
              </View>
            </View>

            {/* Frequency legend */}
            <View className="flex-row items-center justify-between px-1">
              {['20Hz', '60', '125', '250', '500', '1kHz', '2k', '4k', '8k', '16k'].map((f) => (
                <Text key={f} className={`font-mono text-[9px] uppercase ${f === '1kHz' ? 'font-semibold text-[#ffc174]' : 'text-[#d8c3ad]'}`}>
                  {f}
                </Text>
              ))}
            </View>
          </View>
        </View>

        {/* ───── 10-band rack ───── */}
        <View className="mb-6 px-5">
          <Card>
            <View className="mb-4 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Icon name="equalizer" size={18} />
                <Text className="text-[16px] font-semibold text-[#e5e1e6]">10-Band ISO Rack</Text>
              </View>
              <View className="rounded-full bg-[#1f1f22] px-2.5 py-1">
                <Text className="font-mono text-[10px] text-[#ffc174]">±12.0 dB</Text>
              </View>
            </View>

            <View className="flex-row items-stretch justify-between">
              {bands.map((v, i) => (
                <View key={BAND_LABELS[i]} className="items-center gap-1" style={{ width: 34, opacity: muted[i] ? 0.55 : 1 }}>
                  <Text className="font-mono text-[10px] font-semibold" style={{ color: valColor(v) }}>
                    {fmt(v)}
                  </Text>
                  <VSlider value={v} muted={muted[i]} onChange={(nv) => setBand(i, nv)} onDrag={setLocked} />
                  <Text className="font-mono text-[11px] font-medium text-[#e5e1e6]">{BAND_LABELS[i]}</Text>
                  <Pressable
                    onPress={() => setMuted((m) => m.map((x, j) => (j === i ? !x : x)))}
                    className={`h-6 w-6 items-center justify-center rounded ${muted[i] ? 'bg-[#ffc174]' : 'bg-[#1f1f22]'}`}
                  >
                    <Text className={`font-mono text-[10px] ${muted[i] ? 'text-[#472a00]' : 'text-[#d8c3ad]'}`}>Q</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            <View className="mt-3 flex-row items-center justify-between pt-1">
              <View className="flex-row items-center gap-1">
                <Icon name="waves" size={16} color={C.muted} />
                <Text className="font-mono text-[11px] text-[#d8c3ad]">Constant-Q Mode</Text>
              </View>
              <View className="flex-row items-center gap-2">
                <Pressable onPress={() => nudgeAll(-5)} className="h-7 w-8 items-center justify-center rounded bg-[#1f1f22] active:opacity-70">
                  <Text className="text-[12px] text-[#e5e1e6]">-0.5</Text>
                </Pressable>
                <Text className="font-mono text-[11px] text-[#ffc174]">OFFSET</Text>
                <Pressable onPress={() => nudgeAll(5)} className="h-7 w-8 items-center justify-center rounded bg-[#1f1f22] active:opacity-70">
                  <Text className="text-[12px] text-[#e5e1e6]">+0.5</Text>
                </Pressable>
              </View>
            </View>
          </Card>
        </View>

        {/* ───── Acoustic architectures ───── */}
        <View className="mb-6 gap-3 px-5">
          <View className="flex-row items-center justify-between px-1">
            <Text className="text-[18px] font-semibold text-[#e5e1e6]">Acoustic Architectures</Text>
            <Text className="font-mono text-[12px] uppercase text-[#ffc174]">64-Bit Float</Text>
          </View>

          {/* Spatial */}
          <Card className="gap-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 flex-row items-center gap-2">
                <Icon name="surround-sound" />
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold leading-tight text-[#e5e1e6]">Spatial Soundfield & Crossfeed</Text>
                  <Text className="text-[12px] text-[#d8c3ad]">Binaural acoustic HRTF ear simulation</Text>
                </View>
              </View>
              <Switch
                value={crossfeed}
                onValueChange={setCrossfeed}
                trackColor={{ false: C.highest, true: C.amber }}
                thumbColor={crossfeed ? C.primary : C.muted}
              />
            </View>

            <View style={{ opacity: crossfeed ? 1 : 0.45 }}>
              <View className="mb-0.5 flex-row justify-between">
                <Text className="font-mono text-[12px] text-[#d8c3ad]">Soundstage Width</Text>
                <Text className="font-mono text-[12px] font-bold text-[#ffc174]">{width}%</Text>
              </View>
              <HSlider value={width} min={0} max={150} onChange={setWidth} onDrag={setLocked} />
            </View>

            <View className="flex-row gap-1.5">
              {['Studio Room', 'Concert Hall', 'Intimate Club'].map((label, i) => (
                <Pressable
                  key={label}
                  onPress={() => setIrMode(i)}
                  className={`flex-1 items-center rounded-lg px-1 py-2 active:opacity-70 ${irMode === i ? 'bg-[#2a2a2d]' : 'bg-[#1f1f22]'}`}
                >
                  <Text className={`font-mono text-[11px] ${irMode === i ? 'text-[#ffc174]' : 'text-[#d8c3ad]'}`}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </Card>

          {/* Saturator */}
          <Card className="gap-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 flex-row items-center gap-2">
                <Icon name="graphic-eq" />
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold leading-tight text-[#e5e1e6]">Analog Harmonic Saturator</Text>
                  <Text className="text-[12px] text-[#d8c3ad]">Class-A Triode 300B warmth emulation</Text>
                </View>
              </View>
              <View className="rounded-full bg-[#1f1f22] px-2 py-0.5">
                <Text className="font-mono text-[10px] text-[#ffc174]">THD 0.08%</Text>
              </View>
            </View>

            <View>
              <View className="mb-0.5 flex-row justify-between">
                <Text className="font-mono text-[12px] text-[#d8c3ad]">Drive Intensity</Text>
                <Text className="font-mono text-[12px] font-bold text-[#ffc174]">+{(drive / 10).toFixed(1)} dB</Text>
              </View>
              <HSlider value={drive} min={0} max={60} onChange={setDrive} onDrag={setLocked} />
            </View>

            <View className="flex-row gap-2">
              {['2nd Order (Silky Even)', '3rd Order (Punch Odd)'].map((label, i) => (
                <Pressable
                  key={label}
                  onPress={() => setHarmonic(i)}
                  className={`flex-1 items-center rounded-lg py-2 active:opacity-70 ${harmonic === i ? 'bg-[#2a2a2d]' : 'bg-[#1f1f22]'}`}
                >
                  <Text className={`font-mono text-[11px] ${harmonic === i ? 'text-[#ffc174]' : 'text-[#d8c3ad]'}`}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </Card>

          {/* Phase */}
          <Card>
            <View className="flex-row items-center justify-between">
              <View className="flex-1 flex-row items-center gap-2">
                <Icon name="filter-vintage" />
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold leading-tight text-[#e5e1e6]">FIR Phase Coherence</Text>
                  <Text className="text-[12px] text-[#d8c3ad]">
                    {linearPhase ? 'Linear Phase (0° Phase Distortion)' : 'Minimum Phase (Low Latency)'}
                  </Text>
                </View>
              </View>
              <Pill active={linearPhase} onPress={() => setLinearPhase((v) => !v)}>
                {linearPhase ? 'Linear Phase' : 'Min Phase'}
              </Pill>
            </View>
          </Card>
        </View>

        {/* ───── DAC + output stage ───── */}
        <View className="mb-6 px-5">
          <Card className="gap-4">
            <View className="flex-row items-center justify-between rounded-xl bg-[#0e0e11] p-3">
              <View className="flex-1 flex-row items-center gap-2">
                <Icon name="developer-board" size={22} />
                <View className="flex-1">
                  <Text className="text-[14px] font-semibold leading-tight text-[#e5e1e6]">DSD 11.2MHz / PCM 384kHz</Text>
                  <Text className="font-mono text-[10px] text-[#d8c3ad]">Native Bit-Perfect Direct Stream</Text>
                </View>
              </View>
              <View className="items-end">
                <Text className="font-mono text-[11px] font-semibold text-[#ffc174]">32-Bit Dual ES9038</Text>
                <Text className="font-mono text-[10px] text-[#d8c3ad]">Jitter &lt; 0.04ps</Text>
              </View>
            </View>

            <View>
              <View className="flex-row items-center justify-between">
                <Text className="font-mono text-[13px] text-[#e5e1e6]">Master Pre-Amp Gain</Text>
                <Text className="font-mono text-[12px] font-semibold text-[#ffc174]">
                  {preamp > 0 ? '+' : ''}
                  {(preamp / 10).toFixed(1)} dB
                </Text>
              </View>
              <HSlider value={preamp} min={-120} max={60} onChange={setPreamp} onDrag={setLocked} />
              <View className="flex-row items-center justify-between">
                <Text className="font-mono text-[10px] text-[#d8c3ad]">-12 dB</Text>
                <View className="flex-row items-center gap-1">
                  <Icon name="security" size={12} />
                  <Text className="font-mono text-[10px] text-[#ffc174]">Auto Clip-Guard Active</Text>
                </View>
                <Text className="font-mono text-[10px] text-[#d8c3ad]">+6 dB</Text>
              </View>
            </View>

            <View className="gap-1.5">
              <View className="flex-row justify-between">
                <Text className="font-mono text-[10px] text-[#d8c3ad]">PEAK VU LEVEL</Text>
                <Text className="font-mono text-[10px] text-[#ffc174]">{dbfs} dBFS</Text>
              </View>
              {[
                ['L', vu.l],
                ['R', vu.r],
              ].map(([ch, lvl]) => (
                <View key={ch} className="flex-row items-center gap-2">
                  <Text className="w-3 font-mono text-[10px] text-[#d8c3ad]">{ch}</Text>
                  <View className="h-2 flex-1 overflow-hidden rounded-full bg-[#353438]">
                    <View
                      className="h-full rounded-full"
                      style={{ width: `${lvl}%`, backgroundColor: lvl > 88 ? C.pink : lvl > 78 ? C.amber : C.primary }}
                    />
                  </View>
                  <Text className="font-mono text-[9px] text-[#d8c3ad]">0dB</Text>
                </View>
              ))}
            </View>
          </Card>
        </View>
      </ScrollView>

      {/* ───── Mini transport bar ───── */}
      <View
        className="absolute bottom-0 left-0 right-0 z-40 flex-row items-center justify-between bg-[#1b1b1e]/95 px-5 pt-2.5"
        style={{ paddingBottom: insets.bottom + 10, elevation: 16 }}
      >
        <View className="min-w-0 flex-1 flex-row items-center gap-3">
          <View className="h-11 w-11 overflow-hidden rounded-lg bg-[#353438]">
            <Image source={{ uri: IMG.art }} className="h-full w-full" resizeMode="cover" />
          </View>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-[14px] font-semibold text-[#e5e1e6]">Obsidian Resonance</Text>
            <Text numberOfLines={1} className="text-[12px] text-[#d8c3ad]">Kiasmos • DSD 11.2MHz Direct</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable className="h-9 w-9 items-center justify-center rounded-full active:opacity-60">
            <Icon name="skip-previous" size={22} color={C.muted} />
          </Pressable>
          <Pressable
            onPress={() => setPlaying((p) => !p)}
            className="h-11 w-11 items-center justify-center rounded-full bg-[#f59e0b] active:scale-95"
            style={{ shadowColor: C.amber, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 8 }}
          >
            <Icon name={playing ? 'pause' : 'play-arrow'} size={26} color={C.onPrimary} />
          </Pressable>
          <Pressable className="h-9 w-9 items-center justify-center rounded-full active:opacity-60">
            <Icon name="skip-next" size={22} color={C.muted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}