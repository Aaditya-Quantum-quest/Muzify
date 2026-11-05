import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  Image,
  Animated,
  PanResponder,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { cssInterop } from 'nativewind';
import Svg, { Path, Circle, Defs, Text as SvgText, TextPath } from 'react-native-svg';

// lets <LinearGradient className="..." /> work (skip if already in a shared setup file)
cssInterop(LinearGradient, { className: 'style' });

/* ───────────── theme (taken from the reference) ───────────── */
const INK = '#0e1a3d'; // navy buttons + text
const SOFT = '#d9d6ea'; // light lavender buttons
const GREEN = '#38c85a'; // progress
// bg  → bg-[#e9e6f1]   cream → bg-[#f3f0f8]

// Serif italic for the artist name. For a closer match to the reference load
// "Playfair Display Italic" with expo-font and put its name here.
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

/* ───────────── demo queue (replace with real data) ───────────── */
// add `image: require('@/assets/...')` or `image: { uri: '...' }` to show real artwork
const QUEUE = [
  { id: '1', title: 'Stick with You', artist: 'Zara Larsson', album: 'Poster Girl', seconds: 204, art: ['#d9568f', '#7b2a6e'] },
  { id: '2', title: 'Golden Hour', artist: 'Nova Lane', album: 'Late Bloom', seconds: 187, art: ['#dea962', '#c25d1a'] },
  { id: '3', title: 'Neon Rain', artist: 'The Static', album: 'Night Shift', seconds: 221, art: ['#6a4fd8', '#2a1d6e'] },
  { id: '4', title: 'Low Tide', artist: 'Mira Vale', album: 'Salt', seconds: 176, art: ['#4f8fd8', '#1d3a6e'] },
  { id: '5', title: 'Wildflower', artist: 'Harbor', album: 'Open Fields', seconds: 199, art: ['#4fd88a', '#1d6e45'] },
];

const fmt = (s) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ───────────── icons ───────────── */
const PATHS = {
  back: 'm15 18-6-6 6-6',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  note: 'M9 18V5l11-2v13',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  play: 'M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  prev: 'M19 20 9 12l10-8zM5 19V5',
  next: 'm5 4 10 8-10 8zM19 5v14',
  heart: 'M12 20.5s-7.5-4.5-7.5-10A4.3 4.3 0 0 1 12 7.8a4.3 4.3 0 0 1 7.5 2.7c0 5.5-7.5 10-7.5 10Z',
  repeat: 'M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3',
  shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
};

function Icon({ name, size = 22, color = INK, filled = false, stroke = 1.8 }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth={filled ? 1.4 : stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={PATHS[name]} />
      {name === 'note' && (
        <>
          <Circle cx={6} cy={18} r={3} />
          <Circle cx={17} cy={16} r={3} />
        </>
      )}
    </Svg>
  );
}

// circular arrow with "10" inside (dir: 'back' | 'fwd')
function Skip10({ dir, size = 30, color = '#fff' }) {
  const back = dir === 'back';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {back ? (
        <>
          <Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <Path d="M3 3v5h5" />
        </>
      ) : (
        <>
          <Path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <Path d="M21 3v5h-5" />
        </>
      )}
      <SvgText x={12} y={15.4} fontSize={7.5} fontWeight="bold" fill={color} stroke="none" textAnchor="middle">
        10
      </SvgText>
    </Svg>
  );
}

const FlowerIcon = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={1.8}>
    <Circle cx={8.5} cy={8.5} r={3.6} />
    <Circle cx={15.5} cy={8.5} r={3.6} />
    <Circle cx={8.5} cy={15.5} r={3.6} />
    <Circle cx={15.5} cy={15.5} r={3.6} />
  </Svg>
);

/* ───────────── bottom sheet (light) ───────────── */
function Sheet({ visible, onClose, children }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <View
        className="bg-[#f3f0f8] rounded-t-[28px] px-5 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
      >
        <View className="self-center w-10 h-1 rounded-full bg-[#0e1a3d]/15 mb-4" />
        {children}
      </View>
    </Modal>
  );
}

/* ───────────── screen ───────────── */
export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { width: screenW, height: screenH } = useWindowDimensions();

  // optional: router.push({ pathname: '/player', params: { title, artist, album, duration } })
  const queue = useMemo(() => {
    if (!params.title) return QUEUE;
    return [
      {
        id: 'param',
        title: String(params.title),
        artist: String(params.artist ?? 'Unknown artist'),
        album: String(params.album ?? 'Single'),
        seconds: Number(params.duration) || 200,
        art: QUEUE[0].art,
      },
      ...QUEUE.slice(1),
    ];
  }, [params.title, params.artist, params.album, params.duration]);

  const [idx, setIdx] = useState(0);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off'); // off | all | one
  const [liked, setLiked] = useState(false);
  const [notify, setNotify] = useState(false);
  const [remaining, setRemaining] = useState(false);
  const [scrub, setScrub] = useState(false);
  const [sheet, setSheet] = useState(null); // 'queue' | 'options' | null

  const track = queue[idx];
  const duration = track.seconds;
  const progress = clamp(pos / duration, 0, 1);

  /* ── playback simulation ── */
  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => setPos((p) => p + 0.25), 250);
    return () => clearInterval(t);
  }, [playing]);

  const goTo = (i) => {
    setIdx(i);
    setPos(0);
    setLiked(false);
  };
  const next = () => {
    if (shuffle && queue.length > 1) {
      let n = idx;
      while (n === idx) n = Math.floor(Math.random() * queue.length);
      goTo(n);
    } else {
      goTo((idx + 1) % queue.length);
    }
    setPlaying(true);
  };
  const prev = () => {
    if (pos > 3) setPos(0);
    else goTo((idx - 1 + queue.length) % queue.length);
  };

  useEffect(() => {
    if (pos < duration) return;
    if (repeat === 'one') setPos(0);
    else if (repeat === 'all' || shuffle || idx < queue.length - 1) next();
    else {
      setPlaying(false);
      setPos(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  /* ── track-change animation ── */
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }).start();
  }, [idx, anim]);

  /* ── layout ── */
  const fixed = 360; // top bar + title + controls + margins
  const avail = screenH - insets.top - insets.bottom;
  const artH = clamp(avail - fixed, 300, 400);
  const W = Math.min(artH / 1.4, screenW - 110);
  const R = W / 2;
  const GAP = 14;
  const PAD = 24;
  const boxW = W + PAD * 2;
  const boxH = artH + PAD;
  const cx = boxW / 2;
  const yb = artH - R; // centre of the bottom semicircle
  const r = R + GAP; // progress-arc radius
  const L = Math.round(artH * 0.17); // straight part of the arc on each side
  const y0 = yb - L;
  const x1 = cx - r;
  const x2 = cx + r;
  const total = 2 * L + Math.PI * r;
  const arcD = `M ${x1} ${y0} L ${x1} ${yb} A ${r} ${r} 0 0 0 ${x2} ${yb} L ${x2} ${y0}`;

  const pointAt = (s) => {
    if (s <= L) return { x: x1, y: y0 + s };
    if (s <= L + Math.PI * r) {
      const th = Math.PI - (s - L) / r;
      return { x: cx + r * Math.cos(th), y: yb + r * Math.sin(th) };
    }
    return { x: x2, y: yb - (s - L - Math.PI * r) };
  };
  const thumb = pointAt(progress * total);

  /* ── scrubbing along the arc ── */
  const boxRef = useRef(null);
  const origin = useRef({ x: 0, y: 0 });
  const geo = useRef({});
  geo.current = { cx, yb, r, L, y0, x1, x2, total, duration };

  const measure = () =>
    boxRef.current?.measureInWindow?.((x, y) => {
      origin.current = { x, y };
    });

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: (e) => {
        const g = geo.current;
        const x = e.nativeEvent.pageX - origin.current.x;
        const y = e.nativeEvent.pageY - origin.current.y;
        measure();
        if (y >= g.y0 - 12 && y <= g.yb) {
          return Math.abs(x - g.x1) < 24 || Math.abs(x - g.x2) < 24;
        }
        if (y > g.yb) return Math.abs(Math.hypot(x - g.cx, y - g.yb) - g.r) < 24;
        return false;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        setScrub(true);
        seekTo(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderMove: (_, g) => seekTo(g.moveX, g.moveY),
      onPanResponderRelease: () => setScrub(false),
      onPanResponderTerminate: () => setScrub(false),
    }),
  ).current;

  function seekTo(px, py) {
    const g = geo.current;
    const x = px - origin.current.x;
    const y = py - origin.current.y;
    let s;
    if (y <= g.yb) {
      s = x < g.cx ? clamp(y - g.y0, 0, g.L) : g.L + Math.PI * g.r + clamp(g.yb - y, 0, g.L);
    } else {
      s = g.L + (Math.PI - Math.atan2(y - g.yb, x - g.cx)) * g.r;
    }
    setPos(clamp(s / g.total, 0, 1) * g.duration);
  }

  /* ── text bits ── */
  const [first, ...rest] = track.artist.split(' ');
  const titleFont = track.title.length > 18 ? 15 : 18;
  const arcTextR = R - 34;

  const cycleRepeat = () => setRepeat((v) => (v === 'off' ? 'all' : v === 'all' ? 'one' : 'off'));

  return (
    <View
      className="flex-1 bg-[#e9e6f1]"
      style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }}
    >
      <StatusBar style="dark" />

      {/* ── top bar ── */}
      <View className="flex-row items-center justify-between px-5 h-14">
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.75}
          hitSlop={HIT}
          className="w-11 h-11 rounded-full bg-[#d9d6ea] items-center justify-center"
        >
          <Icon name="back" size={22} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setNotify((v) => !v)} activeOpacity={0.75} hitSlop={HIT} className="w-11 h-11 items-center justify-center">
          <Icon name="bell" size={24} filled={notify} />
          {notify && <View className="absolute right-2.5 top-2.5 w-2 h-2 rounded-full bg-[#38c85a]" />}
        </TouchableOpacity>
      </View>

      {/* ── artist + album pill ── */}
      <Animated.View
        className="px-6 mt-1"
        style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}
      >
        <View className="pb-5">
          <Text textTransform="capitalize" 
            className="text-[#0e1a3d]"
            style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 50, lineHeight: 54, letterSpacing: -0.5 }}
            numberOfLines={rest.length ? 3 : 2}
          >
            {first}
            {rest.length ? `\n${rest.join(' ')}` : ''}
          </Text>
          <View
            className="absolute right-0 bottom-0 flex-row items-center h-9 pl-1.5 pr-3.5 rounded-full border border-[#0e1a3d] bg-[#f3f0f8]"
            style={{ maxWidth: '62%' }}
          >
            <View className="w-6 h-6 rounded-full bg-[#d9d6ea] items-center justify-center mr-2">
              <FlowerIcon />
            </View>
            <Text textTransform="capitalize"  className="shrink text-[15px] text-[#0e1a3d]" style={{ fontFamily: SERIF, fontStyle: 'italic' }} numberOfLines={1}>
              {track.album}
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* ── artwork + progress arc ── */}
      <View className="flex-1 items-center justify-center">
        <View ref={boxRef} onLayout={measure} style={{ width: boxW, height: boxH }} {...pan.panHandlers}>
          {/* capsule artwork */}
          <Animated.View
            style={{
              position: 'absolute',
              left: PAD,
              top: 0,
              width: W,
              height: artH,
              borderRadius: R,
              overflow: 'hidden',
              opacity: anim,
              transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
            }}
          >
            {track.image ? (
              <Image source={track.image} style={{ width: W, height: artH }} resizeMode="cover" />
            ) : (
              <LinearGradient colors={track.art} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ width: W, height: artH }}>
                <View className="absolute -right-10 top-16 w-[180px] h-[180px] rounded-full bg-white/10" />
                <View className="absolute -left-16 bottom-24 w-[200px] h-[200px] rounded-full bg-black/10" />
                <View className="absolute left-10 top-1/3 w-[90px] h-[90px] rounded-full bg-white/10" />
              </LinearGradient>
            )}
            {/* bottom shade so the time stays readable on any image */}
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.38)']}
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: artH * 0.4 }}
            />

            {/* curved song title */}
            <Svg width={W} height={artH} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
              <Defs>
                <Path id="titleArc" d={`M ${R - arcTextR} ${R} A ${arcTextR} ${arcTextR} 0 0 1 ${R + arcTextR} ${R}`} />
              </Defs>
              <SvgText fill="#fff" fontSize={titleFont} fontStyle="italic" fontFamily={SERIF} textAnchor="middle">
                <TextPath href="#titleArc" startOffset="50%">
                  {track.title}
                </TextPath>
              </SvgText>
            </Svg>

            {/* time (tap to flip elapsed / remaining) */}
            <TouchableOpacity
              onPress={() => setRemaining((v) => !v)}
              activeOpacity={0.8}
              hitSlop={HIT}
              style={{ position: 'absolute', left: 0, right: 0, bottom: artH * 0.07, alignItems: 'center' }}
            >
              <Text textTransform="capitalize"  className="text-xl font-medium text-white tracking-wide">
                {remaining ? `-${fmt(duration - pos)}` : fmt(pos)}
              </Text>
            </TouchableOpacity>

            {/* play / pause */}
            <View style={{ position: 'absolute', left: 0, right: 0, top: artH * 0.42, alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => setPlaying((p) => !p)}
                activeOpacity={0.85}
                className="w-[76px] h-[76px] rounded-full bg-[#0e1a3d] items-center justify-center border-4 border-white/40"
              >
                <Icon name={playing ? 'pause' : 'play'} size={28} color="#fff" filled />
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* progress arc */}
          <Svg width={boxW} height={boxH} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
            <Path d={arcD} stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />
            {progress > 0.004 && (
              <Path
                d={arcD}
                stroke={GREEN}
                strokeWidth={4}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={[total, total]}
                strokeDashoffset={total * (1 - progress)}
              />
            )}
            <Circle cx={thumb.x} cy={thumb.y} r={scrub ? 9 : 7} fill="#fff" stroke={GREEN} strokeWidth={3} />
          </Svg>

          {/* corner buttons */}
          <TouchableOpacity
            onPress={() => setSheet('queue')}
            activeOpacity={0.75}
            hitSlop={HIT}
            className="absolute left-1 bottom-1 w-10 h-10 rounded-full bg-[#f3f0f8] border border-[#0e1a3d]/15 items-center justify-center"
          >
            <Icon name="note" size={18} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSheet('options')}
            activeOpacity={0.75}
            hitSlop={HIT}
            className="absolute right-1 bottom-1 w-10 h-10 rounded-full bg-[#f3f0f8] border border-[#0e1a3d]/15 items-center justify-center"
          >
            <Icon name="dots" size={20} stroke={2.6} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── transport controls ── */}
      <View className="flex-row items-center justify-center gap-4 px-5 mt-2 mb-2">
        <TouchableOpacity
          onPress={prev}
          activeOpacity={0.8}
          className="w-[62px] h-[62px] rounded-full bg-[#d9d6ea] items-center justify-center"
        >
          <Icon name="prev" size={24} filled />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setPos((p) => Math.max(0, p - 10))}
          activeOpacity={0.8}
          className="w-[62px] h-[62px] rounded-full bg-[#0e1a3d] items-center justify-center"
        >
          <Skip10 dir="back" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setPos((p) => Math.min(duration - 0.1, p + 10))}
          activeOpacity={0.8}
          className="w-[62px] h-[62px] rounded-full bg-[#0e1a3d] items-center justify-center"
        >
          <Skip10 dir="fwd" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={next}
          activeOpacity={0.8}
          className="w-[62px] h-[62px] rounded-full bg-[#d9d6ea] items-center justify-center"
        >
          <Icon name="next" size={24} filled />
        </TouchableOpacity>
      </View>

      {/* ── queue sheet ── */}
      <Sheet visible={sheet === 'queue'} onClose={() => setSheet(null)}>
        <Text textTransform="capitalize"  className="text-2xl text-[#0e1a3d] mb-3" style={{ fontFamily: SERIF, fontStyle: 'italic' }}>
          Up next
        </Text>
        <ScrollView className="max-h-[420px]" showsVerticalScrollIndicator={false}>
          {queue.map((t, i) => {
            const current = i === idx;
            return (
              <TouchableOpacity
                key={t.id}
                activeOpacity={0.75}
                onPress={() => {
                  if (current) setPlaying((p) => !p);
                  else {
                    goTo(i);
                    setPlaying(true);
                  }
                  setSheet(null);
                }}
                className={`flex-row items-center p-2 rounded-2xl mb-1 ${current ? 'bg-[#e3dff0]' : ''}`}
              >
                <LinearGradient
                  colors={t.art}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  className="w-12 h-12 rounded-xl mr-3"
                />
                <View className="flex-1 min-w-0">
                  <Text textTransform="capitalize"  className="text-base font-semibold text-[#0e1a3d]" numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Text textTransform="capitalize"  className="text-xs text-[#6b6f8a] mt-0.5" numberOfLines={1}>
                    {t.artist}
                  </Text>
                </View>
                {current ? (
                  <Icon name={playing ? 'pause' : 'play'} size={18} filled />
                ) : (
                  <Text textTransform="capitalize"  className="text-xs text-[#6b6f8a]">{fmt(t.seconds)}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Sheet>

      {/* ── options sheet ── */}
      <Sheet visible={sheet === 'options'} onClose={() => setSheet(null)}>
        <TouchableOpacity onPress={() => setLiked((v) => !v)} activeOpacity={0.7} className="h-14 flex-row items-center gap-4">
          <Svg width={22} height={22} viewBox="0 0 24 24" fill={liked ? '#e8456f' : 'none'} stroke={liked ? '#e8456f' : INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Path d={PATHS.heart} />
          </Svg>
          <Text textTransform="capitalize"  className="text-base text-[#0e1a3d]">{liked ? 'Liked' : 'Like this song'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={cycleRepeat} activeOpacity={0.7} className="h-14 flex-row items-center gap-4">
          <Icon name="repeat" size={22} color={repeat === 'off' ? INK : '#1f9d40'} />
          <Text textTransform="capitalize"  className="text-base text-[#0e1a3d]">
            Repeat: {repeat === 'off' ? 'off' : repeat === 'all' ? 'all songs' : 'this song'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShuffle((v) => !v)} activeOpacity={0.7} className="h-14 flex-row items-center gap-4">
          <Icon name="shuffle" size={22} color={shuffle ? '#1f9d40' : INK} />
          <Text textTransform="capitalize"  className="text-base text-[#0e1a3d]">Shuffle: {shuffle ? 'on' : 'off'}</Text>
        </TouchableOpacity>
      </Sheet>
    </View>
  );
}