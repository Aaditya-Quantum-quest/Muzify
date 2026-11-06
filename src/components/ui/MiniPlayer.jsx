/**
 * MiniPlayerBar — "Graphite" bar + liquid orb
 *
 * Flow: app opens as an orb (bottom-right) → a song starts → orb morphs into the
 * mini player → 5 s without a touch → morphs back into the orb → tap orb → mini
 * player → tap song info → /player.
 *
 * Needs: react-native-reanimated (3.x), react-native-svg, expo-router.
 * Plain StyleSheet (no NativeWind). All animation runs on the UI thread.
 */
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { useRouter } from "expo-router";

import { usePlayer } from "../../context/player-context";

/* ───────────── constants ───────────── */
const IDLE_MS = 5000; // no touch for this long → orb
const MORPH_MS = 520;
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const ORB = 84; // orb diameter
const BAR_H = 92;
const BAR_MAX_W = 398;
const ACCENT = "#C6F24E";
const IVORY = "#F4F1E8";
const MUTED = "#9A9AA0";
const TWO_PI = Math.PI * 2;
const FALLBACK_COLORS = ["#555", "#222", "#fff", "#888", "#111"];

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/* ───────────── worklet helpers (run on the UI thread) ───────────── */
function blobPath(cx, cy, R, A, p, sd) {
  "worklet";
  let d = "";
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * TWO_PI;
    const r =
      R +
      A *
        (0.55 * Math.sin(2 * t + p * 0.9 + sd) +
          0.35 * Math.sin(3 * t - p * 1.3 + sd * 2) +
          0.2 * Math.sin(5 * t + p * 0.6 - sd));
    d += (i ? "L" : "M") + (cx + r * Math.cos(t)).toFixed(1) + " " + (cy + r * Math.sin(t)).toFixed(1);
  }
  return d + "Z";
}

function waveY(x, mid, A, p) {
  "worklet";
  return mid + A * Math.sin((x / 20) * TWO_PI - p);
}

function wavePath(x0, x1, mid, A, p) {
  "worklet";
  const n = Math.max(1, Math.ceil((x1 - x0) / 3));
  let d = "";
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    d += (i ? "L" : "M") + x.toFixed(1) + " " + waveY(x, mid, A, p).toFixed(1);
  }
  return d;
}

function dotProps(k, p, e) {
  "worklet";
  const a = p * 0.35 + k * 2.2;
  const r = 52 + 3 * Math.sin(p * 0.8 + k * 1.7);
  return {
    cx: 64 + r * Math.cos(a),
    cy: 64 + r * Math.sin(a),
    opacity: Math.max(0, Math.sin(p * 1.1 + k * 2.3)) * (0.25 + 0.65 * e),
  };
}

/* ───────────── default icons (override via props) ───────────── */
const ShuffleIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 7h3.5c2 0 3.4 1 4.5 2.6l2 2.8c1.1 1.6 2.5 2.6 4.5 2.6H21M3 17h3.5c1.2 0 2.2-.4 3-1.1M21 7h-3.5c-1.2 0-2.2.4-3 1.1M18 4l3 3-3 3M18 14l3 3-3 3"
      stroke={IVORY}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);
const PauseIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24">
    <Rect x={6} y={5} width={4} height={14} rx={1.2} fill="#0B0B0C" />
    <Rect x={14} y={5} width={4} height={14} rx={1.2} fill="#0B0B0C" />
  </Svg>
);
const PlayIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24">
    <Path d="M8 5.2v13.6a1 1 0 0 0 1.5.85l11-6.8a1 1 0 0 0 0-1.7l-11-6.8A1 1 0 0 0 8 5.2z" fill="#0B0B0C" />
  </Svg>
);

/* ───────────── wavy seek bar ───────────── */
const SeekWave = memo(function SeekWave({ W, morph, phase, energy, progress }) {
  const MID = 12;
  const played = useAnimatedProps(() => {
    if (morph.value > 0.4) return { d: "M0 0" }; // hidden → skip work
    const x1 = 2 + progress.value * (W - 4);
    return { d: wavePath(2, x1, MID, 3.2 * energy.value, phase.value) };
  }, [W]);
  const rest = useAnimatedProps(() => {
    const x1 = 2 + progress.value * (W - 4);
    return { d: `M${x1} ${MID}L${W - 2} ${MID}` };
  }, [W]);
  const thumb = useAnimatedProps(() => {
    const x1 = 2 + progress.value * (W - 4);
    return { cx: x1, cy: waveY(x1, MID, 3.2 * energy.value, phase.value) };
  }, [W]);

  return (
    <Svg width={W} height={24} viewBox={`0 0 ${W} 24`} fill="none">
      <AnimatedPath animatedProps={rest} d="M0 0" stroke="rgba(255,255,255,.14)" strokeWidth={2.5} strokeLinecap="round" />
      <AnimatedPath animatedProps={played} d="M0 0" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <AnimatedCircle animatedProps={thumb} cx={2} cy={MID} r={4.5} fill={IVORY} />
    </Svg>
  );
});

/* ───────────── liquid halo behind the orb ───────────── */
const Halo = memo(function Halo({ morph, phase, energy }) {
  const blobA = useAnimatedProps(() => ({
    d: morph.value < 0.5 ? "M0 0" : blobPath(61.5, 61.5, 43, 2.5 + 5 * energy.value, phase.value, 0),
  }));
  const blobB = useAnimatedProps(() => ({
    d: morph.value < 0.5 ? "M0 0" : blobPath(66.5, 66.5, 43, 2.5 + 5 * energy.value, phase.value * 1.15, 2.4),
  }));
  const d0 = useAnimatedProps(() => dotProps(0, phase.value, energy.value));
  const d1 = useAnimatedProps(() => dotProps(1, phase.value, energy.value));
  const d2 = useAnimatedProps(() => dotProps(2, phase.value, energy.value));

  return (
    <Svg width={128} height={128} viewBox="0 0 128 128" fill="none">
      <Defs>
        <LinearGradient id="gb" gradientUnits="userSpaceOnUse" x1={20} y1={20} x2={108} y2={108}>
          <Stop offset={0} stopColor="#5BA8FA" />
          <Stop offset={1} stopColor="#3FB8F5" />
        </LinearGradient>
        <LinearGradient id="gc" gradientUnits="userSpaceOnUse" x1={108} y1={108} x2={20} y2={20}>
          <Stop offset={0} stopColor="#1FD6EE" />
          <Stop offset={1} stopColor="#3CC4F6" />
        </LinearGradient>
        <RadialGradient id="under" gradientUnits="userSpaceOnUse" cx={64} cy={76} r={50}>
          <Stop offset={0.6} stopColor="#22D3EE" stopOpacity={0.28} />
          <Stop offset={1} stopColor="#22D3EE" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={64} cy={76} r={50} fill="url(#under)" />
      <AnimatedPath animatedProps={blobA} d="M0 0" fill="url(#gb)" />
      <AnimatedPath animatedProps={blobB} d="M0 0" fill="url(#gc)" opacity={0.95} />
      <AnimatedCircle animatedProps={d0} cx={64} cy={64} r={1.7} fill="#22D3EE" />
      <AnimatedCircle animatedProps={d1} cx={64} cy={64} r={1.7} fill="#22D3EE" />
      <AnimatedCircle animatedProps={d2} cx={64} cy={64} r={1.7} fill="#22D3EE" />
    </Svg>
  );
});

/* ───────────── orb face: pause lines / play triangle + inner glow ───────────── */
const OrbFace = memo(function OrbFace({ playing }) {
  return (
    <Svg width={80} height={80} viewBox="0 0 80 80" fill="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="inner" gradientUnits="userSpaceOnUse" cx={40} cy={40} r={40}>
          <Stop offset={0.72} stopColor="#38C8F0" stopOpacity={0} />
          <Stop offset={1} stopColor="#38C8F0" stopOpacity={0.5} />
        </RadialGradient>
        <LinearGradient id="face" x1={0} y1={0} x2={0} y2={1}>
          <Stop offset={0} stopColor="#46B6F8" />
          <Stop offset={1} stopColor="#2CCDF0" />
        </LinearGradient>
      </Defs>
      <Circle cx={40} cy={40} r={40} fill="url(#inner)" />
      {playing ? (
        <>
          <Rect x={33} y={23} width={4} height={34} rx={2} fill="url(#face)" />
          <Rect x={47} y={23} width={4} height={34} rx={2} fill="url(#face)" />
        </>
      ) : (
        <Path d="M35 27L54 40L35 53Z" fill="url(#face)" stroke="url(#face)" strokeWidth={4} strokeLinejoin="round" />
      )}
    </Svg>
  );
});

/* ───────────── main component ───────────── */
export default function MiniPlayerBar({
  sidePad = 16,
  insets = { top: 0, bottom: 0, left: 0, right: 0 },
  router: routerProp = null,
  AvatarArt = null,
  IconShuffle = null,
  IconPlay = null,
  IconPause = null,
}) {
  const hookRouter = useRouter();
  const router = routerProp ?? hookRouter;

  const player = usePlayer();
  const { track, playing, togglePlay, shuffle, toggleShuffle, pos } = player;
  const seekTo = player.seekTo ?? player.seek; // optional: (seconds) => void

  const reduceMotion = useReducedMotion();
  const { width: screenW } = useWindowDimensions();
  const barW = Math.min(BAR_MAX_W, screenW - 2 * (sidePad - 4));
  const innerW = barW - 2 - 28; // minus border and horizontal padding

  const hasTrack = !!track;
  const duration = Number(track?.duration) > 0 ? Number(track.duration) : 0;
  const frac = duration ? Math.min(1, Math.max(0, pos / duration)) : 0;
  const trackKey = track?.id ?? track?.title ?? null;

  /* mode: 'orb' | 'bar' — the app opens as an orb */
  const [mode, setMode] = useState("orb");

  /* shared values */
  const morph = useSharedValue(1); // 1 = orb, 0 = bar
  const phase = useSharedValue(0);
  const energy = useSharedValue(0);
  const progress = useSharedValue(0);

  /* morph bar <-> orb */
  useEffect(() => {
    morph.value = withTiming(mode === "orb" ? 1 : 0, { duration: reduceMotion ? 0 : MORPH_MS, easing: EASE });
  }, [mode, reduceMotion, morph]);

  /* wave / blob clock — only ticks while a song is playing */
  const frame = useFrameCallback((info) => {
    "worklet";
    const dt = Math.min(info.timeSincePreviousFrame ?? 16, 50);
    phase.value += (dt / 1000) * 2;
  }, false);
  useEffect(() => {
    frame.setActive(playing && hasTrack && !reduceMotion);
  }, [playing, hasTrack, reduceMotion, frame]);

  /* energy: lively when playing, calm when paused, flat with no track */
  useEffect(() => {
    energy.value = withTiming(!hasTrack ? 0 : playing ? 1 : 0.25, { duration: 450 });
  }, [playing, hasTrack, energy]);

  /* progress glides between position updates */
  useEffect(() => {
    progress.value = withTiming(frac, { duration: 450, easing: Easing.linear });
  }, [frac, progress]);

  /* idle timer: bar → orb after IDLE_MS without a touch */
  const idleRef = useRef(null);
  const clearIdle = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = null;
  }, []);
  const armIdle = useCallback(() => {
    clearIdle();
    idleRef.current = setTimeout(() => setMode("orb"), IDLE_MS);
  }, [clearIdle]);
  useEffect(() => {
    if (mode === "bar") armIdle();
    else clearIdle();
    return clearIdle;
  }, [mode, armIdle, clearIdle]);
  const onTouch = useCallback(() => {
    if (mode === "bar") armIdle();
  }, [mode, armIdle]);

  /* a song starts (or changes) → orb becomes the bar */
  const prev = useRef({ key: trackKey, playing });
  useEffect(() => {
    const p = prev.current;
    if (playing && hasTrack && (!p.playing || p.key !== trackKey)) setMode("bar");
    prev.current = { key: trackKey, playing };
  }, [playing, trackKey, hasTrack]);

  const expand = useCallback(() => setMode("bar"), []);
  const openPlayer = useCallback(() => router.push("/player"), [router]);
  const onSeek = useCallback(
    (x) => {
      if (!seekTo || !duration) return;
      seekTo(Math.min(1, Math.max(0, x / innerW)) * duration);
    },
    [seekTo, duration, innerW]
  );

  /* animated styles */
  const boxStyle = useAnimatedStyle(() => {
    const m = morph.value;
    return {
      width: interpolate(m, [0, 1], [barW, ORB]),
      height: interpolate(m, [0, 1], [BAR_H, ORB]),
      borderRadius: interpolate(m, [0, 1], [30, ORB / 2]),
      borderWidth: interpolate(m, [0, 1], [1, 2]),
      backgroundColor: interpolateColor(m, [0, 1], ["#121214", "#FFFFFF"]),
      borderColor: interpolateColor(m, [0, 1], ["rgba(255,255,255,0.1)", "#3CC8F4"]),
      shadowColor: interpolateColor(m, [0, 1], ["#000000", "#22D3EE"]),
      shadowOpacity: interpolate(m, [0, 1], [0.55, 0.38]),
      shadowRadius: interpolate(m, [0, 1], [28, 12]),
      shadowOffset: { width: 0, height: interpolate(m, [0, 1], [18, 8]) },
      elevation: interpolate(m, [0, 1], [20, 10]),
    };
  }, [barW]);
  const barLayerStyle = useAnimatedStyle(() => ({ opacity: interpolate(morph.value, [0, 0.35], [1, 0], "clamp") }));
  const orbLayerStyle = useAnimatedStyle(() => ({ opacity: interpolate(morph.value, [0.55, 1], [0, 1], "clamp") }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: interpolate(morph.value, [0.55, 1], [0, 1], "clamp") }));

  const Shuffle = IconShuffle ?? ShuffleIcon;
  const Play = IconPlay ?? PlayIcon;
  const Pause = IconPause ?? PauseIcon;
  const colors = track?.colors ?? FALLBACK_COLORS;
  const title = track?.title ?? "No track";
  const by = track?.artist ?? "";

  return (
    <View
      pointerEvents="box-none"
      style={[styles.root, { paddingHorizontal: sidePad - 4, paddingBottom: 14 + insets.bottom }]}
    >
      {/* liquid halo — sits behind the orb, never blocks touches */}
      <Animated.View
        pointerEvents="none"
        style={[styles.halo, { right: sidePad - 26, bottom: 8 + insets.bottom }, haloStyle]}
      >
        <Halo morph={morph} phase={phase} energy={energy} />
      </Animated.View>

      {/* the morphing container: bar <-> orb */}
      <Animated.View onTouchStart={onTouch} style={[styles.box, boxStyle]}>
        {/* ── bar layer ── */}
        <Animated.View
          pointerEvents={mode === "bar" ? "auto" : "none"}
          style={[styles.barLayer, { width: barW - 2 }, barLayerStyle]}
        >
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <LinearGradient id="barBg" x1={0} y1={0} x2={0} y2={1}>
                <Stop offset={0} stopColor="#19191C" />
                <Stop offset={1} stopColor="#121214" />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width="100%" height="100%" fill="url(#barBg)" />
          </Svg>

          <View style={styles.row}>
            <Pressable
              onPress={openPlayer}
              accessibilityRole="button"
              accessibilityLabel="Open player"
              style={styles.info}
            >
              <View style={styles.art}>{AvatarArt ? <AvatarArt colors={colors} /> : <View style={styles.artFallback} />}</View>
              <View style={styles.texts}>
                <Text numberOfLines={1} style={styles.title}>
                  {title}
                </Text>
                <Text numberOfLines={1} style={styles.sub}>
                  {by ? `${by} · ` : ""}
                  {fmt(pos)} / {fmt(duration)}
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={toggleShuffle}
              accessibilityRole="button"
              accessibilityLabel="Shuffle"
              accessibilityState={{ selected: !!shuffle }}
              style={styles.shuffle}
            >
              <View style={{ opacity: shuffle ? 1 : 0.55 }}>
                <Shuffle />
              </View>
              {shuffle ? <View style={styles.shuffleDot} /> : null}
            </Pressable>

            <Pressable
              onPress={togglePlay}
              accessibilityRole="button"
              accessibilityLabel={playing ? "Pause" : "Play"}
              style={styles.play}
            >
              {playing ? <Pause /> : <Play />}
            </Pressable>
          </View>

          <Pressable
            onPress={(e) => onSeek(e.nativeEvent.locationX)}
            accessibilityRole="adjustable"
            accessibilityLabel="Seek"
            style={styles.seek}
          >
            <SeekWave W={innerW} morph={morph} phase={phase} energy={energy} progress={progress} />
          </Pressable>
        </Animated.View>

        {/* ── orb layer ── */}
        <Animated.View pointerEvents={mode === "orb" ? "auto" : "none"} style={[styles.orbLayer, orbLayerStyle]}>
          <Pressable
            onPress={expand}
            accessibilityRole="button"
            accessibilityLabel="Open mini-player"
            style={StyleSheet.absoluteFill}
          >
            <OrbFace playing={playing && hasTrack} />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function fmt(s) {
  const n = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  root: { position: "absolute", left: 0, right: 0, bottom: 80, alignItems: "flex-end" },
  halo: { position: "absolute", width: 128, height: 128 },
  box: { marginBottom: 16, overflow: "hidden", borderStyle: "solid" },
  barLayer: { position: "absolute", right: 0, top: 0, height: 90, paddingTop: 14, paddingHorizontal: 14 },
  orbLayer: { position: "absolute", right: 0, bottom: 0, width: 80, height: 80 },
  row: { flexDirection: "row", alignItems: "center", height: 52, gap: 12 },
  info: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", height: 52, gap: 12 },
  art: { width: 52, height: 52, borderRadius: 15, overflow: "hidden", backgroundColor: "#1C1C1E" },
  artFallback: { flex: 1, backgroundColor: "#7A786C" },
  texts: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 15, fontWeight: "600", letterSpacing: -0.15, color: IVORY, textTransform: "capitalize" },
  sub: { fontSize: 12, color: MUTED, fontStyle: "italic", fontVariant: ["tabular-nums"] },
  shuffle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  shuffleDot: { position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: ACCENT },
  play: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: IVORY },
  seek: { height: 24, justifyContent: "center" },
});