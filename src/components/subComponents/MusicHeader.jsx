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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "expo-router";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Search, SlidersHorizontal, X } from "lucide-react-native";

/* ------------------------------------------------------------------ */
/* Constants (module scope: allocated once, never re-created)          */
/* ------------------------------------------------------------------ */

// Load these with @expo-google-fonts/outfit in your root layout.
const FONT = {
  thin: "Outfit_200ExtraLight",
  light: "Outfit_300Light",
  regular: "Outfit_400Regular",
  semi: "Outfit_600SemiBold",
};

const ACCENT = "#ff2d55";
const HOLD_MS = 1800;
const SWIPE_MS = 800;
const SWIPE_EASING = Easing.bezier(0.65, 0, 0.2, 1);
const DEFAULT_WORDS = ["today.", "tomorrow.", "forever."];
const SEARCH_DEBOUNCE_MS = 300;

const AVATAR_RING = ["#ff2d55", "#bf5af2", "#5ac8fa"];
const GRAD_START = { x: 0.45, y: 0 };
const GRAD_END = { x: 0.55, y: 1 };
const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

const EQ_PHASES = [0, 0.25, 0.5, 0.75];
const EQ_REST = [0.27, 0.5, 0.27, 0.5];

const LIGHT = {
  fg: "#14161c",
  mute: "#757a86",
  card: "rgba(255,255,255,0.72)",
  line: "rgba(20,22,28,0.09)",
  ink: "#14161c",
  onInk: "#ffffff",
  grad: ["#b9c3e6", "#e9e8ee", "#f7f5f1"],
};
const DARK = {
  fg: "#f3f2ee",
  mute: "#8b909c",
  card: "rgba(255,255,255,0.07)",
  line: "rgba(255,255,255,0.10)",
  ink: "#f3f2ee",
  onInk: "#0f1116",
  grad: ["#2a3350", "#15181f", "#0f1116"],
};

/* ------------------------------------------------------------------ */
/* useIsActive: the single gate for every animation and timer          */
/* Active only when: screen is focused + app is foregrounded + the     */
/* header is actually on screen (the `visible` prop).                  */
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
/* Pulsing red dot (one UI-thread loop, stops when inactive)           */
/* ------------------------------------------------------------------ */

const PulseDot = memo(function PulseDot({ active, offset }) {
  const p = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(p);
    p.value = 0;
    if (!active) return;
    p.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(p);
  }, [active, p]);

  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 1], [0.6, 0]),
    transform: [{ scale: interpolate(p.value, [0, 1], [1, 3.2]) }],
  }));

  return (
    <View style={[styles.dotWrap, { marginBottom: offset }]}>
      <Animated.View pointerEvents="none" style={[styles.dotRing, ring]} />
      <View style={styles.dot} />
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Rotating word: UI-thread swipe, JS only ticks every ~2.6 s          */
/* ------------------------------------------------------------------ */

const WordSlot = memo(function WordSlot({
  words,
  fontSize,
  itemH,
  autoplay,
  instant,
  color,
}) {
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
    // `pos` is a stable shared value, not an effect dependency; the compiler
    // only flags it because `advance` is also used inside an effect.
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
      fontFamily: FONT.semi,
      fontSize,
      lineHeight: itemH,
      letterSpacing: -fontSize * 0.035,
      color,
      height: itemH,
      includeFontPadding: false,
      textAlignVertical: "center",
    }),
    [fontSize, itemH, color],
  );

  return (
    <View style={styles.wordRow}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Showing ${words[0]} Tap for next word`}
        style={{ height: itemH, overflow: "hidden" }}
      >
        <Animated.View style={reel}>
          {list.map((w, i) => (
            <Text key={`${w}-${i}`} numberOfLines={1} style={textStyle}>
              {w}
            </Text>
          ))}
        </Animated.View>
      </Pressable>
      <PulseDot active={autoplay} offset={Math.round(itemH * 0.2)} />
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Equaliser button: ONE shared clock drives all four bars via         */
/* transform (no layout work), and stops when off or inactive.         */
/* ------------------------------------------------------------------ */

const EqBar = memo(function EqBar({ clock, running, phase, rest, color }) {
  const style = useAnimatedStyle(() => {
    const s = running.value
      ? 0.28 + 0.72 * (0.5 + 0.5 * Math.sin((clock.value + phase) * Math.PI * 2))
      : rest;
    return { transform: [{ scaleY: s }] };
  });
  return <Animated.View style={[styles.eqBar, { backgroundColor: color }, style]} />;
});

const EqButton = memo(function EqButton({ on, active, onPress, t }) {
  const clock = useSharedValue(0);
  const running = useSharedValue(false);
  const go = on && active;

  useEffect(() => {
    running.value = go;
    cancelAnimation(clock);
    if (!go) return;
    clock.value = 0;
    clock.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(clock);
  }, [go, clock, running]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityLabel="Bit-perfect output"
      accessibilityState={{ checked: on }}
      style={[styles.eq, { backgroundColor: t.ink }]}
    >
      {EQ_PHASES.map((ph, i) => (
        <EqBar
          key={i}
          clock={clock}
          running={running}
          phase={ph}
          rest={EQ_REST[i]}
          color={t.onInk}
        />
      ))}
    </Pressable>
  );
});

/* ------------------------------------------------------------------ */
/* Search field: typing state is local, so keystrokes never re-render  */
/* the header. Debounced callback to the parent.                       */
/* ------------------------------------------------------------------ */

const SearchField = memo(function SearchField({ onSearch, t }) {
  const input = useRef(null);
  const timer = useRef(null);
  const [hasText, setHasText] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onChangeText = useCallback(
    (v) => {
      setHasText((prev) => {
        const next = v.length > 0;
        return prev === next ? prev : next;
      });
      if (!onSearch) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => onSearch(v.trim()), SEARCH_DEBOUNCE_MS);
    },
    [onSearch],
  );

  const clear = useCallback(() => {
    input.current?.clear();
    input.current?.focus();
    setHasText(false);
    onSearch?.("");
  }, [onSearch]);

  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);

  return (
    <View
      style={[
        styles.field,
        {
          backgroundColor: t.card,
          borderColor: focused ? t.fg : t.line,
          borderWidth: focused ? 1.5 : 1,
        },
      ]}
    >
      <Search size={20} color={t.mute} strokeWidth={1.6} />
      <TextInput
        ref={input}
        style={[styles.input, { color: t.fg, fontFamily: FONT.light }]}
        placeholder="Search artists, albums, tracks"
        placeholderTextColor={t.mute}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel="Search music"
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        onSubmitEditing={(e) => onSearch?.(e.nativeEvent.text.trim())}
      />
      {hasText && (
        <Pressable
          onPress={clear}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={[styles.clear, { backgroundColor: t.line }]}
        >
          <X size={16} color={t.fg} strokeWidth={1.8} />
        </Pressable>
      )}
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Chip                                                                */
/* ------------------------------------------------------------------ */

const Chip = memo(function Chip({ label, sub, pressed, onPress, t }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: pressed }}
      style={[
        styles.chip,
        pressed
          ? { backgroundColor: t.ink }
          : { backgroundColor: t.card, borderColor: t.line, borderWidth: 1 },
      ]}
    >
      {pressed && <View style={styles.chipDot} />}
      <Text
        style={[styles.chipText, { color: pressed ? t.onInk : t.fg }]}
      >
        {label}
      </Text>
      {sub ? (
        <Text
          style={[
            styles.chipSub,
            { color: pressed ? t.onInk : t.mute, opacity: pressed ? 0.65 : 1 },
          ]}
        >
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
});

/* ------------------------------------------------------------------ */
/* Avatar + top row                                                    */
/* ------------------------------------------------------------------ */

const Avatar = memo(function Avatar({ uri, initial, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
    >
      <LinearGradient colors={AVATAR_RING} style={styles.avatarRing}>
        <View style={styles.avatarInner}>
          {uri ? (
            <Image source={{ uri }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarText}>{initial}</Text>
          )}
        </View>
      </LinearGradient>
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
  onProfilePress,
  onSettingsPress,
  onSearch,
  onBitPerfectChange,
  // Old props such as heading, subTitle, tagline, title and description
  // are simply ignored if they arrive through {...HEADER_CONTENT.home}.
}) {
  const isActive = useIsActive(active && visible);
  const reduceMotion = useReducedMotion();
  const animate = isActive && !reduceMotion;

  const t = useColorScheme() === "dark" ? DARK : LIGHT;
  const { width } = useWindowDimensions();
  const fontSize = Math.min(54, Math.round(width * 0.12));
  const itemH = Math.round(fontSize * 1.2);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }, []);

  const [opts, setOpts] = useState({ dsd: true, native: false, bp: true });
  const bpRef = useRef(true);

  const toggleDsd = useCallback(
    () => setOpts((p) => ({ ...p, dsd: !p.dsd })),
    [],
  );
  const toggleNative = useCallback(
    () => setOpts((p) => ({ ...p, native: !p.native })),
    [],
  );
  const toggleBp = useCallback(() => {
    bpRef.current = !bpRef.current;
    setOpts((p) => ({ ...p, bp: bpRef.current }));
    onBitPerfectChange?.(bpRef.current);
  }, [onBitPerfectChange]);

  return (
    <LinearGradient
      colors={t.grad}
      start={GRAD_START}
      end={GRAD_END}
      style={styles.header}
    >
      {/* top row */}
      <View style={styles.top}>
        <Avatar
          uri={avatarUri}
          initial={initial ?? name.trim().charAt(0).toUpperCase()}
          onPress={onProfilePress}
        />
        <View style={styles.who}>
          <Text style={[styles.greet, { color: t.mute }]}>{greeting}</Text>
          <Text numberOfLines={1} style={[styles.name, { color: t.fg }]}>
            {name}
          </Text>
        </View>
        <Pressable
          onPress={onSettingsPress ?? goArtists}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={[styles.round, { backgroundColor: t.card }]}
        >
          <SlidersHorizontal size={22} color={t.fg} strokeWidth={1.5} />
        </Pressable>
      </View>

      {/* headline */}
      <View style={styles.hero}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: FONT.thin,
            fontSize,
            lineHeight: Math.round(fontSize * 1.1),
            letterSpacing: -fontSize * 0.03,
            color: t.fg,
            includeFontPadding: false,
          }}
        >
          Good music,
        </Text>
        <WordSlot
          words={words}
          fontSize={fontSize}
          itemH={itemH}
          autoplay={animate}
          instant={reduceMotion}
          color={t.fg}
        />
      </View>

      {/* search + bit-perfect switch */}
      <View style={styles.searchRow}>
        <SearchField onSearch={onSearch} t={t} />
        <EqButton on={opts.bp} active={animate} onPress={toggleBp} t={t} />
      </View>

      {/* chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
      >
        <Chip label="DSD" sub="11.2 MHz" pressed={opts.dsd} onPress={toggleDsd} t={t} />
        <Chip label="Native stream" pressed={opts.native} onPress={toggleNative} t={t} />
        <Chip label="Bit-perfect" pressed={opts.bp} onPress={toggleBp} t={t} />
      </ScrollView>
    </LinearGradient>
  );
}

export default memo(MusicHeader);

/* ------------------------------------------------------------------ */
/* Styles (static, created once)                                       */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  header: { borderRadius: 36, padding: 20, overflow: "hidden" },

  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#20232c",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 44, height: 44 },
  avatarText: { color: "#fff", fontSize: 18, fontFamily: FONT.regular },
  who: { flex: 1, minWidth: 0 },
  greet: { fontSize: 14, fontFamily: FONT.light },
  name: { fontSize: 19, fontFamily: FONT.semi, letterSpacing: -0.2 },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  hero: { paddingTop: 44, paddingBottom: 30 },
  wordRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 2 },
  dotWrap: { width: 11, height: 11, alignItems: "center", justifyContent: "center" },
  dot: { width: 11, height: 11, borderRadius: 6, backgroundColor: ACCENT },
  dotRing: {
    position: "absolute",
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: ACCENT,
  },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  field: {
    flex: 1,
    minWidth: 0,
    height: 58,
    borderRadius: 29,
    paddingLeft: 20,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: { flex: 1, minWidth: 0, fontSize: 16, paddingVertical: 0 },
  clear: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  eq: {
    width: 58,
    height: 58,
    borderRadius: 29,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  eqBar: { width: 3, height: 22, borderRadius: 2 },

  chipsScroll: { marginHorizontal: -20, marginTop: 14, flexGrow: 0 },
  chips: { paddingHorizontal: 20, gap: 8 },
  chip: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT },
  chipText: { fontSize: 14, fontFamily: FONT.regular },
  chipSub: { fontSize: 12, fontFamily: FONT.light },
});