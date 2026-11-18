import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useIsFocused } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { ChevronRight } from "lucide-react-native";

/* ------------------------------------------------------------------ */
/* Tokens: dark, flat. Colour comes only from each card's wave art.    */
/* ------------------------------------------------------------------ */

const C = {
  bg: "#000000",
  card: "#0e0d0b",
  fg: "#f3f0ea",
  mute: "#8d8981",
  line: "#26241f",
  skel: "#121110",
  accent: "#ff5a36",
  white: "#ffffff",
  ink: "#14110a",
  plate: "rgba(0,0,0,0.62)",
};

const FONT = {
  thin: "Outfit_200ExtraLight",
  light: "Outfit_300Light",
  regular: "Outfit_400Regular",
  medium: "Outfit_500Medium",
};

// One accent per artist (stable hash of the name): tints the wave art, border and button.
const ACCENTS = ["#e8b04a", "#ff7a45", "#4fd1a1", "#9b7bff", "#ff6b9a", "#4aa8ff"];

const MAX_W = 1280;
const WAVE_LINES = 9;
const WAVE_STEPS = 28;
const TAG_LH = 22;
const EMPTY = [];
const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const EASE = Easing.out(Easing.cubic);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pad2 = (n) => String(n).padStart(2, "0");

const hashOf = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};
const accentFor = (name) => ACCENTS[hashOf(name) % ACCENTS.length];

// Small seeded PRNG so each artist always gets the same artwork.
const rng = (seed) => {
  let t = seed || 1;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return (((r ^ (r >>> 14)) >>> 0) % 10000) / 10000;
  };
};

// Layered contour lines (one path per line), unique per artist.
const wavePaths = (name, W, H) => {
  const r = rng(hashOf(name));
  const freq = 1.1 + r() * 1.3;
  const phase = r() * Math.PI * 2;
  const amp = H * (0.14 + r() * 0.1);
  const drift = 0.18 + r() * 0.16;
  const stepY = H / (WAVE_LINES + 2);
  const out = [];
  for (let i = 0; i < WAVE_LINES; i += 1) {
    let d = "";
    for (let s = 0; s <= WAVE_STEPS; s += 1) {
      const t = s / WAVE_STEPS;
      const env = 0.35 + 0.65 * Math.sin(Math.PI * t);
      const y = stepY * (i + 1.5) + amp * env * Math.sin(t * Math.PI * 2 * freq + phase + i * drift);
      d += `${s ? "L" : "M"}${(W * t).toFixed(1)} ${y.toFixed(1)} `;
    }
    out.push(d);
  }
  return out;
};

/**
 * Always horizontal. The rail fills the container width exactly (no scrolling):
 * one wide open card + slim collapsed pills. Content is capped at MAX_W.
 *   phone  (< 600): 34px slim pills, tighter gaps and padding
 *   tablet / wide : wider pills, larger type
 */
const metricsFor = (w, winH, n, insetL, insetR, gapOverride) => {
  const phone = w < 600;
  const inset = Math.round(clamp(w * 0.05, 16, 64));
  const left = insetL ?? inset;
  const right = insetR ?? inset;
  const titleSize = Math.round(clamp(w * (phone ? 0.13 : 0.1), 44, 96));
  const gap = gapOverride ?? (phone ? 6 : 10);
  const pad = phone ? 20 : 24;
  const minC = phone ? 34 : 56;
  const content = Math.max(0, Math.min(w, MAX_W) - left - right);
  const x = Math.round(clamp(winH * (phone ? 0.5 : 0.52), 320, 460));
  const rad = phone ? 18 : 28;
  const base = { phone, left, right, gap, pad, titleSize, content, x, rad };

  if (n <= 1) return { ...base, a: content, b: content, fullW: content - pad * 2 };

  const k = n - 1;
  let ew = clamp(content * (phone ? 0.5 : 0.42), phone ? 140 : 260, 560);
  let cw = clamp((content - gap * k - ew) / k, minC, 200);
  ew = content - gap * k - cw * k; // always fills the width exactly
  cw = Math.round(cw);
  ew = Math.round(ew);
  return { ...base, a: cw, b: ew, fullW: ew - pad * 2 };
};

const LOCAL_OR_REMOTE = /^(https?:|file:|content:|data:)/i;
const toImageSource = (image) => {
  if (typeof image === "number") return image;
  if (typeof image === "string" && LOCAL_OR_REMOTE.test(image.trim())) return { uri: image.trim() };
  return null;
};

const triggerHaptic = () => {
  try {
    Haptics.selectionAsync().catch(() => {});
  } catch {
    // unsupported device
  }
};

const sanitize = (artists) =>
  Array.isArray(artists) ? artists.filter((a) => a && typeof a === "object") : EMPTY;

const sameArtists = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x !== y && (!x || !y || x.id !== y.id || x.name !== y.name || x.info !== y.info || x.image !== y.image)) {
      return false;
    }
  }
  return true;
};

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

// Single gate: screen focused + app foregrounded + `visible` prop.
function useIsActive(visible = true) {
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setAppActive(s === "active"));
    return () => sub.remove();
  }, []);
  return visible && focused && appActive;
}

// Latest-value ref: keeps child handlers referentially stable.
function useLatest(value) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

// Same array (and items) while content is unchanged, so memo never re-renders for nothing.
function useStableArtists(artists) {
  const ref = useRef({ raw: null, safe: EMPTY });
  // eslint-disable-next-line react-hooks/refs
  if (ref.current.raw === null || !sameArtists(ref.current.raw, artists)) {
    // eslint-disable-next-line react-hooks/refs
    ref.current = { raw: artists, safe: sanitize(artists) };
  }
  // eslint-disable-next-line react-hooks/refs
  return ref.current.safe;
}

// While inactive, keep returning the last value seen while active.
function useWhileActive(value, active) {
  const ref = useRef(value);
  useEffect(() => {
    if (active) ref.current = value;
  }, [active, value]);
  // eslint-disable-next-line react-hooks/refs
  return active ? value : ref.current;
}

/**
 * Viewport visibility for a section inside a vertical ScrollView.
 *
 *   const vis = useSectionVisibility();
 *   <ScrollView onLayout={vis.onScrollLayout} onScroll={vis.onScroll} scrollEventThrottle={64}>
 *     <View onLayout={vis.onLayout}>
 *       <ArtistsSection visible={vis.visible} ... />
 *     </View>
 *   </ScrollView>
 *
 * The wrapping View must be a direct child of the ScrollView content.
 */
export function useSectionVisibility(margin = 160) {
  const [visible, setVisible] = useState(false);
  const box = useRef({ y: 0, h: 0 });
  const view = useRef({ y: 0, vh: 0 });

  const evaluate = useCallback(() => {
    const { y, h } = box.current;
    const { y: sy, vh } = view.current;
    if (!h || !vh) return;
    const next = y + h > sy - margin && y < sy + vh + margin;
    setVisible((prev) => (prev === next ? prev : next));
  }, [margin]);

  const onLayout = useCallback((e) => {
    box.current = e.nativeEvent.layout;
    evaluate();
  }, [evaluate]);
  const onScrollLayout = useCallback((e) => {
    view.current.vh = e.nativeEvent.layout.height;
    evaluate();
  }, [evaluate]);
  const onScroll = useCallback((e) => {
    view.current = {
      y: e.nativeEvent.contentOffset.y,
      vh: e.nativeEvent.layoutMeasurement.height,
    };
    evaluate();
  }, [evaluate]);

  return { visible, onLayout, onScroll, onScrollLayout };
}

/* ------------------------------------------------------------------ */
/* Artist card                                                         */
/* ------------------------------------------------------------------ */

const ArtistCard = memo(function ArtistCard({
  artist, index, selected, phone, a, b, x, pad, rad, fullW, reduceMotion, onPress, onView,
}) {
  const name = typeof artist.name === "string" ? artist.name : "Unknown artist";
  const info = typeof artist.info === "string" ? artist.info : "";
  const source = useMemo(() => toImageSource(artist.image), [artist.image]);
  const [failed, setFailed] = useState(false);
  const showImage = source && !failed;

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setFailed(false), [artist.image]);

  const color = useMemo(() => accentFor(name), [name]);
  const waveH = Math.round(x * 0.46);
  const paths = useMemo(() => (showImage ? EMPTY : wavePaths(name, b, waveH)), [showImage, name, b, waveH]);

  // One UI-thread value drives width, wave parallax, dimming, labels.
  const sel = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    sel.value = withTiming(selected ? 1 : 0, { duration: reduceMotion ? 0 : 650, easing: EASE });
  }, [selected, reduceMotion, sel]);

  const frame = useAnimatedStyle(() => ({ width: a + (b - a) * sel.value }));
  // Collapsed pills show the middle slice of the art; it glides to the left as the card opens.
  const art = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - sel.value) * (b - a) * 0.5 }] }));
  const zoom = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.05 * sel.value }] }));
  const dim = useAnimatedStyle(() => ({ opacity: 0.3 * (1 - sel.value) }));
  const tagFade = useAnimatedStyle(() => ({ opacity: 0.9 * (1 - sel.value) }));
  const fullFade = useAnimatedStyle(() => ({ opacity: sel.value }));

  const handlePress = useCallback(() => onPress(artist), [onPress, artist]);
  const handleView = useCallback(() => onView(artist), [onView, artist]);
  const onImageError = useCallback(() => setFailed(true), []);
  const onA11yAction = useCallback(
    (e) => {
      if (e.nativeEvent.actionName === "view") handleView();
    },
    [handleView],
  );

  const nameSize = Math.round(clamp(fullW * 0.12, 22, 42));
  const border = { borderColor: selected ? `${color}b3` : `${color}38` };

  return (
    <Animated.View style={[styles.card, { height: x, borderRadius: rad }, border, frame]}>
      {showImage ? (
        <Animated.View style={[StyleSheet.absoluteFill, zoom]}>
          <Image
            source={source}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            resizeMethod="resize"
            onError={onImageError}
          />
        </Animated.View>
      ) : (
        <Animated.View style={[styles.art, { width: b, height: waveH }, art]} pointerEvents="none">
          <Svg width={b} height={waveH}>
            {paths.map((d, i) => (
              <Path
                key={i}
                d={d}
                stroke={color}
                strokeOpacity={0.3 + (0.7 * i) / (WAVE_LINES - 1)}
                strokeWidth={1.2}
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="none"
              />
            ))}
          </Svg>
        </Animated.View>
      )}

      {/* Unselected cards sit slightly back */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dim]} pointerEvents="none" />

      {/* Tap: select (expand) first, redirect on the second tap of the same card */}
      <Pressable
        onPress={handlePress}
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={info ? `${name}, ${info}` : name}
        accessibilityHint={selected ? "Opens the artist profile" : "Expands this card"}
        accessibilityState={{ selected }}
        accessibilityActions={[{ name: "view", label: `View ${name}` }]}
        onAccessibilityAction={onA11yAction}
      />

      <Text style={[styles.idx, { top: pad, left: pad - 4 }]} pointerEvents="none">{pad2(index + 1)}</Text>

      {/* Collapsed: name runs up the spine */}
      <Animated.View
        style={[styles.tag, { width: x - pad * 2 - 28, left: (a - TAG_LH) / 2 + TAG_LH }, tagFade]}
        pointerEvents="none"
      >
        <Text numberOfLines={1} style={[styles.tagText, phone && styles.tagTextSm]}>{name}</Text>
      </Animated.View>

      {/* Expanded details */}
      <Animated.View
        style={[styles.full, { width: fullW + pad * 2, padding: pad }, showImage && styles.fullPlate, fullFade]}
        pointerEvents={selected ? "box-none" : "none"}
        accessibilityElementsHidden={!selected}
        importantForAccessibility={selected ? "auto" : "no-hide-descendants"}
      >
        <View style={{ width: fullW }} pointerEvents="none">
          <Text style={[styles.kicker, { color }]} numberOfLines={1}>{pad2(index + 1)}</Text>
          <Text numberOfLines={2} style={[styles.name, { fontSize: nameSize, lineHeight: nameSize * 1.1 }]}>
            {name}
          </Text>
          {info ? (
            <Text numberOfLines={2} style={styles.info}>{info}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={handleView}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`View ${name}`}
          style={[styles.viewBtn, { backgroundColor: color }]}
        >
          <Text style={styles.viewText} numberOfLines={1}>View</Text>
          <ChevronRight size={16} color={C.ink} strokeWidth={2} />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
});

/* ------------------------------------------------------------------ */
/* Skeleton: ONE shared pulse, paused off-screen                       */
/* ------------------------------------------------------------------ */

const Skeleton = memo(function Skeleton({ active, m, count }) {
  const p = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(p);
    p.value = 0;
    if (!active) return undefined;
    p.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(p);
  }, [active, p]);

  const pulse = useAnimatedStyle(() => ({ opacity: 1 - 0.55 * p.value }));
  const n = Math.max(2, count);

  return (
    <View
      style={[styles.rail, { gap: m.gap, width: m.content }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: n }, (_, i) => (
        <Animated.View
          key={i}
          style={[styles.skel, { width: i === 0 ? m.b : m.a, height: m.x, borderRadius: m.rad }, pulse]}
        />
      ))}
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

function ArtistsSection({
  title = "Artists",
  titlePrefix = "The",
  label = "Popular this week",

  artists = EMPTY,
  selectedId = null, // initial / controlled selection (first artist is open when null)
  loading = false,
  limit = 6, // cards in the rail; the rest live behind "See all"

  // Layout overrides. Leave undefined for the responsive defaults.
  gap: gapProp,
  inset: insetProp, // both sides
  insetLeft, // optional, wins over inset
  insetRight, // optional, wins over inset

  // Pass false while the section is scrolled off screen (see useSectionVisibility).
  visible = true,

  onArtistSelect, // 1st tap on a collapsed card: it expands (no redirect)
  onArtistPress, // 2nd tap on the expanded card, or "View profile": redirect
  onArtistView, // alias of onArtistPress (takes priority if both are given)
  onSeeAll,
}) {
  const active = useIsActive(visible);
  const reduceMotion = useReducedMotion();
  const { width: winW, height: winH } = useWindowDimensions();

  const [boxW, setBoxW] = useState(0);
  const onRootLayout = useCallback((e) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setBoxW((cur) => (cur === w ? cur : w));
  }, []);

  // Lazy mount: nothing heavy renders until the section has been visible once.
  const [everActive, setEverActive] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active) setEverActive(true);
  }, [active]);

  const stable = useStableArtists(artists);

  const [selId, setSelId] = useState(selectedId);
  const selRef = useRef(selectedId);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelId(selectedId);
    selRef.current = selectedId;
  }, [selectedId]);

  const live = useWhileActive({ artists: stable, selId, loading }, active);
  const shown = useMemo(() => live.artists.slice(0, Math.max(1, limit)), [live.artists, limit]);
  const count = shown.length;

    const m = useMemo(
    () =>
      metricsFor(
        boxW || winW,
        winH,
        count,
        insetLeft ?? insetProp,
        insetRight ?? insetProp,
        gapProp,
      ),
    [boxW, winW, winH, count, insetLeft, insetRight, insetProp, gapProp],
  );

  const selectRef = useLatest(onArtistSelect);
  const pressRef = useLatest(onArtistPress);
  const viewRef = useLatest(onArtistView);
  const firstIdRef = useLatest(shown[0]?.id ?? null);

  const redirect = useCallback(
    (artist) => {
      triggerHaptic();
      (viewRef.current ?? pressRef.current)?.(artist);
    },
    [viewRef, pressRef],
  );

  // Two-step tap: collapsed card -> expand; already expanded card -> redirect.
  const handleCardPress = useCallback(
    (artist) => {
      const current = selRef.current ?? firstIdRef.current;
      if (current != null && String(current) === String(artist.id)) {
        redirect(artist);
        return;
      }
      triggerHaptic();
      selRef.current = artist.id;
      setSelId(artist.id);
      selectRef.current?.(artist);
    },
    [redirect, selectRef, firstIdRef],
  );

  const selectedIdx = useMemo(() => {
    if (!count) return -1;
    if (live.selId == null) return 0;
    const i = shown.findIndex((s) => String(s.id) === String(live.selId));
    return i < 0 ? 0 : i;
  }, [shown, live.selId, count]);

  // Progress hairline follows the open card.
  const thumbL = useSharedValue(0);
  useEffect(() => {
    if (selectedIdx < 0 || !count) return;
    thumbL.value = withTiming((selectedIdx / count) * 100, { duration: reduceMotion ? 0 : 500, easing: EASE });
  }, [selectedIdx, count, reduceMotion, thumbL]);
  const thumbStyle = useAnimatedStyle(() => ({ left: `${thumbL.value}%` }));

  const showBody = everActive && visible;

  if (!live.loading && live.artists.length === 0 && everActive) return null;

  const sizing = { fontSize: m.titleSize, lineHeight: m.titleSize, letterSpacing: -m.titleSize * 0.04 };

  return (
    <View style={styles.root} onLayout={onRootLayout}>
     <View style={[styles.inner, { paddingLeft: m.left, paddingRight: m.right }]}>
        {/* Header (cheap, always rendered) */}
        <View style={styles.head}>
          <View style={styles.headText}>
            {label ? (
              <View style={styles.eyebrowRow}>
                <View style={styles.dot} />
                <Text style={styles.eyebrow}>{String(label)}</Text>
              </View>
            ) : null}
            <Text accessibilityRole="header" style={[styles.title, sizing]}>
              {titlePrefix ? `${titlePrefix} ` : ""}
              <Text style={styles.titleBold}>{title}</Text>
            </Text>
          </View>
          {onSeeAll ? (
            <Pressable
              onPress={onSeeAll}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={`See all ${String(title).toLowerCase()}`}
              style={styles.seeAll}
            >
              <Text style={styles.seeAllText}>See all</Text>
              <View style={styles.seeAllLine} />
              <ChevronRight size={14} color={C.fg} strokeWidth={1.4} style={styles.seeAllChevron} />
            </Pressable>
          ) : null}
        </View>

        {/* Body: only mounted while on screen. Off-screen = fixed-height spacer. */}
        {!showBody ? (
          <View style={{ height: m.x + 64 }} />
        ) : live.loading ? (
          <Skeleton active={active && !reduceMotion} m={m} count={Math.min(6, limit)} />
        ) : (
          <>
            <View style={[styles.rail, { gap: m.gap, width: m.content }]}>
              {shown.map((item, index) => (
                <ArtistCard
                  key={String(item.id ?? item.name ?? index)}
                  artist={item}
                  index={index}
                  selected={index === selectedIdx}
                  phone={m.phone}
                  a={m.a}
                  b={m.b}
                  x={m.x}
                  pad={m.pad}
                  rad={m.rad}
                  fullW={m.fullW}
                  reduceMotion={reduceMotion}
                  onPress={handleCardPress}
                  onView={redirect}
                />
              ))}
            </View>

            <View style={[styles.foot, { width: m.content }]}>
              <Text style={styles.count}>{pad2(selectedIdx + 1)} / {pad2(count)}</Text>
              <View style={styles.bar}>
                <Animated.View style={[styles.thumb, { width: `${100 / count}%` }, thumbStyle]} />
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

export default memo(ArtistsSection);

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: { width: "100%", backgroundColor: C.bg, alignItems: "center" },
  inner: { width: "100%", maxWidth: MAX_W + 128, alignItems: "center" },

  /* header */
  head: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 28,
    columnGap: 16,
  },
  headText: { flexShrink: 1 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent, marginRight: 10 },
  eyebrow: { fontFamily: FONT.regular, fontSize: 13, letterSpacing: 0.6, color: C.mute },
  title: { fontFamily: FONT.thin, color: C.fg },
  titleBold: { fontFamily: FONT.medium },
  seeAll: { flexDirection: "row", alignItems: "center", paddingBottom: 6, minHeight: 44 },
  seeAllText: { fontFamily: FONT.regular, fontSize: 13, letterSpacing: 0.8, color: C.fg },
  seeAllLine: { width: 22, height: 1, marginLeft: 10, backgroundColor: C.fg },
  seeAllChevron: { marginLeft: -7 },

  /* rail */
  rail: { flexDirection: "row", alignSelf: "center" },
  skel: { backgroundColor: C.skel },

  /* card */
  card: { overflow: "hidden", backgroundColor: C.card, borderWidth: 1 },
  art: { position: "absolute", left: 0, top: 52 },
  dim: { backgroundColor: "#000" },
  idx: {
    position: "absolute",
    color: "rgba(255,255,255,0.85)",
    fontFamily: FONT.regular,
    fontSize: 11,
    letterSpacing: 1.6,
    fontVariant: ["tabular-nums"],
  },
  tag: {
    position: "absolute",
    bottom: 22,
    height: TAG_LH,
    transformOrigin: "left bottom",
    transform: [{ rotate: "-90deg" }],
  },
  tagText: { color: C.white, fontFamily: FONT.regular, fontSize: 17, lineHeight: TAG_LH, letterSpacing: -0.2 },
  tagTextSm: { fontSize: 15 },
  full: { position: "absolute", left: 0, bottom: 0 },
  fullPlate: { backgroundColor: C.plate },
  kicker: { fontFamily: FONT.regular, fontSize: 11, letterSpacing: 1.6, marginBottom: 8, fontVariant: ["tabular-nums"] },
  name: { color: C.white, fontFamily: FONT.medium, letterSpacing: -1 },
  info: { marginTop: 8, color: "rgba(255,255,255,0.72)", fontFamily: FONT.regular, fontSize: 13, lineHeight: 18 },
  viewBtn: {
    marginTop: 16,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingLeft: 16,
    paddingRight: 6,
    borderRadius: 22,
    columnGap: 2,
  },
  viewText: { color: C.ink, fontFamily: FONT.medium, fontSize: 13, letterSpacing: 0.2 },

  /* footer */
  foot: { flexDirection: "row", alignItems: "center", columnGap: 20, marginTop: 28, marginBottom: 8 },
  count: { fontFamily: FONT.regular, fontSize: 12, letterSpacing: 1.8, minWidth: 56, color: C.mute, fontVariant: ["tabular-nums"] },
  bar: { flex: 1, height: 1, backgroundColor: C.line },
  thumb: { position: "absolute", top: -1, height: 3, backgroundColor: C.fg },
});