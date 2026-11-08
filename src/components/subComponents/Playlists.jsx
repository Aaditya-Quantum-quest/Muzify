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
  useColorScheme,
} from "react-native";
import { useRouter, useIsFocused } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeInDown,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { ChevronRight, ListMusic, Pause, Play } from "lucide-react-native";

/* ------------------------------------------------------------------ */
/* Constants (module scope: allocated once)                            */
/* ------------------------------------------------------------------ */

const FONT = {
  thin: "Outfit_200ExtraLight",
  light: "Outfit_300Light",
  regular: "Outfit_400Regular",
  semi: "Outfit_600SemiBold",
};

const ACCENT = "#ff2d55";

// Fan geometry
const CARD_W = 152;
const CARD_H = 192;
const CARD_TOP = 34;
const FAN_H = 290;
const RADIUS = 28;
const ARC_R = 440; // arc radius
const STEP_DEG = 22; // degrees between neighbouring cards
const PX_PER_CARD = 128; // drag distance that moves one card
const RENDER_WINDOW = 3; // cards mounted on each side of the focused one

const SPRING = { damping: 20, stiffness: 180, mass: 0.9 };
const BAR_PHASES = [0, 0.33, 0.66];
const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };
const DEFAULT_GRADIENT = ["#6a4fd8", "#1a1240"];
const ART_START = { x: 0.1, y: 0 };
const ART_END = { x: 0.9, y: 1 };
const SCRIM = ["rgba(8,9,14,0)", "rgba(8,9,14,0.5)"];
const SCRIM_AT = [0.55, 1];

// One soft ring motif, top right (replaces the old stack of rings).
const RINGS = [74, 52, 30].map((r) => ({
  width: r * 2,
  height: r * 2,
  borderRadius: r,
  left: 118 - r,
  top: 62 - r,
}));

export const DEFAULT_PLAYLISTS = [
  { id: "top-pop", title: "Top-Pop Culture", songs: 24, gradient: ["#c2457a", "#3a1d6e"] },
  { id: "chill-one", title: "Chill Place One", songs: 18, gradient: ["#2f6f9a", "#14243d"] },
  { id: "warm-piano", title: "Warm Piano Hours", songs: 31, gradient: ["#dea962", "#7a3b1a"] },
  { id: "night-drive", title: "Night Drive FM", songs: 22, gradient: ["#6a4fd8", "#1a1240"] },
  { id: "rooftop", title: "Rooftop Sessions", songs: 16, gradient: ["#4fd88a", "#0f4a32"] },
];

const LIGHT = {
  fg: "#14161c",
  onFg: "#ffffff",
  mute: "#757a86",
  card: "rgba(255,255,255,0.8)",
  line: "rgba(20,22,28,0.12)",
};
const DARK = {
  fg: "#f3f2ee",
  onFg: "#0f1116",
  mute: "#8b909c",
  card: "rgba(255,255,255,0.07)",
  line: "rgba(255,255,255,0.14)",
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const clamp = (v, lo, hi) => {
  "worklet";
  return Math.min(Math.max(v, lo), hi);
};

const toSource = (image) => {
  if (!image) return null;
  if (typeof image === "number") return image;
  if (typeof image === "string") return { uri: image };
  if (typeof image === "object" && image.uri) return image;
  return null;
};

const songsLabel = (n) => `${n ?? 0} ${n === 1 ? "song" : "songs"}`;

const haptic = () => {
  try {
    Haptics.selectionAsync().catch(() => {});
  } catch {
    // unsupported device
  }
};

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

// Single gate: screen focused + app foregrounded + isScreenActive prop.
function useIsActive(flag = true) {
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setAppActive(s === "active"),
    );
    return () => sub.remove();
  }, []);

  return flag && focused && appActive;
}

// Latest-value ref: keeps child callbacks stable. The ref is written after
// paint, never during render (see EquilizerScreen).
function useLatest(value) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

// While inactive, keep returning the last value seen while active. The ref is
// only a render-cache — written after paint, never during render.
function useWhileActive(value, active) {
  const ref = useRef(value);
  useEffect(() => {
    if (active) ref.current = value;
  }, [active, value]);
  // eslint-disable-next-line react-hooks/refs
  return ref.current;
}

/* ------------------------------------------------------------------ */
/* Equaliser: one shared clock, UI thread, stops when inactive         */
/* ------------------------------------------------------------------ */

const Bar = memo(function Bar({ clock, phase }) {
  const style = useAnimatedStyle(() => ({
    transform: [
      {
        scaleY:
          0.25 + 0.75 * (0.5 + 0.5 * Math.sin((clock.value + phase) * Math.PI * 2)),
      },
    ],
  }));
  return <Animated.View style={[styles.bar, style]} />;
});

const Bars = memo(function Bars({ active }) {
  const clock = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(clock);
    if (!active) return;
    clock.value = 0;
    clock.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(clock);
  }, [active, clock]);

  return (
    <View style={styles.bars}>
      {BAR_PHASES.map((ph) => (
        <Bar key={ph} clock={clock} phase={ph} />
      ))}
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Card: position on the arc is driven ONLY by the shared `pos` value  */
/* (UI thread). The card never re-renders while you swipe.             */
/* ------------------------------------------------------------------ */

const FanCard = memo(function FanCard({
  item,
  index,
  left,
  pos,
  playing,
  focused,
  near,
  animate,
  onCardPress,
  onPlayPress,
}) {
  const source = useMemo(() => toSource(item.image), [item.image]);

  const arc = useAnimatedStyle(() => {
    const d = index - pos.value;
    const ad = Math.abs(d);
    const a = d * STEP_DEG;
    const rad = (a * Math.PI) / 180;
    return {
      opacity: ad > 2.6 ? 0 : Math.max(0, 1 - ad * 0.26),
      zIndex: 100 - Math.round(ad * 10),
      transform: [
        { translateX: ARC_R * Math.sin(rad) },
        { translateY: ARC_R * (1 - Math.cos(rad)) },
        { rotate: `${a}deg` },
        { scale: Math.max(0.7, 1 - ad * 0.085) },
      ],
    };
  });

  const handleCard = useCallback(() => onCardPress(index), [onCardPress, index]);
  const handlePlay = useCallback(() => onPlayPress(index), [onPlayPress, index]);

  return (
    <Animated.View
      style={[styles.cardWrap, { left }, arc]}
      importantForAccessibility={near ? "auto" : "no-hide-descendants"}
      accessibilityElementsHidden={!near}
    >
      <View style={styles.card}>
        {source ? (
          <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={item.gradient ?? DEFAULT_GRADIENT}
            start={ART_START}
            end={ART_END}
            style={StyleSheet.absoluteFill}
          />
        )}

        {RINGS.map((r) => (
          <View key={r.width} pointerEvents="none" style={[styles.ring, r]} />
        ))}

        <LinearGradient
          colors={SCRIM}
          locations={SCRIM_AT}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <Pressable
          onPress={handleCard}
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}, ${songsLabel(item.songs)}`}
          accessibilityHint={focused ? "Double tap to play or pause" : "Double tap to bring forward"}
          accessibilityState={{ selected: focused }}
        />

        <View style={styles.chip} pointerEvents="none">
          {playing ? <Bars active={animate} /> : null}
          <Text style={styles.chipText}>
            {playing ? "Playing" : songsLabel(item.songs)}
          </Text>
        </View>

        <Pressable
          onPress={handlePlay}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`${playing ? "Pause" : "Play"} ${item.title}`}
          style={[styles.play, playing && styles.playOn]}
        >
          {playing ? (
            <Pause size={14} color="#14161c" fill="#14161c" strokeWidth={0} />
          ) : (
            <Play size={14} color="#fff" fill="#fff" strokeWidth={0} />
          )}
        </Pressable>

        {playing ? <View pointerEvents="none" style={styles.playRing} /> : null}
      </View>
    </Animated.View>
  );
});

/* ------------------------------------------------------------------ */
/* Pagination dots                                                     */
/* ------------------------------------------------------------------ */

const Dots = memo(function Dots({ count, active, on, off }) {
  return (
    <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dotBase,
            { width: i === active ? 22 : 6, backgroundColor: i === active ? on : off },
          ]}
        />
      ))}
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

function Playlists({
  items = DEFAULT_PLAYLISTS,
  title = "Playlists",
  label = "Handpicked",
  activeId, // controlled "playing" id (optional)
  initialIndex = 0,
  bleed = 0, // set to your parent's horizontal padding to let the fan reach the screen edges
  onPressItem, // card tapped / play toggled
  onView, // "View" button; falls back to onSeeAll, then /library
  onSeeAll,
  isScreenActive = true,
}) {
  const router = useRouter();
  const active = useIsActive(isScreenActive);
  const reduceMotion = useReducedMotion();
  const t = useColorScheme() === "dark" ? DARK : LIGHT;

  // Lazy mount: the fan is not built until the section has been visible once.
  // State, not a ref — the spacer and empty-state branches both read it
  // during render, so it must trigger a re-render the moment the section
  // becomes visible for the first time. (React's "store info from a previous
  // render" pattern; the compiler flags the conditional setState.)
  const [everActive, setEverActive] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active) setEverActive(true);
  }, [active]);

  // Data frozen while off-screen.
  const live = useWhileActive({ items, activeId }, active);
  const list = Array.isArray(live.items) ? live.items : [];
  const count = list.length;
  const last = Math.max(0, count - 1);

  const start = Math.min(Math.max(initialIndex, 0), last);
  const pos = useSharedValue(start);
  const [focusIdx, setFocusIdx] = useState(start);
  const [fanW, setFanW] = useState(0);
  const [playingState, setPlayingState] = useState(null);
  const playingId = live.activeId ?? playingState;

  const focusRef = useRef(start);
  const itemsRef = useLatest(list);
  const pressRef = useLatest(onPressItem);
  const viewRef = useLatest(onView);
  const seeAllRef = useLatest(onSeeAll);

  /* ---- keep position valid if the list shrinks ---- */
  useEffect(() => {
    if (pos.value > last) pos.value = last;
    if (focusRef.current > last) {
      focusRef.current = last;
      setFocusIdx(last);
    }
  }, [last, pos]);

  /* ---- UI thread -> JS: only when the focused card actually changes ---- */
  const onFocusChange = useCallback((i) => {
    if (i !== focusRef.current) {
      focusRef.current = i;
      haptic();
    }
    setFocusIdx(i);
  }, []);

  useAnimatedReaction(
    () => Math.round(clamp(pos.value, 0, last)),
    (cur, prev) => {
      if (prev !== null && cur !== prev) runOnJS(onFocusChange)(cur);
    },
    [last, onFocusChange],
  );

  /* ---- navigation ---- */
  const goTo = useCallback(
    (i) => {
      const target = Math.min(Math.max(i, 0), last);
      // `pos` is a stable shared value, not an effect dependency; the compiler
      // flags it because goTo is also referenced inside an effect.
      // eslint-disable-next-line react-hooks/immutability
      pos.value = reduceMotion ? target : withSpring(target, SPRING);
    },
    [last, pos, reduceMotion],
  );

  const togglePlay = useCallback((i) => {
    const item = itemsRef.current[i];
    if (!item) return;
    setPlayingState((cur) => (String(cur) === String(item.id) ? null : item.id));
    pressRef.current?.(item);
  }, [itemsRef, pressRef]);

  const onCardPress = useCallback(
    (i) => {
      if (i === focusRef.current) togglePlay(i);
      else goTo(i);
    },
    [goTo, togglePlay],
  );

  const onPlayPress = useCallback(
    (i) => {
      if (i !== focusRef.current) goTo(i);
      togglePlay(i);
    },
    [goTo, togglePlay],
  );

  const openAll = useCallback(() => {
    (seeAllRef.current ?? (() => router.push("/library")))();
  }, [seeAllRef, router]);

  const handleView = useCallback(() => {
    const item = itemsRef.current[focusRef.current];
    if (!item) return;
    haptic();
    if (viewRef.current) viewRef.current(item);
    else openAll();
  }, [itemsRef, viewRef, openAll]);

  /* ---- swipe gesture: runs entirely on the UI thread ---- */
  const startPos = useSharedValue(0);
  const instant = reduceMotion;

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(active)
        .activeOffsetX([-8, 8])
        .failOffsetY([-14, 14])
        .onBegin(() => {
          cancelAnimation(pos);
          // eslint-disable-next-line react-hooks/immutability
          startPos.value = pos.value;
        })
        .onUpdate((e) => {
          // gentle edge resistance: allow a little overscroll
          // eslint-disable-next-line react-hooks/immutability
          pos.value = clamp(startPos.value - e.translationX / PX_PER_CARD, -0.4, last + 0.4);
        })
        .onEnd((e) => {
          const projected = pos.value - ((e.velocityX / 1000) * 220) / PX_PER_CARD;
          const delta = clamp(projected - pos.value, -2, 2);
          const target = clamp(Math.round(pos.value + delta), 0, last);
          // eslint-disable-next-line react-hooks/immutability
          pos.value = instant ? target : withSpring(target, SPRING);
        }),
    [active, last, pos, startPos, instant],
  );

  /* ---- screen reader: swipe up/down to move focus ---- */
  const onAccessibilityAction = useCallback(
    (e) => {
      if (e.nativeEvent.actionName === "increment") goTo(focusRef.current + 1);
      else if (e.nativeEvent.actionName === "decrement") goTo(focusRef.current - 1);
    },
    [goTo],
  );
  const a11yActions = useMemo(
    () => [{ name: "increment" }, { name: "decrement" }],
    [],
  );

  const onFanLayout = useCallback(
    (e) => {
      const w = Math.round(e.nativeEvent.layout.width);
      setFanW((cur) => (cur === w ? cur : w));
    },
    [],
  );

  const fanStyle = useMemo(() => ({ height: FAN_H, marginHorizontal: -bleed }), [bleed]);

  if (count === 0 && everActive) return null;

  const left = (fanW - CARD_W) / 2;
  const focused = list[Math.min(focusIdx, last)];

  // Mount only the cards near the focused one.
  const from = Math.max(0, focusIdx - RENDER_WINDOW);
  const to = Math.min(count, focusIdx + RENDER_WINDOW + 1);
  const windowed = list.slice(from, to);

  return (
    <View style={styles.root}>
      {/* Title row */}
      <View style={styles.head}>
        <Pressable
          onPress={openAll}
          accessibilityRole="button"
          accessibilityLabel={`See all ${String(title).toLowerCase()}`}
          style={styles.titleBtn}
        >
          <View style={[styles.ico, { backgroundColor: t.card, borderColor: t.line }]}>
            <ListMusic size={19} color={t.fg} strokeWidth={1.5} />
          </View>
          <Text style={[styles.title, { color: t.fg }]}>{title}</Text>
          <ChevronRight size={18} color={t.mute} strokeWidth={1.8} />
        </Pressable>
        {label ? <Text style={[styles.label, { color: t.mute }]}>{label}</Text> : null}
      </View>

      {/* Fan (built only after first visibility) */}
      {!everActive ? (
        <View style={{ height: FAN_H + 150 }} />
      ) : (
        <>
          <GestureDetector gesture={pan}>
            <View
              style={[styles.fan, fanStyle]}
              onLayout={onFanLayout}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={title}
              accessibilityValue={{ text: focused ? focused.title : "" }}
              accessibilityActions={a11yActions}
              onAccessibilityAction={onAccessibilityAction}
            >
              {fanW > 0 &&
                windowed.map((item, k) => {
                  const index = from + k;
                  return (
                    <FanCard
                      key={String(item.id)}
                      item={item}
                      index={index}
                      left={left}
                      pos={pos}
                      playing={playingId != null && String(playingId) === String(item.id)}
                      focused={index === focusIdx}
                      near={Math.abs(index - focusIdx) <= 2}
                      animate={active && !reduceMotion}
                      onCardPress={onCardPress}
                      onPlayPress={onPlayPress}
                    />
                  );
                })}
            </View>
          </GestureDetector>

          {/* Focused playlist: name, count, View */}
          {focused ? (
            <View style={styles.focus}>
              <Animated.View
                key={String(focused.id)}
                entering={reduceMotion ? undefined : FadeInDown.duration(240)}
                style={styles.focusText}
              >
                <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.name, { color: t.fg }]}>
                  {focused.title}
                </Text>
                <Text style={[styles.sub, { color: t.mute }]}>
                  {songsLabel(focused.songs)}
                  {playingId != null && String(playingId) === String(focused.id)
                    ? ", playing now"
                    : ""}
                </Text>
              </Animated.View>

              <Pressable
                onPress={handleView}
                accessibilityRole="button"
                accessibilityLabel={`View ${focused.title}`}
                style={[styles.view, { backgroundColor: t.fg }]}
              >
                <Text style={[styles.viewText, { color: t.onFg }]}>View</Text>
                <View style={[styles.viewIco, { backgroundColor: t.onFg }]}>
                  <ChevronRight size={17} color={t.fg} strokeWidth={1.8} />
                </View>
              </Pressable>
            </View>
          ) : null}

          <Dots count={count} active={focusIdx} on={t.fg} off={t.line} />
        </>
      )}
    </View>
  );
}

export default memo(Playlists);

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: { width: "100%" },

  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 28,
    marginBottom: 8,
  },
  titleBtn: { flexDirection: "row", alignItems: "center", gap: 12 },
  ico: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: FONT.semi, fontSize: 28, letterSpacing: -0.8 },
  label: { fontFamily: FONT.light, fontSize: 14 },

  fan: { overflow: "hidden" },
  cardWrap: {
    position: "absolute",
    top: CARD_TOP,
    width: CARD_W,
    height: CARD_H,
    borderRadius: RADIUS,
    backgroundColor: "#1a1d26",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  card: {
    flex: 1,
    borderRadius: RADIUS,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  ring: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  playRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS,
    borderWidth: 2,
    borderColor: ACCENT,
  },

  chip: {
    position: "absolute",
    left: 12,
    top: 12,
    height: 28,
    paddingHorizontal: 11,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.34)",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  chipText: { color: "#fff", fontFamily: FONT.regular, fontSize: 12 },
  bars: { height: 12, flexDirection: "row", alignItems: "flex-end", gap: 2 },
  bar: { width: 3, height: 12, borderRadius: 2, backgroundColor: "#fff", transformOrigin: "bottom" },

  play: {
    position: "absolute",
    right: 12,
    top: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  playOn: { backgroundColor: "#fff", borderColor: "transparent" },

  focus: { alignItems: "center", paddingTop: 4 },
  focusText: { alignItems: "center", alignSelf: "stretch" },
  name: { fontFamily: FONT.thin, fontSize: 40, letterSpacing: -1.2, textAlign: "center" },
  sub: { marginTop: 8, fontFamily: FONT.light, fontSize: 15 },

  view: {
    marginTop: 22,
    height: 52,
    paddingLeft: 26,
    paddingRight: 7,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  viewText: { fontFamily: FONT.regular, fontSize: 16 },
  viewIco: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },

  dots: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 26 },
  dotBase: { height: 6, borderRadius: 3 },
});