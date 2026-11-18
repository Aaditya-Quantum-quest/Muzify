import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useIsFocused } from "expo-router";
import { usePlayer } from "../../context/player-context";
import { playbackQueue } from "../../services/audio/PlaybackQueue";
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { ChevronRight, Pause, Play } from "lucide-react-native";

/*
 * "Louvre" — six mix slats, one open at a time.
 *
 * Performance notes
 * - Opening/closing is one flexGrow animation per slat on the UI thread
 *   (Reanimated). Siblings share the row by flex, so the widths always add up
 *   to the row width and nothing is measured per frame.
 * - Line art is generated once per row width (useMemo) and drawn by a memoized
 *   <SlatArt>. It never re-renders while a slat opens or closes.
 * - The dash "signal flow" only runs on the slat that is open AND playing AND
 *   on a focused screen AND with OS "reduce motion" off. A playing slat that is
 *   closed shows static dashes + the equalizer, so no per-frame SVG work.
 * - SlatItem is memo'd and receives primitives + stable callbacks, so selecting
 *   a slat re-renders at most two items; the other four are skipped.
 * - useIsFocused stops every animation the moment the screen loses focus.
 * - Six static items: a plain View row (no FlatList windowing overhead).
 * - Module-level constants for data, styles and configs keep references stable.
 */

// Copy the real value from your original screen file.
// FG_COLOR: the value that used to be C.fg
const FG_COLOR = "#ffffff";
const FONT = "Quicksand_500Medium";

const SIDE_PAD = 20; // horizontal padding of the screen that hosts this section
const SLAT_H = 440;
const SLAT_RADIUS = 20;
const SLAT_GAP = 3;
const GROW = 4.03; // open slat width = GROW x a closed slat
const OPEN_MS = 600;
const OPEN_EASING = Easing.bezier(0.2, 0.8, 0.2, 1);
const LABEL_LEN = 170; // length of the vertical eyebrow on a closed slat

const INK = "#14100a";
const SLAT_BG = "#14110d";
const EDGE_IDLE = "rgba(255,255,255,0.07)";

// line art
const LINES = 14;
const LINE_TOP = 44;
const LINE_GAP = 9.5;
const STEP = 4;
const DASH = "38 14";
const DASH_LOOP = 52;
const FLOW_MS = 1700;

const EQ_DELAYS = [0, 250, 500];

const RAW_MIXES = [
  {
    id: "weekly-featured",
    accent: "#e0aa4a",
    eyebrow: "Weekly featured",
    title: "Soundtrack of the week",
    subtitle: "Ambient beats, lush neoclassical and minimal…",
    chip: "28 tracks",
    footer: "1 hr 42 min",
    a: 24,
    f: 1.2,
    p: 0,
  },
  {
    id: "daily-mix",
    accent: "#e46a35",
    eyebrow: "Personalised",
    title: "Daily mix, made for you",
    subtitle: "Tailored to your mood and time of day",
    chip: "Updated daily",
    footer: "Adaptive",
    a: 30,
    f: 1.6,
    p: 1,
  },
  {
    id: "liked-songs",
    accent: "#ea7aa3",
    eyebrow: "Your collection",
    title: "Songs you love",
    subtitle: "Every favourite track, all in one place",
    chip: "Your favourites",
    footer: "Liked tracks",
    a: 20,
    f: 0.9,
    p: 2,
  },
  {
    id: "recently-added",
    accent: "#5cc4b0",
    eyebrow: "Fresh collection",
    title: "New to your library",
    subtitle: "The latest tracks added to your collection",
    chip: "Recently added",
    footer: "Latest additions",
    a: 26,
    f: 2.0,
    p: 0.5,
  },
  {
    id: "hyped-songs",
    accent: "#a98cf0",
    eyebrow: "Your hype zone",
    title: "Feel the hype",
    subtitle: "Your most exciting tracks for high-energy moments",
    chip: "Trending now",
    footer: "On repeat",
    a: 34,
    f: 2.6,
    p: 3,
  },
  {
    id: "most-played",
    accent: "#6ba6f2",
    eyebrow: "Your top rotation",
    title: "Your all-time repeats",
    subtitle: "The tracks you keep coming back to, again and again",
    chip: "Top tracks",
    footer: "Most played",
    a: 22,
    f: 1.4,
    p: 4,
  },
];

// Derived once, at module load.
const MIXES = RAW_MIXES.map((m, i) => ({
  ...m,
  idx: String(i + 1).padStart(2, "0"),
  edge: `${m.accent}59`, // open-slat border: accent at ~35%
  meta: `${m.chip} · ${m.footer}`,
}));

const AnimatedPath = Animated.createAnimatedComponent(Path);

/* ----------------------------- line art ------------------------------ */

// Three groups of lines (faint, mid, bright) as three path strings.
// Flat at the slat edges, waving through the middle.
function buildArt(m, w) {
  const out = ["", "", ""];
  const n = Math.ceil(w / STEP);
  for (let k = 0; k < LINES; k++) {
    const g = k < 5 ? 0 : k < 10 ? 1 : 2;
    const y0 = LINE_TOP + k * LINE_GAP;
    const scale = 0.5 + 0.5 * (k / (LINES - 1));
    let d = "";
    for (let i = 0; i <= n; i++) {
      const x = Math.min(i * STEP, w);
      const env = Math.pow(Math.max(0, Math.sin((Math.PI * x) / w)), 1.4);
      const y =
        y0 +
        m.a * scale * env * Math.sin((x / w) * Math.PI * 2 * m.f + k * 0.34 + m.p);
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    out[g] += d;
  }
  return out;
}

const SlatArt = memo(function SlatArt({ art, accent, width, dashed, flow }) {
  const offset = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const run = flow && !reduceMotion;

  useEffect(() => {
    if (run) {
      offset.value = 0;
      offset.value = withRepeat(
        withTiming(-DASH_LOOP, { duration: FLOW_MS, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(offset);
    }
    return () => cancelAnimation(offset);
  }, [run, offset]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: offset.value,
  }));

  const dasharray = dashed ? DASH : undefined;

  return (
    <Svg width={width} height={SLAT_H} fill="none">
      <AnimatedPath
        d={art[0]}
        stroke={accent}
        strokeOpacity={0.22}
        strokeWidth={1}
        strokeDasharray={dasharray}
        animatedProps={animatedProps}
      />
      <AnimatedPath
        d={art[1]}
        stroke={accent}
        strokeOpacity={0.5}
        strokeWidth={1}
        strokeDasharray={dasharray}
        animatedProps={animatedProps}
      />
      <AnimatedPath
        d={art[2]}
        stroke={accent}
        strokeOpacity={0.95}
        strokeWidth={1}
        strokeDasharray={dasharray}
        animatedProps={animatedProps}
      />
    </Svg>
  );
});

/* ----------------------------- equalizer ----------------------------- */

const EqBar = memo(function EqBar({ color, delay, animate }) {
  const height = useSharedValue(6);

  useEffect(() => {
    if (animate) {
      height.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(11, { duration: 450 }),
            withTiming(3, { duration: 450 }),
          ),
          -1,
          false,
        ),
      );
    } else {
      cancelAnimation(height);
      height.value = withTiming(6, { duration: 150 });
    }
    return () => cancelAnimation(height);
  }, [animate, delay, height]);

  const animatedStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View
      style={[s.eqBar, { backgroundColor: color }, animatedStyle]}
    />
  );
});

const EqualizerBars = memo(function EqualizerBars({ color, animate }) {
  const reduceMotion = useReducedMotion();
  const run = animate && !reduceMotion;
  return (
    <View style={s.eqRow}>
      {EQ_DELAYS.map((delay, i) => (
        <EqBar key={i} color={color} delay={delay} animate={run} />
      ))}
    </View>
  );
});

/* ------------------------------- slat -------------------------------- */

const SlatItem = memo(function SlatItem({
  mix,
  index,
  active,
  playing,
  animate,
  contentW,
  art,
  onSelect,
  onOpen,
  onTogglePlay,
}) {
  const { id, accent, edge, idx, eyebrow, title, subtitle, meta } = mix;
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: reduceMotion ? 0 : OPEN_MS,
      easing: OPEN_EASING,
    });
  }, [active, reduceMotion, progress]);

  const slatStyle = useAnimatedStyle(() => ({
    flexGrow: interpolate(progress.value, [0, 1], [1, GROW], Extrapolation.CLAMP),
    borderColor: interpolateColor(progress.value, [0, 1], [EDGE_IDLE, edge]),
  }));
  const artStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.6, 1], Extrapolation.CLAMP),
  }));
  const collapsedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4], [1, 0], Extrapolation.CLAMP),
  }));
  const expandedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.5, 1], [0, 1], Extrapolation.CLAMP),
  }));

  // Art and open-state content are both centered on the slat and clipped by it,
  // so the slat opens from its middle like a shutter.
  const centered = useMemo(
    () => ({ left: "50%", width: contentW, marginLeft: -contentW / 2 }),
    [contentW],
  );

  const handleSelect = useCallback(() => {
    if (active) onOpen(id);
    else onSelect(index);
  }, [active, onOpen, onSelect, id, index]);
  const handlePlay = useCallback(() => onTogglePlay(id), [onTogglePlay, id]);

  const btnColor = playing ? accent : INK;

  return (
    <Animated.View style={[s.slat, slatStyle]}>
      {/* line art */}
      <Animated.View
        pointerEvents="none"
        style={[s.layer, centered, artStyle]}
      >
        <SlatArt
          art={art}
          accent={accent}
          width={contentW}
          dashed={playing}
          flow={animate && active}
        />
      </Animated.View>

      {/* closed state: index (or equalizer) on top, vertical eyebrow below */}
      <Animated.View pointerEvents="none" style={[s.fill, collapsedStyle]}>
        <View style={s.collapsedTop}>
          {playing ? (
            <EqualizerBars color={accent} animate={animate} />
          ) : (
            <Text style={s.index}>{idx}</Text>
          )}
        </View>
        <View style={s.collapsedBottom}>
          <Text numberOfLines={1} style={s.vertical}>
            {eyebrow}
          </Text>
        </View>
      </Animated.View>

      {/* tap target: opens a closed slat, opens the mix when already open */}
      <Pressable
        onPress={handleSelect}
        accessibilityRole="button"
        accessibilityLabel={active ? `Open ${title}` : `Show ${title}`}
        accessibilityState={{ expanded: active }}
        style={s.fill}
      />

      {/* open state */}
      <Animated.View
        pointerEvents={active ? "box-none" : "none"}
        accessibilityElementsHidden={!active}
        importantForAccessibility={active ? "auto" : "no-hide-descendants"}
        style={[s.layer, centered, s.expanded, expandedStyle]}
      >
        <Text style={s.index}>{idx}</Text>

        <View>
          <View style={s.eyebrowRow}>
            {playing ? <EqualizerBars color={accent} animate={animate} /> : null}
            <Text
              numberOfLines={1}
              style={[s.eyebrow, { color: accent }]}
            >
              {eyebrow}
            </Text>
          </View>
          <Text numberOfLines={2} style={s.title}>
            {title}
          </Text>
          <Text numberOfLines={2} style={s.subtitle}>
            {subtitle}
          </Text>
          <Text style={s.meta}>{meta}</Text>

          <Pressable
            onPress={handlePlay}
            accessibilityRole="button"
            accessibilityLabel={`${playing ? "Pause" : "Play"} ${title}`}
            style={({ pressed }) => [
              s.playBtn,
              {
                backgroundColor: playing ? "transparent" : accent,
                borderColor: accent,
              },
              pressed && s.pressed,
            ]}
          >
            <Text style={[s.playText, { color: btnColor }]}>
              {playing ? "Pause" : "Play mix"}
            </Text>
            {playing ? (
              <Pause size={14} color={btnColor} fill={btnColor} strokeWidth={2} />
            ) : (
              <Play size={14} color={btnColor} fill={btnColor} strokeWidth={2} />
            )}
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  );
});

/* ------------------------------ section ------------------------------ */

const InspiredForYou = memo(function InspiredForYou() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { playing, togglePlay } = usePlayer();
  const { width: windowW } = useWindowDimensions();

  const [activeIndex, setActiveIndex] = useState(0);
  const [rowW, setRowW] = useState(windowW - SIDE_PAD * 2);

  // The queue records which mix it was filled from, so the slat that is
  // actually playing (and only that one) is marked as playing.
  const activeMixId = playing ? playbackQueue.mixSource ?? null : null;

  // Width of the open slat's inside, from the measured row width
  // (row minus gaps minus the 1px border on both sides of all six slats).
  const contentW = useMemo(() => {
    const free = rowW - SLAT_GAP * (MIXES.length - 1) - 2 * MIXES.length;
    return Math.max(80, Math.round((GROW * free) / (MIXES.length - 1 + GROW)));
  }, [rowW]);

  const arts = useMemo(() => MIXES.map((m) => buildArt(m, contentW)), [contentW]);

  const onRowLayout = useCallback((e) => {
    const w = e.nativeEvent.layout.width;
    setRowW((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
  }, []);

  const handleSeeAll = useCallback(() => {
    router.push("/library");
  }, [router]);

  const openMix = useCallback(
    (id, autoplay) => {
      router.push({
        pathname: "/MixedPlayer",
        params: autoplay ? { mixId: id, autoplay: "1" } : { mixId: id },
      });
    },
    [router],
  );

  const handleOpen = useCallback((id) => openMix(id, false), [openMix]);

  // The pill starts this mix, or pauses/resumes it when it is already
  // the one loaded in the shared queue.
  const handleMixButton = useCallback(
    (id) => {
      if (playbackQueue.mixSource === id && playbackQueue.getQueue().length) {
        togglePlay();
        return;
      }
      openMix(id, true);
    },
    [openMix, togglePlay],
  );

  return (
    <>
      <View style={s.header}>
        <Text style={[s.headerTitle, { color: FG_COLOR }]}>Inspired for you</Text>

        <Pressable
          onPress={handleSeeAll}
          hitSlop={10}
          accessibilityRole="link"
          accessibilityLabel="See all in library"
          style={({ pressed }) => [s.seeAll, pressed && s.pressed]}
        >
          <Text style={s.seeAllText}>See all</Text>
          <ChevronRight size={14} color="#b3a794" strokeWidth={2} />
        </Pressable>
      </View>

      <View style={s.row} onLayout={onRowLayout}>
        {MIXES.map((mix, i) => {
          const isActive = i === activeIndex;
          const isPlaying = mix.id === activeMixId;
          return (
            <SlatItem
              key={mix.id}
              mix={mix}
              index={i}
              active={isActive}
              playing={isPlaying}
              animate={isPlaying && isFocused}
              contentW={contentW}
              art={arts[i]}
              onSelect={setActiveIndex}
              onOpen={handleOpen}
              onTogglePlay={handleMixButton}
            />
          );
        })}
      </View>
    </>
  );
});

const s = StyleSheet.create({
  /* header */
  header: {
    marginTop: 28,
    marginBottom: 12,
    marginLeft: 2,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontFamily: FONT, fontSize: 22, letterSpacing: 0.3 },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { fontFamily: FONT, fontSize: 13, color: "#b3a794" },
  pressed: { opacity: 0.8 },

  /* row + slat */
  row: { height: SLAT_H, flexDirection: "row", gap: SLAT_GAP },
  slat: {
    flexBasis: 0,
    flexShrink: 1,
    minWidth: 0,
    height: SLAT_H,
    overflow: "hidden",
    borderRadius: SLAT_RADIUS,
    borderWidth: 1,
    backgroundColor: SLAT_BG,
  },
  fill: StyleSheet.absoluteFillObject,
  layer: { position: "absolute", top: 0, bottom: 0 },

  /* closed state */
  collapsedTop: {
    position: "absolute",
    top: 16,
    left: 0,
    right: 0,
    height: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  collapsedBottom: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    height: LABEL_LEN,
    alignItems: "center",
    justifyContent: "center",
  },
  vertical: {
    width: LABEL_LEN,
    textAlign: "left",
    transform: [{ rotate: "-90deg" }],
    fontFamily: FONT,
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: "#b3a794",
  },
  index: {
    height: 12,
    fontFamily: FONT,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 1.2,
    color: "#9a8f7e",
  },

  /* open state */
  expanded: {
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 14,
    justifyContent: "space-between",
  },
  eyebrowRow: {
    height: 14,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  eyebrow: {
    flexShrink: 1,
    fontFamily: FONT,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    minHeight: 46,
    fontFamily: FONT,
    fontSize: 20,
    lineHeight: 23,
    color: "#f6efe4",
  },
  subtitle: {
    marginTop: 6,
    minHeight: 34,
    fontFamily: FONT,
    fontSize: 12,
    lineHeight: 17,
    color: "#a99e8d",
  },
  meta: {
    marginTop: 12,
    paddingTop: 10,
    minHeight: 40,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
    fontFamily: FONT,
    fontSize: 11,
    lineHeight: 15,
    color: "#b3a794",
  },
  playBtn: {
    marginTop: 12,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playText: { fontFamily: FONT, fontSize: 14, letterSpacing: 0.3 },

  /* equalizer */
  eqRow: {
    height: 11,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  eqBar: { width: 2, borderRadius: 1 },
});

export default InspiredForYou;