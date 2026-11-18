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
  useWindowDimensions,
} from "react-native";
import { useRouter, useIsFocused } from "expo-router";
import * as Haptics from "expo-haptics";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { ChevronRight, Heart, Pause, Play, Zap } from "lucide-react-native";
import { usePlayer } from "../../context/player-context";
import { getSongsAddedBetween } from "../../databases/queries/mix";
import { getSetting, saveSetting } from "../../databases/queries/settings";

/* ------------------------------------------------------------------ */
/* Flat AMOLED tokens (no gradients, no shadows, no elevation)         */
/* ------------------------------------------------------------------ */

const C = {
  bg: "#000000",
  s1: "#0b0b0b",
  s2: "#161616",
  s3: "#262626",
  line: "#222222",
  fg: "#e8e8e8",
  mute: "#7d7d7d",
  accent: "#ff2d55",
  white: "#ffffff",
  black: "#000000",
};

const FONT = {
  light: "Outfit_300Light",
  semi: "Outfit_600SemiBold",
};

const DEFAULT_COLOR = "#7a5ff0";
const LIKED_SONGS_KEY = "liked_song_ids";

// Card sizes
const N_W = 296, N_H = 158, N_GAP = 14;
const HEAD_H = 56; // 40 icon + 16 margin
const MONTH_TITLE_H = 20;
const MONTH_ROW_GAP = 14;
const MONTH_LIST_TOP = 6;
const MONTH_LIST_BOTTOM = 10;

// Placeholder height so layout never jumps when the section mounts
const SECTION_H = {
  news:
    36 +
    HEAD_H +
    3 * (MONTH_TITLE_H + MONTH_LIST_TOP + N_H + MONTH_LIST_BOTTOM) +
    2 * MONTH_ROW_GAP,
};

const NEW_KINDS = ["disc", "bars", "waves", "hills", "sun"];
const NEW_COLORS = ["#ec6f8e", "#e8921a", "#4f8fd8", "#7a5ff0", "#5fd896"];
const EMPTY = [];
const MONTH_ROWS = [
  { key: "last-month", title: "Last month", from: 1, to: 0 },
  { key: "month-2", title: "1-2 months ago", from: 2, to: 1 },
  { key: "month-3", title: "2-3 months ago", from: 3, to: 2 },
];

/* ---------- flat scene art: shapes in the item's color on black ---------- */
const SCENES = {
  hills: (c) => (
    <>
      <Circle cx="140" cy="62" r="22" fill={c} fillOpacity={0.9} />
      <Path d="M0 150L40 100L70 130L110 78L150 125L200 92V200H0Z" fill={c} fillOpacity={0.45} />
      <Path d="M0 176L50 140L90 164L140 128L200 170V200H0Z" fill={c} fillOpacity={0.7} />
      <Path d="M0 196Q100 164 200 196V200H0Z" fill={c} />
    </>
  ),
  sun: (c) => (
    <>
      <Circle cx="100" cy="92" r="48" fill={c} fillOpacity={0.35} />
      <Circle cx="100" cy="92" r="30" fill={c} />
      <Path d="M0 150H200M0 168H200M0 184H200" stroke={c} strokeOpacity={0.6} strokeWidth={3} />
    </>
  ),
  waves: (c) => (
    <G fill="none" stroke={c} strokeWidth={3.5}>
      <Path d="M-10 90Q25 66 60 90T130 90T210 90" strokeOpacity={0.4} />
      <Path d="M-10 118Q25 94 60 118T130 118T210 118" strokeOpacity={0.6} />
      <Path d="M-10 146Q25 122 60 146T130 146T210 146" strokeOpacity={0.8} />
      <Path d="M-10 174Q25 150 60 174T130 174T210 174" />
    </G>
  ),
  disc: (c) => (
    <>
      <G fill="none" stroke={c} strokeWidth={2.5}>
        <Circle cx="100" cy="100" r="78" strokeOpacity={0.35} />
        <Circle cx="100" cy="100" r="58" strokeOpacity={0.6} />
        <Circle cx="100" cy="100" r="38" />
      </G>
      <Circle cx="100" cy="100" r="14" fill={c} />
    </>
  ),
  bars: (c) => (
    <G fill={c}>
      <Rect x="34" y="96" width="16" height="70" rx="8" fillOpacity={0.5} />
      <Rect x="62" y="62" width="16" height="104" rx="8" fillOpacity={0.8} />
      <Rect x="90" y="80" width="16" height="86" rx="8" fillOpacity={0.6} />
      <Rect x="118" y="44" width="16" height="122" rx="8" />
      <Rect x="146" y="88" width="16" height="78" rx="8" fillOpacity={0.7} />
    </G>
  ),
};

/* ------------------------------------------------------------------ */
/* Helpers + hooks                                                     */
/* ------------------------------------------------------------------ */

const toSource = (image) => {
  if (!image) return null;
  if (typeof image === "number") return image;
  if (typeof image === "string") return { uri: image };
  if (typeof image === "object" && image.uri) return image;
  return null;
};

const haptic = () => {
  try {
    Haptics.selectionAsync().catch(() => {});
  } catch {
    // unsupported device
  }
};

function subtractMonths(date, months) {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() - months);
  const lastDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(day, lastDay));
  return result.getTime();
}

function readLikedIds() {
  try {
    const value = getSetting(LIKED_SONGS_KEY);
    const ids = JSON.parse(value || "[]");
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch {
    return new Set();
  }
}

// Single gate: screen focused (useIsFocused) + app foregrounded + prop flag.
function useIsActive(flag = true) {
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setAppActive(s === "active"));
    return () => sub.remove();
  }, []);
  return flag && focused && appActive;
}

// Latest-value ref: keeps child callbacks stable across renders.
function useLatest(value) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

/* ------------------------------------------------------------------ */
/* LazySection: mounts children only once they are about to be seen    */
/*  - with `scrollY` (Reanimated shared value of the parent scroll):   */
/*    mounts when the section's top is within one screen of the edge   */
/*  - without it: mounts in a staggered way after the screen is active */
/* Once mounted it stays mounted (no remount flicker, state is kept).  */
/* ------------------------------------------------------------------ */

const LazySection = memo(function LazySection({
  index, height, active, scrollY, originY, winH, children,
}) {
  const [shown, setShown] = useState(false);
  const [top, setTop] = useState(null);

  const onLayout = useCallback((e) => {
    const y = Math.round(e.nativeEvent.layout.y);
    setTop((cur) => (cur === y ? cur : y));
  }, []);

  // Path A: scroll-driven (UI thread reaction, one JS hop when it flips)
  useAnimatedReaction(
    () => {
      if (!scrollY || top == null) return false;
      return scrollY.value + winH + 240 > originY + top;
    },
    (near, prev) => {
      if (near && !prev) runOnJS(setShown)(true);
    },
    [scrollY, top, originY, winH],
  );

  // Path B: no scroll value given, stagger mounts so the first frame stays light
  useEffect(() => {
    if (shown || scrollY || !active) return undefined;
    const id = setTimeout(() => setShown(true), index * 160);
    return () => clearTimeout(id);
  }, [active, shown, scrollY, index]);

  if (!shown) return <View onLayout={onLayout} style={[styles.section, { height }]} />;
  return children;
});

/* ------------------------------------------------------------------ */
/* Shared visual pieces                                                */
/* ------------------------------------------------------------------ */

const Scene = memo(function Scene({ kind = "disc", color = DEFAULT_COLOR, image }) {
  const source = useMemo(() => toSource(image), [image]);
  if (source) {
    return <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" />;
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
        {(SCENES[kind] ?? SCENES.disc)(color)}
      </Svg>
    </View>
  );
});

const SectionHeading = memo(function SectionHeading({ Icon, title, label, onPress }) {
  return (
    <View style={styles.head}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`See all ${title.toLowerCase()}`}
        style={styles.titleBtn}
      >
        <View style={styles.ico}>
          <Icon size={19} color={C.fg} strokeWidth={1.5} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <ChevronRight size={18} color={C.mute} strokeWidth={1.8} />
      </Pressable>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* NEW SONGS                                                           */
/* ------------------------------------------------------------------ */

const NewCard = memo(function NewCard({
  item, index, songs, periodTitle, playing, liked, pulse, onToggle, onLike,
}) {
  const dot = useAnimatedStyle(() => ({ opacity: 1 - 0.7 * pulse.value }));

  const handlePlay = useCallback(
    () => onToggle(item, index, songs),
    [onToggle, item, index, songs],
  );
  const handleLike = useCallback(() => onLike(item), [onLike, item]);

  return (
    <View style={[styles.nc, playing && styles.rcOn]}>
      <View style={styles.nTop}>
        <View style={styles.thumb}>
          <Scene kind={item.kind} color={item.color} image={item.image} />
        </View>
        <View style={styles.nText}>
<Text numberOfLines={1} style={styles.nMeta}>{item.title}</Text>
          <Text numberOfLines={1} style={styles.nMeta}>{item.meta}</Text>
          <View style={styles.nNew}>
            <Animated.View style={[styles.nDot, dot]} />
            <Text numberOfLines={1} style={styles.nMeta}>
              Added {periodTitle.toLowerCase()}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.nBottom}>
        <Pressable
          onPress={handleLike}
          accessibilityRole="button"
          accessibilityState={{ selected: liked }}
          accessibilityLabel={liked ? `Unlike ${item.title}` : `Like ${item.title}`}
          style={({ pressed }) => [
            styles.likeButton,
            liked && styles.likeButtonOn,
            pressed && styles.splitPressed,
          ]}
        >
          <Heart
            size={19}
            color={liked ? C.accent : C.white}
            fill={liked ? C.accent : "transparent"}
            strokeWidth={2}
          />
        </Pressable>

        <Pressable
          onPress={handlePlay}
          accessibilityRole="button"
          accessibilityLabel={`${playing ? "Pause" : "Play"} ${item.title}`}
          style={({ pressed }) => [
            styles.playButton,
            playing && styles.splitOn,
            pressed && styles.splitPressed,
          ]}
        >
          {playing ? (
            <Pause size={18} color={C.black} fill={C.black} strokeWidth={0} />
          ) : (
            <Play size={18} color={C.white} fill={C.white} strokeWidth={0} />
          )}
        </Pressable>
      </View>
    </View>
  );
});

const NewSongsSection = memo(function NewSongsSection({
  rows, playingKey, likedIds, animate, onToggle, onLike, onHeadingPress, bleed,
}) {
  // One shared pulse drives every added-age dot; stops when inactive.
  const pulse = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(pulse);
    pulse.value = 0;
    if (!animate) return undefined;
    pulse.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [animate, pulse]);

  const listStyle = useMemo(() => ({ marginHorizontal: -bleed, flexGrow: 0 }), [bleed]);
  const extra = useMemo(() => ({ playingKey, likedIds }), [playingKey, likedIds]);

  return (
    <View style={styles.section}>
      <SectionHeading Icon={Zap} title="New songs" label="Last 3 months" onPress={onHeadingPress} />
      {rows.map((row, rowIndex) => (
        <View
          key={row.key}
          style={[
            styles.monthRow,
            rowIndex < rows.length - 1 && styles.monthRowSpacing,
          ]}
        >
          <Text style={styles.monthTitle}>{row.title}</Text>
          {row.items.length ? (
            <FlatList
              horizontal
              data={row.items}
              extraData={extra}
              renderItem={({ item, index }) => (
                <NewCard
                  item={item}
                  index={index}
                  songs={row.songs}
                  periodTitle={row.title}
                  playing={playingKey === `new-${item.id}`}
                  liked={likedIds.has(String(item.id))}
                  pulse={pulse}
                  onToggle={onToggle}
                  onLike={onLike}
                />
              )}
              keyExtractor={keyById}
              ItemSeparatorComponent={NewSep}
              getItemLayout={newLayout}
              showsHorizontalScrollIndicator={false}
              snapToInterval={N_W + N_GAP}
              snapToAlignment="start"
              decelerationRate="fast"
              style={listStyle}
              contentContainerStyle={{
                paddingHorizontal: bleed,
                paddingTop: MONTH_LIST_TOP,
                paddingBottom: MONTH_LIST_BOTTOM,
              }}
              initialNumToRender={2}
              maxToRenderPerBatch={2}
              windowSize={3}
              removeClippedSubviews={Platform.OS === "android"}
            />
          ) : (
            <View style={styles.monthEmptyRail}>
              <Text style={styles.monthEmptyText}>No songs added during this period</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
});

/* ---------- module-scope list helpers (allocated once) ---------- */
const keyById = (it) => String(it.id);
const NewSep = () => <View style={{ width: N_GAP }} />;
const newLayout = (_, i) => ({ length: N_W + N_GAP, offset: (N_W + N_GAP) * i, index: i });

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */
/**
 * <RecentGrid
 *   isScreenActive={isVisible}       // extra gate, ANDed with useIsFocused + AppState
 *   scrollY={scrollY}                // optional Reanimated shared value of the parent scroll
 *   originY={0}                      // y of this component inside that scroll content
 *   onPressItem={(section, item) => ...}   // "new"
 *   onPressHeading={(section) => ...}      // defaults to /library
 *   onLike={(item, liked) => ...}
 *   bleed={20}                       // parent's horizontal padding so rails reach the edges
 * />
 *
 * Songs are grouped into three rolling month ranges and play through the
 * shared queue, while likes persist in app settings.
 */
function RecentGrid({
  onPressItem,
  onPressHeading,
  onLike,
  bleed = 0,
  isScreenActive = true,
  scrollY,
  originY = 0,
}) {
  const router = useRouter();
  const { height: winH } = useWindowDimensions();
  const active = useIsActive(isScreenActive);
  const reduceMotion = useReducedMotion();
  const animate = active && !reduceMotion;
  const { track, playing, playSongs, togglePlay } = usePlayer();

  // Nothing heavy renders until the screen has been active at least once.
  const [everActive, setEverActive] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active) setEverActive(true);
  }, [active]);

  // Load each non-overlapping month range one tick after the screen activates.
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(() => {
      const now = new Date();
      setRows(
        MONTH_ROWS.map((range) => ({
          ...range,
          songs: getSongsAddedBetween(
            subtractMonths(now, range.from),
            subtractMonths(now, range.to),
            12,
          ),
        })),
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [active]);

  const displayRows = useMemo(
    () =>
      (rows ?? EMPTY).map((row, rowIndex) => ({
        ...row,
        items: row.songs.map((song, i) => ({
          id: song.id,
          title: song.title || "Unknown title",
          meta: song.artist || "Unknown artist",
          kind: NEW_KINDS[(i + rowIndex) % NEW_KINDS.length],
          color: NEW_COLORS[(i + rowIndex) % NEW_COLORS.length],
          image: song.artwork_uri ?? undefined,
        })),
      })),
    [rows],
  );
  const [likedIds, setLikedIds] = useState(readLikedIds);
  const likedIdsRef = useRef(likedIds);
  const pressRef = useLatest(onPressItem);
  const headingRef = useLatest(onPressHeading);

  // Real playback state: the card playing is the shared player's track.
  const playingKey = playing && track?.id != null ? `new-${track.id}` : null;

  // Starts the current month-row queue, pausing it on a second tap.
  const toggleNew = useCallback(
    (item, index, songs) => {
      haptic();
      if (track && String(track.id) === String(item.id)) {
        togglePlay();
      } else {
        playSongs(songs, index);
      }
      pressRef.current?.("new", item);
    },
    [track, togglePlay, playSongs, pressRef],
  );

  const toggleLike = useCallback(
    (item) => {
      const id = String(item.id);
      const next = new Set(likedIdsRef.current);
      const liked = !next.has(id);
      if (liked) next.add(id);
      else next.delete(id);
      likedIdsRef.current = next;
      setLikedIds(next);
      haptic();

      try {
        saveSetting(LIKED_SONGS_KEY, JSON.stringify([...next]));
      } catch (error) {
        console.warn("[recent] could not save liked songs:", error);
      }
      onLike?.(item, liked);
    },
    [onLike],
  );

  const goHeading = useCallback(() => {
    if (headingRef.current) headingRef.current("new");
    else router.push("/library");
  }, [headingRef, router]);

  if (!everActive || !rows) return <View style={styles.placeholder} />;

  return (
    <View style={styles.root}>
      <LazySection
        index={0}
        height={SECTION_H.news}
        active={active}
        scrollY={scrollY}
        originY={originY}
        winH={winH}
      >
        <NewSongsSection
          rows={displayRows}
          playingKey={playingKey}
          likedIds={likedIds}
          animate={animate}
          onToggle={toggleNew}
          onLike={toggleLike}
          onHeadingPress={goHeading}
          bleed={bleed}
        />
      </LazySection>
    </View>
  );
}

export default memo(RecentGrid);

/* ------------------------------------------------------------------ */
/* Styles: flat, solid, hairline borders, zero shadow/elevation        */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: { width: "100%", backgroundColor: C.bg },
  placeholder: { width: "100%", height: SECTION_H.news, backgroundColor: C.bg },
  section: { marginTop: 36 },

  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  titleBtn: { flexDirection: "row", alignItems: "center", gap: 12 },
  ico: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: FONT.semi, fontSize: 28, letterSpacing: -0.8, color: C.fg },
  label: { fontFamily: FONT.light, fontSize: 14, color: C.mute },
  monthRow: { width: "100%" },
  monthRowSpacing: { marginBottom: MONTH_ROW_GAP },
  monthTitle: {
    height: MONTH_TITLE_H,
    color: C.fg,
    fontFamily: FONT.semi,
    fontSize: 15,
  },
  monthEmptyRail: {
    height: N_H + MONTH_LIST_TOP + MONTH_LIST_BOTTOM,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.s1,
  },
  monthEmptyText: { color: C.mute, fontFamily: FONT.light, fontSize: 13 },

  // active/playing state: accent border instead of glow
  rcOn: { borderColor: C.accent },

  /* new songs */
  nc: {
    width: N_W,
    height: N_H,
    borderRadius: 24,
    backgroundColor: C.s1,
    borderWidth: 1,
    borderColor: C.line,
    padding: 16,
    justifyContent: "space-between",
  },
  nTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: C.black,
    borderWidth: 1,
    borderColor: C.line,
  },
  nText: { flex: 1, minWidth: 0, gap: 2 },
  nTitle: { color: C.fg, fontFamily: FONT.semi, fontSize: 21, letterSpacing: -0.4 },
  nMeta: { color: C.mute, fontFamily: FONT.light, fontSize: 14 },
  nNew: { flexDirection: "row", alignItems: "center", gap: 7 },
  nDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
  nBottom: { flexDirection: "row", gap: 10 },
  likeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#3a3a3a",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.s2,
  },
  likeButtonOn: {
    borderColor: C.accent,
    backgroundColor: "rgba(255,45,85,0.12)",
  },
  playButton: {
    flex: 1,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.s2,
    borderRadius: 24,
  },
  splitOn: { backgroundColor: C.white },
  splitPressed: { backgroundColor: C.s3, transform: [{ scale: 0.96 }] },
});
