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
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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
import { ChevronRight, Mic } from "lucide-react-native";

/* ------------------------------------------------------------------ */
/* Constants (module scope: allocated once)                            */
/* ------------------------------------------------------------------ */

const FONT = {
  light: "Outfit_300Light",
  regular: "Outfit_400Regular",
  semi: "Outfit_600SemiBold",
};

const ACCENT = "#ff2d55";
const CARD_W = 168;
const CARD_H = 248;
const RAD = 30;
const EMPTY = [];
const SKELETON_ITEMS = [0, 1, 2];
const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

const TINTS = [
  ["#2a8f89", "#bfe6d2"],
  ["#d9822b", "#f7d583"],
  ["#5b4fd0", "#cbbcff"],
  ["#cf4f74", "#ffc6c4"],
  ["#2f7fa6", "#aedbe9"],
  ["#7a9f3a", "#dff0b0"],
];
const TINT_START = { x: 0, y: 0 };
const TINT_END = { x: 1, y: 1 };
const SCRIM = ["rgba(8,9,14,0)", "rgba(8,9,14,0.5)", "rgba(8,9,14,0.78)"];
const SCRIM_AT = [0.38, 0.7, 1];

const LIGHT = {
  fg: "#14161c",
  mute: "#757a86",
  card: "rgba(255,255,255,0.8)",
  line: "rgba(20,22,28,0.09)",
  skel: "rgba(20,22,28,0.08)",
};
const DARK = {
  fg: "#f3f2ee",
  mute: "#8b909c",
  card: "rgba(255,255,255,0.07)",
  line: "rgba(255,255,255,0.10)",
  skel: "rgba(255,255,255,0.07)",
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const tintFor = (name) => {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return TINTS[h % TINTS.length];
};

const initialsOf = (name) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

// http(s) plus local sources (file/content/data) so locally stored art still works.
const LOCAL_OR_REMOTE = /^(https?:|file:|content:|data:)/i;

const toImageSource = (image) => {
  if (typeof image === "number") return image;
  if (typeof image === "string" && LOCAL_OR_REMOTE.test(image.trim())) {
    return { uri: image.trim() };
  }
  return null;
};

const triggerHaptic = () => {
  try {
    Haptics.selectionAsync().catch(() => {});
  } catch (e) {
    // unsupported device
  }
};

const sanitize = (artists) =>
  Array.isArray(artists)
    ? artists.filter((a) => a && typeof a === "object")
    : EMPTY;

const sameArtists = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x !== y &&
      (!x ||
        !y ||
        x.id !== y.id ||
        x.name !== y.name ||
        x.info !== y.info ||
        x.image !== y.image)
    ) {
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
    const sub = AppState.addEventListener("change", (s) =>
      setAppActive(s === "active"),
    );
    return () => sub.remove();
  }, []);

  return visible && focused && appActive;
}

// Keeps the latest callback in a ref so child handlers stay referentially stable.
function useLatest(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

// Parents often pass a fresh `.map(...)` array every render. This returns the
// SAME array (and same item objects) while the content is unchanged, so memo
// and FlatList never re-render for nothing.
function useStableArtists(artists) {
  const ref = useRef({ raw: null, safe: EMPTY });
  if (ref.current.raw === null || !sameArtists(ref.current.raw, artists)) {
    ref.current = { raw: artists, safe: sanitize(artists) };
  }
  return ref.current.safe;
}

// While inactive, keep returning the last value seen while active, so an
// off-screen list does no work when data changes behind the scenes.
function useWhileActive(value, active) {
  const ref = useRef(value);
  if (active) ref.current = value;
  return ref.current;
}

/* ------------------------------------------------------------------ */
/* Artist card                                                         */
/* ------------------------------------------------------------------ */

const ArtistCard = memo(function ArtistCard({
  artist,
  selected,
  reduceMotion,
  onPress,
  onView,
}) {
  const name = typeof artist.name === "string" ? artist.name : "Unknown artist";
  const info = typeof artist.info === "string" ? artist.info : "";
  const source = useMemo(() => toImageSource(artist.image), [artist.image]);
  const [failed, setFailed] = useState(false);
  const showImage = source && !failed;

  useEffect(() => setFailed(false), [artist.image]);

  const tint = useMemo(() => tintFor(name), [name]);
  const initials = useMemo(() => initialsOf(name), [name]);

  // One UI-thread value drives both lift and zoom (no JS work per frame).
  const sel = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    sel.value = withTiming(selected ? 1 : 0, {
      duration: reduceMotion ? 0 : 380,
      easing: Easing.out(Easing.cubic),
    });
  }, [selected, reduceMotion, sel]);

  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: -8 * sel.value }],
  }));
  const zoom = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.06 * sel.value }],
  }));

  const handlePress = useCallback(() => onPress(artist), [onPress, artist]);
  const handleView = useCallback(() => onView(artist), [onView, artist]);
  const onImageError = useCallback(() => setFailed(true), []);

  return (
    <Animated.View style={[styles.shadow, lift]}>
      <View style={styles.card}>
        <Animated.View style={[StyleSheet.absoluteFill, zoom]}>
          {showImage ? (
            <Image
              source={source}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              resizeMethod="resize"
              onError={onImageError}
            />
          ) : (
            <LinearGradient
              colors={tint}
              start={TINT_START}
              end={TINT_END}
              style={styles.fallback}
            >
              <Text style={styles.initials}>{initials}</Text>
            </LinearGradient>
          )}
        </Animated.View>

        <LinearGradient
          colors={SCRIM}
          locations={SCRIM_AT}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <Pressable
          onPress={handlePress}
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={info ? `${name}, ${info}` : name}
          accessibilityState={{ selected }}
        />

        <View style={styles.meta} pointerEvents="none">
          <View style={styles.nameRow}>
            {selected && <View style={styles.dot} />}
            <Text numberOfLines={1} style={styles.name}>
              {name}
            </Text>
          </View>
          {info ? (
            <Text numberOfLines={1} style={styles.info}>
              {info}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={handleView}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`View ${name}`}
          style={[styles.view, selected && styles.viewOn]}
        >
          <Text style={[styles.viewText, selected && styles.viewTextOn]}>
            View
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
});

/* ------------------------------------------------------------------ */
/* Skeleton: ONE shared pulse for every placeholder, paused off-screen */
/* ------------------------------------------------------------------ */

const Skeleton = memo(function Skeleton({ active, color, inset, gap, height }) {
  const p = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(p);
    p.value = 0;
    if (!active) return;
    p.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(p);
  }, [active, p]);

  const pulse = useAnimatedStyle(() => ({ opacity: 1 - 0.55 * p.value }));

  return (
    <View
      style={{ flexDirection: "row", paddingHorizontal: inset, columnGap: gap, height }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {SKELETON_ITEMS.map((i) => (
        <Animated.View
          key={i}
          style={[styles.skelCard, { backgroundColor: color }, pulse]}
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
  label = "Popular",
  icon: Icon = Mic,

  artists = EMPTY,
  selectedId = null,
  loading = false,

  gap = 14,
  inset = 20,
  snap = true,

  visible = true, // optional: pass false when scrolled off screen
  onArtistPress, // tap on a card (select)
  onArtistView, // tap on "View"; falls back to onArtistPress
  onSeeAll,
}) {
  const active = useIsActive(visible);
  const reduceMotion = useReducedMotion();
  const t = useColorScheme() === "dark" ? DARK : LIGHT;

  // Lazy mount: nothing heavy renders until the section has been visible once.
  const everActive = useRef(active);
  if (active) everActive.current = true;

  // Stable data, frozen while off-screen.
  const stable = useStableArtists(artists);
  const live = useWhileActive({ artists: stable, selectedId, loading }, active);

  const pressRef = useLatest(onArtistPress);
  const viewRef = useLatest(onArtistView);

  const handlePress = useCallback(
    (artist) => {
      triggerHaptic();
      pressRef.current?.(artist);
    },
    [pressRef],
  );
  const handleView = useCallback(
    (artist) => {
      triggerHaptic();
      (viewRef.current ?? pressRef.current)?.(artist);
    },
    [viewRef, pressRef],
  );

  const step = CARD_W + gap;
  const listHeight = CARD_H + 14 + 28;

  const renderItem = useCallback(
    ({ item }) => (
      <ArtistCard
        artist={item}
        selected={
          live.selectedId != null && String(item.id) === String(live.selectedId)
        }
        reduceMotion={reduceMotion}
        onPress={handlePress}
        onView={handleView}
      />
    ),
    [live.selectedId, reduceMotion, handlePress, handleView],
  );

  const keyExtractor = useCallback(
    (item, i) => String(item.id ?? item.name ?? i),
    [],
  );
  const renderGap = useCallback(() => <View style={{ width: gap }} />, [gap]);
  const getItemLayout = useCallback(
    (_, index) => ({ length: step, offset: step * index, index }),
    [step],
  );

  const contentStyle = useMemo(
    () => ({ paddingHorizontal: inset, paddingTop: 14, paddingBottom: 28 }),
    [inset],
  );
  const listStyle = useMemo(() => ({ height: listHeight }), [listHeight]);
  const snapProps = useMemo(
    () =>
      snap
        ? {
            snapToInterval: step,
            snapToAlignment: "start",
            decelerationRate: "fast",
          }
        : null,
    [snap, step],
  );

  if (!live.loading && live.artists.length === 0 && everActive.current) {
    return null;
  }

  return (
    <View>
      {/* Title row */}
      <View style={styles.head}>
        <Pressable
          onPress={onSeeAll}
          disabled={!onSeeAll}
          accessibilityRole="button"
          accessibilityLabel={`See all ${String(title).toLowerCase()}`}
          style={styles.titleBtn}
        >
          <View
            style={[
              styles.ico,
              { backgroundColor: t.card, borderColor: t.line },
            ]}
          >
            <Icon size={19} color={t.fg} strokeWidth={1.5} />
          </View>
          <Text style={[styles.title, { color: t.fg }]}>{title}</Text>
          {onSeeAll ? (
            <ChevronRight size={18} color={t.mute} strokeWidth={1.8} />
          ) : null}
        </Pressable>
        {label ? (
          <Text style={[styles.label, { color: t.mute }]}>{label}</Text>
        ) : null}
      </View>

      {/* Body: placeholder-height spacer until first visible */}
      {!everActive.current ? (
        <View style={listStyle} />
      ) : live.loading ? (
        <Skeleton
          active={active && !reduceMotion}
          color={t.skel}
          inset={inset}
          gap={gap}
          height={listHeight}
        />
      ) : (
        <FlatList
          horizontal
          data={live.artists}
          extraData={live.selectedId}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ItemSeparatorComponent={renderGap}
          getItemLayout={getItemLayout}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={contentStyle}
          style={listStyle}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS === "android"}
          {...snapProps}
        />
      )}
    </View>
  );
}

export default memo(ArtistsSection);

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 6,
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

  shadow: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: RAD,
    backgroundColor: "#222",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  card: {
    flex: 1,
    borderRadius: RAD,
    overflow: "hidden",
    backgroundColor: "#222",
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    height: CARD_H * 0.62,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { color: "#fff", fontFamily: FONT.light, fontSize: 44, opacity: 0.92 },

  meta: { position: "absolute", left: 14, right: 14, bottom: 62 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: ACCENT },
  name: {
    flexShrink: 1,
    color: "#fff",
    fontFamily: FONT.semi,
    fontSize: 17,
    letterSpacing: -0.25,
  },
  info: {
    marginTop: 3,
    color: "rgba(255,255,255,0.82)",
    fontFamily: FONT.light,
    fontSize: 12,
  },

  view: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "transparent",
  },
  viewOn: { backgroundColor: "#14161c", borderColor: "rgba(255,255,255,0.25)" },
  viewText: { color: "#14161c", fontFamily: FONT.regular, fontSize: 14 },
  viewTextOn: { color: "#fff" },

  skelCard: { width: CARD_W, height: CARD_H, borderRadius: RAD, marginTop: 14 },
});