import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

/*
  Deps (all ship with Expo): react-native-svg, react-native-safe-area-context, @expo/vector-icons
  Playback here is simulated. Wire your audio engine into: pos (seconds), playing, onSeek(seconds), volume.
*/

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const TRACKS = [
  {
    id: 'young-and-beautiful',
    title: 'Young And Beautiful',
    artist: 'Lana Del Rey',
    duration: 236,
    art: { uri: 'https://picsum.photos/seed/lana/600/900' }, // vertical
    tint: '#3a2615',
  },
  {
    id: 'tu-hai-ki-nahi',
    title: 'Tu Hai Ki Nahi',
    artist: 'Meet Bros Anjjan - Roy',
    duration: 330,
    art: { uri: 'https://picsum.photos/seed/tuhai/900/500' }, // horizontal
    tint: '#262a45',
  },
  {
    id: 'high-rated',
    title: 'HIGH RATED',
    artist: 'Guru Randhawa',
    duration: 216,
    art: { uri: 'https://picsum.photos/seed/rated/700/700' }, // square
    tint: '#2b2b30',
  },
];

/* ---------- helpers ---------- */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

// Random-but-smooth amplitudes. Same seed (track id) = same wave, every track gets its own.
function makeWave(seed, n = 72) {
  const rnd = mulberry32(hash(seed));
  const outer = [];
  const k = [];
  let v = 0.5;
  for (let i = 0; i < n; i++) {
    v = v * 0.45 + (0.12 + rnd() * 0.88) * 0.55;
    const env = 0.65 + 0.35 * Math.sin(i / 6 + rnd() * 0.2);
    outer.push(Math.min(1, v * env * 1.15));
    k.push(0.3 + 0.45 * rnd());
  }
  return { outer, inner: outer.map((x, i) => x * k[i]) };
}

function buildPath(vals, W, base, H, scale = 1) {
  const n = vals.length;
  const dx = W / (n - 1);
  const p = vals.map((v, i) => [i * dx, base - v * H * scale]);
  let d = `M0 ${base} L${p[0][0]} ${p[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    d += ` Q${p[i][0]} ${p[i][1]} ${(p[i][0] + p[i + 1][0]) / 2} ${(p[i][1] + p[i + 1][1]) / 2}`;
  }
  return `${d} L${W} ${p[n - 1][1]} L${W} ${base} Z`;
}

// Touch / drag -> 0..1 value. Uses locationX at touch start + dx so it stays stable while dragging.
function useScrub(width, pad, onScrub, onRelease) {
  const start = useRef(0);
  const live = useRef({});
  live.current = { width, pad, onScrub, onRelease };
  return useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const { width: w, pad: p, onScrub: s } = live.current;
          start.current = e.nativeEvent.locationX - p;
          s(clamp(start.current / (w - p * 2)));
        },
        onPanResponderMove: (_, g) => {
          const { width: w, pad: p, onScrub: s } = live.current;
          s(clamp((start.current + g.dx) / (w - p * 2)));
        },
        onPanResponderRelease: (_, g) => {
          const { width: w, pad: p, onRelease: r } = live.current;
          r?.(clamp((start.current + g.dx) / (w - p * 2)));
        },
      }).panHandlers,
    []
  );
}

/* ---------- album art: any aspect ratio, fitted inside a box ---------- */

function AlbumArt({ source, maxW, maxH }) {
  const [ratio, setRatio] = useState(1);

  useEffect(() => {
    const src = Image.resolveAssetSource(source);
    if (src?.width && src?.height) setRatio(src.width / src.height);
    else if (src?.uri) Image.getSize(src.uri, (w, h) => h && setRatio(w / h), () => {});
  }, [source]);

  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }

  return (
    <View className="items-center justify-center" style={{ height: maxH }}>
      <View className="overflow-hidden bg-[#15161a]" style={{ width: w, height: h, borderRadius: 26 }}>
        <Image source={source} style={{ width: w, height: h }} resizeMode="cover" />
      </View>
    </View>
  );
}

/* ---------- song seek bar: random orange waves ---------- */

const PAD = 12;
const WAVE_H = 56;
const BASE = 46;
const AMP = 44;

function WaveSeekBar({ seed, progress, width, onScrub, onRelease }) {
  const iw = width - PAD * 2;
  const pan = useScrub(width, PAD, onScrub, onRelease);

  const { outer, inner } = useMemo(() => {
    const w = makeWave(seed);
    return { outer: buildPath(w.outer, iw, BASE, AMP), inner: buildPath(w.inner, iw, BASE, AMP) };
  }, [seed, iw]);

  const px = clamp(progress) * iw;

  return (
    <View {...pan} style={{ width, height: WAVE_H }}>
      <Svg width={width} height={WAVE_H} pointerEvents="none">
        <Defs>
          <LinearGradient id="waveOuter" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FF6A1F" />
            <Stop offset="1" stopColor="#E5391B" />
          </LinearGradient>
          <LinearGradient id="waveInner" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFD27A" />
            <Stop offset="1" stopColor="#FF9A2A" />
          </LinearGradient>
          <ClipPath id="played">
            <Rect x="0" y="0" width={px} height={WAVE_H} />
          </ClipPath>
        </Defs>
        <G x={PAD}>
          <Rect x="0" y={BASE - 1.5} width={iw} height="3" rx="1.5" fill="rgba(255,255,255,0.3)" />
          <G clipPath="url(#played)">
            <Rect x="0" y={BASE - 1.5} width={iw} height="3" fill="#F2501E" />
            <Path d={outer} fill="url(#waveOuter)" />
            <Path d={inner} fill="url(#waveInner)" />
          </G>
          <Circle cx={px} cy={BASE} r="7.5" fill="#EF3B24" stroke="#ffffff" strokeWidth="2.5" />
        </G>
      </Svg>
    </View>
  );
}

/* ---------- volume bar ---------- */

function VolumeBar({ value, width, onChange }) {
  const pan = useScrub(width, 0, onChange);
  return (
    <View {...pan} className="justify-center" style={{ width, height: 28 }}>
      <View pointerEvents="none" className="h-[4px] rounded-full bg-[#1b1d22]" style={{ width }}>
        <View className="h-[4px] rounded-full bg-[#C7CA3B]" style={{ width: value * width }} />
      </View>
    </View>
  );
}

/* ---------- small pieces ---------- */

function EqIcon({ color = '#8a8c92' }) {
  return (
    <View className="flex-row items-center" style={{ gap: 2, height: 18 }}>
      {[8, 16, 11, 5].map((h, i) => (
        <View key={i} style={{ width: 2, height: h, borderRadius: 1, backgroundColor: color }} />
      ))}
    </View>
  );
}

function BottomPill() {
  return (
    <View className="flex-row justify-between rounded-[22px] bg-[#16171a] px-6 py-3" style={{ marginHorizontal: 12 }}>
      {['grid-outline', 'stats-chart-outline', 'search-outline', 'menu-outline'].map((n) => (
        <Pressable key={n} hitSlop={10}>
          <Ionicons name={n} size={22} color="#8a8c92" />
        </Pressable>
      ))}
    </View>
  );
}

/* ---------- screen ---------- */

export default function PlayerScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [volume, setVolume] = useState(0.18);
  const [shuffle, setShuffle] = useState(true);
  const [repeat, setRepeat] = useState(false);

  const track = TRACKS[index];

  const go = useCallback((dir) => {
    setIndex((i) => (i + dir + TRACKS.length) % TRACKS.length);
    setPos(0);
  }, []);

  useEffect(() => {
    if (!playing || scrubbing) return undefined;
    const t = setInterval(() => setPos((p) => p + 0.25), 250);
    return () => clearInterval(t);
  }, [playing, scrubbing]);

  useEffect(() => {
    if (pos < track.duration) return;
    if (repeat) setPos(0);
    else go(1);
  }, [pos, track.duration, repeat, go]);

  const barW = width - 48;
  const volW = width - 108;
  const artMaxW = width - 64;
  const artMaxH = clamp(height * 0.38, 220, 330);

  return (
    <View className="flex-1 bg-[#050506]">
      <Svg width={width} height={height} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={track.tint} />
            <Stop offset="0.45" stopColor="#0b0b0d" />
            <Stop offset="1" stopColor="#050506" />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#bg)" />
      </Svg>

      <View className="flex-1 justify-between px-6" style={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 10 }}>
        <View>
          <AlbumArt source={track.art} maxW={artMaxW} maxH={artMaxH} />
          <View style={{ marginTop: 12 }}>
            <WaveSeekBar
              seed={track.id}
              width={barW}
              progress={pos / track.duration}
              onScrub={(p) => {
                setScrubbing(true);
                setPos(p * track.duration);
              }}
              onRelease={(p) => {
                setPos(p * track.duration);
                setScrubbing(false);
              }}
            />
          </View>
          <View className="flex-row justify-between">
            <Text className="text-[11px] text-[#8c8e94]">{fmt(pos)}</Text>
            <Text className="text-[11px] text-[#8c8e94]">{fmt(track.duration)}</Text>
          </View>
        </View>

        <View className="items-center">
          <Text className="text-[19px] font-semibold text-white" style={{ fontFamily: SERIF, letterSpacing: 0.2 }} numberOfLines={1}>
            {track.title}
          </Text>
          <Text className="mt-1 text-[13px] text-[#a3a5ab]" style={{ fontFamily: SERIF }} numberOfLines={1}>
            {track.artist}
          </Text>
          <View className="mt-3 rounded-full border border-white/25 px-[10px] py-[3px]">
            <Text className="text-[10px] text-[#a0a2a8]">44.1 kHz  128 kbps  aac LC</Text>
          </View>
        </View>

        <View className="flex-row items-center justify-between px-3">
          <View className="flex-row items-center" style={{ gap: 38 }}>
            <EqIcon />
            <Ionicons name="speedometer-outline" size={22} color="#8a8c92" />
          </View>
          <View className="flex-row items-center" style={{ gap: 38 }}>
            <Pressable onPress={() => setRepeat((r) => !r)} hitSlop={10}>
              <Ionicons name="repeat" size={22} color={repeat ? '#ffffff' : '#8a8c92'} />
            </Pressable>
            <Pressable onPress={() => setShuffle((s) => !s)} hitSlop={10}>
              <Ionicons name="shuffle" size={22} color={shuffle ? '#ffffff' : '#8a8c92'} />
            </Pressable>
          </View>
        </View>

        <View className="flex-row items-center justify-between px-4">
          <View className="h-[6px] w-[6px] rounded-full bg-[#4a4b50]" />
          <Pressable onPress={() => go(-1)} hitSlop={12}>
            <Ionicons name="play-back" size={34} color="#ffffff" />
          </Pressable>
          <Pressable onPress={() => setPlaying((p) => !p)} hitSlop={8} className="h-[70px] w-[70px] items-center justify-center">
            <Ionicons name={playing ? 'pause' : 'play'} size={60} color="#ffffff" />
          </Pressable>
          <Pressable onPress={() => go(1)} hitSlop={12}>
            <Ionicons name="play-forward" size={34} color="#ffffff" />
          </Pressable>
          <View className="h-[6px] w-[6px] rounded-full bg-[#4a4b50]" />
        </View>

        <View className="flex-row items-center" style={{ gap: 12 }}>
          <Ionicons name="volume-low" size={18} color="#8a8c92" />
          <VolumeBar value={volume} width={volW} onChange={setVolume} />
          <Ionicons name="volume-high" size={18} color="#8a8c92" />
        </View>

        <BottomPill />
      </View>
    </View>
  );
}