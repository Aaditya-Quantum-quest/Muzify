// DynamicNotch.jsx — single file, inline styles only (optimized)
//
// Needs react-native-svg. Album-art colours (react-native-image-colors) and
// hardware volume (react-native-volume-manager's native module) are native-only:
// in a dev build both light up on their own, in Expo Go the island falls back to
// the default palette and the volume view simply stays hidden.
//
// Usage (root layout, above everything else):
//   <DynamicNotch
//     track={{ title, artist, art }}   // art = image uri
//     playing={playing}
//     position={pos}                   // seconds
//     duration={dur}                   // seconds
//     onSeek={(seconds) => seekTo(seconds)}
//     top={10}
//   />
// With no `track` prop it runs a self-playing demo.
//
// Performance notes:
//  • Visualizer bars and notch morphs run outside the React render loop.
//  • Seek-wave paths are static, avoiding per-frame JS work and SVG regeneration.
//  • HillBar is memoized with stable callbacks; hardware-volume writes are throttled.
//  • Palettes are cached per image; animated styles are memoized.

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, NativeEventEmitter, NativeModules, PanResponder, Pressable, Text, View, useWindowDimensions } from 'react-native';
import Reanimated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { requireOptionalNativeModule } from 'expo-modules-core';

/* ───────────── colour helpers ───────────── */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const FALLBACK = '#3fa2ff';

const parseHex = (hex) => {
  let h = typeof hex === 'string' ? hex.replace('#', '').trim() : '';
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}/.test(h)) h = FALLBACK.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const toHsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
};
const fromHsl = (h, s, l) => {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};
// keeps the hue of the art, but bright enough to read on a pure-black notch
const tone = (hex, minS, minL, maxL) => {
  const [h, s, l] = toHsl(parseHex(hex));
  return fromHsl(h, s < 0.08 ? s : Math.max(s, minS), clamp(l, minL, maxL));
};
const makePalette = (a, b) => ({
  main: tone(a, 0.5, 0.5, 0.62),
  mid: tone(a, 0.5, 0.66, 0.72),
  light: tone(b || a, 0.35, 0.8, 0.88),
});
const DEFAULT_PALETTE = makePalette(FALLBACK, '#a5e6ff');

// palette per image uri → colours are extracted once, then reused
const paletteCache = new Map();

// 'react-native-image-colors' resolves requireNativeModule('ImageColors') while
// it is being imported, so a static import throws in Expo Go and takes the whole
// app down before the first render. Probe the native module, then load the
// package lazily and memoise the verdict (null = unavailable in this build).
let getColorsLoader = null;
const loadGetColors = () => {
  if (!getColorsLoader) {
    getColorsLoader = requireOptionalNativeModule('ImageColors')
      ? import('react-native-image-colors').then((m) => m.getColors || null).catch(() => null)
      : Promise.resolve(null);
  }
  return getColorsLoader;
};

// Hardware volume needs no JS package at all: react-native-volume-manager only
// forwards these four calls to the native module it registers (and its wrapper
// throws on every one of them when that module is missing). Going straight to
// NativeModules keeps the bundle resolvable on a machine where the install is
// incomplete, and the view simply stays dormant where the module is not
// compiled in — i.e. Expo Go. A dev build with the package linked gets the
// original behaviour, unchanged.
const nativeVolume = () => {
  try {
    return NativeModules.VolumeManager || null;
  } catch {
    return null;
  }
};
const usePalette = (uri) => {
  const [pal, setPal] = useState(() => paletteCache.get(uri) || DEFAULT_PALETTE);
  useEffect(() => {
    if (!uri) return undefined;
    const cached = paletteCache.get(uri);
    if (cached) { setPal(cached); return undefined; }
    let dead = false;
    loadGetColors()
      .then((getColors) => {
        if (!getColors) return undefined; // no palette module in this build → DEFAULT_PALETTE stays
        return getColors(uri, { fallback: FALLBACK, cache: true, key: uri, quality: 'low' })
          .then((r) => {
            const ios = r.platform === 'ios';
            const main = ios ? r.primary || r.detail : r.vibrant || r.dominant || r.average;
            const alt = ios ? r.secondary || r.background : r.lightVibrant || r.lightMuted || r.muted || r.average;
            const next = makePalette(main, alt);
            paletteCache.set(uri, next);
            if (!dead) setPal(next);
          });
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [uri]);
  return pal;
};

/* The seek wave is deliberately static: regenerating several SVG paths at 25 Hz
   occupied the JS thread and made the rest of the player feel unresponsive. */
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ───────────── visualizer — native-driver animation, zero JS per frame ───────────── */
const BAR_DUR = [380, 520, 440, 600, 360];
const Bar = memo(function Bar({ color, maxH, dur, playing }) {
  const v = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    if (!playing) {
      Animated.timing(v, { toValue: 0.25, duration: 200, useNativeDriver: true }).start();
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.25, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [playing, dur]);
  return <Animated.View style={{ width: 4, height: maxH, borderRadius: 2, backgroundColor: color, transform: [{ scaleY: v }] }} />;
});

const Bars = memo(function Bars({ playing, pal, maxH = 20 }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: maxH, gap: 4 }}>
      {BAR_DUR.map((d, i) => (
        <Bar key={i} color={i % 2 ? pal.light : pal.main} maxH={maxH} dur={d} playing={playing} />
      ))}
    </View>
  );
});

/* ───────────── hills seek bar (draggable) ───────────── */
const PAD = 10, BASE = 28, SVG_H = 36, STEP = 4;
const hills = (x0, x1, amp, k, phase) => {
  const L = x1 - x0;
  if (L < 4) return '';
  const scale = Math.min(1, L / 60);
  let d = `M${x0} ${BASE}`;
  for (let x = 0; x <= L; x += STEP) {
    const e = Math.pow(Math.sin((Math.PI * x) / L), 1.1);
    d += ` L${(x0 + x).toFixed(0)} ${(BASE - amp * scale * e * (0.55 + 0.45 * Math.sin(x / k + phase))).toFixed(1)}`;
  }
  return `${d} L${x1.toFixed(0)} ${BASE} Z`;
};

const HillBar = memo(function HillBar({ width, value, pal, onStart, onChange, onEnd }) {
  const [drag, setDrag] = useState(null);
  const live = useRef({});
  live.current = { width, onStart, onChange, onEnd };
  const startP = useRef(0);

  const pan = useMemo(() => {
    const finish = (g) => {
      const r = live.current;
      const p = clamp(startP.current + g.dx / r.width);
      setDrag(null);
      r.onChange && r.onChange(p, true);
      r.onEnd && r.onEnd();
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const r = live.current;
        startP.current = clamp((e.nativeEvent.locationX - PAD) / r.width);
        setDrag(startP.current);
        r.onStart && r.onStart();
        r.onChange && r.onChange(startP.current, false);
      },
      onPanResponderMove: (e, g) => {
        const p = clamp(startP.current + g.dx / live.current.width);
        setDrag(p);
        live.current.onChange && live.current.onChange(p, false);
      },
      onPanResponderRelease: (e, g) => finish(g),
      onPanResponderTerminate: (e, g) => finish(g),
    });
  }, []);

  const v = clamp(drag == null ? value : drag);
  const xp = PAD + v * width;
  const total = width + PAD * 2;
  return (
    <View {...pan.panHandlers} style={{ width: total, height: 44, justifyContent: 'center' }}>
      <Svg pointerEvents="none" width={total} height={SVG_H} viewBox={`0 0 ${total} ${SVG_H}`}>
        <Path d={hills(PAD, xp, 14, 26, 0)} fill={pal.main} fillOpacity={0.9} />
        <Path d={hills(PAD, xp, 17, 19, 1.3)} fill={pal.light} fillOpacity={0.75} />
        <Path d={hills(PAD + 14, xp, 9, 12, 2.4)} fill={pal.mid} fillOpacity={0.8} />
        <Path d={`M${PAD} ${BASE} H${xp}`} stroke={pal.main} strokeWidth={6} strokeLinecap="round" />
        <Path d={`M${xp} ${BASE} H${PAD + width}`} stroke="#ffffff" strokeOpacity={0.3} strokeWidth={6} strokeLinecap="round" />
        <Circle cx={xp} cy={BASE} r={drag == null ? 15 : 18} fill={pal.main} opacity={0.25} />
        <Circle cx={xp} cy={BASE} r={9} fill={pal.main} stroke="#ffffff" strokeWidth={3} />
      </Svg>
    </View>
  );
});

/* ───────────── demo data ───────────── */
const DEMO = {
  track: { title: 'Entropy', artist: 'Beach Bunny', art: 'https://picsum.photos/seed/entropy/300' },
  duration: 221,
};

/* ───────────── the notch ───────────── */
function DynamicNotch({ track, playing, position, duration, onSeek, top = 10, idleTimeout = 6000 }) {
  const { width: W } = useWindowDimensions();
  const playerW = Math.min(W - 24, 360);
  const VOL_W = 150;

  // demo playback when no track is given (1 tick / second)
  const demo = !track;
  const [dPos, setDPos] = useState(110);
  useEffect(() => {
    if (!demo) return undefined;
    const id = setInterval(() => setDPos((p) => (p + 1 >= DEMO.duration ? 0 : p + 1)), 1000);
    return () => clearInterval(id);
  }, [demo]);
  const T = track || DEMO.track;
  const isPlaying = demo ? true : !!playing;
  const pos = demo ? dPos : position || 0;
  const dur = demo ? DEMO.duration : duration || 1;
  const seek = demo ? setDPos : onSeek;

  const live = useRef({});
  live.current = { seek, dur, idleTimeout };

  const pal = usePalette(T.art);
  useEffect(() => { if (T.art) Image.prefetch(T.art).catch(() => {}); }, [T.art]);

  // ── volume (hardware buttons) ──
  const [vol, setVol] = useState(0.5);
  const [volVisible, setVolVisible] = useState(false);
  const volTimer = useRef(null);
  const volDrag = useRef(false);
  const lastPush = useRef(0);

  const hideVolSoon = useCallback(() => {
    clearTimeout(volTimer.current);
    volTimer.current = setTimeout(() => setVolVisible(false), 2000);
  }, []);
  useEffect(() => {
    const VM = nativeVolume();
    let sub = null;
    if (VM) {
      try { Promise.resolve(VM.showNativeVolumeUI({ enabled: false })).catch(() => {}); } catch (e) {}
      try {
        Promise.resolve(VM.getVolume())
          .then((r) => setVol(typeof r === 'number' ? r : r && typeof r.volume === 'number' ? r.volume : 0.5))
          .catch(() => {});
      } catch (e) {}
      // The package's own listener helper is eventEmitter.addListener('RNVMEventVolume', cb)
      try {
        sub = new NativeEventEmitter(VM).addListener('RNVMEventVolume', (r) => {
          if (!volDrag.current) setVol(r.volume);
          setVolVisible(true);
          if (!volDrag.current) hideVolSoon();
        });
      } catch (e) {}
    }
    return () => {
      sub && sub.remove();
      clearTimeout(volTimer.current);
      if (!VM) return; // the OS UI was never suppressed, so there is nothing to hand back
      try { Promise.resolve(VM.showNativeVolumeUI({ enabled: true })).catch(() => {}); } catch (e) {}
    };
  }, [hideVolSoon]);

  const onVolStart = useCallback(() => { volDrag.current = true; clearTimeout(volTimer.current); }, []);
  const onVolChange = useCallback((p, final) => {
    setVol(p);
    const now = Date.now();
    if (final || now - lastPush.current > 60) { // throttle native writes
      lastPush.current = now;
      // playSound/type are the defaults the npm wrapper fills in before the native call
      try {
        const VM = nativeVolume();
        Promise.resolve(VM && VM.setVolume(p, { playSound: false, type: 'music', showUI: false })).catch(() => {});
      } catch (e) {}
    }
  }, []);
  const onVolEnd = useCallback(() => { volDrag.current = false; hideVolSoon(); }, [hideVolSoon]);

  // ── player open / auto-collapse ──
  const [open, setOpen] = useState(false);
  const [seekDrag, setSeekDrag] = useState(null);
  const seeking = useRef(false);
  const collapseTimer = useRef(null);
  const armCollapse = useCallback(() => {
    clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => (seeking.current ? armCollapse() : setOpen(false)), live.current.idleTimeout);
  }, []);
  useEffect(() => {
    if (open) armCollapse();
    return () => clearTimeout(collapseTimer.current);
  }, [open, armCollapse]);

  const onSeekStart = useCallback(() => { seeking.current = true; }, []);
  const onSeekChange = useCallback((p, final) => {
    if (final) {
      setSeekDrag(null);
      const r = live.current;
      r.seek && r.seek(p * r.dur);
    } else setSeekDrag(p);
  }, []);
  const onSeekEnd = useCallback(() => { seeking.current = false; armCollapse(); }, [armCollapse]);

  // ── morph between idle / volume / player ──
  const view = volVisible ? 'volume' : open ? 'player' : 'idle';
  const idx = view === 'idle' ? 0 : view === 'volume' ? 1 : 2;
  const size = useSharedValue(0);
  const fade = useSharedValue(1);
  const [shown, setShown] = useState(view);
  useEffect(() => {
    if (view === shown) return;
    fade.value = withTiming(0, { duration: 80 }, (finished) => {
      'worklet';
      if (!finished) return;
      runOnJS(setShown)(view);
      size.value = withSpring(idx, { damping: 22, stiffness: 180, mass: 0.75 });
      fade.value = withDelay(60, withTiming(1, { duration: 160 }));
    });
  }, [view, shown, idx, fade, size]);

  const boxStyle = useAnimatedStyle(() => ({
    width: interpolate(size.value, [0, 1, 2], [132, 290, playerW]),
    height: interpolate(size.value, [0, 1, 2], [36, 64, 156]),
    borderRadius: interpolate(size.value, [0, 1, 2], [18, 32, 38]),
    backgroundColor: '#000000',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  }), [playerW]);
  const contentStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const shownPos = seekDrag == null ? pos : seekDrag * dur;

  let content = null;
  if (shown === 'idle') {
    content = isPlaying ? <Bars playing pal={pal} /> : null; // pure black when stopped
  } else if (shown === 'volume') {
    content = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20 }}>
        <Svg width={20} height={20} viewBox="0 0 20 20">
          <Path d="M3 8h3l5-4v12l-5-4H3z" fill={pal.main} />
          {vol > 0.01 && <Path d="M14 7q2 3 0 6" fill="none" stroke={pal.main} strokeWidth={2} strokeLinecap="round" />}
        </Svg>
        <HillBar width={VOL_W} value={vol} pal={pal} onStart={onVolStart} onChange={onVolChange} onEnd={onVolEnd} />
        <Text style={{ width: 38, textAlign: 'right', color: pal.main, fontSize: 15, fontWeight: '600' }}>
          {Math.round(vol * 100)}%
        </Text>
      </View>
    );
  } else {
    content = (
      <View style={{ width: playerW, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
        <Pressable onPress={() => setOpen(false)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Image
            source={{ uri: T.art }}
            fadeDuration={0}
            resizeMode="cover"
            style={{ width: 52, height: 52, borderRadius: 15, backgroundColor: '#1a1a1a' }}
          />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: '#ffffff', fontSize: 17, fontWeight: '600' }}>{T.title}</Text>
            <Text numberOfLines={1} style={{ color: '#9a9aa2', fontSize: 14, marginTop: 2 }}>{T.artist}</Text>
          </View>
          <Bars playing={isPlaying} pal={pal} maxH={14} />
        </Pressable>
        <View style={{ marginLeft: -PAD, marginTop: 2 }}>
          <HillBar
            width={playerW - 32 - PAD * 2}
            value={shownPos / dur}
            pal={pal}
            onStart={onSeekStart}
            onChange={onSeekChange}
            onEnd={onSeekEnd}
          />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 }}>
          <Text style={{ color: '#8e8e96', fontSize: 11 }}>{fmt(shownPos)}</Text>
          <Text style={{ color: '#8e8e96', fontSize: 11 }}>-{fmt(Math.max(0, dur - shownPos))}</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top, left: 0, right: 0, alignItems: 'center', zIndex: 9999, elevation: 9999 }}
    >
      <Pressable onPress={() => view === 'idle' && setOpen(true)}>
        <Reanimated.View style={boxStyle}>
          <Reanimated.View style={[contentStyle, { alignItems: 'center', justifyContent: 'center' }]}>{content}</Reanimated.View>
        </Reanimated.View>
      </Pressable>
    </View>
  );
}

export default memo(DynamicNotch);
