import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppState,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useIsFocused, useRouter } from "expo-router";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg"; // already a peer dep of lucide-react-native
import { Search, SlidersHorizontal } from "lucide-react-native";
import { usePlayer } from "../../context/player-context";
import { playbackQueue } from "../../services/audio/PlaybackQueue";
import { getRandomSongs } from "../../databases/queries/mix";

/* ------------------------------------------------------------------ */
/* Constants (module scope: allocated once)                            */
/* ------------------------------------------------------------------ */

// Load these in your root layout:
//   @expo-google-fonts/instrument-serif -> InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic
//   @expo-google-fonts/outfit           -> Outfit_300Light, Outfit_400Regular, Outfit_500Medium
const FONT = {
  serif: "InstrumentSerif_400Regular",
  serifItalic: "InstrumentSerif_400Regular_Italic",
  light: "Outfit_300Light",
  regular: "Outfit_400Regular",
  medium: "Outfit_500Medium",
};

const T = {
  bg: "#0b0b0c",
  fg: "#f4f1ea",
  mute: "#9a968c",
  accent: "#ff2d55",
  onFg: "#0b0b0c",
  field: "#17171a",
  line: "rgba(255,255,255,0.14)",
  lineHot: "rgba(255,255,255,0.45)",
};

const HOLD_MS = 1800;
const SWIPE_MS = 800;
const SPIN_MS = 9000;
const SWIPE_EASING = Easing.bezier(0.65, 0, 0.2, 1);
const DEFAULT_WORDS = ["today.", "tomorrow.", "forever."];

/* ------------------------------------------------------------------ */
/* Vinyl geometry: computed once, drawn in a fixed 250-unit viewBox    */
/* ------------------------------------------------------------------ */

const D = 250;
const C = D / 2;
const LABEL_R = 44;
const HOLE_R = 6;

const GROOVES = (() => {
  const out = [];
  for (let r = LABEL_R + 5; r < C - 3; r += 3) out.push(r);
  return out;
})();

// Pie slice from angle a0 to a1 (degrees, clockwise from 12 o'clock).
const sector = (a0, a1) => {
  const p = (a) => {
    const rad = (a * Math.PI) / 180;
    return `${(C + C * Math.sin(rad)).toFixed(2)} ${(C - C * Math.cos(rad)).toFixed(2)}`;
  };
  return `M${C} ${C}L${p(a0)}A${C} ${C} 0 0 1 ${p(a1)}Z`;
};

// Two nested slices per side fake a soft light sheen.
const SHEEN = [
  { d: sector(65, 115), o: 0.05 },
  { d: sector(80, 100), o: 0.06 },
  { d: sector(245, 295), o: 0.05 },
  { d: sector(260, 280), o: 0.06 },
];

/* ------------------------------------------------------------------ */
/* RESPONSIVE SYSTEM: everything is derived from getMetrics()          */
/* ------------------------------------------------------------------ */

const PAGE_PAD = 20; // horizontal padding of the screen wrapping this header
const REF_W = 350; // content width the base numbers were designed for
const HEADLINE_RATIO = 0.165; // headline size = content width * ratio
const HEADLINE_MIN = 36;
const HEADLINE_MAX = 84;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function getMetrics(contentW, winW, winH) {
  const landscape = winW > winH;

  const s = clamp(contentW / REF_W, 0.86, 1.3);
  const f = clamp(s, 0.92, 1.18);
  const size = (n) => Math.round(n * s);
  const txt = (n) => Math.round(n * f);

  // Vertical rhythm only compresses in landscape (no jump when keyboard opens).
  const v = landscape ? clamp(winH / 700, 0.5, 1) : 1;

  let fontSize = clamp(
    Math.round(contentW * HEADLINE_RATIO),
    HEADLINE_MIN,
    HEADLINE_MAX,
  );
  if (landscape) fontSize = Math.min(fontSize, Math.round(winH * 0.14));
  const lineHeight = Math.round(fontSize * 1.04);
  const letterSpacing = -fontSize * 0.02;

  const disc = Math.round(size(250) * v);
  const bleed = Math.round(disc * 0.26); // how far the record runs off the right edge
  const capW = clamp(
    contentW - (disc - bleed) - size(14),
    size(96),
    size(160),
  );

  return {
    fontSize,
    lineHeight,
    letterSpacing,

    // top row
    gap: size(12),
    avatar: size(44),
    avatarFont: txt(17),
    greet: txt(13),
    name: txt(18),
    btn: size(44),
    iconL: size(22),
    iconM: size(20),

    // hero + stage
    heroTop: Math.round(34 * v),
    disc,
    bleed,
    stage: Math.round(disc * 0.9),
    capTop: Math.round(disc * 0.44),
    capW,
    capTitle: txt(28),
    capSub: txt(13),

    // search
    field: size(58),
    fieldPad: size(22),
    input: txt(16),
  };
}

function makeStyles(m) {
  return StyleSheet.create({
    header: {
      backgroundColor: T.bg,
      paddingTop: 20,
      paddingBottom: 8,
      overflow: "visible", // lets the record bleed off the screen edge
    },

    top: { flexDirection: "row", alignItems: "center", gap: m.gap },
    avatar: {
      width: m.avatar,
      height: m.avatar,
      borderRadius: Math.round(m.avatar * 0.32),
      backgroundColor: T.fg,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarImg: { width: m.avatar, height: m.avatar },
    avatarText: { color: T.onFg, fontSize: m.avatarFont, fontFamily: FONT.regular },
    who: { flex: 1, minWidth: 0 },
    greet: { fontSize: m.greet, fontFamily: FONT.light, color: T.mute },
    name: {
      fontSize: m.name,
      fontFamily: FONT.medium,
      letterSpacing: -0.2,
      color: T.fg,
    },
    btn: {
      width: m.btn,
      height: m.btn,
      alignItems: "center",
      justifyContent: "center",
    },

    hero: { marginTop: m.heroTop },
    wordWrap: { height: m.lineHeight, overflow: "hidden", alignSelf: "flex-start" },

    stage: { height: m.stage, marginTop: 12 },
    disc: {
      position: "absolute",
      top: 0,
      right: -m.bleed,
      width: m.disc,
      height: m.disc,
    },
    discPressed: { transform: [{ scale: 0.97 }] },
    discSpin: { width: m.disc, height: m.disc },
    caption: {
      position: "absolute",
      left: 0,
      top: m.capTop,
      width: m.capW,
    },
    capTitle: {
      fontFamily: FONT.serif,
      fontSize: m.capTitle,
      lineHeight: Math.round(m.capTitle * 1.07),
      color: T.fg,
    },
    capSub: {
      marginTop: 8,
      fontFamily: FONT.light,
      fontSize: m.capSub,
      color: T.mute,
    },

    field: {
      height: m.field,
      borderRadius: m.field / 2,
      paddingHorizontal: m.fieldPad,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: T.field,
      borderWidth: 1,
      borderColor: T.line,
    },
    fieldHot: { borderColor: T.lineHot },
    input: {
      flex: 1,
      minWidth: 0,
      fontSize: m.input,
      fontFamily: FONT.light,
      color: T.mute,
    },
  });
}

/* ------------------------------------------------------------------ */
/* useIsActive: the single gate for every animation and timer          */
/* Active only when: screen focused + app foregrounded + `visible`.    */
/* ------------------------------------------------------------------ */

export function useIsActive(visible = true) {
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setAppActive(s === "active"),
    );
    return () => sub.remove();
  }, []);

  return visible && focused && appActive;
}

/* ------------------------------------------------------------------ */
/* Rotating word: UI-thread swipe, JS only ticks every ~2.6 s          */
/* ------------------------------------------------------------------ */

const WordSlot = memo(function WordSlot({ words, m, st, autoplay, instant }) {
  const itemH = m.lineHeight;
  const list = useMemo(() => [...words, words[0]], [words]);
  const last = list.length - 1;
  const pos = useSharedValue(0);
  const idx = useRef(0);
  const busy = useRef(false);
  const busyTimer = useRef(null);
  const interval = useRef(null);
  const swipeMs = instant ? 0 : SWIPE_MS;

  const advance = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    const next = idx.current + 1;
    // eslint-disable-next-line react-hooks/immutability
    pos.value = withTiming(
      next,
      { duration: swipeMs, easing: SWIPE_EASING },
      (done) => {
        // Seamless loop: the last row repeats the first word, then snaps to 0.
        if (done && next === last) pos.value = 0;
      },
    );
    idx.current = next === last ? 0 : next;
    busyTimer.current = setTimeout(() => {
      busy.current = false;
    }, swipeMs + 40);
  }, [last, pos, swipeMs]);

  const start = useCallback(() => {
    clearInterval(interval.current);
    interval.current = setInterval(advance, HOLD_MS + SWIPE_MS);
  }, [advance]);

  useEffect(() => {
    if (!autoplay) return;
    start();
    return () => clearInterval(interval.current);
  }, [autoplay, start]);

  useEffect(() => () => clearTimeout(busyTimer.current), []);

  const onPress = useCallback(() => {
    advance();
    if (autoplay) start();
  }, [advance, autoplay, start]);

  const reel = useAnimatedStyle(() => ({
    transform: [{ translateY: -pos.value * itemH }],
  }));

  const textStyle = useMemo(
    () => ({
      fontFamily: FONT.serifItalic,
      fontSize: m.fontSize,
      lineHeight: m.lineHeight,
      height: m.lineHeight,
      letterSpacing: m.letterSpacing,
      color: T.accent,
      includeFontPadding: false,
      textAlignVertical: "center",
    }),
    [m.fontSize, m.lineHeight, m.letterSpacing],
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Showing ${words[0]} Tap for next word`}
      style={st.wordWrap}
    >
      <Animated.View style={reel}>
        {list.map((w, i) => (
          <Text
            key={`${w}-${i}`}
            numberOfLines={1}
            allowFontScaling={false}
            style={textStyle}
          >
            {w}
          </Text>
        ))}
      </Animated.View>
    </Pressable>
  );
});

/* ------------------------------------------------------------------ */
/* Vinyl: a static SVG, rotated on the UI thread. The SVG is drawn     */
/* once and rasterised, so spinning costs almost nothing per frame.    */
/* ------------------------------------------------------------------ */

const VinylArt = memo(function VinylArt({ size }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${D} ${D}`}>
      <Circle cx={C} cy={C} r={C} fill="#141416" />
      {GROOVES.map((r) => (
        <Circle
          key={r}
          cx={C}
          cy={C}
          r={r}
          fill="none"
          stroke="#232327"
          strokeWidth={1}
        />
      ))}
      {SHEEN.map((s, i) => (
        <Path key={i} d={s.d} fill="#ffffff" fillOpacity={s.o} />
      ))}
      <Circle cx={C} cy={C} r={LABEL_R} fill={T.accent} />
      <Circle cx={C} cy={C} r={HOLE_R} fill={T.bg} />
      <Circle
        cx={C}
        cy={C}
        r={C - 0.5}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.1}
        strokeWidth={1}
      />
    </Svg>
  );
});

const Vinyl = memo(function Vinyl({ size, active, onPress, st }) {
  const rot = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(rot);
    if (!active) return;
    // Resume from the current angle so it never jumps when re-activated.
    const from = rot.value % 360;
    rot.value = from;
    rot.value = withRepeat(
      withTiming(from + 360, { duration: SPIN_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(rot);
  }, [active, rot]);

  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }],
  }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Play a random song"
      style={({ pressed }) => [st.disc, pressed && st.discPressed]}
    >
      <Animated.View
        style={[st.discSpin, spin]}
        renderToHardwareTextureAndroid
        shouldRasterizeIOS
      >
        <VinylArt size={size} />
      </Animated.View>
    </Pressable>
  );
});

/* ------------------------------------------------------------------ */
/* Search field: a doorway to the full SearchScreen                    */
/* ------------------------------------------------------------------ */

const SearchField = memo(function SearchField({ onOpen, placeholder, m, st }) {
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={placeholder}
      style={({ pressed }) => [st.field, pressed && st.fieldHot]}
    >
      <Search size={m.iconM} color={T.mute} strokeWidth={1.6} />
      <Text numberOfLines={1} style={st.input}>
        {placeholder}
      </Text>
    </Pressable>
  );
});

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */

const Avatar = memo(function Avatar({ uri, initial, onPress, st }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      style={st.avatar}
    >
      {uri ? (
        <Image source={{ uri }} style={st.avatarImg} />
      ) : (
        <Text style={st.avatarText} maxFontSizeMultiplier={1.2}>
          {initial}
        </Text>
      )}
    </Pressable>
  );
});

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

function MusicHeader({
  name = "Aarav Mehta",
  initial,
  avatarUri,
  words = DEFAULT_WORDS,
  active = true, // pass false when the header is off screen
  visible = true, // optional second gate, same effect as `active`
  goArtists, // settings button handler (existing prop name)
  onSearchPress,
  searchPlaceholder = "Search artists, albums, tracks",
  onProfilePress,
  onSettingsPress,
}) {
  const isActive = useIsActive(active && visible);
  const reduceMotion = useReducedMotion();
  const animate = isActive && !reduceMotion;

  const router = useRouter();
  const openSearch = useCallback(() => {
    if (onSearchPress) onSearchPress();
    else router.push("/search");
  }, [onSearchPress, router]);

  /* ---- responsive: measure the header's own width, rebuild on rotate ---- */
  const { width: winW, height: winH } = useWindowDimensions();
  const [layoutW, setLayoutW] = useState(null);
  const onLayout = useCallback((e) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setLayoutW((prev) =>
      prev !== null && Math.abs(prev - next) < 2 ? prev : next,
    );
  }, []);
  const contentW = layoutW ?? winW - PAGE_PAD * 2;

  const m = useMemo(
    () => getMetrics(contentW, winW, winH),
    [contentW, winW, winH],
  );
  const st = useMemo(() => makeStyles(m), [m]);

  const headlineStyle = useMemo(
    () => ({
      fontFamily: FONT.serif,
      fontSize: m.fontSize,
      lineHeight: m.lineHeight,
      letterSpacing: m.letterSpacing,
      color: T.fg,
      includeFontPadding: false,
    }),
    [m.fontSize, m.lineHeight, m.letterSpacing],
  );

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }, []);

  const { playing, playSongs } = usePlayer();

  // Every press rolls a fresh random queue and starts on a random song.
  const playRandom = useCallback(() => {
    const songs = getRandomSongs();
    if (!songs.length) return;
    playSongs(songs, Math.floor(Math.random() * songs.length));
    // setQueue clears this, so it has to be set after the queue loads.
    playbackQueue.mixSource = "random";
  }, [playSongs]);

  const randomPlaying = playing && playbackQueue.mixSource === "random";

  return (
    <View style={st.header} onLayout={onLayout}>
      {/* top row */}
      <View style={st.top}>
        <Avatar
          uri={avatarUri}
          initial={initial ?? name.trim().charAt(0).toUpperCase()}
          onPress={onProfilePress}
          st={st}
        />
        <View style={st.who}>
          <Text style={st.greet} maxFontSizeMultiplier={1.2}>
            {greeting}
          </Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={st.name}>
            {name}
          </Text>
        </View>
        <Pressable
          onPress={onSettingsPress ?? goArtists}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={st.btn}
        >
          <SlidersHorizontal size={m.iconL} color={T.fg} strokeWidth={1.5} />
        </Pressable>
      </View>

      {/* headline */}
      <View style={st.hero}>
        <Text numberOfLines={1} allowFontScaling={false} style={headlineStyle}>
          Good music,
        </Text>
        <WordSlot
          words={words}
          m={m}
          st={st}
          autoplay={animate}
          instant={reduceMotion}
        />
      </View>

      {/* record + caption (the record is the random-play button) */}
      <View style={st.stage}>
        <View style={st.caption} pointerEvents="none">
          <Text style={st.capTitle} maxFontSizeMultiplier={1.1}>
            {randomPlaying ? "Now spinning" : "Spin a random song"}
          </Text>
          <Text style={st.capSub} maxFontSizeMultiplier={1.2}>
            {randomPlaying ? "Tap for another" : "Tap the record"}
          </Text>
        </View>
        <Vinyl size={m.disc} active={animate} onPress={playRandom} st={st} />
      </View>

      {/* search (drawn after the stage so it sits over the record's edge) */}
      <SearchField
        onOpen={openSearch}
        placeholder={searchPlaceholder}
        m={m}
        st={st}
      />
    </View>
  );
}

export default memo(MusicHeader);